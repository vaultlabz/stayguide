// 2026-10-08 05:10, G7 Ops stage 5: per-request context (AsyncLocalStorage) so services can use the phone's time for
// updates that were queued offline and sent later, without threading it through every call.
import { AsyncLocalStorage } from 'async_hooks';

interface Ctx { clientTime?: Date }
export const requestContext = new AsyncLocalStorage<Ctx>();

/** Max age accepted for a queued update's device time; older (or future) times fall back to the server clock. */
const MAX_LAG_MS = 48 * 3600 * 1000;

export function parseClientTime(value: unknown, now = Date.now()): Date | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const t = Date.parse(value);
  if (!Number.isFinite(t) || t > now + 60_000 || t < now - MAX_LAG_MS) return undefined;
  return new Date(Math.min(t, now));
}

/** The device time of a replayed offline update, if any. */
export const clientTime = (): Date | undefined => requestContext.getStore()?.clientTime;

/** When the action really happened: the device time for replayed updates, otherwise now. */
export const clientNow = (): Date => clientTime() ?? new Date();
