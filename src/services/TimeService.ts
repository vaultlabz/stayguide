// 2026-10-08 09:10, G7 Ops stage 7: time & pay (manager review of on-site time, audited corrections, pay export).
// Entries come from check-in/out (stage 3) or are added by a manager. Every manager change needs a reason and is stored
// with the values before and after. Voided entries stay visible but count for nothing.
import { RowDataPacket } from 'mysql2';
import { db } from '../utils/database';
import { MOCK_MODE, mockTimeEntries, mockTimeEntryEdits, mockWorkOrders, mockProperties, mockUsers, mockCompanyWorkers } from '../utils/mock-database';

export const MAX_ENTRY_HOURS = 24;

export interface TimeRow {
  id: number; work_order_id: number; user_id: number; clock_in: Date; clock_out: Date | null;
  method_in: string; method_out: string | null; created_by: number | null; edited: boolean; voided_at: Date | null; void_reason: string | null;
  // joined
  worker_name: string; worker_email: string; job_title: string; property_id: number; property_name: string; company_id: number;
}
export interface Totals { user_id: number; worker_name: string; worker_email: string; worker_type: string | null; minutes: number; hourly_rate: number | null; amount: number | null; entries: number; open: number }

const nextId = (rows: any[]) => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
export const minutesOf = (e: Pick<TimeRow, 'clock_in' | 'clock_out' | 'voided_at'>, now = new Date()) =>
  e.voided_at ? 0 : Math.max(0, Math.round(((e.clock_out ? +new Date(e.clock_out) : +now) - +new Date(e.clock_in)) / 60000));

// ---- time zones (the manager's browser zone, IANA name) ----

export function validTz(tz: unknown): string {
  if (typeof tz !== 'string' || !tz) return 'UTC';
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return 'UTC'; }
}
/** Offset of `tz` from UTC at instant `t`, in ms. */
function tzOffset(t: number, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}
/** UTC instant of local midnight on `ymd` in `tz`. */
export function zonedMidnight(ymd: string, tz: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - tzOffset(guess, tz);
  t = guess - tzOffset(t, tz); // second pass handles DST changes
  return new Date(t);
}
/** UTC instant of local wall time `hhmm` (HH:MM) on `ymd` in `tz` (2026-10-08 10:40, G7 S8 schedules). */
export function zonedTime(ymd: string, hhmm: string, tz: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - tzOffset(guess, tz);
  t = guess - tzOffset(t, tz);
  return new Date(t);
}
/** Today's date (YYYY-MM-DD) in `tz`. */
export const todayIn = (tz: string, now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const localParts = (d: Date, tz: string) => {
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, ...o }).format(d);
  return { date: f({ year: 'numeric', month: '2-digit', day: '2-digit' }), time: f({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) };
};

export class TimeService {
  private decorate(e: any): TimeRow {
    const o: any = mockWorkOrders.find(x => x.id === e.work_order_id) || {};
    const p: any = mockProperties.find(x => x.id === o.property_id) || {};
    const u: any = mockUsers.find(x => x.id === e.user_id) || {};
    return { ...e, edited: !!e.edited, worker_name: `${u.first_name} ${u.last_name}`, worker_email: u.email, job_title: o.title, property_id: o.property_id, property_name: p.name, company_id: o.company_id };
  }

  async get(id: number): Promise<TimeRow | null> {
    if (MOCK_MODE) { const e = mockTimeEntries.find(x => x.id === id); return e ? this.decorate(e) : null; }
    const [rows] = await db.execute<RowDataPacket[]>(`${SELECT} WHERE t.id = ?`, [id]);
    return rows[0] ? norm(rows[0]) : null;
  }

  /** Entries of the company that started in [from, to), optionally for one worker / property. Oldest first. */
  async list(companyId: number, f: { from: Date; to: Date; userId?: number; propertyId?: number }): Promise<TimeRow[]> {
    if (MOCK_MODE) {
      return mockTimeEntries.map(e => this.decorate(e))
        .filter(e => e.company_id === companyId && +new Date(e.clock_in) >= +f.from && +new Date(e.clock_in) < +f.to
          && (!f.userId || e.user_id === f.userId) && (!f.propertyId || e.property_id === f.propertyId))
        .sort((a, b) => +new Date(a.clock_in) - +new Date(b.clock_in));
    }
    const where = ['w.company_id = ?', 't.clock_in >= ?', 't.clock_in < ?'];
    const params: any[] = [companyId, f.from, f.to];
    if (f.userId) { where.push('t.user_id = ?'); params.push(f.userId); }
    if (f.propertyId) { where.push('w.property_id = ?'); params.push(f.propertyId); }
    const [rows] = await db.execute<RowDataPacket[]>(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY t.clock_in ASC`, params);
    return rows.map(norm);
  }

  /** Per-worker totals with the hourly rate from their membership in this company (rates are not snapshotted). */
  async totals(companyId: number, entries: TimeRow[]): Promise<Totals[]> {
    const rates = new Map<number, { rate: number | null; type: string | null }>();
    if (MOCK_MODE) {
      mockCompanyWorkers.filter(m => m.company_id === companyId).forEach(m => rates.set(m.user_id, { rate: m.hourly_rate ?? null, type: m.worker_type }));
    } else {
      const [rows] = await db.execute<RowDataPacket[]>('SELECT user_id, hourly_rate, worker_type FROM company_workers WHERE company_id = ?', [companyId]);
      rows.forEach(r => rates.set(r.user_id, { rate: r.hourly_rate === null ? null : Number(r.hourly_rate), type: r.worker_type }));
    }
    const by = new Map<number, Totals>();
    for (const e of entries) {
      const t = by.get(e.user_id) || { user_id: e.user_id, worker_name: e.worker_name, worker_email: e.worker_email, worker_type: rates.get(e.user_id)?.type ?? null,
        minutes: 0, hourly_rate: rates.get(e.user_id)?.rate ?? null, amount: null, entries: 0, open: 0 };
      if (!e.voided_at) { t.minutes += e.clock_out ? minutesOf(e) : 0; t.entries++; if (!e.clock_out) t.open++; }
      by.set(e.user_id, t);
    }
    for (const t of by.values()) t.amount = t.hourly_rate === null ? null : Math.round((t.minutes / 60) * t.hourly_rate * 100) / 100;
    return [...by.values()].sort((a, b) => a.worker_name.localeCompare(b.worker_name));
  }

  /** Another (non-voided) entry of the same worker overlapping [start, end). */
  private async overlaps(userId: number, start: Date, end: Date | null, exceptId: number | null): Promise<boolean> {
    const rows: any[] = MOCK_MODE
      ? mockTimeEntries.filter(e => e.user_id === userId)
      : (await db.execute<RowDataPacket[]>('SELECT id, clock_in, clock_out, voided_at FROM time_entries WHERE user_id = ?', [userId]))[0];
    const s = +start, en = end ? +end : Date.now();
    return rows.some(r => r.id !== exceptId && !r.voided_at && +new Date(r.clock_in) < en && (r.clock_out ? +new Date(r.clock_out) : Date.now()) > s);
  }

  /** Common checks for a corrected or added period. */
  async validatePeriod(userId: number, start: Date, end: Date | null, exceptId: number | null): Promise<string | null> {
    const now = Date.now();
    if (+start > now) return 'Check-in can\'t be in the future';
    if (end && +end > now + 60_000) return 'Check-out can\'t be in the future';
    if (end && +end <= +start) return 'Check-out must be after check-in';
    if (end && +end - +start > MAX_ENTRY_HOURS * 3600000) return `An entry can be at most ${MAX_ENTRY_HOURS} hours; split it into several`;
    if (await this.overlaps(userId, start, end, exceptId)) return 'This overlaps another time entry of the same person';
    return null;
  }

  private async record(entryId: number, editorId: number, action: 'added' | 'edited' | 'closed' | 'voided', reason: string, before: any, after: any) {
    const pick = (e: any) => e && { clock_in: e.clock_in, clock_out: e.clock_out, voided_at: e.voided_at ?? null };
    if (MOCK_MODE) {
      mockTimeEntryEdits.push({ id: nextId(mockTimeEntryEdits), time_entry_id: entryId, editor_id: editorId, action, reason, before_json: pick(before), after_json: pick(after), created_at: new Date() });
      return;
    }
    await db.execute('INSERT INTO time_entry_edits (time_entry_id, editor_id, action, reason, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?)',
      [entryId, editorId, action, reason, before ? JSON.stringify(pick(before)) : null, after ? JSON.stringify(pick(after)) : null]);
  }

  async add(d: { work_order_id: number; user_id: number; clock_in: Date; clock_out: Date }, editorId: number, reason: string): Promise<TimeRow> {
    let id: number;
    if (MOCK_MODE) {
      id = nextId(mockTimeEntries);
      mockTimeEntries.push({ id, ...d, method_in: 'manual', method_out: 'button', created_by: editorId, edited: false, voided_at: null, void_reason: null, created_at: new Date() });
    } else {
      const [r] = await db.execute("INSERT INTO time_entries (work_order_id, user_id, clock_in, clock_out, method_in, method_out, created_by) VALUES (?, ?, ?, ?, 'manual', 'button', ?)",
        [d.work_order_id, d.user_id, d.clock_in, d.clock_out, editorId]);
      id = (r as any).insertId;
    }
    const row = (await this.get(id))!;
    await this.record(id, editorId, 'added', reason, null, row);
    return row;
  }

  async edit(entry: TimeRow, clockIn: Date, clockOut: Date | null, editorId: number, reason: string): Promise<TimeRow> {
    const action = !entry.clock_out && clockOut && +clockIn === +new Date(entry.clock_in) ? 'closed' : 'edited';
    if (MOCK_MODE) {
      Object.assign(mockTimeEntries.find(e => e.id === entry.id), { clock_in: clockIn, clock_out: clockOut, edited: true, method_out: clockOut && !entry.clock_out ? 'button' : entry.method_out });
    } else {
      await db.execute(`UPDATE time_entries SET clock_in = ?, clock_out = ?, edited = true${clockOut && !entry.clock_out ? ", method_out = 'button'" : ''} WHERE id = ?`, [clockIn, clockOut, entry.id]);
    }
    const after = (await this.get(entry.id))!;
    await this.record(entry.id, editorId, action, reason, entry, after);
    return after;
  }

  async void(entry: TimeRow, editorId: number, reason: string): Promise<TimeRow> {
    const now = new Date();
    if (MOCK_MODE) {
      Object.assign(mockTimeEntries.find(e => e.id === entry.id), { voided_at: now, void_reason: reason, clock_out: entry.clock_out ?? now });
    } else {
      await db.execute('UPDATE time_entries SET voided_at = ?, void_reason = ?, clock_out = COALESCE(clock_out, ?) WHERE id = ?', [now, reason, now, entry.id]);
    }
    const after = (await this.get(entry.id))!;
    await this.record(entry.id, editorId, 'voided', reason, entry, after);
    return after;
  }

  async history(entryId: number) {
    if (MOCK_MODE) {
      return mockTimeEntryEdits.filter(x => x.time_entry_id === entryId).map(x => {
        const u: any = mockUsers.find(y => y.id === x.editor_id) || {};
        return { ...x, editor_name: `${u.first_name} ${u.last_name}` };
      });
    }
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT x.*, CONCAT(u.first_name, ' ', u.last_name) AS editor_name FROM time_entry_edits x LEFT JOIN users u ON u.id = x.editor_id WHERE x.time_entry_id = ? ORDER BY x.id`, [entryId]);
    return rows.map(r => ({ ...r, before_json: typeof r.before_json === 'string' ? JSON.parse(r.before_json) : r.before_json, after_json: typeof r.after_json === 'string' ? JSON.parse(r.after_json) : r.after_json }));
  }

  // ---- CSV ----

  /** Pay export: one row per entry, in the manager's time zone. Voided entries are left out; open ones are marked. */
  entriesCsv(entries: TimeRow[], totals: Totals[], tz: string): string {
    const rate = new Map(totals.map(t => [t.user_id, t.hourly_rate]));
    const head = ['Worker', 'Email', 'Date', 'Check in', 'Check out', 'Hours', 'Hourly rate', 'Amount', 'Job #', 'Job', 'Property', 'How', 'Corrected', 'Time zone'];
    const rows = entries.filter(e => !e.voided_at).map(e => {
      const a = localParts(new Date(e.clock_in), tz);
      const b = e.clock_out ? localParts(new Date(e.clock_out), tz) : null;
      const hours = e.clock_out ? minutesOf(e) / 60 : null;
      const r = rate.get(e.user_id) ?? null;
      return [e.worker_name, e.worker_email, a.date, a.time, b ? (b.date === a.date ? b.time : `${b.date} ${b.time}`) : 'still checked in',
        hours === null ? '' : hours.toFixed(2), r === null ? '' : r.toFixed(2), hours === null || r === null ? '' : (Math.round(hours * r * 100) / 100).toFixed(2),
        e.work_order_id, e.job_title, e.property_name, e.method_in === 'manual' ? 'added by manager' : e.method_in, e.edited || e.method_in === 'manual' ? 'yes' : 'no', tz];
    });
    return toCsv([head, ...rows]);
  }

  summaryCsv(totals: Totals[], from: string, to: string): string {
    const head = ['Worker', 'Email', 'Type', 'From', 'To', 'Hours', 'Hourly rate', 'Amount', 'Entries', 'Still checked in'];
    const rows = totals.map(t => [t.worker_name, t.worker_email, t.worker_type ?? '', from, to, (t.minutes / 60).toFixed(2),
      t.hourly_rate === null ? '' : t.hourly_rate.toFixed(2), t.amount === null ? '' : t.amount.toFixed(2), t.entries, t.open]);
    return toCsv([head, ...rows]);
  }
}

/** RFC 4180 CSV; text that a spreadsheet would treat as a formula is prefixed with ' (CSV injection). */
function toCsv(rows: any[][]): string {
  const cell = (v: any) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s))) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

const SELECT = `SELECT t.*, CONCAT(u.first_name, ' ', u.last_name) AS worker_name, u.email AS worker_email,
       w.title AS job_title, w.property_id, w.company_id, p.name AS property_name
  FROM time_entries t JOIN work_orders w ON w.id = t.work_order_id JOIN properties p ON p.id = w.property_id JOIN users u ON u.id = t.user_id`;
const norm = (r: any): TimeRow => ({ ...r, edited: !!r.edited });
