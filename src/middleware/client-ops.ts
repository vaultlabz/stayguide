// 2026-10-08 05:10, G7 Ops stage 5: idempotent replay of worker updates queued offline.
// The app sends `X-Client-Op-Id` (UUID) and `X-Client-Created-At` (ISO time on the phone) with every queued update.
// The first result (2xx or 4xx) is stored; a resend with the same id gets that stored result instead of running again.
import { Response, NextFunction } from 'express';
import { RowDataPacket } from 'mysql2';
import { AuthRequest } from '../types';
import { db } from '../utils/database';
import { MOCK_MODE, mockClientOps } from '../utils/mock-database';
import { requestContext, parseClientTime } from '../utils/request-context';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEEP_DAYS = 30;
const inFlight = new Set<string>();

async function findOp(userId: number, opId: string): Promise<{ request: string; status_code: number; response: any } | null> {
  if (MOCK_MODE) return mockClientOps.find(o => o.user_id === userId && o.op_id === opId) || null;
  const [rows] = await db.execute<RowDataPacket[]>('SELECT request, status_code, response FROM client_ops WHERE user_id = ? AND op_id = ?', [userId, opId]);
  const r: any = rows[0];
  return r ? { request: r.request, status_code: r.status_code, response: typeof r.response === 'string' ? JSON.parse(r.response) : r.response } : null;
}

async function saveOp(userId: number, opId: string, request: string, status: number, body: any) {
  if (MOCK_MODE) {
    mockClientOps.push({ user_id: userId, op_id: opId, request, status_code: status, response: body, created_at: new Date() });
    if (mockClientOps.length > 5000) mockClientOps.splice(0, mockClientOps.length - 5000);
    return;
  }
  await db.execute('INSERT IGNORE INTO client_ops (user_id, op_id, request, status_code, response) VALUES (?, ?, ?, ?, ?)', [userId, opId, request, status, JSON.stringify(body ?? null)]);
  if (Math.random() < 0.01) await db.execute(`DELETE FROM client_ops WHERE created_at < NOW() - INTERVAL ${KEEP_DAYS} DAY`);
}

/** Use after authentication on worker POST routes. Without the header it is a no-op (normal online use). */
export const idempotentOp = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const opId = String(req.headers['x-client-op-id'] || '');
  if (!opId) return next();
  if (!UUID.test(opId) || !req.user) return res.status(400).json({ error: 'Invalid X-Client-Op-Id' });
  const key = `${req.user.id}:${opId}`;
  const request = `${req.method} ${req.originalUrl.split('?')[0]}`.slice(0, 255);
  try {
    const done = await findOp(req.user.id, opId);
    if (done && done.request !== request) return res.status(400).json({ error: 'X-Client-Op-Id was already used for another update' });
    if (done) {
      res.setHeader('X-Client-Op-Replayed', '1');
      return res.status(done.status_code).json(done.response);
    }
    if (inFlight.has(key)) return res.status(409).json({ error: 'This update is already being processed', retry: true });
    inFlight.add(key);
  } catch (error) {
    console.error('client op lookup failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }

  // capture the JSON result so a resend can get the same answer
  const json = res.json.bind(res);
  res.json = (body: any) => {
    const status = res.statusCode;
    if (status < 500) saveOp(req.user!.id, opId, request, status, body).catch(err => console.error('client op save failed:', err)).finally(() => inFlight.delete(key));
    else inFlight.delete(key);
    return json(body);
  };
  res.on('close', () => inFlight.delete(key));

  const clientTime = parseClientTime(req.headers['x-client-created-at']);
  requestContext.run({ clientTime }, () => next());
};
