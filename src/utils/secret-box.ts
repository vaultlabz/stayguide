// 2026-10-08 00:10, G7 Ops stage 3: AES-256-GCM for small secrets at rest (property access codes, QR sticker tokens).
// Key: OPS_SECRET_KEY (32 bytes, hex or base64). Without it (dev only) a key is derived from JWT_SECRET, with a warning.
import crypto from 'crypto';

// 2026-10-09 08:12, #46: exported so the production startup check validates the key the same way
export function parseOpsKey(raw: string): Buffer | null {
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  if (raw) { const b = Buffer.from(raw, 'base64'); if (b.length === 32) return b; }
  return null;
}

let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (cachedKey) return cachedKey;
  let k = parseOpsKey(process.env.OPS_SECRET_KEY || '');
  if (!k) {
    if (process.env.NODE_ENV === 'production') throw new Error('OPS_SECRET_KEY must be set to 32 bytes (hex or base64) in production');
    console.warn('[secret-box] OPS_SECRET_KEY not set; deriving a development key from JWT_SECRET');
    k = crypto.createHash('sha256').update(`stayguide-ops:${process.env.JWT_SECRET || 'dev'}`).digest();
  }
  cachedKey = k;
  return k;
}

/** "v1:<iv>:<tag>:<ciphertext>" (base64url parts). */
export function seal(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join(':');
}

export function open(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  const [v, iv, tag, ct] = sealed.split(':');
  if (v !== 'v1' || !iv || !tag || ct === undefined) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    console.error('[secret-box] could not decrypt a value (wrong OPS_SECRET_KEY?)');
    return null;
  }
}

/** HMAC-SHA256 signature for short-lived URLs (job photos). */
export function sign(value: string): string {
  return crypto.createHmac('sha256', key()).update(value).digest('base64url');
}
export function verifySignature(value: string, signature: string): boolean {
  const expected = Buffer.from(sign(value));
  const given = Buffer.from(String(signature || ''));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
