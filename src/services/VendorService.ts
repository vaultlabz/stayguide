// 2026-10-08 07:20, G7 Ops stage 6: vendor profiles and insurance certificates (COI).
// The certificate is a private file (PDF kept as uploaded after a signature check, images re-encoded without metadata),
// viewable through short-lived signed URLs. Expiry drives reminders (30 / 7 days, expired) and blocks new assignments.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { RowDataPacket } from 'mysql2';
import { db } from '../utils/database';
import { MOCK_MODE, mockVendorProfiles } from '../utils/mock-database';
import { sign, verifySignature } from '../utils/secret-box';
import { STORAGE_DIR } from './OnSiteService';

export const COI_WARN_DAYS = 30;
const URL_TTL_SEC = 3600;

export type AlertLevel = 'none' | '30' | '7' | 'expired';
export interface VendorProfile {
  user_id: number;
  business_name: string | null;
  license_no: string | null;
  insurance_provider: string | null;
  coi_path: string | null;
  coi_mime: string | null;
  coi_uploaded_at: Date | null;
  coi_expires_on: string | null; // YYYY-MM-DD
  coi_verified_by: number | null;
  coi_verified_at: Date | null;
  coi_alert_level: AlertLevel;
}
export type CoiStatus = { state: 'missing' | 'valid' | 'expiring' | 'expired'; days_left: number | null; expires_on: string | null; verified: boolean };

const ymd = (d: any): string | null => {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const todayYmd = () => ymd(new Date())!;
/** Whole days from today to the expiry date (negative once expired). Calendar dates, no time zone drift. */
export const daysUntil = (date: string, today = todayYmd()) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);

export function coiStatus(p: VendorProfile | null): CoiStatus {
  const expires = p?.coi_expires_on ? ymd(p.coi_expires_on) : null;
  if (!p || !p.coi_path || !expires) return { state: 'missing', days_left: null, expires_on: expires, verified: false };
  const days = daysUntil(expires);
  // valid through the expiry date itself
  const state = days < 0 ? 'expired' : days <= COI_WARN_DAYS ? 'expiring' : 'valid';
  return { state, days_left: days, expires_on: expires, verified: !!p.coi_verified_at };
}

/** Which reminder is due now for this certificate (null = nothing new to send). */
export function dueAlert(p: VendorProfile): AlertLevel | null {
  const s = coiStatus(p);
  if (s.state === 'missing' || s.days_left === null) return null;
  const want: AlertLevel = s.days_left < 0 ? 'expired' : s.days_left <= 7 ? '7' : s.days_left <= COI_WARN_DAYS ? '30' : 'none';
  const order: AlertLevel[] = ['none', '30', '7', 'expired'];
  return order.indexOf(want) > order.indexOf(p.coi_alert_level) ? want : null;
}

const normalize = (r: any): VendorProfile => ({ ...r, coi_expires_on: ymd(r.coi_expires_on), coi_alert_level: r.coi_alert_level || 'none' });

export class VendorService {
  async get(userId: number): Promise<VendorProfile | null> {
    const r: any = MOCK_MODE
      ? mockVendorProfiles.find(p => p.user_id === userId)
      : (await db.execute<RowDataPacket[]>('SELECT * FROM vendor_profiles WHERE user_id = ?', [userId]))[0][0];
    return r ? normalize(r) : null;
  }

  async listWithExpiry(): Promise<VendorProfile[]> {
    const rows: any[] = MOCK_MODE
      ? mockVendorProfiles.filter(p => p.coi_expires_on && p.coi_path)
      : (await db.execute<RowDataPacket[]>('SELECT * FROM vendor_profiles WHERE coi_expires_on IS NOT NULL AND coi_path IS NOT NULL'))[0];
    return rows.map(normalize);
  }

  private async upsert(userId: number, fields: Partial<VendorProfile>): Promise<VendorProfile> {
    if (MOCK_MODE) {
      let row = mockVendorProfiles.find(p => p.user_id === userId);
      if (!row) {
        row = { user_id: userId, business_name: null, license_no: null, insurance_provider: null, coi_path: null, coi_mime: null, coi_uploaded_at: null,
          coi_expires_on: null, coi_verified_by: null, coi_verified_at: null, coi_alert_level: 'none' };
        mockVendorProfiles.push(row);
      }
      Object.assign(row, fields, { updated_at: new Date() });
    } else {
      const keys = Object.keys(fields);
      await db.execute(
        `INSERT INTO vendor_profiles (user_id${keys.map(k => `, ${k}`).join('')}) VALUES (?${keys.map(() => ', ?').join('')})
         ON DUPLICATE KEY UPDATE ${keys.length ? keys.map(k => `${k} = VALUES(${k})`).join(', ') : 'user_id = user_id'}`,
        [userId, ...keys.map(k => (fields as any)[k])]);
    }
    return (await this.get(userId))!;
  }

  async saveDetails(userId: number, d: { business_name: string | null; license_no: string | null; insurance_provider: string | null }): Promise<VendorProfile> {
    return this.upsert(userId, d);
  }

  /** New expiry date (from the vendor, or corrected by a manager). Resets reminders; a vendor's change also clears verification. */
  async setExpiry(userId: number, expiresOn: string, verifiedBy: number | null): Promise<VendorProfile> {
    const current = await this.get(userId);
    const changed = ymd(current?.coi_expires_on) !== expiresOn;
    return this.upsert(userId, {
      coi_expires_on: expiresOn,
      ...(changed ? { coi_alert_level: 'none' as AlertLevel } : {}),
      ...(verifiedBy ? { coi_verified_by: verifiedBy, coi_verified_at: new Date() } : changed ? { coi_verified_by: null, coi_verified_at: null } : {})
    });
  }

  async verify(userId: number, managerId: number): Promise<VendorProfile> {
    return this.upsert(userId, { coi_verified_by: managerId, coi_verified_at: new Date() });
  }

  async setAlertLevel(userId: number, level: AlertLevel): Promise<void> {
    await this.upsert(userId, { coi_alert_level: level });
  }

  /** Stores a new certificate file (replacing the old one). PDF must start with %PDF; images are re-encoded to WebP. */
  async saveCertificate(userId: number, buffer: Buffer, mime: string, expiresOn: string): Promise<VendorProfile | { error: string }> {
    let data: Buffer, ext: string, storedMime: string;
    if (mime === 'application/pdf' || buffer.subarray(0, 5).toString() === '%PDF-') {
      if (buffer.subarray(0, 5).toString() !== '%PDF-') return { error: 'That PDF file is not readable' };
      data = buffer; ext = 'pdf'; storedMime = 'application/pdf';
    } else {
      try {
        data = await sharp(buffer, { failOn: 'error' }).rotate().resize(2000, 2000, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
      } catch {
        return { error: 'Upload a PDF or a photo of the certificate' };
      }
      ext = 'webp'; storedMime = 'image/webp';
    }
    const rel = path.join('coi', String(userId), `${crypto.randomBytes(12).toString('hex')}.${ext}`);
    const abs = path.join(STORAGE_DIR, rel);
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    await fs.promises.writeFile(abs, data);
    const old = await this.get(userId);
    const saved = await this.upsert(userId, {
      coi_path: rel, coi_mime: storedMime, coi_uploaded_at: new Date(), coi_expires_on: expiresOn,
      coi_verified_by: null, coi_verified_at: null, coi_alert_level: 'none'
    });
    if (old?.coi_path) await fs.promises.unlink(this.filePath(old)).catch(() => {});
    return saved;
  }

  filePath(p: VendorProfile): string {
    const abs = path.resolve(STORAGE_DIR, p.coi_path!);
    if (!abs.startsWith(path.resolve(STORAGE_DIR) + path.sep)) throw new Error('Invalid certificate path');
    return abs;
  }

  /** Signed, short-lived link; it embeds the file name so a replaced certificate's old link stops working. */
  signedUrl(p: VendorProfile): string | null {
    if (!p.coi_path) return null;
    const exp = Math.floor(Date.now() / 1000) + URL_TTL_SEC;
    const file = path.basename(p.coi_path);
    return `/ops-file/coi/${p.user_id}/${file}?e=${exp}&s=${sign(`coi:${p.user_id}:${file}:${exp}`)}`;
  }

  checkSignature(userId: number, file: string, exp: number, signature: string): boolean {
    return Number.isFinite(exp) && exp >= Date.now() / 1000 && verifySignature(`coi:${userId}:${file}:${exp}`, signature);
  }
}
