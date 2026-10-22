// 2026-10-09 12:28, #61 several admins per company: list, invite (emailed set-password link, 7 days) and deactivate /
// reactivate. Company admins manage their own company; the super admin reaches every company through the same routes.
// Not part of the Ops add-on (field workers stay on /ops/team).
import crypto from 'crypto';
import { Request, Response } from 'express';
import { AuthRequest, User } from '../types';
import { resolveOwnedCompany } from '../utils/ownership';
import { UserService } from '../services/UserService';
import { PasswordService } from '../services/PasswordService';
import { EmailService } from '../services/EmailService';
import { normalizeEmail } from '../services/WorkerService';

export const ADMIN_INVITE_DAYS = 7;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const baseUrl = (req: Request) => (process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const view = (u: User, meId?: number) => ({
  id: u.id, email: u.email, first_name: u.first_name, last_name: u.last_name, status: u.status,
  last_login: u.last_login ?? null, created_at: u.created_at, is_me: u.id === meId
});

export class CompanyAdminsController {
  private users = new UserService();
  private passwords = new PasswordService();
  private email = new EmailService();

  async list(req: AuthRequest, res: Response) {
    try {
      const company = await resolveOwnedCompany(req, res);
      if (!company) return;
      res.json({ admins: (await this.users.listCompanyAdmins(company.id)).map(u => view(u, req.user?.id)) });
    } catch (error) {
      console.error('List company admins error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async invite(req: AuthRequest, res: Response) {
    try {
      const company = await resolveOwnedCompany(req, res);
      if (!company) return;
      const email = normalizeEmail(req.body?.email);
      const first = String(req.body?.first_name || '').trim().slice(0, 100);
      const last = String(req.body?.last_name || '').trim().slice(0, 100);
      if (!EMAIL_RE.test(email) || email.length > 255) return res.status(400).json({ error: 'A valid email is required' });
      if (!first || !last) return res.status(400).json({ error: 'First and last name are required' });
      if (await this.users.emailTaken(email)) return res.status(409).json({ error: 'That email already has a StayGuide account' });

      // random unusable password until they pick one through the emailed link
      const user = await this.users.createUser({ email, password: crypto.randomBytes(24).toString('base64url'),
        first_name: first, last_name: last, role: 'company_admin', company_id: company.id });
      const reset = await this.passwords.createReset(email, ADMIN_INVITE_DAYS * 24 * 60);
      if (reset) {
        const link = `${baseUrl(req)}/reset-password?token=${reset.token}`;
        const by = req.user ? `${req.user.first_name} ${req.user.last_name}`.trim() : 'StayGuide';
        this.email.sendEmail({
          to: email, fromName: `${company.name} via StayGuide`, subject: `You're now an admin of ${company.name} on StayGuide`,
          text: `Hi ${first},\n\n${by} added you as an admin of ${company.name} on StayGuide.\n\nChoose your password: ${link}\n\nThe link works for ${ADMIN_INVITE_DAYS} days. Then sign in at ${baseUrl(req)}/login`,
          html: `<p>Hi ${esc(first)},</p><p>${esc(by)} added you as an admin of <strong>${esc(company.name)}</strong> on StayGuide.</p>`
            + `<p><a href="${link}">Choose your password</a></p><p style="color:#666">The link works for ${ADMIN_INVITE_DAYS} days. Then sign in at ${esc(baseUrl(req))}/login</p>`
        }).catch(err => console.error('Admin invite email failed:', err));
      }
      res.status(201).json({ admin: view(user, req.user?.id) });
    } catch (error) {
      console.error('Invite company admin error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /** PUT /admins/:userId { status: 'active' | 'inactive' } */
  async setStatus(req: AuthRequest, res: Response) {
    try {
      const company = await resolveOwnedCompany(req, res);
      if (!company) return;
      const status = req.body?.status;
      if (status !== 'active' && status !== 'inactive') return res.status(400).json({ error: 'status must be active or inactive' });
      const admins = await this.users.listCompanyAdmins(company.id);
      const target = admins.find(u => u.id === Number(req.params.userId));
      if (!target) return res.status(404).json({ error: 'Admin not found' });
      if (status === 'inactive') {
        if (target.id === req.user?.id) return res.status(400).json({ error: "You can't deactivate yourself. Ask another admin." });
        if (!admins.some(u => u.id !== target.id && u.status === 'active')) {
          return res.status(400).json({ error: 'A company needs at least one active admin' });
        }
      }
      const updated = await this.users.updateUser(target.id, { status } as Partial<User>);
      res.json({ admin: view(updated || { ...target, status }, req.user?.id) });
    } catch (error) {
      console.error('Update company admin error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
