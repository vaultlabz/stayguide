// 2026-10-08 05:20, G7 Ops stage 5: web push to the worker app (new job, approved/rejected, sent back, canceled, messages).
// VAPID keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT. Without them (dev only) a key pair is generated per
// process, so subscriptions stop working after a restart. In production push is simply off until the keys are set.
import crypto from 'crypto';
import webpush from 'web-push';
import { RowDataPacket } from 'mysql2';
import { db } from '../utils/database';
import { MOCK_MODE, mockPushSubscriptions } from '../utils/mock-database';

export interface PushMessage { title: string; body: string; url: string; tag?: string }
interface Sub { id: number; user_id: number; endpoint: string; p256dh: string; auth: string }

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const MAX_SUBS_PER_USER = 10;

// The server POSTs to the subscription endpoint, so only real browser push services are accepted (no SSRF to internal hosts).
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
export function validEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false;
  let url: URL;
  try { url = new URL(endpoint); } catch { return false; }
  // tests run a local fake push service; never allowed in production
  if (process.env.PUSH_ALLOW_ANY_ENDPOINT === 'true' && process.env.NODE_ENV !== 'production') return url.protocol === 'http:' || url.protocol === 'https:';
  return url.protocol === 'https:' && PUSH_HOSTS.some(re => re.test(url.hostname));
}

let keys: { publicKey: string; privateKey: string } | null | undefined;
function vapid() {
  if (keys !== undefined) return keys;
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv) keys = { publicKey: pub, privateKey: priv };
  else if (process.env.NODE_ENV !== 'production') {
    keys = webpush.generateVAPIDKeys();
    console.warn('[push] VAPID keys not set; generated temporary dev keys (subscriptions reset on restart). See .env.example');
  } else {
    keys = null;
    console.warn('[push] VAPID keys not set; push notifications are off');
  }
  if (keys) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@stayguide.com', keys.publicKey, keys.privateKey);
  return keys;
}

export class PushService {
  publicKey(): string | null { return vapid()?.publicKey ?? null; }

  async subscribe(userId: number, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent: string | null): Promise<void> {
    const hash = sha256(sub.endpoint);
    if (MOCK_MODE) {
      const existing = mockPushSubscriptions.find(s => s.endpoint_hash === hash);
      if (existing) Object.assign(existing, { user_id: userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth });
      else mockPushSubscriptions.push({ id: mockPushSubscriptions.reduce((m, s) => Math.max(m, s.id), 0) + 1, user_id: userId, endpoint: sub.endpoint, endpoint_hash: hash,
        p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: userAgent, created_at: new Date() });
      const mine = mockPushSubscriptions.filter(s => s.user_id === userId);
      for (const old of mine.slice(0, Math.max(0, mine.length - MAX_SUBS_PER_USER))) mockPushSubscriptions.splice(mockPushSubscriptions.indexOf(old), 1);
      return;
    }
    // the same browser re-subscribing (or another user signing in on it) takes over the row
    await db.execute(
      `INSERT INTO push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent)`,
      [userId, sub.endpoint, hash, sub.keys.p256dh, sub.keys.auth, userAgent]);
    await db.execute(
      `DELETE FROM push_subscriptions WHERE user_id = ? AND id NOT IN (SELECT id FROM (SELECT id FROM push_subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT ${MAX_SUBS_PER_USER}) keep)`,
      [userId, userId]);
  }

  async unsubscribe(userId: number, endpoint: string): Promise<void> {
    const hash = sha256(endpoint);
    if (MOCK_MODE) {
      const i = mockPushSubscriptions.findIndex(s => s.endpoint_hash === hash && s.user_id === userId);
      if (i >= 0) mockPushSubscriptions.splice(i, 1);
      return;
    }
    await db.execute('DELETE FROM push_subscriptions WHERE endpoint_hash = ? AND user_id = ?', [hash, userId]);
  }

  async count(userId: number): Promise<number> {
    if (MOCK_MODE) return mockPushSubscriptions.filter(s => s.user_id === userId).length;
    const [rows] = await db.execute<RowDataPacket[]>('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?', [userId]);
    return Number(rows[0].n);
  }

  private async subsFor(userId: number): Promise<Sub[]> {
    if (MOCK_MODE) return mockPushSubscriptions.filter(s => s.user_id === userId);
    const [rows] = await db.execute<RowDataPacket[]>('SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?', [userId]);
    return rows as Sub[];
  }

  private async drop(sub: Sub) {
    if (MOCK_MODE) { const i = mockPushSubscriptions.indexOf(sub as any); if (i >= 0) mockPushSubscriptions.splice(i, 1); return; }
    await db.execute('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
  }

  /** Best-effort: sends to every device of the user, removes subscriptions the push service says are gone. */
  async notify(userId: number, message: PushMessage): Promise<number> {
    if (!vapid()) return 0;
    let sent = 0;
    for (const sub of await this.subsFor(userId)) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ ...message, title: message.title.slice(0, 120), body: message.body.slice(0, 300) }), { TTL: 24 * 3600, urgency: 'high' });
        sent++;
        if (!MOCK_MODE) db.execute('UPDATE push_subscriptions SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', [sub.id]).catch(() => {});
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) await this.drop(sub);
        else console.error('Push failed:', error?.statusCode || error?.message || error);
      }
    }
    return sent;
  }
}
