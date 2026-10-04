// 2026-10-04 00:26, G4 section analytics: what guests use on the tablet / phone guide (Pro feature, no personal data)
import { RowDataPacket } from 'mysql2';
import { db } from '../utils/database';
import { MOCK_MODE, mockSectionEvents } from '../utils/mock-database';

export type EventSource = 'tablet' | 'guest_link';

/** Allowed section → actions. Anything else is dropped. */
export const ALLOWED_EVENTS: Record<string, string[]> = {
  home: ['visit'],
  wifi: ['open', 'copy'],
  house: ['open'],
  amenities: ['open'],
  videos: ['open', 'play'],
  guide: ['open'],
  book: ['open', 'tap'],
  report: ['open', 'submit']
};

export const MAX_EVENTS_PER_BATCH = 50;

export function validEvents(raw: unknown): { section: string; action: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_EVENTS_PER_BATCH)
    .filter((e: any) => e && typeof e.section === 'string' && typeof e.action === 'string' && (ALLOWED_EVENTS[e.section] || []).includes(e.action))
    .map((e: any) => ({ section: e.section, action: e.action }));
}

export interface AnalyticsSummary {
  days: number;
  visits: { total: number; tablet: number; guest_link: number };
  sections: { section: string; action: string; tablet: number; guest_link: number; total: number }[];
  daily: { date: string; visits: number; opens: number }[];
}

export class AnalyticsService {
  async record(propertyId: number, source: EventSource, deviceId: number | null, events: { section: string; action: string }[]): Promise<number> {
    if (!events.length) return 0;
    if (MOCK_MODE) {
      const now = new Date();
      for (const e of events) mockSectionEvents.push({ property_id: propertyId, source, device_id: deviceId, ...e, created_at: now });
      return events.length;
    }
    const placeholders = events.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const values = events.flatMap(e => [propertyId, source, deviceId, e.section, e.action]);
    await db.execute(`INSERT INTO section_events (property_id, source, device_id, section, action) VALUES ${placeholders}`, values);
    return events.length;
  }

  private async rows(propertyIds: number[], since: Date): Promise<any[]> {
    if (!propertyIds.length) return [];
    if (MOCK_MODE) return mockSectionEvents.filter(e => propertyIds.includes(e.property_id) && e.created_at >= since);
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT section, action, source, DATE_FORMAT(created_at, '%Y-%m-%d') AS day, COUNT(*) AS n
       FROM section_events WHERE property_id IN (${propertyIds.map(() => '?').join(', ')}) AND created_at >= ?
       GROUP BY section, action, source, day`,
      [...propertyIds, since]
    );
    return rows;
  }

  /** Aggregate for one or more properties over the last `days` days (UTC dates). */
  async summary(propertyIds: number[], days = 30): Promise<AnalyticsSummary> {
    const since = new Date(Date.now() - days * 86400000);
    const raw = await this.rows(propertyIds, since);
    // Normalise mock rows (one per event) and SQL rows (grouped with n) to the same shape
    const grouped = raw.map(r => r.n !== undefined
      ? { section: r.section, action: r.action, source: r.source, day: r.day, n: Number(r.n) }
      : { section: r.section, action: r.action, source: r.source, day: new Date(r.created_at).toISOString().slice(0, 10), n: 1 });

    const bySection = new Map<string, { section: string; action: string; tablet: number; guest_link: number; total: number }>();
    const byDay = new Map<string, { visits: number; opens: number }>();
    const visits = { total: 0, tablet: 0, guest_link: 0 };

    for (const r of grouped) {
      const key = `${r.section}:${r.action}`;
      const s = bySection.get(key) || { section: r.section, action: r.action, tablet: 0, guest_link: 0, total: 0 };
      s[r.source as EventSource] += r.n; s.total += r.n;
      bySection.set(key, s);
      const d = byDay.get(r.day) || { visits: 0, opens: 0 };
      if (r.section === 'home' && r.action === 'visit') {
        d.visits += r.n; visits.total += r.n; visits[r.source as EventSource] += r.n;
      } else if (r.action === 'open') {
        d.opens += r.n;
      }
      byDay.set(r.day, d);
    }

    const daily = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      daily.push({ date, ...(byDay.get(date) || { visits: 0, opens: 0 }) });
    }
    const sections = [...bySection.values()].filter(s => s.section !== 'home').sort((a, b) => b.total - a.total);
    return { days, visits, sections, daily };
  }
}
