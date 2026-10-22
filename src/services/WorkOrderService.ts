// 2026-10-07 22:20, G7 Ops stage 2: work orders, lifecycle rules and the append-only event log (docs/G7_OPS_PLAN.md).
// All status changes go through transition(), so the manager board, the worker app and (later) offline replays share one rule set.
import { RowDataPacket } from 'mysql2';
import { db } from '../utils/database';
import { MOCK_MODE, mockWorkOrders, mockWorkOrderEvents, mockProperties, mockUsers } from '../utils/mock-database';
import { IntegratedReportService, GuestReport } from './IntegratedReportService';
import { MockIntegratedReportService } from './MockIntegratedReportService';
import { ChecklistService } from './ChecklistService'; // 2026-10-08 02:50, G7 S4
import { clientTime } from '../utils/request-context'; // 2026-10-08 05:10, G7 S5

export const WO_TYPES = ['maintenance', 'cleaning', 'inspection', 'ad_hoc'] as const;
export const WO_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const WO_STATUSES = ['new', 'assigned', 'awaiting_approval', 'in_progress', 'done', 'verified', 'canceled'] as const;
export type WoType = typeof WO_TYPES[number];
export type WoPriority = typeof WO_PRIORITIES[number];
export type WoStatus = typeof WO_STATUSES[number];
export type WoAction = 'assign' | 'estimate' | 'approve' | 'reject' | 'start' | 'submit' | 'verify' | 'bounce' | 'cancel' | 'comment';

/** Over this share above the approved amount, a submitted job is flagged for review. */
export const OVERRUN_TOLERANCE = 0.10;

export interface WorkOrder {
  id: number;
  company_id: number;
  property_id: number;
  amenity_id: number | null;
  guest_report_id: number | null;
  type: WoType;
  title: string;
  description: string | null;
  priority: WoPriority;
  status: WoStatus;
  assignee_user_id: number | null;
  window_start: Date | null;
  window_end: Date | null;
  due_at: Date | null;
  cost_estimate: number | null;
  cost_actual: number | null;
  approved_amount: number | null;
  approved_by: number | null;
  approved_at: Date | null;
  completion_notes: string | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
  // joined
  property_name?: string;
  property_address?: string | null;
  property_site_lat?: number | null; // 2026-10-10 10:28, #62 precise property spot
  property_site_lng?: number | null;
  late_alerted_at?: Date | null;
  assignee_name?: string | null;
  has_access_override?: boolean;
  schedule_id?: number | null; // 2026-10-08 10:50, G7 S8
  schedule_due_on?: string | null;
}

export interface WoEvent {
  id: number;
  work_order_id: number;
  actor_user_id: number | null;
  actor_name?: string | null;
  actor_role?: string | null;
  action: string;
  note: string | null;
  data: any;
  created_at: Date;
}

export type Actor = { id: number | null; role: 'manager' | 'worker' | 'system' };
export type TransitionResult = { order: WorkOrder; events: string[]; flags: string[] } | { error: string; status: number };

const num = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v));
const userName = (id: number | null) => {
  const u: any = id ? mockUsers.find(x => x.id === id) : null;
  return u ? `${u.first_name} ${u.last_name}` : null;
};
const nextId = (rows: any[]) => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
// 2026-10-08 00:30, G7 S3: the per-job access code (ciphertext) never leaves the service; OnSiteService reads it directly
const normalize = ({ access_code_override_enc, ...r }: any): WorkOrder => ({
  ...r,
  has_access_override: !!access_code_override_enc,
  cost_estimate: num(r.cost_estimate), cost_actual: num(r.cost_actual), approved_amount: num(r.approved_amount)
});

const ORDER_SELECT = `SELECT w.*, p.name AS property_name, p.address AS property_address, p.site_lat AS property_site_lat, p.site_lng AS property_site_lng,
       CONCAT(u.first_name, ' ', u.last_name) AS assignee_name
  FROM work_orders w JOIN properties p ON p.id = w.property_id LEFT JOIN users u ON u.id = w.assignee_user_id`;

export class WorkOrderService {
  private reports: IntegratedReportService = MOCK_MODE ? new MockIntegratedReportService() : new IntegratedReportService();
  private checklists = new ChecklistService();

  // ---- data access ----

  private decorate(r: any): WorkOrder {
    const p: any = mockProperties.find(x => x.id === r.property_id) || {};
    return normalize({ ...r, property_name: p.name, property_address: p.address ?? null, property_site_lat: p.site_lat ?? null, property_site_lng: p.site_lng ?? null, assignee_name: userName(r.assignee_user_id) });
  }

  async get(id: number): Promise<WorkOrder | null> {
    if (MOCK_MODE) {
      const r = mockWorkOrders.find(x => x.id === id);
      return r ? this.decorate(r) : null;
    }
    const [rows] = await db.execute<RowDataPacket[]>(`${ORDER_SELECT} WHERE w.id = ?`, [id]);
    return rows[0] ? normalize(rows[0]) : null;
  }

  async list(companyId: number, f: { status?: WoStatus; property_id?: number; assignee_user_id?: number } = {}): Promise<WorkOrder[]> {
    if (MOCK_MODE) {
      return mockWorkOrders
        .filter(r => r.company_id === companyId && (!f.status || r.status === f.status) && (!f.property_id || r.property_id === f.property_id)
          && (!f.assignee_user_id || r.assignee_user_id === f.assignee_user_id))
        .map(r => this.decorate(r))
        .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
    }
    const where = ['w.company_id = ?'];
    const params: any[] = [companyId];
    if (f.status) { where.push('w.status = ?'); params.push(f.status); }
    if (f.property_id) { where.push('w.property_id = ?'); params.push(f.property_id); }
    if (f.assignee_user_id) { where.push('w.assignee_user_id = ?'); params.push(f.assignee_user_id); }
    const [rows] = await db.execute<RowDataPacket[]>(`${ORDER_SELECT} WHERE ${where.join(' AND ')} ORDER BY w.updated_at DESC`, params);
    return rows.map(normalize);
  }

  /** Jobs assigned to a worker in the given companies (the caller passes only companies where the worker is active). */
  async listForWorker(userId: number, companyIds: number[]): Promise<WorkOrder[]> {
    if (!companyIds.length) return [];
    if (MOCK_MODE) {
      return mockWorkOrders.filter(r => r.assignee_user_id === userId && companyIds.includes(r.company_id) && r.status !== 'canceled')
        .map(r => this.decorate(r));
    }
    const [rows] = await db.execute<RowDataPacket[]>(
      `${ORDER_SELECT} WHERE w.assignee_user_id = ? AND w.company_id IN (${companyIds.map(() => '?').join(',')}) AND w.status <> 'canceled'`,
      [userId, ...companyIds]
    );
    return rows.map(normalize);
  }

  private async insert(fields: Partial<WorkOrder>): Promise<number> {
    if (MOCK_MODE) {
      const id = nextId(mockWorkOrders);
      mockWorkOrders.push({
        id, amenity_id: null, guest_report_id: null, description: null, assignee_user_id: null, window_start: null, window_end: null,
        due_at: null, cost_estimate: null, cost_actual: null, approved_amount: null, approved_by: null, approved_at: null,
        completion_notes: null, created_by: null, ...fields, created_at: new Date(), updated_at: new Date()
      });
      return id;
    }
    const keys = Object.keys(fields);
    const [result] = await db.execute(`INSERT INTO work_orders (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, keys.map(k => (fields as any)[k]));
    return (result as any).insertId;
  }

  private async patch(id: number, fields: Partial<WorkOrder>): Promise<void> {
    if (!Object.keys(fields).length) return;
    if (MOCK_MODE) {
      Object.assign(mockWorkOrders.find(x => x.id === id), fields, { updated_at: new Date() });
      return;
    }
    const keys = Object.keys(fields);
    await db.execute(`UPDATE work_orders SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map(k => (fields as any)[k]), id]);
  }

  async addEvent(orderId: number, actorId: number | null, action: string, note: string | null = null, data: any = null): Promise<void> {
    const deviceTime = clientTime() ?? null; // set only for updates replayed from the offline queue
    if (MOCK_MODE) {
      mockWorkOrderEvents.push({ id: nextId(mockWorkOrderEvents), work_order_id: orderId, actor_user_id: actorId, action, note, data, created_at: new Date(), client_created_at: deviceTime });
      return;
    }
    await db.execute('INSERT INTO work_order_events (work_order_id, actor_user_id, action, note, data, client_created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [orderId, actorId, action, note, data === null ? null : JSON.stringify(data), deviceTime]);
  }

  async events(orderId: number): Promise<WoEvent[]> {
    if (MOCK_MODE) {
      return mockWorkOrderEvents.filter(e => e.work_order_id === orderId)
        .map(e => ({ ...e, actor_name: userName(e.actor_user_id), actor_role: (mockUsers.find(u => u.id === e.actor_user_id) as any)?.role ?? null }));
    }
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT e.*, CONCAT(u.first_name, ' ', u.last_name) AS actor_name, u.role AS actor_role
         FROM work_order_events e LEFT JOIN users u ON u.id = e.actor_user_id
        WHERE e.work_order_id = ? ORDER BY e.id ASC`,
      [orderId]
    );
    return rows.map(r => ({ ...r, data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data })) as WoEvent[];
  }

  /** Open jobs of every company with the fields alerting needs (2026-10-08 11:10, G7 S8 scheduler). */
  async openForAlerts(): Promise<(WorkOrder & { overdue_alerted_at: Date | null; unassigned_alerted_at: Date | null })[]> {
    const open = ['new', 'assigned', 'awaiting_approval', 'in_progress'];
    if (MOCK_MODE) return mockWorkOrders.filter(o => open.includes(o.status)).map(o => ({ ...this.decorate(o), overdue_alerted_at: o.overdue_alerted_at ?? null, unassigned_alerted_at: o.unassigned_alerted_at ?? null, late_alerted_at: o.late_alerted_at ?? null })) as any;
    const [rows] = await db.execute<RowDataPacket[]>(`${ORDER_SELECT} WHERE w.status IN ('new', 'assigned', 'awaiting_approval', 'in_progress')`);
    return rows.map(r => ({ ...normalize(r), overdue_alerted_at: r.overdue_alerted_at, unassigned_alerted_at: r.unassigned_alerted_at })) as any;
  }

  async markAlerted(orderId: number, field: 'overdue_alerted_at' | 'unassigned_alerted_at' | 'late_alerted_at'): Promise<void> { // 2026-10-10 10:28, #62 late
    if (MOCK_MODE) { mockWorkOrders.find(o => o.id === orderId)[field] = new Date(); return; }
    await db.execute(`UPDATE work_orders SET ${field} = CURRENT_TIMESTAMP WHERE id = ?`, [orderId]);
  }

  // ---- create / edit ----

  async create(data: {
    company_id: number; property_id: number; amenity_id?: number | null; guest_report_id?: number | null; type: WoType; title: string;
    description?: string | null; priority: WoPriority; assignee_user_id?: number | null; window_start?: Date | null; window_end?: Date | null;
    due_at?: Date | null; approved_amount?: number | null; checklist_template_id?: number | null;
    schedule_id?: number | null; schedule_due_on?: string | null; // 2026-10-08 10:50, G7 S8
  }, actor: Actor): Promise<WorkOrder> {
    const { checklist_template_id, ...data_ } = data;
    data = data_;
    const assigned = !!data.assignee_user_id;
    const id = await this.insert({
      ...data,
      status: assigned ? 'assigned' : 'new',
      approved_by: data.approved_amount != null ? actor.id : null,
      approved_at: data.approved_amount != null ? new Date() : null,
      created_by: actor.id
    } as Partial<WorkOrder>);
    await this.addEvent(id, actor.id, 'created', null, data.guest_report_id ? { guest_report_id: data.guest_report_id } : null);
    if (assigned) await this.addEvent(id, actor.id, 'assigned', null, { assignee_user_id: data.assignee_user_id });
    if (data.approved_amount != null) await this.addEvent(id, actor.id, 'preapproved', null, { amount: data.approved_amount });
    if (checklist_template_id) {
      await this.checklists.attach(id, checklist_template_id);
      await this.addEvent(id, actor.id, 'checklist_attached', null, { template_id: checklist_template_id });
    }
    return (await this.get(id))!;
  }

  /** Manager edits of the descriptive fields; not allowed once verified or canceled. */
  async edit(order: WorkOrder, fields: Partial<Pick<WorkOrder, 'title' | 'description' | 'priority' | 'type' | 'window_start' | 'window_end' | 'due_at'>>, actor: Actor): Promise<TransitionResult> {
    if (order.status === 'verified' || order.status === 'canceled') return { error: `A ${order.status} work order can't be edited`, status: 409 };
    // 2026-10-10 10:28, #62 a moved window re-arms the late / no-show alert
    const moved = 'window_start' in fields && +new Date(fields.window_start as any) !== +new Date(order.window_start as any);
    await this.patch(order.id, moved ? { ...fields, late_alerted_at: null } : fields);
    await this.addEvent(order.id, actor.id, 'edited', null, { fields: Object.keys(fields) });
    return { order: (await this.get(order.id))!, events: ['edited'], flags: [] };
  }

  // ---- lifecycle ----

  /**
   * The only place status changes. `threshold` is the company's approval threshold (null = never ask).
   * Payload: assign {assignee_user_id|null, approved_amount?} · estimate {amount, note?} · approve {amount?} · reject/bounce {reason}
   * · submit {notes?, cost_actual?} · cancel {reason?} · comment {note}
   */
  async transition(order: WorkOrder, action: WoAction, actor: Actor, payload: any, threshold: number | null): Promise<TransitionResult> {
    const s = order.status;
    const fail = (error: string, status = 409): TransitionResult => ({ error, status });
    const isManager = actor.role === 'manager' || actor.role === 'system';
    const isAssignee = actor.role === 'worker' && actor.id !== null && actor.id === order.assignee_user_id;
    const closed = s === 'verified' || s === 'canceled';
    const fields: Partial<WorkOrder> = {};
    const events: [string, string | null, any][] = [];
    const flags: string[] = [];

    switch (action) {
      case 'assign': {
        if (!isManager) return fail('Only the property manager can assign work', 403);
        if (!['new', 'assigned', 'awaiting_approval', 'in_progress'].includes(s)) return fail(`Can't assign a ${s} work order`);
        const to = payload.assignee_user_id ?? null;
        if (to === null) {
          if (s === 'in_progress') return fail('Work has started; bounce or cancel it instead of unassigning');
          if (s === 'new') return fail('This work order is not assigned');
          Object.assign(fields, { assignee_user_id: null, status: 'new' });
          events.push(['unassigned', payload.note ?? null, { from: order.assignee_user_id }]);
        } else {
          fields.assignee_user_id = to;
          if (s === 'new') fields.status = 'assigned';
          events.push([order.assignee_user_id ? 'reassigned' : 'assigned', payload.note ?? null, { assignee_user_id: to, from: order.assignee_user_id }]);
        }
        if (payload.approved_amount != null) {
          Object.assign(fields, { approved_amount: payload.approved_amount, approved_by: actor.id, approved_at: new Date() });
          events.push(['preapproved', null, { amount: payload.approved_amount }]);
        }
        break;
      }
      case 'estimate': {
        if (!isAssignee) return fail('Only the assigned worker can add an estimate', 403);
        if (s !== 'assigned' && s !== 'in_progress') return fail(`Can't change the estimate of a ${s} job`);
        const amount = Number(payload.amount);
        fields.cost_estimate = amount;
        events.push(['estimated', payload.note ?? null, { amount }]);
        const covered = order.approved_amount !== null && amount <= order.approved_amount;
        if (threshold !== null && amount > threshold && !covered) {
          fields.status = 'awaiting_approval';
          events.push(['approval_requested', null, { amount, threshold, resume: s }]);
          flags.push('approval_requested');
        }
        break;
      }
      case 'approve': {
        if (!isManager) return fail('Only the property manager can approve costs', 403);
        if (s !== 'awaiting_approval') return fail('This job is not waiting for approval');
        const amount = payload.amount != null ? Number(payload.amount) : order.cost_estimate;
        const resume = await this.resumeStatus(order.id);
        Object.assign(fields, { approved_amount: amount, approved_by: actor.id, approved_at: new Date(), status: resume });
        events.push(['approved', payload.note ?? null, { amount }]);
        break;
      }
      case 'reject': {
        if (!isManager) return fail('Only the property manager can reject costs', 403);
        if (s !== 'awaiting_approval') return fail('This job is not waiting for approval');
        if (!payload.reason) return fail('A reason is required', 400);
        Object.assign(fields, { status: 'new', assignee_user_id: null, cost_estimate: null });
        events.push(['rejected', payload.reason, { from: order.assignee_user_id, amount: order.cost_estimate }]);
        break;
      }
      case 'start': {
        if (!isAssignee) return fail('Only the assigned worker can start this job', 403);
        if (s === 'awaiting_approval') return fail('The estimate is waiting for the manager\'s approval');
        if (s !== 'assigned') return fail(`Can't start a ${s} job`);
        fields.status = 'in_progress';
        events.push(['started', null, null]);
        break;
      }
      case 'submit': {
        if (!isAssignee) return fail('Only the assigned worker can submit this job', 403);
        if (s !== 'in_progress') return fail(`Can't submit a ${s} job`);
        // 2026-10-08 02:50, G7 S4: every checklist step must be done (photo steps need their photo)
        const open = await this.checklists.incomplete(order.id);
        if (open.length) return fail(`Finish the checklist first: ${open.length} step${open.length === 1 ? '' : 's'} still open (${open.slice(0, 3).map(i => i.label).join('; ')}${open.length > 3 ? '; …' : ''})`);
        const actual = payload.cost_actual != null ? Number(payload.cost_actual) : null;
        Object.assign(fields, { status: 'done', completion_notes: payload.notes ?? null, cost_actual: actual });
        const limit = order.approved_amount !== null ? order.approved_amount * (1 + OVERRUN_TOLERANCE) : threshold;
        const over = actual !== null && limit !== null && actual > limit;
        if (over) flags.push('over_budget');
        events.push(['submitted', payload.notes ?? null, { cost_actual: actual, over_budget: over }]);
        break;
      }
      case 'verify': {
        if (!isManager) return fail('Only the property manager can verify work', 403);
        if (s !== 'done') return fail('Only submitted work can be verified');
        fields.status = 'verified';
        events.push(['verified', payload.note ?? null, null]);
        break;
      }
      case 'bounce': {
        if (!isManager) return fail('Only the property manager can send work back', 403);
        if (s !== 'done') return fail('Only submitted work can be sent back');
        if (!payload.reason) return fail('A reason is required', 400);
        fields.status = 'in_progress';
        const reopened = Array.isArray(payload.reopen_item_ids) && payload.reopen_item_ids.length ? await this.checklists.reopen(order.id, payload.reopen_item_ids) : 0;
        events.push(['bounced', payload.reason, reopened ? { reopened } : null]);
        break;
      }
      case 'cancel': {
        if (!isManager) return fail('Only the property manager can cancel work', 403);
        if (closed) return fail(`This work order is already ${s}`);
        fields.status = 'canceled';
        events.push(['canceled', payload.reason ?? null, { from: s }]);
        break;
      }
      case 'comment': {
        if (!isManager && !isAssignee) return fail('Not allowed', 403);
        if (!payload.note) return fail('A comment is required', 400);
        events.push(['commented', payload.note, null]);
        break;
      }
      default:
        return fail('Unknown action', 400);
    }

    await this.patch(order.id, fields);
    for (const [a, note, data] of events) await this.addEvent(order.id, actor.id, a, note, data);
    if (fields.status === 'verified' && order.guest_report_id) await this.resolveReport(order, actor);
    return { order: (await this.get(order.id))!, events: events.map(e => e[0]), flags };
  }

  /** After approval a job goes back to where it was when the estimate came in. */
  private async resumeStatus(orderId: number): Promise<WoStatus> {
    const req = [...(await this.events(orderId))].reverse().find(e => e.action === 'approval_requested');
    return req?.data?.resume === 'in_progress' ? 'in_progress' : 'assigned';
  }

  // ---- guest reports ----

  async getReport(reportId: number): Promise<GuestReport | null> {
    try { return await this.reports.getReportById(reportId); } catch { return null; }
  }

  /** Open work order already created from this guest report, if any (prevents duplicates). */
  async findByReport(companyId: number, reportId: number): Promise<WorkOrder | null> {
    return (await this.list(companyId)).find(o => o.guest_report_id === reportId && o.status !== 'canceled') || null;
  }

  async createFromReport(companyId: number, report: GuestReport, actor: Actor): Promise<WorkOrder> {
    const type: WoType = report.category === 'housekeeping' || report.category === 'supplies' ? 'cleaning' : 'maintenance';
    const order = await this.create({
      company_id: companyId, property_id: report.property_id, amenity_id: report.amenity_id ?? null, guest_report_id: report.id!,
      type, title: report.title.slice(0, 255), description: [report.description, report.location ? `Location: ${report.location}` : ''].filter(Boolean).join('\n\n'),
      priority: report.urgency_level === 'immediate' ? 'urgent' : report.priority
    }, actor);
    if (report.status === 'new' || report.status === 'acknowledged') {
      await this.reports.updateReportStatus(report.id!, 'in_progress', actor.id ?? undefined, `Work order #${order.id} created`).catch(() => {});
    }
    return order;
  }

  private async resolveReport(order: WorkOrder, actor: Actor) {
    try {
      const report = await this.getReport(order.guest_report_id!);
      if (report && report.status !== 'resolved' && report.status !== 'closed') {
        await this.reports.updateReportStatus(report.id!, 'resolved', actor.id ?? undefined, `Resolved by work order #${order.id}`);
      }
    } catch (error) {
      console.error('Could not resolve the linked guest report:', error);
    }
  }
}
