// 2026-10-08 11:20, G7 Ops stage 8: preventive schedules (manager CRUD) and the company time zone setting
import { Response } from 'express';
import { AuthRequest } from '../types';
import { TimeController } from './TimeController';
import { threshold, presenceOn } from './WorkOrderController';
import { ScheduleService, firstOnOrAfter, Schedule } from '../services/ScheduleService';
import { WO_TYPES, WO_PRIORITIES } from '../services/WorkOrderService';
import { todayIn, validTz } from '../services/TimeService';
import { db } from '../utils/database';
import { MOCK_MODE, mockCompanies } from '../utils/mock-database';

const int = (v: unknown, min: number, max: number) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : null; };

export class ScheduleController extends TimeController {
  protected schedules = new ScheduleService();

  private async scheduleView(s: Schedule) {
    const property = await this.properties.findById(s.property_id);
    const member = s.default_assignee_user_id ? await this.workers.getMember(s.company_id, s.default_assignee_user_id) : null;
    const template = s.checklist_template_id ? await this.checklists.getTemplate(s.checklist_template_id) : null;
    return { ...s, property_name: property?.name ?? null, assignee_name: member ? `${member.first_name} ${member.last_name}` : null, checklist_name: template?.name ?? null };
  }

  async listSchedules(req: AuthRequest, res: Response) {
    try {
      const company = await this.opsCompany(req, res);
      if (!company) return;
      const tz = validTz(company.timezone);
      res.json({ timezone: tz, today: todayIn(tz), schedules: await Promise.all((await this.schedules.list(company.id)).map(s => this.scheduleView(s))) });
    } catch (error) {
      console.error('Error listing schedules:', error);
      res.status(500).json({ error: 'Failed to load schedules' });
    }
  }

  /** Validates a full schedule body. next_due_on comes from start_on (default today) and the recurrence. */
  private async scheduleInput(b: any, companyId: number, tz: string, existing: Schedule | null): Promise<{ error: string } | Omit<Schedule, 'id' | 'company_id' | 'last_order_id'>> {
    const title = typeof b.title === 'string' && b.title.trim() && b.title.trim().length <= 255 ? b.title.trim() : null;
    if (!title) return { error: 'A title (max 255 characters) is required' };
    const property = await this.properties.findById(Number(b.property_id));
    if (!property || property.company_id !== companyId) return { error: 'Choose one of your properties' };
    const type = b.type || 'maintenance', priority = b.priority || 'medium';
    if (!WO_TYPES.includes(type) || !WO_PRIORITIES.includes(priority)) return { error: 'Invalid type or priority' };
    const description = typeof b.description === 'string' && b.description.trim() ? b.description.trim().slice(0, 5000) : null;
    let checklist: number | null = null;
    if (b.checklist_template_id) {
      const t = await this.checklists.getTemplate(Number(b.checklist_template_id));
      if (!t || t.company_id !== companyId || !t.active) return { error: 'Choose one of your checklists' };
      checklist = t.id;
    }
    let assignee: number | null = null;
    if (b.default_assignee_user_id) {
      const m = await this.workers.getMember(companyId, Number(b.default_assignee_user_id));
      if (!m || m.status !== 'active') return { error: 'Choose an active member of your team' };
      assignee = m.user_id;
    }
    const recurrence = b.recurrence;
    let interval_days: number | null = null, weekday: number | null = null, month_day: number | null = null;
    if (recurrence === 'every_n_days') { interval_days = int(b.interval_days, 1, 365); if (!interval_days) return { error: 'Repeat every 1 to 365 days' }; }
    else if (recurrence === 'weekly') { weekday = int(b.weekday, 0, 6); if (weekday === null) return { error: 'Choose a weekday' }; }
    else if (recurrence === 'monthly') { month_day = int(b.month_day, 1, 28); if (!month_day) return { error: 'Choose a day of the month from 1 to 28' }; }
    else return { error: 'Repeat must be every N days, weekly or monthly' };
    const window_start_time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.window_start_time || '09:00')) ? String(b.window_start_time || '09:00') : null;
    if (!window_start_time) return { error: 'Start time must be HH:MM' };
    const window_hours = int(b.window_hours ?? 4, 1, 12);
    const lead_days = int(b.lead_days ?? 3, 0, 30);
    if (!window_hours || lead_days === null) return { error: 'Window 1–12 hours; create 0–30 days ahead' };
    const today = todayIn(tz);
    const start = /^\d{4}-\d{2}-\d{2}$/.test(String(b.start_on || '')) ? String(b.start_on) : null;
    const rules = { recurrence, interval_days, weekday, month_day };
    // keep the current next due date unless the timing changed or a new start was given
    const sameRules = existing && existing.recurrence === recurrence && existing.interval_days === interval_days && existing.weekday === weekday && existing.month_day === month_day;
    const next_due_on = start ? firstOnOrAfter(rules, start < today ? today : start) : sameRules ? existing!.next_due_on : firstOnOrAfter(rules, today);
    return { title, description, property_id: property.id, type, priority, checklist_template_id: checklist, default_assignee_user_id: assignee,
      recurrence, interval_days, weekday, month_day, window_start_time, window_hours, lead_days, next_due_on, active: existing ? existing.active : true };
  }

  async createSchedule(req: AuthRequest, res: Response) {
    try {
      const company = await this.opsCompany(req, res);
      if (!company) return;
      const input = await this.scheduleInput(req.body || {}, company.id, validTz(company.timezone), null);
      if ('error' in input) return res.status(400).json(input);
      const s = await this.schedules.save(null, company.id, input, req.user!.id);
      res.status(201).json({ schedule: await this.scheduleView(s) });
    } catch (error) {
      console.error('Error creating schedule:', error);
      res.status(500).json({ error: 'Failed to create the schedule' });
    }
  }

  private async ownedSchedule(req: AuthRequest, res: Response) {
    const company = await this.opsCompany(req, res);
    if (!company) return null;
    const s = await this.schedules.get(parseInt(req.params.scheduleId));
    if (!s || s.company_id !== company.id) { res.status(404).json({ error: 'Schedule not found' }); return null; }
    return { company, s };
  }

  async updateSchedule(req: AuthRequest, res: Response) {
    try {
      const found = await this.ownedSchedule(req, res);
      if (!found) return;
      const b = req.body || {};
      if (Object.keys(b).length === 1 && 'active' in b) {
        const s = await this.schedules.save(found.s.id, found.company.id, { ...stripIds(found.s), active: b.active === true }, req.user!.id);
        return res.json({ schedule: await this.scheduleView(s) });
      }
      const input = await this.scheduleInput({ ...found.s, ...b }, found.company.id, validTz(found.company.timezone), found.s);
      if ('error' in input) return res.status(400).json(input);
      const s = await this.schedules.save(found.s.id, found.company.id, input, req.user!.id);
      res.json({ schedule: await this.scheduleView(s) });
    } catch (error) {
      console.error('Error updating schedule:', error);
      res.status(500).json({ error: 'Failed to save the schedule' });
    }
  }

  /** Extends GET/PUT /ops/settings with the company time zone (schedules and local times use it). */
  async settings(req: AuthRequest, res: Response) {
    if (req.method === 'PUT' && !('timezone' in (req.body || {}))) return super.settings(req, res);
    try {
      const company = await this.opsCompany(req, res);
      if (!company) return;
      if (req.method !== 'PUT') return res.json({ approval_threshold: threshold(company), timezone: validTz(company.timezone), presence_emails: presenceOn(company) }); // 2026-10-10 10:28, #62
      const tz = String(req.body.timezone || '');
      if (validTz(tz) !== tz) return res.status(400).json({ error: 'Unknown time zone' });
      if (MOCK_MODE) (mockCompanies.find(c => c.id === company.id) as any).timezone = tz;
      else await db.execute('UPDATE companies SET timezone = ? WHERE id = ?', [tz, company.id]);
      if ('approval_threshold' in req.body || 'presence_emails' in req.body) return super.settings(req, res);
      res.json({ timezone: tz });
    } catch (error) {
      console.error('Error saving time zone:', error);
      res.status(500).json({ error: 'Failed to save settings' });
    }
  }
}

const stripIds = ({ id, company_id, last_order_id, ...rest }: Schedule) => rest;
