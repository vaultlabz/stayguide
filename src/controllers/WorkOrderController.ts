// 2026-10-07 22:30, G7 Ops stage 2: work-order API for managers (/company/:companySlug/ops/...) and workers (/maint/api/jobs/...)
import { Request, Response } from 'express';
import { AuthRequest, Company } from '../types';
import { WorkOrderService, WorkOrder, WoAction, WO_TYPES, WO_PRIORITIES, WO_STATUSES, WoStatus, Actor } from '../services/WorkOrderService';
import { WorkerService } from '../services/WorkerService';
import { CompanyService } from '../services/CompanyService';
import { PropertyService } from '../services/PropertyService';
import { UserService } from '../services/UserService';
import { EmailService } from '../services/EmailService';
import { entitlementsFor, upgradeRequired } from '../services/EntitlementService';
import { resolveOwnedCompany } from '../utils/ownership';
import { OnSiteService } from '../services/OnSiteService'; // 2026-10-08 00:50, G7 S3
import { ChecklistService } from '../services/ChecklistService'; // 2026-10-08 03:00, G7 S4
import { PushService } from '../services/PushService'; // 2026-10-08 05:30, G7 S5
import { VendorService, coiStatus } from '../services/VendorService'; // 2026-10-08 07:40, G7 S6

const MANAGER_ACTIONS: WoAction[] = ['assign', 'approve', 'reject', 'verify', 'bounce', 'cancel', 'comment'];
const WORKER_ACTIONS: WoAction[] = ['start', 'estimate', 'submit', 'comment'];
const MAX_AMOUNT = 1_000_000;
const TEXT_MAX = 5000;

const baseUrl = (req: Request) => (process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (n: number | null | undefined) => (n === null || n === undefined ? '' : `$${Number(n).toFixed(2)}`);
export const threshold = (c: Company) => (c.ops_approval_threshold === null || c.ops_approval_threshold === undefined ? null : Number(c.ops_approval_threshold));

function text(v: unknown, max: number, required: boolean): string | null | undefined {
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return required ? undefined : null;
  return typeof v === 'string' && v.trim().length <= max ? v.trim() : undefined;
}
function amount(v: unknown): number | null | undefined {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= MAX_AMOUNT ? Math.round(n * 100) / 100 : undefined;
}
function date(v: unknown): Date | null | undefined {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(String(v));
  return isNaN(+d) ? undefined : d;
}

export class WorkOrderController {
  protected orders = new WorkOrderService();
  protected workers = new WorkerService();
  protected companies = new CompanyService();
  protected properties = new PropertyService();
  protected users = new UserService();
  protected email = new EmailService();
  protected onsite = new OnSiteService();
  protected checklists = new ChecklistService();
  protected push = new PushService();

  /** Email + web push to a worker (2026-10-08 05:30, G7 S5). The push opens the job in the app. */
  protected async tellWorker(userId: number | null, company: Company, subject: string, lines: string[], link: string, linkLabel: string) {
    if (!userId) return;
    this.mail((await this.users.findById(userId))?.email, company, subject, lines, link, linkLabel);
    const url = link.replace(/^https?:\/\/[^/]+/, '');
    this.push.notify(userId, { title: subject, body: lines.filter(Boolean).join(' · '), url, tag: url }).catch(err => console.error('Push failed:', err));
  }

  /** Job checklist with signed photo URLs for photo steps (2026-10-08 03:00, G7 S4). */
  protected async checklistView(orderId: number) {
    const photos = new Map((await this.onsite.withUrls(orderId)).map(p => [p.id, p.url]));
    return (await this.checklists.jobItems(orderId)).map(i => ({
      id: i.id, label: i.label, requires_photo: i.requires_photo, done: i.done, done_at: i.done_at, note: i.note,
      photo_url: i.photo_id ? photos.get(i.photo_id) ?? null : null
    }));
  }

  // ---- shared ----

  protected async opsCompany(req: AuthRequest, res: Response): Promise<Company | null> {
    const company = await resolveOwnedCompany(req, res);
    if (!company) return null;
    if (!entitlementsFor(company).ops) {
      upgradeRequired(res, 'ops', 'The Ops add-on is not active for this company. It needs a Pro or Portfolio plan; contact StayGuide to switch it on.');
      return null;
    }
    return company;
  }

  /** Best-effort notification; never fails the request. */
  protected mail(to: string | null | undefined, company: Company, subject: string, lines: string[], link: string, linkLabel: string) {
    if (!to) return;
    this.email.sendEmail({
      to, fromName: `${company.name} via StayGuide`, subject,
      text: `${lines.join('\n\n')}\n\n${linkLabel}: ${link}\n\nPowered by StayGuide`,
      html: `${lines.map(l => `<p style="white-space:pre-wrap">${esc(l)}</p>`).join('')}<p><a href="${link}">${esc(linkLabel)}</a></p><p style="color:#999;font-size:12px">Powered by StayGuide</p>`
    }).catch(err => console.error('Work order email failed:', err));
  }

  protected async notify(req: Request, company: Company, before: WorkOrder, after: WorkOrder, events: string[], flags: string[], note: string | null) {
    const job = `#${after.id} ${after.title} (${after.property_name})`;
    const workerLink = `${baseUrl(req)}/maint?job=${after.id}`;
    const managerLink = `${baseUrl(req)}/company/${company.slug}/ops?wo=${after.id}`;

    if (events.includes('assigned') || events.includes('reassigned')) {
      const when = after.window_start ? `When: ${new Date(after.window_start).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}` : '';
      this.tellWorker(after.assignee_user_id, company, `New job: ${after.title}`, [`${company.name} assigned you a job.`, job, when].filter(Boolean), workerLink, 'Open the job');
    }
    if (events.includes('reassigned') && before.assignee_user_id && before.assignee_user_id !== after.assignee_user_id) {
      this.tellWorker(before.assignee_user_id, company, `Job reassigned: ${after.title}`, [`${company.name} gave ${job} to someone else.`], `${baseUrl(req)}/maint`, 'Open your jobs');
    }
    if (events.includes('unassigned') && before.assignee_user_id) {
      this.tellWorker(before.assignee_user_id, company, `Job removed: ${after.title}`, [`${company.name} took ${job} off your list.`], `${baseUrl(req)}/maint`, 'Open your jobs');
    }
    if (flags.includes('approval_requested')) {
      this.mail(company.email, company, `Approval needed: ${money(after.cost_estimate)} for ${after.title}`,
        [`${after.assignee_name} estimated ${money(after.cost_estimate)} for ${job}. Work is on hold until you approve.`, note || ''].filter(Boolean), managerLink, 'Review the estimate');
    }
    if (events.includes('approved')) {
      this.tellWorker(after.assignee_user_id, company, `Approved: ${after.title}`, [`${company.name} approved ${money(after.approved_amount)} for ${job}. You can start.`], workerLink, 'Open the job');
    }
    if (events.includes('rejected')) {
      this.tellWorker(before.assignee_user_id, company, `Estimate not approved: ${after.title}`, [`${company.name} did not approve the estimate for ${job}.`, `Reason: ${note}`], `${baseUrl(req)}/maint`, 'Open your jobs');
    }
    if (events.includes('submitted')) {
      this.mail(company.email, company, `${flags.includes('over_budget') ? 'Over budget: ' : 'Ready to verify: '}${after.title}`,
        [`${after.assignee_name} finished ${job}.`, after.cost_actual !== null ? `Actual cost: ${money(after.cost_actual)}${after.approved_amount !== null ? ` (approved ${money(after.approved_amount)})` : ''}` : '', after.completion_notes || ''].filter(Boolean),
        managerLink, 'Verify the work');
    }
    if (events.includes('bounced')) {
      this.tellWorker(after.assignee_user_id, company, `Sent back: ${after.title}`, [`${company.name} sent ${job} back.`, `Reason: ${note}`], workerLink, 'Open the job');
    }
    if (events.includes('canceled') && after.assignee_user_id) {
      this.tellWorker(after.assignee_user_id, company, `Canceled: ${after.title}`, [`${company.name} canceled ${job}.`, note ? `Reason: ${note}` : ''].filter(Boolean), `${baseUrl(req)}/maint`, 'Open your jobs');
    }
    if (events.includes('commented')) {
      if (req.path.startsWith('/maint')) this.mail(company.email, company, `Comment on ${after.title}`, [`${after.assignee_name}: ${note}`], managerLink, 'Open the work order');
      else this.tellWorker(after.assignee_user_id, company, `Comment on ${after.title}`, [`${company.name}: ${note}`], workerLink, 'Open the job');
    }
  }

  /** Validates and normalizes the payload of an action; returns an error message or the clean payload. */
  protected payloadFor(action: WoAction, b: any): { error: string } | any {
    switch (action) {
      case 'assign': {
        // 2026-10-08 04:10, a missing field means unassigned (was NaN → 'Invalid assignee')
        const assignee = b.assignee_user_id === undefined || b.assignee_user_id === null || b.assignee_user_id === '' ? null : Number(b.assignee_user_id);
        if (assignee !== null && !Number.isInteger(assignee)) return { error: 'Invalid assignee' };
        const approved = amount(b.approved_amount);
        if (approved === undefined) return { error: 'Pre-approved amount must be between 0 and 1,000,000' };
        return { assignee_user_id: assignee, approved_amount: approved };
      }
      case 'estimate': {
        const a = amount(b.amount);
        const note = text(b.note, TEXT_MAX, false);
        if (a === undefined || a === null) return { error: 'Estimate must be between 0 and 1,000,000' };
        if (note === undefined) return { error: 'Note is too long' };
        return { amount: a, note };
      }
      case 'approve': {
        const a = amount(b.amount);
        if (a === undefined) return { error: 'Amount must be between 0 and 1,000,000' };
        return { amount: a };
      }
      case 'reject': case 'bounce': {
        const reason = text(b.reason, TEXT_MAX, true);
        if (!reason) return { error: 'A reason is required' };
        const reopen = Array.isArray(b.reopen_item_ids) ? b.reopen_item_ids.map(Number).filter(Number.isInteger).slice(0, 200) : [];
        return { reason, reopen_item_ids: reopen };
      }
      case 'cancel': {
        const reason = text(b.reason, TEXT_MAX, false);
        return reason === undefined ? { error: 'Reason is too long' } : { reason };
      }
      case 'submit': {
        const notes = text(b.notes, TEXT_MAX, false);
        const actual = amount(b.cost_actual);
        if (notes === undefined) return { error: 'Notes are too long' };
        if (actual === undefined) return { error: 'Actual cost must be between 0 and 1,000,000' };
        return { notes, cost_actual: actual };
      }
      case 'comment': {
        const note = text(b.note, TEXT_MAX, true);
        return note ? { note } : { error: 'A comment is required' };
      }
      default:
        return {};
    }
  }

  // ---- manager ----

  async list(req: AuthRequest, res: Response) {
    try {
      const company = await this.opsCompany(req, res);
      if (!company) return;
      const status = req.query.status as WoStatus | undefined;
      if (status && !WO_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
      const orders = await this.orders.list(company.id, {
        status, property_id: req.query.property_id ? Number(req.query.property_id) : undefined,
        assignee_user_id: req.query.assignee_user_id ? Number(req.query.assignee_user_id) : undefined
      });
      const now = Date.now();
      res.json({
        work_orders: orders.map(o => ({ ...o, overdue: !!o.due_at && +new Date(o.due_at) < now && !['done', 'verified', 'canceled'].includes(o.status) })),
        approval_threshold: threshold(company)
      });
    } catch (error) {
      console.error('Error listing work orders:', error);
      res.status(500).json({ error: 'Failed to load work orders' });
    }
  }

  protected async ownedOrder(req: AuthRequest, res: Response): Promise<{ company: Company; order: WorkOrder } | null> {
    const company = await this.opsCompany(req, res);
    if (!company) return null;
    const order = await this.orders.get(parseInt(req.params.orderId));
    if (!order || order.company_id !== company.id) {
      res.status(404).json({ error: 'Work order not found' });
      return null;
    }
    return { company, order };
  }

  async detail(req: AuthRequest, res: Response) {
    try {
      const found = await this.ownedOrder(req, res);
      if (!found) return;
      const report = found.order.guest_report_id ? await this.orders.getReport(found.order.guest_report_id) : null;
      const time = await this.onsite.entriesFor(found.order.id);
      res.json({
        work_order: found.order, events: await this.orders.events(found.order.id), report: report && reportSummary(report),
        // 2026-10-08 00:50, G7 S3
        photos: await this.onsite.withUrls(found.order.id),
        checklist: await this.checklistView(found.order.id),
        time: { entries: time, minutes: OnSiteService.minutesOf(time), on_site: time.some(e => !e.clock_out) },
        access_window: this.onsite.accessState(found.order)
      });
    } catch (error) {
      console.error('Error loading work order:', error);
      res.status(500).json({ error: 'Failed to load work order' });
    }
  }

  /** Validates the editable fields shared by create and edit; returns the clean fields or an error. */
  private async fieldsFrom(b: any, company: Company, creating: boolean): Promise<{ error: string } | Record<string, any>> {
    const out: Record<string, any> = {};
    if (creating || 'title' in b) {
      const title = text(b.title, 255, true);
      if (!title) return { error: 'A title (max 255 characters) is required' };
      out.title = title;
    }
    if ('description' in b) {
      const d = text(b.description, TEXT_MAX, false);
      if (d === undefined) return { error: 'Description is too long' };
      out.description = d;
    }
    if (creating || 'type' in b) {
      const type = b.type || 'maintenance';
      if (!WO_TYPES.includes(type)) return { error: `Type must be one of: ${WO_TYPES.join(', ')}` };
      out.type = type;
    }
    if (creating || 'priority' in b) {
      const priority = b.priority || 'medium';
      if (!WO_PRIORITIES.includes(priority)) return { error: 'Invalid priority' };
      out.priority = priority;
    }
    for (const k of ['window_start', 'window_end', 'due_at']) {
      if (!(k in b)) continue;
      const d = date(b[k]);
      if (d === undefined) return { error: `Invalid date for ${k}` };
      out[k] = d;
    }
    if (out.window_start && out.window_end && out.window_end < out.window_start) return { error: 'The window must end after it starts' };
    if (creating) {
      const property = await this.properties.findById(Number(b.property_id));
      if (!property || property.company_id !== company.id) return { error: 'Choose one of your properties' };
      out.property_id = property.id;
    }
    return out;
  }

  private async checkAssignee(companyId: number, userId: number | null): Promise<string | null> {
    if (userId === null) return null;
    const member = await this.workers.getMember(companyId, userId);
    if (!member || member.status !== 'active') return 'Choose an active member of your team';
    // 2026-10-08 07:40, G7 S6: no new work for a vendor whose insurance has expired
    if (member.worker_type === 'vendor' && coiStatus(await new VendorService().get(userId)).state === 'expired') {
      return `${member.first_name} ${member.last_name}'s insurance certificate has expired. Ask them to upload the current one before assigning work.`;
    }
    return null;
  }

  async create(req: AuthRequest, res: Response) {
    try {
      const company = await this.opsCompany(req, res);
      if (!company) return;
      const b = req.body || {};
      const fields = await this.fieldsFrom(b, company, true);
      if ('error' in fields) return res.status(400).json(fields);
      const assign = this.payloadFor('assign', b);
      if ('error' in assign) return res.status(400).json(assign);
      const bad = await this.checkAssignee(company.id, assign.assignee_user_id);
      if (bad) return res.status(400).json({ error: bad });
      // 2026-10-08 03:00, G7 S4: optional checklist template (must be one of this company's active templates)
      let checklistId: number | null = null;
      if (b.checklist_template_id) {
        const t = await this.checklists.getTemplate(Number(b.checklist_template_id));
        if (!t || t.company_id !== company.id || !t.active) return res.status(400).json({ error: 'Choose one of your checklists' });
        checklistId = t.id;
      }
      const order = await this.orders.create({ ...(fields as any), company_id: company.id, assignee_user_id: assign.assignee_user_id, approved_amount: assign.approved_amount, checklist_template_id: checklistId },
        { id: req.user!.id, role: 'manager' });
      this.notify(req, company, { ...order, assignee_user_id: null }, order, order.assignee_user_id ? ['assigned'] : [], [], null).catch(err => console.error('Work order notification failed:', err));
      res.status(201).json({ message: 'Work order created', work_order: order });
    } catch (error) {
      console.error('Error creating work order:', error);
      res.status(500).json({ error: 'Failed to create work order' });
    }
  }

  async edit(req: AuthRequest, res: Response) {
    try {
      const found = await this.ownedOrder(req, res);
      if (!found) return;
      const fields = await this.fieldsFrom(req.body || {}, found.company, false);
      if ('error' in fields) return res.status(400).json(fields);
      const result = await this.orders.edit(found.order, fields as any, { id: req.user!.id, role: 'manager' });
      if ('error' in result) return res.status(result.status).json({ error: result.error });
      res.json({ message: 'Work order updated', work_order: result.order });
    } catch (error) {
      console.error('Error editing work order:', error);
      res.status(500).json({ error: 'Failed to update work order' });
    }
  }

  async managerAction(req: AuthRequest, res: Response) {
    try {
      const action = req.params.action as WoAction;
      if (!MANAGER_ACTIONS.includes(action)) return res.status(404).json({ error: 'Unknown action' });
      const found = await this.ownedOrder(req, res);
      if (!found) return;
      const payload = this.payloadFor(action, req.body || {});
      if ('error' in payload) return res.status(400).json(payload);
      if (action === 'assign') {
        const bad = await this.checkAssignee(found.company.id, payload.assignee_user_id);
        if (bad) return res.status(400).json({ error: bad });
      }
      const result = await this.orders.transition(found.order, action, { id: req.user!.id, role: 'manager' }, payload, threshold(found.company));
      if ('error' in result) return res.status(result.status).json({ error: result.error });
      // 2026-10-08 00:50, G7 S3: a job that leaves its worker closes their open check-in
      if (result.order.assignee_user_id !== found.order.assignee_user_id || result.order.status === 'canceled' || result.order.status === 'new') {
        await this.onsite.closeOpenEntries(found.order.id);
      }
      this.notify(req, found.company, found.order, result.order, result.events, result.flags, payload.reason ?? payload.note ?? null).catch(err => console.error('Work order notification failed:', err));
      res.json({ message: 'Done', work_order: result.order, flags: result.flags });
    } catch (error) {
      console.error('Error updating work order:', error);
      res.status(500).json({ error: 'Failed to update work order' });
    }
  }

  async fromReport(req: AuthRequest, res: Response) {
    try {
      const company = await this.opsCompany(req, res);
      if (!company) return;
      const report = await this.orders.getReport(parseInt(req.params.reportId));
      const property = report ? await this.properties.findById(report.property_id) : null;
      if (!report || !property || property.company_id !== company.id) return res.status(404).json({ error: 'Guest report not found' });
      const existing = await this.orders.findByReport(company.id, report.id!);
      if (existing) return res.status(409).json({ error: `Work order #${existing.id} already exists for this report`, work_order: existing });
      const order = await this.orders.createFromReport(company.id, report, { id: req.user!.id, role: 'manager' });
      res.status(201).json({ message: 'Work order created', work_order: order });
    } catch (error) {
      console.error('Error creating work order from report:', error);
      res.status(500).json({ error: 'Failed to create work order' });
    }
  }

  async settings(req: AuthRequest, res: Response) {
    try {
      const company = await this.opsCompany(req, res);
      if (!company) return;
      if (req.method === 'PUT') {
        const t = amount(req.body?.approval_threshold);
        if (t === undefined) return res.status(400).json({ error: 'Threshold must be between 0 and 1,000,000, or empty for no approvals' });
        await this.companies.setOpsApprovalThreshold(company.id, t);
        return res.json({ approval_threshold: t });
      }
      res.json({ approval_threshold: threshold(company) });
    } catch (error) {
      console.error('Error with Ops settings:', error);
      res.status(500).json({ error: 'Failed to save settings' });
    }
  }

  // ---- worker ----

  /** Companies where this worker may see jobs now (membership, company and Ops add-on all active). */
  protected async activeCompanies(userId: number) {
    const memberships = await this.workers.membershipsForUser(userId);
    return memberships.filter(m => m.status === 'active' && m.company_status === 'active' && entitlementsFor(m as any).ops);
  }

  async workerJobs(req: AuthRequest, res: Response) {
    try {
      const companies = await this.activeCompanies(req.user!.id);
      const byId = new Map(companies.map(c => [c.company_id, c]));
      const jobs = await this.orders.listForWorker(req.user!.id, companies.map(c => c.company_id));
      res.json({ jobs: jobs.map(j => workerView(j, byId.get(j.company_id)!)) });
    } catch (error) {
      console.error('Error loading worker jobs:', error);
      res.status(500).json({ error: 'Failed to load jobs' });
    }
  }

  protected async workerOrder(req: AuthRequest, res: Response) {
    const order = await this.orders.get(parseInt(req.params.jobId));
    const company = order ? (await this.activeCompanies(req.user!.id)).find(c => c.company_id === order.company_id) : null;
    if (!order || !company || order.assignee_user_id !== req.user!.id) {
      res.status(404).json({ error: 'Job not found' });
      return null;
    }
    return { order, membership: company };
  }

  async workerJob(req: AuthRequest, res: Response) {
    try {
      const found = await this.workerOrder(req, res);
      if (!found) return;
      const report = found.order.guest_report_id ? await this.orders.getReport(found.order.guest_report_id) : null;
      const events = (await this.orders.events(found.order.id)).map(e => ({
        action: e.action, note: e.note, created_at: e.created_at,
        // workers see who did it as "you" or the manager's company, never other workers' or the manager's personal details
        by: e.actor_user_id === req.user!.id ? 'You' : e.actor_role === 'field_worker' ? 'Previous assignee' : e.actor_user_id === null ? 'StayGuide' : found.membership.company_name,
        amount: e.data?.amount ?? e.data?.cost_actual ?? null
      }));
      const mine = await this.onsite.entriesFor(found.order.id, req.user!.id);
      const open = mine.find(e => !e.clock_out);
      const access = this.onsite.accessState(found.order);
      const { code, notes } = await this.onsite.codeFor(found.order);
      res.json({
        job: workerView(found.order, found.membership), report: report && reportSummary(report), events,
        // 2026-10-08 00:50, G7 S3: the code itself only comes from POST .../access (audited); here just whether it can be shown
        access: { ...access, has_code: !!code, notes: access.available ? notes : null },
        on_site: open ? { since: open.clock_in } : null,
        minutes_on_site: OnSiteService.minutesOf(mine),
        photos: await this.onsite.withUrls(found.order.id),
        checklist: await this.checklistView(found.order.id)
      });
    } catch (error) {
      console.error('Error loading job:', error);
      res.status(500).json({ error: 'Failed to load job' });
    }
  }

  async workerAction(req: AuthRequest, res: Response) {
    try {
      const action = req.params.action as WoAction;
      if (!WORKER_ACTIONS.includes(action)) return res.status(404).json({ error: 'Unknown action' });
      const found = await this.workerOrder(req, res);
      if (!found) return;
      const payload = this.payloadFor(action, req.body || {});
      if ('error' in payload) return res.status(400).json(payload);
      const company = (await this.companies.findById(found.order.company_id))!;
      // 2026-10-08 00:50, G7 S3: one open check-in at a time
      const openEntry = await this.onsite.openEntryFor(req.user!.id);
      if (action === 'start' && openEntry && openEntry.work_order_id !== found.order.id) {
        return res.status(409).json({ error: 'You are still checked in at another job. Check out there first.' });
      }
      const result = await this.orders.transition(found.order, action, { id: req.user!.id, role: 'worker' }, payload, threshold(company));
      if ('error' in result) return res.status(result.status).json({ error: result.error });
      if (action === 'start' && !openEntry) {
        await this.onsite.clockIn(found.order.id, req.user!.id, 'button');
        await this.orders.addEvent(found.order.id, req.user!.id, 'checked_in', null, { method: 'button' });
      }
      if (action === 'submit' && openEntry && openEntry.work_order_id === found.order.id) {
        await this.onsite.clockOut(openEntry, 'submit');
        await this.orders.addEvent(found.order.id, req.user!.id, 'checked_out', null, { method: 'submit' });
      }
      this.notify(req, company, found.order, result.order, result.events, result.flags, payload.note ?? payload.notes ?? null).catch(err => console.error('Work order notification failed:', err));
      res.json({ message: 'Done', job: workerView(result.order, found.membership), flags: result.flags });
    } catch (error) {
      console.error('Error updating job:', error);
      res.status(500).json({ error: 'Failed to update job' });
    }
  }
}

/** Guest report fields that may be shown with a work order. Guest name, phone, room and IP are never included. */
export function reportSummary(r: any) {
  return { id: r.id, title: r.title, description: r.description, category: r.category, location: r.location ?? null, priority: r.priority, created_at: r.created_at };
}

/** What a worker sees of a work order: the job and the company that hired them, nothing about other companies or guests. */
export function workerView(o: WorkOrder, m: { company_id: number; company_name: string; logo_url: string | null }) {
  return {
    id: o.id, type: o.type, title: o.title, description: o.description, priority: o.priority, status: o.status,
    window_start: o.window_start, window_end: o.window_end, due_at: o.due_at,
    cost_estimate: o.cost_estimate, approved_amount: o.approved_amount, cost_actual: o.cost_actual, completion_notes: o.completion_notes,
    property: { name: o.property_name, address: o.property_address ?? null },
    company: { id: m.company_id, name: m.company_name, logo_url: m.logo_url },
    from_guest_report: !!o.guest_report_id,
    updated_at: o.updated_at
  };
}
