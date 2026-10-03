// 2026-10-03 12:32, Phase 5: direct-booking / review / showcase links shown on tablets as QR codes.
// Scans go through /r/... so we can count them and tag the owner's site with UTM + sg_click.
import crypto from 'crypto';
import QRCode from 'qrcode';
import { RowDataPacket } from 'mysql2';
import { db } from '../utils/database';
import { Property } from '../types';
import { MOCK_MODE, mockLinkClicks, mockProperties } from '../utils/mock-database';

export type LinkKind = 'book' | 'review' | 'showcase';
export type LinkMedium = 'qr' | 'tablet';

const CAMPAIGN: Record<LinkKind, string> = { book: 'return_guest', review: 'review', showcase: 'showcase' };
const MAX_SHOWCASE = 3;

export const isHttpUrl = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

export class LinkService {
  /** Record a scan and return the click id (sent to the owner's site as sg_click). */
  async recordClick(propertyId: number, kind: LinkKind, medium: LinkMedium, targetPropertyId: number | null): Promise<string> {
    const id = crypto.randomBytes(8).toString('hex'); // 16 chars

    if (MOCK_MODE) {
      mockLinkClicks.push({ id, property_id: propertyId, kind, target_property_id: targetPropertyId, medium, created_at: new Date() });
      return id;
    }

    await db.execute(
      'INSERT INTO link_clicks (id, property_id, kind, target_property_id, medium) VALUES (?, ?, ?, ?, ?)',
      [id, propertyId, kind, targetPropertyId, medium]
    );
    return id;
  }

  /** Scan counts per kind for a property over the last `days` days. */
  async getStats(propertyId: number, days = 30): Promise<Record<LinkKind, number>> {
    const stats: Record<LinkKind, number> = { book: 0, review: 0, showcase: 0 };
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    if (MOCK_MODE) {
      for (const c of mockLinkClicks) {
        if (c.property_id === propertyId && c.created_at >= since) stats[c.kind as LinkKind]++;
      }
      return stats;
    }

    const [rows] = await db.execute<RowDataPacket[]>(
      'SELECT kind, COUNT(*) AS total FROM link_clicks WHERE property_id = ? AND created_at >= ? GROUP BY kind',
      [propertyId, since]
    );
    for (const row of rows) stats[row.kind as LinkKind] = Number(row.total);
    return stats;
  }

  /** Other active properties of the same company that have a booking link. */
  async getShowcaseProperties(companyId: number, excludePropertyId: number): Promise<Property[]> {
    if (MOCK_MODE) {
      return (mockProperties as any[])
        .filter(p => p.company_id === companyId && p.id !== excludePropertyId && p.status === 'active' && isHttpUrl(p.direct_booking_url))
        .slice(0, MAX_SHOWCASE) as Property[];
    }

    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM properties
       WHERE company_id = ? AND id != ? AND status = 'active' AND direct_booking_url IS NOT NULL AND direct_booking_url != ''
       ORDER BY name LIMIT ${MAX_SHOWCASE}`,
      [companyId, excludePropertyId]
    );
    return (rows as Property[]).filter(p => isHttpUrl(p.direct_booking_url));
  }

  /** Destination URL for a scan, tagged for the owner's analytics. Null if the link isn't configured. */
  buildDestination(source: Property, target: Property | null, kind: LinkKind, medium: LinkMedium, clickId: string): string | null {
    const raw = kind === 'review' ? source.review_url : (kind === 'showcase' ? target?.direct_booking_url : source.direct_booking_url);
    if (!isHttpUrl(raw)) return null;

    const url = new URL(raw as string);
    url.searchParams.set('utm_source', 'stayguide');
    url.searchParams.set('utm_medium', medium);
    url.searchParams.set('utm_campaign', CAMPAIGN[kind]);
    url.searchParams.set('utm_content', source.slug);
    if (kind !== 'review') url.searchParams.set('sg_click', clickId); // review sites don't use it
    return url.toString();
  }

  /** Links + QR codes for the tablet content payload. */
  async buildGuestLinks(property: Property, baseUrl: string) {
    const qr = (url: string) => QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    const scanUrl = (path: string) => `${baseUrl}/r/${property.id}/${path}`;

    const book = isHttpUrl(property.direct_booking_url)
      ? { scan_url: scanUrl('book'), qr_svg: await qr(scanUrl('book')), offer: property.return_guest_offer || null }
      : null;

    const review = isHttpUrl(property.review_url)
      ? { scan_url: scanUrl('review'), qr_svg: await qr(scanUrl('review')) }
      : null;

    const showcase = [];
    for (const other of await this.getShowcaseProperties(property.company_id, property.id)) {
      const url = scanUrl(`showcase/${other.id}`);
      showcase.push({ name: other.name, scan_url: url, qr_svg: await qr(url) });
    }

    const checkout = property.guest_checkout_date;
    const checkoutDate = checkout instanceof Date
      ? checkout.toISOString().slice(0, 10)
      : (checkout ? String(checkout).slice(0, 10) : null);

    return { book, review, showcase, checkout_date: checkoutDate };
  }
}
