// 2026-10-08 07:50, G7 Ops: in-process scheduler (single Node instance on Plesk; see docs/G7_OPS_PLAN.md).
// Stage 6: insurance certificate reminders (30 days, 7 days, expired) to the vendor and every company they work for.
// Stage 8: preventive schedules (create jobs ahead of time), overdue and unassigned digests to managers.
import { VendorService, dueAlert, coiStatus, AlertLevel } from '../services/VendorService';
import { WorkerService } from '../services/WorkerService';
import { CompanyService } from '../services/CompanyService';
import { UserService } from '../services/UserService';
import { EmailService } from '../services/EmailService';
import { PushService } from '../services/PushService';
import { entitlementsFor } from '../services/EntitlementService';
import { ScheduleService } from '../services/ScheduleService'; // 2026-10-08 11:10, G7 S8
import { WorkOrderService, WorkOrder } from '../services/WorkOrderService';

const HOUR = 3600 * 1000;
let running = false;
let timer: NodeJS.Timeout | null = null;

const base = () => (process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

async function certificateReminders(): Promise<number> {
  const vendors = new VendorService(), workers = new WorkerService(), companies = new CompanyService();
  const users = new UserService(), email = new EmailService(), push = new PushService();
  let sent = 0;
  for (const profile of await vendors.listWithExpiry()) {
    const level = dueAlert(profile);
    if (!level) continue;
    const user = await users.findById(profile.user_id);
    const memberships = (await workers.membershipsForUser(profile.user_id))
      .filter(m => m.status === 'active' && m.company_status === 'active' && entitlementsFor(m as any).ops);
    if (!user || !memberships.length) { await vendors.setAlertLevel(profile.user_id, level); continue; }
    const s = coiStatus(profile);
    const when = s.state === 'expired' ? `expired on ${fmt(s.expires_on!)}` : `expires on ${fmt(s.expires_on!)} (${s.days_left} day${s.days_left === 1 ? '' : 's'})`;
    const who = `${user.first_name} ${user.last_name}${profile.business_name ? ` (${profile.business_name})` : ''}`;
    const subject = (lvl: AlertLevel) => (lvl === 'expired' ? 'Insurance certificate expired' : 'Insurance certificate expires soon');

    email.sendEmail({
      to: user.email, fromName: 'StayGuide', subject: `${subject(level)}: please upload the new one`,
      text: `Your insurance certificate ${when}.${level === 'expired' ? ' Managers cannot assign you new jobs until you upload the current one.' : ''}\n\nUpload it in the app: ${base()}/maint?profile=1\n\nPowered by StayGuide`,
      html: `<p>Your insurance certificate ${when}.${level === 'expired' ? ' Managers cannot assign you new jobs until you upload the current one.' : ''}</p><p><a href="${base()}/maint?profile=1">Upload it in the app</a></p><p style="color:#999;font-size:12px">Powered by StayGuide</p>`
    }).catch(err => console.error('COI reminder email failed:', err));
    push.notify(profile.user_id, { title: subject(level), body: `Your certificate ${when}. Upload the new one in the app.`, url: '/maint?profile=1', tag: 'coi' }).catch(() => {});

    for (const m of memberships) {
      const company = await companies.findById(m.company_id);
      if (!company?.email) continue;
      email.sendEmail({
        to: company.email, fromName: 'StayGuide', subject: `${subject(level)}: ${who}`,
        text: `${who}'s insurance certificate ${when}.${level === 'expired' ? ' They cannot be assigned new work until a current certificate is uploaded.' : ''}\n\nTeam: ${base()}/company/${company.slug}/team`,
        html: `<p>${who}'s insurance certificate ${when}.${level === 'expired' ? ' They cannot be assigned new work until a current certificate is uploaded.' : ''}</p><p><a href="${base()}/company/${company.slug}/team">Open the team</a></p>`
      }).catch(err => console.error('COI manager email failed:', err));
    }
    await vendors.setAlertLevel(profile.user_id, level);
    sent++;
  }
  return sent;
}

// ---- 2026-10-08 11:10, G7 S8 ----
const UNASSIGNED_AFTER_MS = 24 * HOUR, UNASSIGNED_URGENT_AFTER_MS = HOUR;
const when = (d: Date | null) => (d ? new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '');

/** Creates scheduled jobs that are due and tells the assigned person (email + push). */
async function scheduledJobs(now: Date): Promise<number> {
  const created = await new ScheduleService().generateDue(now);
  const users = new UserService(), email = new EmailService(), push = new PushService(), companies = new CompanyService();
  for (const o of created.filter(x => x.assignee_user_id)) {
    const [u, c] = await Promise.all([users.findById(o.assignee_user_id!), companies.findById(o.company_id)]);
    if (!u || !c) continue;
    const link = `${base()}/maint?job=${o.id}`;
    email.sendEmail({ to: u.email, fromName: `${c.name} via StayGuide`, subject: `New job: ${o.title}`,
      text: `${c.name} scheduled a job for you.\n\n#${o.id} ${o.title} (${o.property_name})\nWhen: ${when(o.window_start)}\n\nOpen the job: ${link}\n\nPowered by StayGuide`,
      html: `<p>${c.name} scheduled a job for you.</p><p><strong>#${o.id} ${o.title}</strong> (${o.property_name})<br>When: ${when(o.window_start)}</p><p><a href="${link}">Open the job</a></p>` }).catch(() => {});
    push.notify(u.id, { title: `New job: ${o.title}`, body: `${o.property_name} · ${when(o.window_start)}`, url: `/maint?job=${o.id}`, tag: `/maint?job=${o.id}` }).catch(() => {});
  }
  return created.length;
}

/** One digest per company: jobs that just became overdue, and new jobs nobody has taken. Each job is reported once. */
async function managerDigests(now: Date): Promise<{ overdue: number; unassigned: number }> {
  const orders = new WorkOrderService(), companies = new CompanyService(), email = new EmailService(), push = new PushService();
  const open = await orders.openForAlerts();
  const overdue = open.filter(o => o.due_at && +new Date(o.due_at) < +now && !o.overdue_alerted_at);
  const unassigned = open.filter(o => o.status === 'new' && !o.unassigned_alerted_at
    && +now - +new Date(o.created_at) > (o.priority === 'urgent' ? UNASSIGNED_URGENT_AFTER_MS : UNASSIGNED_AFTER_MS));
  const byCompany = new Map<number, { overdue: WorkOrder[]; unassigned: WorkOrder[] }>();
  for (const o of overdue) (byCompany.get(o.company_id) || byCompany.set(o.company_id, { overdue: [], unassigned: [] }).get(o.company_id)!).overdue.push(o);
  for (const o of unassigned) (byCompany.get(o.company_id) || byCompany.set(o.company_id, { overdue: [], unassigned: [] }).get(o.company_id)!).unassigned.push(o);
  let nOver = 0, nUn = 0;
  for (const [companyId, g] of byCompany) {
    const c = await companies.findById(companyId);
    if (!c || c.status !== 'active' || !entitlementsFor(c).ops) continue;
    const line = (o: WorkOrder) => `#${o.id} ${o.title} · ${o.property_name}${o.assignee_name ? ' · ' + o.assignee_name : ''}${o.due_at ? ' · due ' + when(o.due_at) : ''}`;
    const parts = [
      g.overdue.length ? `Overdue (${g.overdue.length}):\n${g.overdue.map(line).join('\n')}` : '',
      g.unassigned.length ? `Waiting for someone to be assigned (${g.unassigned.length}):\n${g.unassigned.map(line).join('\n')}` : ''
    ].filter(Boolean);
    const link = `${base()}/company/${c.slug}/ops`;
    const subject = [g.overdue.length ? `${g.overdue.length} overdue` : '', g.unassigned.length ? `${g.unassigned.length} unassigned` : ''].filter(Boolean).join(', ');
    email.sendEmail({ to: c.email, fromName: 'StayGuide', subject: `Work orders: ${subject}`,
      text: `${parts.join('\n\n')}\n\nOpen the board: ${link}`,
      html: `${parts.map(p => `<p style="white-space:pre-wrap">${p.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]!))}</p>`).join('')}<p><a href="${link}">Open the board</a></p>` }).catch(() => {});
    for (const o of g.overdue) {
      if (o.assignee_user_id) push.notify(o.assignee_user_id, { title: `Overdue: ${o.title}`, body: `${o.property_name}${o.due_at ? ' · was due ' + when(o.due_at) : ''}`, url: `/maint?job=${o.id}`, tag: `/maint?job=${o.id}` }).catch(() => {});
      await orders.markAlerted(o.id, 'overdue_alerted_at'); nOver++;
    }
    for (const o of g.unassigned) { await orders.markAlerted(o.id, 'unassigned_alerted_at'); nUn++; }
  }
  return { overdue: nOver, unassigned: nUn };
}

/** One pass of every Ops check. Safe to call any time; overlapping runs are skipped. */
export async function runOpsChecks(now = new Date()): Promise<{ certificate_reminders: number; scheduled_jobs: number; overdue_alerts: number; unassigned_alerts: number } | { skipped: true }> {
  if (running) return { skipped: true };
  running = true;
  try {
    const certificate_reminders = await certificateReminders();
    const scheduled_jobs = await scheduledJobs(now);
    const digests = await managerDigests(now);
    return { certificate_reminders, scheduled_jobs, overdue_alerts: digests.overdue, unassigned_alerts: digests.unassigned };
  } finally {
    running = false;
  }
}

export function startOpsScheduler() {
  if (timer || process.env.OPS_SCHEDULER === 'off') return;
  const tick = () => runOpsChecks().then(r => { if (!('skipped' in r) && Object.values(r).some(Boolean)) console.log('[ops] checks:', r); }).catch(err => console.error('[ops] scheduled checks failed:', err));
  setTimeout(tick, 15_000).unref();
  timer = setInterval(tick, HOUR);
  timer.unref();
}
