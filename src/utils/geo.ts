// 2026-10-10 10:28, #62 presence at the property: phone location fixes, distance to the property spot, and parsing a
// pasted pin ("34.0195, -118.4912" or a Google / Apple Maps link).

/** Within this many metres (plus the fix's accuracy, capped) counts as "at the property". */
export const AT_PROPERTY_M = 150;
/** Further than this from the property while checked in: the app suggests checking out. */
export const AWAY_M = 300;
/** A QR check-in may set the property spot only when the fix is at least this precise. */
export const LEARN_MAX_ACCURACY_M = 50;
const MAX_ACCURACY_ALLOWANCE_M = 100;

export interface Fix { lat: number; lng: number; accuracy: number }
export interface Point { lat: number; lng: number }

const validLatLng = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** `{lat, lng, accuracy}` from a request body, or null when missing or out of range. */
export function parseFix(raw: any): Fix | null {
  if (!raw || typeof raw !== 'object') return null;
  const lat = Number(raw.lat), lng = Number(raw.lng), accuracy = Number(raw.accuracy);
  if (!validLatLng(lat, lng) || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 50000) return null;
  return { lat: round6(lat), lng: round6(lng), accuracy: Math.round(accuracy) };
}

/** Great-circle distance in metres. */
export function distanceM(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** The property's precise spot, or null when it has not been set. */
export function siteOf(p: { site_lat?: any; site_lng?: any } | null | undefined): Point | null {
  if (!p || p.site_lat === null || p.site_lat === undefined || p.site_lng === null || p.site_lng === undefined) return null;
  const lat = Number(p.site_lat), lng = Number(p.site_lng);
  return validLatLng(lat, lng) ? { lat, lng } : null;
}

/** Whether a fix this far away counts as at the property (a vague fix gets some benefit of the doubt). */
export function atProperty(distance: number, accuracy: number): boolean {
  return distance <= AT_PROPERTY_M + Math.min(accuracy, MAX_ACCURACY_ALLOWANCE_M);
}

/** "34.0195, -118.4912", or a maps link with @lat,lng / ?q=lat,lng / ll=lat,lng / !3dlat!4dlng. */
export function parseCoords(text: unknown): Point | null {
  const s = String(text ?? '').trim();
  if (!s || s.length > 2000) return null;
  const n = '(-?\\d{1,3}(?:\\.\\d+)?)';
  const patterns = [
    new RegExp(`!3d${n}!4d${n}`),
    new RegExp(`@${n},${n}`),
    new RegExp(`[?&](?:q|ll|query|daddr|sll)=${n}(?:,|%2C)\\s*${n}`, 'i'),
    new RegExp(`^${n}\\s*,\\s*${n}$`)
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2]);
      if (validLatLng(lat, lng)) return { lat: round6(lat), lng: round6(lng) };
    }
  }
  return null;
}

export type Place = { state: 'at' | 'away' | 'unset' | 'none'; label: string };
/** How a check-in/out location reads: at the property, N away, spot not set, or no location from the phone. */
export function placeOf(lat: unknown, dist: unknown, acc: unknown): Place {
  if (lat === null || lat === undefined) return { state: 'none', label: 'no location from the phone' };
  if (dist === null || dist === undefined) return { state: 'unset', label: 'property location not set' };
  const d = Number(dist);
  return atProperty(d, Number(acc) || 0) ? { state: 'at', label: 'at the property' } : { state: 'away', label: `${formatDistance(d)} from the property` };
}

/** "120 m" / "1.4 km" */
export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}
