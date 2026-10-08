// 2026-10-07 18:40, G7 Ops stage 1: field worker memberships, invites and email sign-in codes (docs/G7_OPS_PLAN.md).
// One worker account (users.role = 'field_worker') can belong to several companies through company_workers.
// Invite tokens are stored as SHA-256, sign-in codes as an HMAC keyed with JWT_SECRET; neither is ever stored in clear.
import crypto from 'crypto';
import { RowDataPacket } from 'mysql2';
import { db } from '../utils/database';
import { MOCK_MODE, mockCompanyWorkers, mockWorkerInvites, mockLoginCodes, mockUsers, mockCompanies } from '../utils/mock-database';
import { UserService } from './UserService';
import { User } from '../types';

export const WORKER_TYPES = ['tech', 'cleaner', 'contractor', 'vendor'] as const;
export type WorkerType = typeof WORKER_TYPES[number];
export const INVITE_DAYS = 7;
export const CODE_MINUTES = 10;
export const CODE_MAX_ATTEMPTS = 5;

export interface WorkerMember {
  user_id: number;
  first_name: string;
  last_name: string;
  email: string;
  worker_type: WorkerType;
  status: 'active' | 'suspended';
  skills: string[];
  phone: string | null;
  hourly_rate: number | null;
  last_login: Date | null;
  created_at: Date;
}

export interface WorkerInvite {
  id: number;
  company_id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  worker_type: WorkerType;
  skills: string[];
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

export interface Membership {
  company_id: number;
  company_name: string;
  company_slug: string;
  logo_url: string | null;
  worker_type: WorkerType;
  status: 'active' | 'suspended';
}

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const codeHmac = (userId: number, code: string) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET || 'stayguide').update(`${userId}:${code}`).digest('hex');
const nextId = (rows: any[]) => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
const parseSkills = (v: any): string[] => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v) { try { return JSON.parse(v); } catch { return []; } }
  return [];
};
export const normalizeEmail = (email: string) => String(email || '').trim().toLowerCase();

export class WorkerService {
  private users = new UserService();

  // ---- members ----

  async listMembers(companyId: number): Promise<WorkerMember[]> {
    if (MOCK_MODE) {
      return mockCompanyWorkers.filter(m => m.company_id === companyId).map(m => {
        const u: any = mockUsers.find(x => x.id === m.user_id) || {};
        return { user_id: m.user_id, first_name: u.first_name, last_name: u.last_name, email: u.email, worker_type: m.worker_type,
          status: m.status, skills: m.skills || [], phone: m.phone ?? null, hourly_rate: m.hourly_rate ?? null,
          last_login: u.last_login ?? null, created_at: m.created_at };
      });
    }
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT m.user_id, u.first_name, u.last_name, u.email, m.worker_type, m.status, m.skills, m.phone, m.hourly_rate, u.last_login, m.created_at
         FROM company_workers m JOIN users u ON u.id = m.user_id
        WHERE m.company_id = ? ORDER BY u.first_name, u.last_name`,
      [companyId]
    );
    return rows.map(r => ({ ...r, skills: parseSkills(r.skills), hourly_rate: r.hourly_rate === null ? null : Number(r.hourly_rate) })) as WorkerMember[];
  }

  async getMember(companyId: number, userId: number): Promise<WorkerMember | null> {
    return (await this.listMembers(companyId)).find(m => m.user_id === userId) || null;
  }

  async updateMember(companyId: number, userId: number, updates: Partial<Pick<WorkerMember, 'worker_type' | 'status' | 'skills' | 'phone' | 'hourly_rate'>>): Promise<WorkerMember | null> {
    const allowed: Record<string, any> = {};
    for (const k of ['worker_type', 'status', 'skills', 'phone', 'hourly_rate'] as const) if (k in updates) allowed[k] = (updates as any)[k];
    if (MOCK_MODE) {
      const m = mockCompanyWorkers.find(x => x.company_id === companyId && x.user_id === userId);
      if (!m) return null;
      Object.assign(m, allowed, { updated_at: new Date() });
      return this.getMember(companyId, userId);
    }
    const keys = Object.keys(allowed);
    if (keys.length) {
      const values = keys.map(k => (k === 'skills' ? JSON.stringify(allowed[k]) : allowed[k]));
      await db.execute(`UPDATE company_workers SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE company_id = ? AND user_id = ?`, [...values, companyId, userId]);
    }
    return this.getMember(companyId, userId);
  }

  /** Companies this worker belongs to (active and suspended), with the branding the worker app shows. */
  async membershipsForUser(userId: number): Promise<(Membership & { ops_addon: boolean; plan: string; subscription_status: string | null; company_status: string })[]> {
    if (MOCK_MODE) {
      return mockCompanyWorkers.filter(m => m.user_id === userId).map(m => {
        const c: any = mockCompanies.find(x => x.id === m.company_id) || {};
        return { company_id: m.company_id, company_name: c.name, company_slug: c.slug, logo_url: c.logo_url ?? null, worker_type: m.worker_type,
          status: m.status, ops_addon: !!c.ops_addon, plan: c.plan, subscription_status: c.subscription_status ?? null, company_status: c.status };
      });
    }
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT m.company_id, c.name AS company_name, c.slug AS company_slug, c.logo_url, m.worker_type, m.status,
              c.ops_addon, c.plan, c.subscription_status, c.status AS company_status
         FROM company_workers m JOIN companies c ON c.id = m.company_id
        WHERE m.user_id = ? ORDER BY c.name`,
      [userId]
    );
    return rows.map(r => ({ ...r, ops_addon: !!r.ops_addon })) as any;
  }

  private async addMembership(companyId: number, userId: number, inv: { worker_type: WorkerType; skills: string[]; phone: string | null; invited_by?: number | null }) {
    if (MOCK_MODE) {
      const existing = mockCompanyWorkers.find(m => m.company_id === companyId && m.user_id === userId);
      if (existing) { existing.status = 'active'; return; }
      mockCompanyWorkers.push({ id: nextId(mockCompanyWorkers), company_id: companyId, user_id: userId, worker_type: inv.worker_type, status: 'active',
        skills: inv.skills, phone: inv.phone, hourly_rate: null, invited_by: inv.invited_by ?? null, created_at: new Date(), updated_at: new Date() });
      return;
    }
    await db.execute(
      `INSERT INTO company_workers (company_id, user_id, worker_type, status, skills, phone, invited_by)
       VALUES (?, ?, ?, 'active', ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = 'active'`,
      [companyId, userId, inv.worker_type, JSON.stringify(inv.skills), inv.phone, inv.invited_by ?? null]
    );
  }

  // ---- invites ----

  async listPendingInvites(companyId: number): Promise<WorkerInvite[]> {
    const all = MOCK_MODE
      ? mockWorkerInvites.filter(i => i.company_id === companyId)
      : (await db.execute<RowDataPacket[]>('SELECT * FROM worker_invites WHERE company_id = ? ORDER BY created_at DESC', [companyId]))[0];
    return (all as any[])
      .filter(i => !i.accepted_at && !i.revoked_at)
      .map(i => { const { token_hash, ...rest } = i; return { ...rest, skills: parseSkills(i.skills) }; }) as WorkerInvite[];
  }

  /** Returns the invite and the clear token (only here, for the email link). */
  async createInvite(data: { company_id: number; email: string; first_name: string; last_name: string; phone: string | null;
    worker_type: WorkerType; skills: string[]; invited_by: number }): Promise<{ invite: WorkerInvite; token: string }> {
    const token = crypto.randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + INVITE_DAYS * 86400000);
    const email = normalizeEmail(data.email);
    if (MOCK_MODE) {
      // a new invite to the same address replaces any pending one
      mockWorkerInvites.filter(i => i.company_id === data.company_id && i.email === email && !i.accepted_at && !i.revoked_at)
        .forEach(i => { i.revoked_at = new Date(); });
      const invite = { id: nextId(mockWorkerInvites), ...data, email, token_hash: sha256(token), expires_at: expires,
        accepted_at: null, revoked_at: null, created_at: new Date() };
      mockWorkerInvites.push(invite);
      const { token_hash, ...rest } = invite;
      return { invite: rest as WorkerInvite, token };
    }
    await db.execute('UPDATE worker_invites SET revoked_at = CURRENT_TIMESTAMP WHERE company_id = ? AND email = ? AND accepted_at IS NULL AND revoked_at IS NULL',
      [data.company_id, email]);
    const [result] = await db.execute(
      `INSERT INTO worker_invites (company_id, email, first_name, last_name, phone, worker_type, skills, token_hash, expires_at, invited_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.company_id, email, data.first_name, data.last_name, data.phone, data.worker_type, JSON.stringify(data.skills), sha256(token), expires, data.invited_by]
    );
    const invite = (await this.listPendingInvites(data.company_id)).find(i => i.id === (result as any).insertId)!;
    return { invite, token };
  }

  /** Issues a fresh token and expiry for a pending invite (resend). */
  async refreshInvite(companyId: number, inviteId: number): Promise<{ invite: WorkerInvite; token: string } | null> {
    const pending = (await this.listPendingInvites(companyId)).find(i => i.id === inviteId);
    if (!pending) return null;
    const token = crypto.randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + INVITE_DAYS * 86400000);
    if (MOCK_MODE) {
      Object.assign(mockWorkerInvites.find(i => i.id === inviteId), { token_hash: sha256(token), expires_at: expires });
    } else {
      await db.execute('UPDATE worker_invites SET token_hash = ?, expires_at = ? WHERE id = ?', [sha256(token), expires, inviteId]);
    }
    return { invite: { ...pending, expires_at: expires }, token };
  }

  async revokeInvite(companyId: number, inviteId: number): Promise<boolean> {
    if (MOCK_MODE) {
      const i = mockWorkerInvites.find(x => x.id === inviteId && x.company_id === companyId && !x.accepted_at && !x.revoked_at);
      if (!i) return false;
      i.revoked_at = new Date();
      return true;
    }
    const [result] = await db.execute('UPDATE worker_invites SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ? AND accepted_at IS NULL AND revoked_at IS NULL',
      [inviteId, companyId]);
    return (result as any).affectedRows > 0;
  }

  /** A usable invite (pending, not expired) for this token, or null. */
  async findInviteByToken(token: string): Promise<(WorkerInvite & { invited_by: number | null }) | null> {
    if (!token || token.length > 100) return null;
    const hash = sha256(token);
    const row: any = MOCK_MODE
      ? mockWorkerInvites.find(i => i.token_hash === hash)
      : (await db.execute<RowDataPacket[]>('SELECT * FROM worker_invites WHERE token_hash = ?', [hash]))[0][0];
    if (!row || row.accepted_at || row.revoked_at || new Date(row.expires_at) < new Date()) return null;
    const { token_hash, ...rest } = row;
    return { ...rest, skills: parseSkills(row.skills) };
  }

  /**
   * Accepts an invite. New email → creates a field_worker account (password optional: code-only sign-in gets an
   * unusable random password). Existing field_worker → just adds the membership. Admin accounts can't be workers.
   */
  async acceptInvite(token: string, profile: { first_name: string; last_name: string; password?: string; skills: string[]; phone: string | null }):
    Promise<{ user: User; created: boolean } | { error: string; status: number }> {
    const invite = await this.findInviteByToken(token);
    if (!invite) return { error: 'This invite link is invalid or has expired. Ask your manager for a new one.', status: 404 };

    let user = await this.users.findByEmail(invite.email);
    let created = false;
    if (user && user.role !== 'field_worker') {
      return { error: 'This email already belongs to a StayGuide admin account. Ask your manager to invite a different email.', status: 409 };
    }
    if (!user) {
      user = await this.users.createUser({
        email: invite.email,
        password: profile.password || crypto.randomBytes(24).toString('base64url'),
        first_name: profile.first_name,
        last_name: profile.last_name,
        role: 'field_worker'
      });
      created = true;
    }
    // an existing account keeps its password: an invite link never changes it

    await this.addMembership(invite.company_id, user.id, {
      worker_type: invite.worker_type, skills: profile.skills.length ? profile.skills : invite.skills,
      phone: profile.phone ?? invite.phone, invited_by: invite.invited_by
    });
    if (MOCK_MODE) {
      mockWorkerInvites.find(i => i.id === invite.id).accepted_at = new Date();
    } else {
      await db.execute('UPDATE worker_invites SET accepted_at = CURRENT_TIMESTAMP WHERE id = ?', [invite.id]);
    }
    return { user, created };
  }

  /** Records a worker sign-in (password, code or invite) for the Team page's "Last sign-in". */
  async touchLogin(userId: number): Promise<void> {
    if (MOCK_MODE) {
      const u: any = mockUsers.find(x => x.id === userId);
      if (u) u.last_login = new Date();
      return;
    }
    await db.execute('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
  }

  // ---- email sign-in codes ----

  /** Creates a 6-digit code for the user and returns it (caller emails it). Older unused codes stop working. */
  async issueLoginCode(userId: number): Promise<string> {
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const expires = new Date(Date.now() + CODE_MINUTES * 60000);
    if (MOCK_MODE) {
      mockLoginCodes.filter(c => c.user_id === userId && !c.used_at).forEach(c => { c.used_at = new Date(); });
      mockLoginCodes.push({ id: nextId(mockLoginCodes), user_id: userId, code_hash: codeHmac(userId, code), expires_at: expires, attempts: 0, used_at: null, created_at: new Date() });
      return code;
    }
    await db.execute('UPDATE login_codes SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL', [userId]);
    await db.execute('INSERT INTO login_codes (user_id, code_hash, expires_at) VALUES (?, ?, ?)', [userId, codeHmac(userId, code), expires]);
    return code;
  }

  /** True once for a correct, unexpired code; wrong guesses count toward CODE_MAX_ATTEMPTS. */
  async verifyLoginCode(userId: number, code: string): Promise<boolean> {
    const row: any = MOCK_MODE
      ? [...mockLoginCodes].reverse().find(c => c.user_id === userId && !c.used_at)
      : (await db.execute<RowDataPacket[]>('SELECT * FROM login_codes WHERE user_id = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1', [userId]))[0][0];
    if (!row || new Date(row.expires_at) < new Date() || row.attempts >= CODE_MAX_ATTEMPTS) return false;
    const ok = /^\d{6}$/.test(code) && crypto.timingSafeEqual(Buffer.from(row.code_hash, 'hex'), Buffer.from(codeHmac(userId, code), 'hex'));
    if (MOCK_MODE) {
      if (ok) row.used_at = new Date(); else row.attempts++;
    } else if (ok) {
      await db.execute('UPDATE login_codes SET used_at = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
    } else {
      await db.execute('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    }
    return ok;
  }
}
