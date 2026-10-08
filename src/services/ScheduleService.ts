// 2026-10-08 11:00, G7 Ops stage 8: preventive maintenance schedules. The scheduler creates the work order `lead_days`
// before each due date (window in the company's time zone), assigns the default person when they can take it, and
// attaches the checklist. One job per occurrence (schedule_id + schedule_due_on).
import { RowDataPacket } from 'mysql2';
import { db } from '../utils/database';
import { MOCK_MODE, mockMaintenanceSchedules, mockWorkOrders, mockCompanies } from '../utils/mock-database';
import { WorkOrderService, WoType, WoPriority, WorkOrder } from './WorkOrderService';
import { WorkerService } from './WorkerService';
import { VendorService, coiStatus } from './VendorService';
import { entitlementsFor } from './EntitlementService';
import { zonedTime, todayIn, validTz } from './TimeService';

export type Recurrence = 'every_n_days' | 'weekly' | 'monthly';
export interface Schedule {
  id: number; company_id: number; property_id: number; title: string; description: string | null; type: WoType; priority: WoPriority;
  checklist_template_id: number | null; default_assignee_user_id: number | null; recurrence: Recurrence;
  interval_days: number | null; weekday: number | null; month_day: number | null;
  window_start_time: string; window_hours: number; lead_days: number; next_due_on: string; active: boolean; last_order_id: number | null;
}

const ymdOf = (v: any) => (typeof v === 'string' ? v.slice(0, 10) : (() => { const d = new Date(v); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })());
const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const nextId = (rows: any[]) => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
const norm = (r: any): Schedule => ({ ...r, active: !!r.active, next_due_on: ymdOf(r.next_due_on) });

/** First due date on or after `from` (inclusive) that matches the recurrence. */
export function firstOnOrAfter(s: Pick<Schedule, 'recurrence' | 'interval_days' | 'weekday' | 'month_day'>, from: string): string {
  if (s.recurrence === 'every_n_days') return from;
  if (s.recurrence === 'weekly') {
    const dow = (new Date(`${from}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
    return addDays(from, ((s.weekday ?? 0) - dow + 7) % 7);
  }
  const [y, m, d] = from.split('-').map(Number);
  const day = s.month_day ?? 1;
  const ym = d <= day ? [y, m] : m === 12 ? [y + 1, 1] : [y, m + 1];
  return `${ym[0]}-${String(ym[1]).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The occurrence after `due`. */
export function nextAfter(s: Pick<Schedule, 'recurrence' | 'interval_days' | 'weekday' | 'month_day'>, due: string): string {
  if (s.recurrence === 'every_n_days') return addDays(due, Math.max(1, s.interval_days ?? 1));
  return firstOnOrAfter(s, addDays(due, 1));
}

export class ScheduleService {
  private orders = new WorkOrderService();
  private workers = new WorkerService();
  private vendors = new VendorService();

  async list(companyId: number): Promise<Schedule[]> {
    const rows: any[] = MOCK_MODE
      ? mockMaintenanceSchedules.filter(s => s.company_id === companyId)
      : (await db.execute<RowDataPacket[]>('SELECT * FROM maintenance_schedules WHERE company_id = ? ORDER BY next_due_on', [companyId]))[0];
    return rows.map(norm).sort((a, b) => a.next_due_on.localeCompare(b.next_due_on));
  }

  async get(id: number): Promise<Schedule | null> {
    const r: any = MOCK_MODE
      ? mockMaintenanceSchedules.find(s => s.id === id)
      : (await db.execute<RowDataPacket[]>('SELECT * FROM maintenance_schedules WHERE id = ?', [id]))[0][0];
    return r ? norm(r) : null;
  }

  private async allActive(): Promise<Schedule[]> {
    const rows: any[] = MOCK_MODE
      ? mockMaintenanceSchedules.filter(s => s.active)
      : (await db.execute<RowDataPacket[]>('SELECT * FROM maintenance_schedules WHERE active = true'))[0];
    return rows.map(norm);
  }

  async save(id: number | null, companyId: number, data: Omit<Schedule, 'id' | 'company_id' | 'last_order_id'>, userId: number): Promise<Schedule> {
    const fields: Record<string, any> = { ...data };
    if (MOCK_MODE) {
      if (id) Object.assign(mockMaintenanceSchedules.find(s => s.id === id), fields, { updated_at: new Date() });
      else { id = nextId(mockMaintenanceSchedules); mockMaintenanceSchedules.push({ id, company_id: companyId, ...fields, last_order_id: null, created_by: userId, created_at: new Date(), updated_at: new Date() }); }
      return (await this.get(id!))!;
    }
    const keys = Object.keys(fields);
    if (id) {
      await db.execute(`UPDATE maintenance_schedules SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map(k => fields[k]), id]);
    } else {
      const [r] = await db.execute(`INSERT INTO maintenance_schedules (company_id, created_by, ${keys.join(', ')}) VALUES (?, ?, ${keys.map(() => '?').join(', ')})`,
        [companyId, userId, ...keys.map(k => fields[k])]);
      id = (r as any).insertId;
    }
    return (await this.get(id!))!;
  }

  private async advance(s: Schedule, nextDue: string, lastOrderId: number | null) {
    if (MOCK_MODE) {
      Object.assign(mockMaintenanceSchedules.find(x => x.id === s.id), { next_due_on: nextDue, ...(lastOrderId ? { last_order_id: lastOrderId } : {}) });
      return;
    }
    await db.execute(`UPDATE maintenance_schedules SET next_due_on = ?${lastOrderId ? ', last_order_id = ?' : ''} WHERE id = ?`, lastOrderId ? [nextDue, lastOrderId, s.id] : [nextDue, s.id]);
  }

  private async exists(scheduleId: number, dueOn: string): Promise<boolean> {
    if (MOCK_MODE) return mockWorkOrders.some(o => o.schedule_id === scheduleId && ymdOf(o.schedule_due_on || '') === dueOn);
    const [rows] = await db.execute<RowDataPacket[]>('SELECT id FROM work_orders WHERE schedule_id = ? AND schedule_due_on = ?', [scheduleId, dueOn]);
    return rows.length > 0;
  }

  private async company(companyId: number): Promise<any> {
    if (MOCK_MODE) return mockCompanies.find(c => c.id === companyId);
    return (await db.execute<RowDataPacket[]>('SELECT * FROM companies WHERE id = ?', [companyId]))[0][0];
  }

  /** The default person if they can take the job now (active member; vendors need a valid certificate). */
  private async assignee(s: Schedule): Promise<number | null> {
    if (!s.default_assignee_user_id) return null;
    const m = await this.workers.getMember(s.company_id, s.default_assignee_user_id);
    if (!m || m.status !== 'active') return null;
    if (m.worker_type === 'vendor' && coiStatus(await this.vendors.get(m.user_id)).state === 'expired') return null;
    return m.user_id;
  }

  /**
   * Creates the jobs that are due. Occurrences whose due date already passed (server was down) are skipped, not
   * created late. Returns the created work orders.
   */
  async generateDue(now = new Date()): Promise<WorkOrder[]> {
    const created: WorkOrder[] = [];
    for (const s of await this.allActive()) {
      const company = await this.company(s.company_id);
      if (!company || company.status !== 'active' || !entitlementsFor(company).ops) continue;
      const tz = validTz(company.timezone);
      const today = todayIn(tz, now);
      let due = s.next_due_on;
      let lastOrder: number | null = null;
      // walk forward while the next occurrence is inside the lead window
      for (let guard = 0; guard < 400 && addDays(due, -s.lead_days) <= today; guard++) {
        if (due >= today && !(await this.exists(s.id, due))) {
          const start = zonedTime(due, s.window_start_time, tz);
          const end = new Date(+start + s.window_hours * 3600000);
          const assignee = await this.assignee(s);
          const order = await this.orders.create({
            company_id: s.company_id, property_id: s.property_id, type: s.type, priority: s.priority, title: s.title,
            description: s.description, assignee_user_id: assignee, window_start: start, window_end: end, due_at: end,
            checklist_template_id: s.checklist_template_id, schedule_id: s.id, schedule_due_on: due
          }, { id: null, role: 'system' });
          await this.orders.addEvent(order.id, null, 'scheduled', s.title, { schedule_id: s.id, due_on: due, default_assignee_skipped: !!s.default_assignee_user_id && !assignee });
          created.push(order);
          lastOrder = order.id;
        }
        due = nextAfter(s, due);
      }
      if (due !== s.next_due_on) await this.advance(s, due, lastOrder);
    }
    return created;
  }
}
