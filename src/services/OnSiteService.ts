// 2026-10-08 00:20, G7 Ops stage 3: access codes (encrypted, time-boxed), property QR stickers, private job photos, check-in/out time entries.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { RowDataPacket } from 'mysql2';
import { db } from '../utils/database';
import { MOCK_MODE, mockPropertyAccess, mockWorkOrders, mockQrTokens, mockWorkOrderPhotos, mockTimeEntries } from '../utils/mock-database';
import { seal, open, sign, verifySignature } from '../utils/secret-box';
import { WorkOrder } from './WorkOrderService';
import { clientNow } from '../utils/request-context'; // 2026-10-08 05:10, G7 S5

export const PHOTO_KINDS = ['before', 'after', 'step', 'receipt'] as const;
export type PhotoKind = typeof PHOTO_KINDS[number];
// OPS_STORAGE_DIR lets tests (and deployments) keep job photos elsewhere; default storage/ops in the repo root (git-ignored)
export const STORAGE_DIR = process.env.OPS_STORAGE_DIR ? path.resolve(process.env.OPS_STORAGE_DIR) : path.join(__dirname, '../../storage/ops');
/** Access codes show from 30 min before the window until 30 min after it. */
export const ACCESS_LEAD_MIN = 30;
/** QR check-in is accepted from 60 min before the window until 60 min after it. */
export const CHECKIN_LEAD_MIN = 60;
/** A window with no end is treated as lasting this long. */
const DEFAULT_WINDOW_HOURS = 12;
const PHOTO_URL_TTL_SEC = 3600;
const MAX_PHOTOS_PER_ORDER = 40;

export interface Photo { id: number; work_order_id: number; kind: PhotoKind; path: string; caption: string | null; uploaded_by: number | null; created_at: Date }
export interface TimeEntry { id: number; work_order_id: number; user_id: number; clock_in: Date; clock_out: Date | null; method_in: 'qr' | 'button' | 'manual'; voided_at?: Date | null; method_out: 'qr' | 'button' | 'submit' | 'system' | null }

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const nextId = (rows: any[]) => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
const minutes = (n: number) => n * 60000;

/** When a job's window opens/closes (null when the job has no window). */
export function windowBounds(o: Pick<WorkOrder, 'window_start' | 'window_end'>, leadMin: number): { from: Date; to: Date } | null {
  if (!o.window_start) return null;
  const start = new Date(o.window_start);
  const end = o.window_end ? new Date(o.window_end) : new Date(+start + DEFAULT_WINDOW_HOURS * 3600000);
  return { from: new Date(+start - minutes(leadMin)), to: new Date(+end + minutes(leadMin)) };
}

export class OnSiteService {
  // ---- access codes ----

  async getPropertyAccess(propertyId: number): Promise<{ code: string | null; notes: string | null }> {
    const row: any = MOCK_MODE
      ? mockPropertyAccess.find(p => p.property_id === propertyId)
      : (await db.execute<RowDataPacket[]>('SELECT access_code_enc, access_notes FROM property_access WHERE property_id = ?', [propertyId]))[0][0];
    return { code: open(row?.access_code_enc), notes: row?.access_notes ?? null };
  }

  async setPropertyAccess(propertyId: number, code: string | null, notes: string | null, userId: number): Promise<void> {
    const enc = code ? seal(code) : null;
    if (MOCK_MODE) {
      const row = mockPropertyAccess.find(p => p.property_id === propertyId);
      if (row) Object.assign(row, { access_code_enc: enc, access_notes: notes, updated_by: userId, updated_at: new Date() });
      else mockPropertyAccess.push({ property_id: propertyId, access_code_enc: enc, access_notes: notes, updated_by: userId, updated_at: new Date() });
      return;
    }
    await db.execute(
      `INSERT INTO property_access (property_id, access_code_enc, access_notes, updated_by) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE access_code_enc = VALUES(access_code_enc), access_notes = VALUES(access_notes), updated_by = VALUES(updated_by)`,
      [propertyId, enc, notes, userId]);
  }

  async setOrderAccessOverride(orderId: number, code: string | null): Promise<void> {
    const enc = code ? seal(code) : null;
    if (MOCK_MODE) {
      mockWorkOrders.find(o => o.id === orderId).access_code_override_enc = enc;
      return;
    }
    await db.execute('UPDATE work_orders SET access_code_override_enc = ? WHERE id = ?', [enc, orderId]);
  }

  /** The code for this job: the job's own override, else the property's. Decrypted only here. */
  async codeFor(order: WorkOrder): Promise<{ code: string | null; notes: string | null }> {
    const row: any = MOCK_MODE
      ? mockWorkOrders.find(o => o.id === order.id)
      : (await db.execute<RowDataPacket[]>('SELECT access_code_override_enc FROM work_orders WHERE id = ?', [order.id]))[0][0];
    const property = await this.getPropertyAccess(order.property_id);
    return { code: open(row?.access_code_override_enc) ?? property.code, notes: property.notes };
  }

  /** Whether the assigned worker may see the access code right now, and why not. */
  accessState(order: WorkOrder, now = new Date()): { available: boolean; reason: string | null; opens_at: Date | null } {
    if (order.status !== 'assigned' && order.status !== 'in_progress') {
      return { available: false, reason: order.status === 'awaiting_approval' ? 'Available once the estimate is approved.' : 'Not available for this job anymore.', opens_at: null };
    }
    const w = windowBounds(order, ACCESS_LEAD_MIN);
    if (!w) {
      return order.status === 'in_progress'
        ? { available: true, reason: null, opens_at: null }
        : { available: false, reason: 'Start the job (or check in with the QR code) to see the access code.', opens_at: null };
    }
    if (now < w.from) return { available: false, reason: null, opens_at: w.from };
    if (now > w.to) return { available: false, reason: 'The job window has ended. Ask the manager to update it.', opens_at: null };
    return { available: true, reason: null, opens_at: null };
  }

  // ---- QR stickers ----

  async currentQr(propertyId: number): Promise<{ token: string; created_at: Date } | null> {
    const row: any = MOCK_MODE
      ? [...mockQrTokens].reverse().find(t => t.property_id === propertyId && !t.revoked_at)
      : (await db.execute<RowDataPacket[]>('SELECT * FROM property_qr_tokens WHERE property_id = ? AND revoked_at IS NULL ORDER BY id DESC LIMIT 1', [propertyId]))[0][0];
    const token = row ? open(row.token_enc) : null;
    return token ? { token, created_at: row.created_at } : null;
  }

  /** Issues a new sticker token; any previous sticker for the property stops working. */
  async rotateQr(propertyId: number): Promise<{ token: string; created_at: Date }> {
    const token = crypto.randomBytes(24).toString('base64url');
    const now = new Date();
    if (MOCK_MODE) {
      mockQrTokens.filter(t => t.property_id === propertyId && !t.revoked_at).forEach(t => { t.revoked_at = now; });
      mockQrTokens.push({ id: nextId(mockQrTokens), property_id: propertyId, token_hash: sha256(token), token_enc: seal(token), created_at: now, revoked_at: null });
      return { token, created_at: now };
    }
    await db.execute('UPDATE property_qr_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE property_id = ? AND revoked_at IS NULL', [propertyId]);
    await db.execute('INSERT INTO property_qr_tokens (property_id, token_hash, token_enc) VALUES (?, ?, ?)', [propertyId, sha256(token), seal(token)]);
    return { token, created_at: now };
  }

  async ensureQr(propertyId: number) {
    return (await this.currentQr(propertyId)) || this.rotateQr(propertyId);
  }

  async propertyForQr(token: string): Promise<number | null> {
    if (!token || token.length > 100) return null;
    const hash = sha256(token);
    const row: any = MOCK_MODE
      ? mockQrTokens.find(t => t.token_hash === hash && !t.revoked_at)
      : (await db.execute<RowDataPacket[]>('SELECT property_id FROM property_qr_tokens WHERE token_hash = ? AND revoked_at IS NULL', [hash]))[0][0];
    return row ? row.property_id : null;
  }

  // ---- time entries ----

  async openEntryFor(userId: number): Promise<TimeEntry | null> {
    const row: any = MOCK_MODE
      ? mockTimeEntries.find(e => e.user_id === userId && !e.clock_out)
      : (await db.execute<RowDataPacket[]>('SELECT * FROM time_entries WHERE user_id = ? AND clock_out IS NULL ORDER BY id DESC LIMIT 1', [userId]))[0][0];
    return row || null;
  }

  async entriesFor(orderId: number, userId?: number): Promise<TimeEntry[]> {
    if (MOCK_MODE) return mockTimeEntries.filter(e => e.work_order_id === orderId && (!userId || e.user_id === userId));
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM time_entries WHERE work_order_id = ? ${userId ? 'AND user_id = ?' : ''} ORDER BY clock_in ASC`, userId ? [orderId, userId] : [orderId]);
    return rows as TimeEntry[];
  }

  async clockIn(orderId: number, userId: number, method: 'qr' | 'button'): Promise<TimeEntry> {
    const now = clientNow(); // the phone's time when this was queued offline
    if (MOCK_MODE) {
      const e = { id: nextId(mockTimeEntries), work_order_id: orderId, user_id: userId, clock_in: now, clock_out: null, method_in: method, method_out: null, created_at: now };
      mockTimeEntries.push(e);
      return e as TimeEntry;
    }
    const [result] = await db.execute('INSERT INTO time_entries (work_order_id, user_id, clock_in, method_in) VALUES (?, ?, ?, ?)', [orderId, userId, now, method]);
    return { id: (result as any).insertId, work_order_id: orderId, user_id: userId, clock_in: now, clock_out: null, method_in: method, method_out: null };
  }

  async clockOut(entry: TimeEntry, method: 'qr' | 'button' | 'submit' | 'system'): Promise<TimeEntry> {
    // never before the check-in it closes (a late replay can carry an earlier phone time)
    const now = new Date(Math.max(+clientNow(), +new Date(entry.clock_in)));
    if (MOCK_MODE) {
      Object.assign(mockTimeEntries.find(e => e.id === entry.id), { clock_out: now, method_out: method });
    } else {
      await db.execute('UPDATE time_entries SET clock_out = ?, method_out = ? WHERE id = ?', [now, method, entry.id]);
    }
    return { ...entry, clock_out: now, method_out: method };
  }

  /** Closes any open entry on this job (job canceled, reassigned or unassigned while someone was on site). */
  async closeOpenEntries(orderId: number): Promise<void> {
    for (const e of (await this.entriesFor(orderId)).filter(x => !x.clock_out)) await this.clockOut(e, 'system');
  }

  static minutesOf(entries: TimeEntry[], now = new Date()): number {
    // voided entries (stage 7) count for nothing
    return Math.round(entries.filter(e => !e.voided_at).reduce((sum, e) => sum + ((e.clock_out ? +new Date(e.clock_out) : +now) - +new Date(e.clock_in)), 0) / 60000);
  }

  // ---- photos ----

  async listPhotos(orderId: number): Promise<Photo[]> {
    if (MOCK_MODE) return mockWorkOrderPhotos.filter(p => p.work_order_id === orderId);
    const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM work_order_photos WHERE work_order_id = ? ORDER BY id ASC', [orderId]);
    return rows as Photo[];
  }

  async getPhoto(id: number): Promise<Photo | null> {
    const row: any = MOCK_MODE
      ? mockWorkOrderPhotos.find(p => p.id === id)
      : (await db.execute<RowDataPacket[]>('SELECT * FROM work_order_photos WHERE id = ?', [id]))[0][0];
    return row || null;
  }

  /** Re-encodes the upload (auto-rotated, max 1600 px, WebP, metadata such as GPS stripped) and stores it outside public/. */
  async addPhoto(order: WorkOrder, kind: PhotoKind, buffer: Buffer, userId: number, caption: string | null): Promise<Photo | { error: string }> {
    if ((await this.listPhotos(order.id)).length >= MAX_PHOTOS_PER_ORDER) return { error: `A job can have up to ${MAX_PHOTOS_PER_ORDER} photos` };
    let image: Buffer;
    try {
      image = await sharp(buffer, { failOn: 'error' }).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    } catch {
      return { error: 'That file is not a readable image' };
    }
    const rel = path.join(String(order.company_id), String(order.id), `${crypto.randomBytes(12).toString('hex')}.webp`);
    const abs = path.join(STORAGE_DIR, rel);
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    await fs.promises.writeFile(abs, image);
    const row = { work_order_id: order.id, kind, path: rel, caption, uploaded_by: userId };
    if (MOCK_MODE) {
      const photo = { id: nextId(mockWorkOrderPhotos), ...row, created_at: new Date() };
      mockWorkOrderPhotos.push(photo);
      return photo as Photo;
    }
    const [result] = await db.execute('INSERT INTO work_order_photos (work_order_id, kind, path, caption, uploaded_by) VALUES (?, ?, ?, ?, ?)',
      [row.work_order_id, row.kind, row.path, row.caption, row.uploaded_by]);
    return (await this.getPhoto((result as any).insertId))!;
  }

  async deletePhoto(photo: Photo): Promise<void> {
    if (MOCK_MODE) {
      mockWorkOrderPhotos.splice(mockWorkOrderPhotos.findIndex(p => p.id === photo.id), 1);
    } else {
      await db.execute('DELETE FROM work_order_photos WHERE id = ?', [photo.id]);
    }
    await fs.promises.unlink(this.filePath(photo)).catch(() => {});
  }

  filePath(photo: Photo): string {
    const abs = path.resolve(STORAGE_DIR, photo.path);
    if (!abs.startsWith(path.resolve(STORAGE_DIR) + path.sep)) throw new Error('Invalid photo path');
    return abs;
  }

  /** Short-lived signed URL, so <img> tags work without exposing the bearer token. */
  signedUrl(photo: Photo): string {
    const exp = Math.floor(Date.now() / 1000) + PHOTO_URL_TTL_SEC;
    return `/ops-photo/${photo.id}?e=${exp}&s=${sign(`photo:${photo.id}:${exp}`)}`;
  }

  checkSignature(id: number, exp: number, signature: string): boolean {
    return Number.isFinite(exp) && exp >= Date.now() / 1000 && verifySignature(`photo:${id}:${exp}`, signature);
  }

  async withUrls(orderId: number) {
    return (await this.listPhotos(orderId)).map(p => ({ id: p.id, kind: p.kind, caption: p.caption, uploaded_by: p.uploaded_by, created_at: p.created_at, url: this.signedUrl(p) }));
  }
}
