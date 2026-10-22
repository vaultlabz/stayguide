// 2026-10-09 12:14, #56 forgot / change password for every account type (super admin, company admin, field worker).
// Reset links are single-use, expire after RESET_MINUTES and are stored only as SHA-256. Setting a password stamps
// users.password_changed_at, which the auth middleware uses to reject sessions issued before the change.
import crypto from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db } from '../utils/database';
import { MOCK_MODE, mockPasswordResets } from '../utils/mock-database';
import { hashPassword } from '../utils/auth';
import { UserService } from './UserService';
import { normalizeEmail } from './WorkerService';
import { User } from '../types';

export const RESET_MINUTES = 60;

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const nextId = (rows: any[]) => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;

/** Same rule as signup. */
export function passwordProblem(password: unknown): string | null {
  return typeof password !== 'string' || password.length < 8 || password.length > 128 ? 'Password must be 8–128 characters' : null;
}

/** Whole seconds: MySQL TIMESTAMP rounds fractions up, which could reject a token issued in the same second. */
const changedNow = () => new Date(Math.floor(Date.now() / 1000) * 1000);

export class PasswordService {
  private users = new UserService();

  /** New reset link for an active account (older unused links stop working), or null when there is no such account. */
  async createReset(email: string, minutes = RESET_MINUTES): Promise<{ user: User; token: string } | null> { // 2026-10-09 12:27, #61 minutes: longer for admin invites
    const user = await this.users.findByEmail(normalizeEmail(email));
    if (!user || user.status !== 'active') return null;
    const token = crypto.randomBytes(32).toString('base64url');
    await this.closeOpenResets(user.id);
    if (MOCK_MODE) {
      mockPasswordResets.push({ id: nextId(mockPasswordResets), user_id: user.id, token_hash: sha256(token),
        expires_at: new Date(Date.now() + minutes * 60000), used_at: null, created_at: new Date() });
    } else {
      await db.execute('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE))',
        [user.id, sha256(token), minutes]);
    }
    return { user, token };
  }

  /** Uses up a valid link and sets the password; null when the link is unknown, used or expired. */
  async resetWithToken(token: string, password: string): Promise<User | null> {
    const hash = sha256(String(token || ''));
    let userId: number | null = null;
    if (MOCK_MODE) {
      const r = mockPasswordResets.find(x => x.token_hash === hash && !x.used_at && x.expires_at > new Date());
      if (r) { r.used_at = new Date(); userId = r.user_id; }
    } else {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP', [hash]);
      if (rows[0]) {
        // claim it atomically so two submits of the same link can't both succeed
        const [res] = await db.execute<ResultSetHeader>('UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL', [rows[0].id]);
        if (res.affectedRows === 1) userId = rows[0].user_id;
      }
    }
    if (userId === null) return null;
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'active') return null;
    return this.setPassword(user.id, password);
  }

  /** Sets a new password, signs out older sessions and voids any open reset links. */
  async setPassword(userId: number, password: string): Promise<User | null> {
    const updated = await this.users.updateUser(userId, { password_hash: await hashPassword(password), password_changed_at: changedNow() } as Partial<User>);
    await this.closeOpenResets(userId);
    return updated;
  }

  private async closeOpenResets(userId: number) {
    if (MOCK_MODE) {
      mockPasswordResets.filter(r => r.user_id === userId && !r.used_at).forEach(r => { r.used_at = new Date(); });
    } else {
      await db.execute('UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL', [userId]);
    }
  }
}
