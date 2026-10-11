// 2026-10-08 09:20, G7 Ops stage 7: time & pay. Managers review, correct (with a reason) and export on-site time;
// workers see their own hours.
import { Response } from 'express';
import { AuthRequest } from '../types';
import { ChecklistController } from './ChecklistController';
import { TimeService, validTz, zonedMidnight, minutesOf, TimeRow } from '../services/TimeService';
import { placeOf } from '../utils/geo'; // 2026-10-10 10:28, #62

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 93;

function reasonOf(v: unknown): string | null {
  return typeof v === 'string' && v.trim() && v.trim().length <= 500 ? v.trim() : null;
}
function dateOf(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const d = new Date(String(v));
  return isNaN(+d) ? undefined : d;
}
const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export class TimeController extends ChecklistController {
  protected time = new TimeService();

  /** ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive) &tz=IANA. Default: the last 14 days. */
  private range(req: AuthRequest): { error: string } | { from: string; to: string; tz: string; fromUtc: Date; toUtc: Date } {
    const tz = validTz(req.query.tz);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const to = YMD.test(String(req.query.to || '')) ? String(req.query.to) : today;
    const from = YMD.test(String(req.query.from || '')) ? String(req.query.from) : addDays(to, -13);
    if (from > to) return { error: '"From" must be on or before "to"' };
    if ((Date.parse(to) - Date.parse(from)) / 86400000 > MAX_RANGE_DAYS) return { error: `Choose at most ${MAX_RANGE_DAYS} days` };
    return { from, to, tz, fromUtc: zonedMidnight(from, tz), toUtc: zonedMidnight(addDays(to, 1), tz) };
  }

  private view(e: TimeRow) {
    const g: any = e; // 2026-10-10 10:28, #62 where the phone was at check-in/out
    return { ...e, minutes: minutesOf(e), open: !e.clock_out && !e.voided_at,
      place_in: e.method_in === 'manual' ? null : placeOf(g.lat_in, g.dist_in, g.acc_in), place_out: e.clock_out && e.method_out !== 'system' ? placeOf(g.lat_out, g.dist_out, g.acc_out) : null };
  }

  async list(req: AuthRequest, res: Response) {
    try {
      const company = await this.opsCompany(req, res);
      if (!company) return;
      const r = this.range(req);
      if ('error' in r) return res.status(400).json(r);
      const entries = await this.time.list(company.id, { from: r.fromUtc, to: r.toUtc,
        userId: req.query.user_id ? Number(req.query.user_id) : undefined, propertyId: req.query.property_id ? Number(req.query.property_id) : undefined });
      res.json({ from: r.from, to: r.to, tz: r.tz, entries: entries.map(e => this.view(e)), totals: await this.time.totals(company.id, entries) });
    } catch (error) {
      console.error('Error loading time:', error);
      res.status(500).json({ error: 'Failed to load time entries' });
    }
  }

  async exportCsv(req: AuthRequest, res: Response) {
    try {
      const company = await this.opsCompany(req, res);
      if (!company) return;
      const r = this.range(req);
      if ('error' in r) return res.status(400).json(r);
      const entries = await this.time.list(company.id, { from: r.fromUtc, to: r.toUtc, userId: req.query.user_id ? Number(req.query.user_id) : undefined,
        propertyId: req.query.property_id ? Number(req.query.property_id) : undefined });
      const totals = await this.time.totals(company.id, entries);
      const summary = req.query.kind === 'summary';
      const csv = summary ? this.time.summaryCsv(totals, r.from, r.to) : this.time.entriesCsv(entries, totals, r.tz);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${company.slug}-${summary ? 'pay-summary' : 'time'}-${r.from}-to-${r.to}.csv"`);
      res.setHeader('Cache-Control', 'no-store');
      res.send(csv);
    } catch (error) {
      console.error('Error exporting time:', error);
      res.status(500).json({ error: 'Failed to export' });
    }
  }

  private async ownedEntry(req: AuthRequest, res: Response) {
    const company = await this.opsCompany(req, res);
    if (!company) return null;
    const entry = await this.time.get(parseInt(req.params.entryId));
    if (!entry || entry.company_id !== company.id) {
      res.status(404).json({ error: 'Time entry not found' });
      return null;
    }
    return { company, entry };
  }

  /** PUT /ops/time/:entryId { clock_in?, clock_out?, reason } : correct or close an entry. */
  async edit(req: AuthRequest, res: Response) {
    try {
      const found = await this.ownedEntry(req, res);
      if (!found) return;
      const { entry } = found;
      if (entry.voided_at) return res.status(409).json({ error: 'This entry was voided' });
      const reason = reasonOf(req.body?.reason);
      if (!reason) return res.status(400).json({ error: 'A reason is required (it is kept with the entry)' });
      const inAt = dateOf(req.body?.clock_in), outAt = dateOf(req.body?.clock_out);
      if (inAt === undefined && req.body?.clock_in !== undefined || outAt === undefined && req.body?.clock_out !== undefined) return res.status(400).json({ error: 'Invalid date' });
      const clockIn = inAt ?? new Date(entry.clock_in);
      const clockOut = outAt === undefined ? (entry.clock_out ? new Date(entry.clock_out) : null) : outAt;
      if (entry.clock_out && clockOut === null) return res.status(400).json({ error: 'A closed entry needs a check-out time' });
      const bad = await this.time.validatePeriod(entry.user_id, clockIn, clockOut, entry.id);
      if (bad) return res.status(400).json({ error: bad });
      const saved = await this.time.edit(entry, clockIn, clockOut, req.user!.id, reason);
      await this.orders.addEvent(entry.work_order_id, req.user!.id, 'time_edited', reason, { time_entry_id: entry.id });
      res.json({ entry: this.view(saved) });
    } catch (error) {
      console.error('Error editing time:', error);
      res.status(500).json({ error: 'Failed to save' });
    }
  }

  /** POST /ops/time { work_order_id, user_id, clock_in, clock_out, reason } : time a worker forgot to record. */
  async add(req: AuthRequest, res: Response) {
    try {
      const company = await this.opsCompany(req, res);
      if (!company) return;
      const b = req.body || {};
      const reason = reasonOf(b.reason);
      if (!reason) return res.status(400).json({ error: 'A reason is required (it is kept with the entry)' });
      const order = await this.orders.get(Number(b.work_order_id));
      if (!order || order.company_id !== company.id) return res.status(400).json({ error: 'Choose one of your work orders' });
      const userId = Number(b.user_id);
      if (!(await this.workers.getMember(company.id, userId))) return res.status(400).json({ error: 'Choose a member of your team' });
      const clockIn = dateOf(b.clock_in), clockOut = dateOf(b.clock_out);
      if (!clockIn || !clockOut) return res.status(400).json({ error: 'Check-in and check-out times are required' });
      const bad = await this.time.validatePeriod(userId, clockIn, clockOut, null);
      if (bad) return res.status(400).json({ error: bad });
      const row = await this.time.add({ work_order_id: order.id, user_id: userId, clock_in: clockIn, clock_out: clockOut }, req.user!.id, reason);
      await this.orders.addEvent(order.id, req.user!.id, 'time_added', reason, { time_entry_id: row.id });
      res.status(201).json({ entry: this.view(row) });
    } catch (error) {
      console.error('Error adding time:', error);
      res.status(500).json({ error: 'Failed to add time' });
    }
  }

  async voidEntry(req: AuthRequest, res: Response) {
    try {
      const found = await this.ownedEntry(req, res);
      if (!found) return;
      if (found.entry.voided_at) return res.status(409).json({ error: 'Already voided' });
      const reason = reasonOf(req.body?.reason);
      if (!reason) return res.status(400).json({ error: 'A reason is required (it is kept with the entry)' });
      const saved = await this.time.void(found.entry, req.user!.id, reason);
      await this.orders.addEvent(found.entry.work_order_id, req.user!.id, 'time_voided', reason, { time_entry_id: found.entry.id });
      res.json({ entry: this.view(saved) });
    } catch (error) {
      console.error('Error voiding time:', error);
      res.status(500).json({ error: 'Failed to void' });
    }
  }

  async history(req: AuthRequest, res: Response) {
    try {
      const found = await this.ownedEntry(req, res);
      if (!found) return;
      res.json({ entry: this.view(found.entry), history: await this.time.history(found.entry.id) });
    } catch (error) {
      console.error('Error loading time history:', error);
      res.status(500).json({ error: 'Failed to load history' });
    }
  }

  /** GET /maint/api/time?tz= : the worker's own hours this week (Mon–Sun) and last week, per company. */
  async mine(req: AuthRequest, res: Response) {
    try {
      const tz = validTz(req.query.tz);
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
      const monday = addDays(today, -dow);
      const weeks = [{ label: 'This week', from: monday }, { label: 'Last week', from: addDays(monday, -7) }];
      const companies = await this.workers.membershipsForUser(req.user!.id);
      const out = [];
      for (const w of weeks) {
        const from = zonedMidnight(w.from, tz), to = zonedMidnight(addDays(w.from, 7), tz);
        let minutes = 0;
        for (const c of companies) {
          const rows = await this.time.list(c.company_id, { from, to, userId: req.user!.id });
          minutes += rows.reduce((s, e) => s + (e.clock_out ? minutesOf(e) : 0), 0);
        }
        out.push({ label: w.label, from: w.from, minutes });
      }
      res.json({ weeks: out });
    } catch (error) {
      console.error('Error loading worker time:', error);
      res.status(500).json({ error: 'Failed to load your hours' });
    }
  }
}
