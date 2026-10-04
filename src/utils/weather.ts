// 2026-10-03 17:00, tablet weather: Open-Meteo (free, no API key) proxied by the server because the page CSP only allows connect-src 'self'.
// Results are cached 30 minutes per property; if Open-Meteo is down the last value is returned with stale: true.

export type WeatherCondition = 'clear' | 'partly' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

/** Map a WMO weather_code (Open-Meteo) to the small icon set the tablet draws. */
export const weatherCondition = (code: number): WeatherCondition => {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95 && code <= 99) return 'storm';
  return 'cloudy';
};

export interface WeatherResult { temperature: number; unit: 'F' | 'C'; condition: WeatherCondition; code: number; updated_at: string; stale?: boolean }

const TTL_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 5000;
const cache = new Map<string, { at: number; data: WeatherResult }>();

// Overridable so tests never touch the real internet
const forecastBase = () => process.env.OPEN_METEO_BASE_URL || 'https://api.open-meteo.com';
const geocodeBase = () => process.env.OPEN_METEO_GEOCODE_URL || 'https://geocoding-api.open-meteo.com';

export const clearWeatherCache = () => cache.clear();

export async function getWeather(propertyId: number, latitude: number, longitude: number, unit: 'F' | 'C'): Promise<WeatherResult | null> {
  const key = `${propertyId}:${latitude},${longitude},${unit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  try {
    const url = new URL('/v1/forecast', forecastBase());
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('current', 'temperature_2m,weather_code');
    url.searchParams.set('temperature_unit', unit === 'C' ? 'celsius' : 'fahrenheit');
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
    const body: any = await response.json();
    const temp = body?.current?.temperature_2m;
    const code = body?.current?.weather_code;
    if (typeof temp !== 'number' || typeof code !== 'number') throw new Error('Unexpected Open-Meteo response');
    const data: WeatherResult = { temperature: Math.round(temp), unit, condition: weatherCondition(code), code, updated_at: new Date().toISOString() };
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (error) {
    console.error('Weather lookup failed:', (error as Error).message);
    return hit ? { ...hit.data, stale: true } : null;
  }
}

/** Candidate search terms from a street address: ZIP first, then city, then the whole string. */
export const geocodeCandidates = (address: string): string[] => {
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  const zip = address.match(/\b\d{5}(?:-\d{4})?\b/);
  const candidates: string[] = [];
  if (zip) candidates.push(zip[0].slice(0, 5));
  if (parts.length >= 2) candidates.push(parts[parts.length - 2].replace(/\d+/g, '').trim());
  candidates.push(address);
  return candidates.filter(c => c.length > 1);
};

export async function geocodeAddress(address: string): Promise<{ latitude: number; longitude: number; name: string } | null> {
  for (const term of geocodeCandidates(address)) {
    try {
      const url = new URL('/v1/search', geocodeBase());
      url.searchParams.set('name', term);
      url.searchParams.set('count', '1');
      const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) continue;
      const body: any = await response.json();
      const hit = body?.results?.[0];
      if (hit && typeof hit.latitude === 'number' && typeof hit.longitude === 'number') {
        return { latitude: hit.latitude, longitude: hit.longitude, name: [hit.name, hit.admin1, hit.country_code].filter(Boolean).join(', ') };
      }
    } catch (error) {
      console.error('Geocoding failed:', (error as Error).message);
    }
  }
  return null;
}
