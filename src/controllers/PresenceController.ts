// 2026-10-10 10:28, #62 presence at the property, for the company dashboard:
// GET /presence: per property, anonymous guest activity (tablet + phone guide events) and, with Ops, who is on site now.
// PUT /properties/:propertySlug/site: the precise property spot used for crew check-in distance.
import { Response } from 'express';
import { RowDataPacket } from 'mysql2';
import { AuthRequest } from '../types';
import { db } from '../utils/database';
import { MOCK_MODE, mockSectionEvents, mockDevices } from '../utils/mock-database';
import { resolveOwnedCompany, resolveOwnedProperty } from '../utils/ownership';
import { PropertyService } from '../services/PropertyService';
import { TimeService, minutesOf } from '../services/TimeService';
import { entitlementsFor } from '../services/EntitlementService';
import { parseCoords, siteOf, placeOf } from '../utils/geo';

const DAY = 24 * 3600 * 1000;
/** A tablet that checked in this recently counts as online. */
const TABLET_ONLINE_MS = 30 * 60 * 1000;

interface Activity { last_at: Date | null; visits_24h: number; events_24h: number; on_site_visits_24h: number }
const empty = (): Activity => ({ last_at: null, visits_24h: 0, events_24h: 0, on_site_visits_24h: 0 });

export class PresenceController {
  private properties = new PropertyService();
  private time = new TimeService();

  /** Guest events per property and source over the last 30 days (last activity) and the last 24 h (counts). */
  private async activity(ids: number[], now: Date): Promise<Map<string, Activity>> {
    const out = new Map<string, Activity>();
    if (!ids.length) return out;
    const since30 = new Date(+now - 30 * DAY), since24 = new Date(+now - DAY);
    if (MOCK_MODE) {
      for (const e of mockSectionEvents) {
        if (!ids.includes(e.property_id) || +new Date(e.created_at) < +since30) continue;
        const key = `${e.property_id}:${e.source}`;
        const a = out.get(key) || out.set(key, empty()).get(key)!;
        if (!a.last_at || +new Date(e.created_at) > +a.last_at) a.last_at = new Date(e.created_at);
        if (+new Date(e.created_at) >= +since24) {
          a.events_24h++;
          if (e.section === 'home' && e.action === 'visit') { a.visits_24h++; if (e.on_site === true) a.on_site_visits_24h++; }
        }
      }
      return out;
    }
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT property_id, source, MAX(created_at) AS last_at,
              SUM(created_at >= ?) AS events_24h,
              SUM(created_at >= ? AND section = 'home' AND action = 'visit') AS visits_24h,
              SUM(created_at >= ? AND section = 'home' AND action = 'visit' AND on_site = 1) AS on_site_visits_24h
         FROM section_events
        WHERE property_id IN (${ids.map(() => '?').join(',')}) AND created_at >= ?
        GROUP BY property_id, source`, [since24, since24, since24, ...ids, since30]);
    for (const r of rows) {
      out.set(`${r.property_id}:${r.source}`, { last_at: r.last_at, visits_24h: Number(r.visits_24h), events_24h: Number(r.events_24h), on_site_visits_24h: Number(r.on_site_visits_24h) });
    }
    return out;
  }

  private async tabletsSeen(ids: number[]): Promise<Map<number, Date>> {
    const out = new Map<number, Date>();
    if (!ids.length) return out;
    const rows: any[] = MOCK_MODE
      ? mockDevices.filter(d => ids.includes(d.property_id) && d.status === 'active' && d.last_seen_at)
      : (await db.execute<RowDataPacket[]>(`SELECT property_id, MAX(last_seen_at) AS last_seen_at FROM devices
          WHERE property_id IN (${ids.map(() => '?').join(',')}) AND status = 'active' AND last_seen_at IS NOT NULL GROUP BY property_id`, ids))[0];
    for (const r of rows) {
      const prev = out.get(r.property_id);
      if (!prev || +new Date(r.last_seen_at) > +prev) out.set(r.property_id, new Date(r.last_seen_at));
    }
    return out;
  }

  // GET /company/:companySlug/presence
  async overview(req: AuthRequest, res: Response) {
    try {
      const company = await resolveOwnedCompany(req, res);
      if (!company) return;
      const now = new Date();
      const props = (await this.properties.getPropertiesByCompany(company.id)).filter(p => p.status === 'active');
      const ids = props.map(p => p.id);
      const [activity, tablets] = await Promise.all([this.activity(ids, now), this.tabletsSeen(ids)]);
      const ent = entitlementsFor(company);

      // crew on site now (Ops only): open, not voided check-ins from the last day
      const onSite = ent.ops
        ? (await this.time.list(company.id, { from: new Date(+now - DAY), to: new Date(+now + 60000) })).filter(e => !e.clock_out && !e.voided_at)
        : [];

      res.json({
        analytics: ent.features.analytics, ops: ent.ops,
        properties: props.map(p => {
          const tablet = activity.get(`${p.id}:tablet`) || empty(), guide = activity.get(`${p.id}:guest_link`) || empty();
          const seen = tablets.get(p.id) || null;
          const last = [tablet.last_at, guide.last_at].filter(Boolean).map(d => +new Date(d!)).sort((a, b) => b - a)[0];
          return {
            id: p.id, slug: p.slug, name: p.name,
            site: siteOf(p), site_source: p.site_source ?? null, guide_location_check: !!p.guide_location_check,
            guests: {
              last_activity_at: last ? new Date(last) : null,
              tablet: { ...tablet, online: !!seen && +now - +seen < TABLET_ONLINE_MS, last_seen_at: seen },
              guide
            },
            crew_on_site: onSite.filter(e => e.property_id === p.id).map(e => {
              const g: any = e;
              return { worker_name: e.worker_name, job_id: e.work_order_id, job_title: e.job_title, since: e.clock_in, minutes: minutesOf(e, now), place: placeOf(g.lat_in, g.dist_in, g.acc_in) };
            })
          };
        })
      });
    } catch (error) {
      console.error('Presence overview error:', error);
      res.status(500).json({ error: 'Failed to load activity' });
    }
  }

  // PUT /company/:companySlug/properties/:propertySlug/site  { location: "lat, lng" | maps link } | { lat, lng } | { clear: true }
  async setSite(req: AuthRequest, res: Response) {
    try {
      const property = await resolveOwnedProperty(req, res);
      if (!property) return;
      if (req.body?.clear === true) {
        await this.properties.setSite(property.id, null, 'pin');
        return res.json({ site: null, site_source: null });
      }
      const b = req.body || {};
      const point = b.location !== undefined ? parseCoords(b.location) : parseCoords(`${b.lat}, ${b.lng}`);
      if (!point) return res.status(400).json({ error: 'Paste coordinates like "34.0195, -118.4912" or a Google / Apple Maps link to the property' });
      await this.properties.setSite(property.id, point, 'pin');
      res.json({ site: point, site_source: 'pin' });
    } catch (error) {
      console.error('Set property location error:', error);
      res.status(500).json({ error: 'Failed to save the location' });
    }
  }
}
