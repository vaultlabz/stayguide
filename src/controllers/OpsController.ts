// 2026-10-07 18:50, G7 Ops stage 1: manager Team API (/company/:companySlug/ops/...) and worker sign-in/onboarding (/maint/api/...)
import { Request, Response } from 'express';
import { AuthRequest, Company } from '../types';
import { WorkerService, WORKER_TYPES, WorkerType, INVITE_DAYS, CODE_MINUTES, normalizeEmail } from '../services/WorkerService';
import { CompanyService } from '../services/CompanyService';
import { UserService } from '../services/UserService';
import { EmailService } from '../services/EmailService';
import { entitlementsFor, upgradeRequired } from '../services/EntitlementService';
import { resolveOwnedCompany } from '../utils/ownership';
import { generateToken } from '../utils/auth';
import { PushService, validEndpoint } from '../services/PushService'; // 2026-10-08 05:40, G7 S5
import fs from 'fs';
import { VendorService, coiStatus, VendorProfile } from '../services/VendorService'; // 2026-10-08 07:30, G7 S6

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const baseUrl = (req: Request) => (process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null);
const optText = (v: unknown, max: number) => (v === undefined || v === null || v === '' ? null : text(v, max));

/** Up to 20 short tags, trimmed and de-duplicated; null when the input is not a valid list. */
function cleanSkills(v: unknown): string[] | null {
  if (v === undefined || v === null || v === '') return [];
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : null;
  if (!list) return null;
  const out = [...new Set(list.map(s => String(s).trim().toLowerCase()).filter(Boolean))];
  return out.length <= 20 && out.every(s => s.length <= 40) ? out : null;
}

export class OpsController {
  private workers = new WorkerService();
  private companies = new CompanyService();
  private users = new UserService();
  private email = new EmailService();
  private push = new PushService();
  private vendors = new VendorService();

  /** What the manager / worker sees of a vendor profile (2026-10-08 07:30, G7 S6). */
  private vendorView(p: VendorProfile | null) {
    return {
      business_name: p?.business_name ?? null, license_no: p?.license_no ?? null, insurance_provider: p?.insurance_provider ?? null,
      coi: { ...coiStatus(p), url: p ? this.vendors.signedUrl(p) : null, mime: p?.coi_mime ?? null, uploaded_at: p?.coi_uploaded_at ?? null }
    };
  }

  /** Company in the URL, owned by the caller, with the Ops add-on active. Sends 402/403/404 itself. */
  private async opsCompany(req: AuthRequest, res: Response): Promise<Company | null> {
    const company = await resolveOwnedCompany(req, res);
    if (!company) return null;
    if (!entitlementsFor(company).ops) {
      upgradeRequired(res, 'ops', 'The Ops add-on is not active for this company. It needs a Pro or Portfolio plan; contact StayGuide to switch it on.');
      return null;
    }
    return company;
  }

  private sendInvite(req: Request, company: Company, invite: { email: string; first_name: string; expires_at: Date }, token: string) {
    const link = `${baseUrl(req)}/maint/invite/${token}`;
    const days = INVITE_DAYS;
    this.email.sendEmail({
      to: invite.email,
      fromName: `${company.name} via StayGuide`,
      subject: `${company.name} invited you to their team on StayGuide`,
      text: `Hi ${invite.first_name},\n\n${company.name} invited you to receive and update jobs in the StayGuide work app.\n\nSet up your account: ${link}\n\nThe link works for ${days} days.\n\nPowered by StayGuide`,
      html: `<p>Hi ${esc(invite.first_name)},</p><p><strong>${esc(company.name)}</strong> invited you to receive and update jobs in the StayGuide work app.</p>`
        + `<p><a href="${link}">Set up your account</a></p><p style="color:#666">The link works for ${days} days.</p><p style="color:#999;font-size:12px">Powered by StayGuide</p>`
    }).catch(err => console.error('Invite email failed:', err));
  }

  // ---- manager: Team ----

  async team(req: AuthRequest, res: Response) {
    try {
      const company = await this.opsCompany(req, res);
      if (!company) return;
      const members = await this.workers.listMembers(company.id);
      res.json({
        members: await Promise.all(members.map(async m => ({ ...m, vendor: this.vendorView(await this.vendors.get(m.user_id)) }))),
        invites: await this.workers.listPendingInvites(company.id), worker_types: WORKER_TYPES
      });
    } catch (error) {
      console.error('Error loading team:', error);
      res.status(500).json({ error: 'Failed to load team' });
    }
  }

  async invite(req: AuthRequest, res: Response) {
    try {
      const company = await this.opsCompany(req, res);
      if (!company) return;
      const email = normalizeEmail(req.body?.email);
      const first_name = text(req.body?.first_name, 100);
      const last_name = text(req.body?.last_name, 100);
      const phone = optText(req.body?.phone, 50);
      const worker_type = req.body?.worker_type as WorkerType;
      const skills = cleanSkills(req.body?.skills);
      if (!EMAIL_RE.test(email) || email.length > 255) return res.status(400).json({ error: 'A valid email is required' });
      if (!first_name || !last_name) return res.status(400).json({ error: 'First and last name are required' });
      if (!WORKER_TYPES.includes(worker_type)) return res.status(400).json({ error: `Type must be one of: ${WORKER_TYPES.join(', ')}` });
      if (skills === null) return res.status(400).json({ error: 'Skills: up to 20 tags of 40 characters' });
      if (req.body?.phone && phone === null) return res.status(400).json({ error: 'Phone is too long' });

      const existing = await this.users.findByEmail(email);
      if (existing && existing.role !== 'field_worker') return res.status(409).json({ error: 'That email belongs to a StayGuide admin account. Use a different email for field work.' });
      if (existing && (await this.workers.getMember(company.id, existing.id))) return res.status(409).json({ error: 'This person is already on your team' });

      const { invite, token } = await this.workers.createInvite({ company_id: company.id, email, first_name, last_name, phone, worker_type, skills, invited_by: req.user!.id });
      this.sendInvite(req, company, invite, token);
      console.log(`Ops invite sent to ${email} for ${company.slug} by ${req.user?.email}`);
      res.status(201).json({ message: 'Invite sent', invite });
    } catch (error) {
      console.error('Error creating invite:', error);
      res.status(500).json({ error: 'Failed to send invite' });
    }
  }

  async resendInvite(req: AuthRequest, res: Response) {
    try {
      const company = await this.opsCompany(req, res);
      if (!company) return;
      const result = await this.workers.refreshInvite(company.id, parseInt(req.params.inviteId));
      if (!result) return res.status(404).json({ error: 'Invite not found' });
      this.sendInvite(req, company, result.invite, result.token);
      res.json({ message: 'Invite sent again', invite: result.invite });
    } catch (error) {
      console.error('Error resending invite:', error);
      res.status(500).json({ error: 'Failed to resend invite' });
    }
  }

  async revokeInvite(req: AuthRequest, res: Response) {
    try {
      const company = await this.opsCompany(req, res);
      if (!company) return;
      if (!(await this.workers.revokeInvite(company.id, parseInt(req.params.inviteId)))) return res.status(404).json({ error: 'Invite not found' });
      res.json({ message: 'Invite canceled' });
    } catch (error) {
      console.error('Error revoking invite:', error);
      res.status(500).json({ error: 'Failed to cancel invite' });
    }
  }

  async updateWorker(req: AuthRequest, res: Response) {
    try {
      const company = await this.opsCompany(req, res);
      if (!company) return;
      const userId = parseInt(req.params.userId);
      if (!(await this.workers.getMember(company.id, userId))) return res.status(404).json({ error: 'Worker not found' });
      const b = req.body || {};
      const updates: Record<string, any> = {};
      if ('status' in b) {
        if (!['active', 'suspended'].includes(b.status)) return res.status(400).json({ error: 'Status must be active or suspended' });
        updates.status = b.status;
      }
      if ('worker_type' in b) {
        if (!WORKER_TYPES.includes(b.worker_type)) return res.status(400).json({ error: 'Invalid type' });
        updates.worker_type = b.worker_type;
      }
      if ('skills' in b) {
        const skills = cleanSkills(b.skills);
        if (skills === null) return res.status(400).json({ error: 'Skills: up to 20 tags of 40 characters' });
        updates.skills = skills;
      }
      if ('phone' in b) {
        const phone = optText(b.phone, 50);
        if (b.phone && phone === null) return res.status(400).json({ error: 'Phone is too long' });
        updates.phone = phone;
      }
      if ('hourly_rate' in b) {
        const rate = b.hourly_rate === '' || b.hourly_rate === null ? null : Number(b.hourly_rate);
        if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 10000)) return res.status(400).json({ error: 'Hourly rate must be between 0 and 10000' });
        updates.hourly_rate = rate === null ? null : Math.round(rate * 100) / 100;
      }
      res.json({ message: 'Worker updated', worker: await this.workers.updateMember(company.id, userId, updates) });
    } catch (error) {
      console.error('Error updating worker:', error);
      res.status(500).json({ error: 'Failed to update worker' });
    }
  }

  /** PUT /ops/workers/:userId/coi { expires_on?, verify? } : a manager confirms the certificate or corrects its date. */
  async verifyCertificate(req: AuthRequest, res: Response) {
    try {
      const company = await this.opsCompany(req, res);
      if (!company) return;
      const userId = parseInt(req.params.userId);
      if (!(await this.workers.getMember(company.id, userId))) return res.status(404).json({ error: 'Worker not found' });
      const profile = await this.vendors.get(userId);
      if (!profile?.coi_path) return res.status(409).json({ error: 'No certificate has been uploaded yet' });
      let saved = profile;
      if (req.body?.expires_on !== undefined) {
        const d = String(req.body.expires_on);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(Date.parse(d))) return res.status(400).json({ error: 'Expiry must be a date (YYYY-MM-DD)' });
        saved = await this.vendors.setExpiry(userId, d, req.user!.id);
      } else if (req.body?.verify === true) {
        saved = await this.vendors.verify(userId, req.user!.id);
      } else {
        return res.status(400).json({ error: 'Send expires_on or verify: true' });
      }
      console.log(`Certificate of user ${userId} confirmed by ${req.user?.email} (${company.slug})`);
      res.json({ vendor: this.vendorView(saved) });
    } catch (error) {
      console.error('Error verifying certificate:', error);
      res.status(500).json({ error: 'Failed to save' });
    }
  }

  // ---- worker: profile + insurance certificate (2026-10-08 07:30, G7 S6) ----

  async profile(req: AuthRequest, res: Response) {
    try {
      const memberships = await this.workers.membershipsForUser(req.user!.id);
      res.json({
        is_vendor: memberships.some(m => m.worker_type === 'vendor' || m.worker_type === 'contractor'),
        vendor: this.vendorView(await this.vendors.get(req.user!.id))
      });
    } catch (error) {
      console.error('Error loading profile:', error);
      res.status(500).json({ error: 'Failed to load your profile' });
    }
  }

  async saveVendorDetails(req: AuthRequest, res: Response) {
    try {
      const business_name = optText(req.body?.business_name, 160);
      const license_no = optText(req.body?.license_no, 80);
      const insurance_provider = optText(req.body?.insurance_provider, 120);
      if ([['business_name', 160], ['license_no', 80], ['insurance_provider', 120]].some(([k, max]) => req.body?.[k as string] && optText(req.body[k as string], max as number) === null)) {
        return res.status(400).json({ error: 'One of the fields is too long' });
      }
      const saved = await this.vendors.saveDetails(req.user!.id, { business_name, license_no, insurance_provider });
      res.json({ vendor: this.vendorView(saved) });
    } catch (error) {
      console.error('Error saving vendor details:', error);
      res.status(500).json({ error: 'Failed to save' });
    }
  }

  /** POST /maint/api/profile/certificate (multipart: file, expires_on) */
  async uploadCertificate(req: AuthRequest, res: Response) {
    try {
      const file = (req as any).file;
      const expires = String(req.body?.expires_on || '');
      if (!file) return res.status(400).json({ error: 'Choose the certificate file (PDF or photo)' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expires) || isNaN(Date.parse(expires))) return res.status(400).json({ error: 'Enter the date the insurance expires' });
      const saved = await this.vendors.saveCertificate(req.user!.id, file.buffer, file.mimetype, expires);
      if ('error' in saved) return res.status(400).json(saved);
      console.log(`Insurance certificate uploaded by ${req.user?.email}, expires ${expires}`);
      res.status(201).json({ vendor: this.vendorView(saved) });
    } catch (error) {
      console.error('Error uploading certificate:', error);
      res.status(500).json({ error: 'Failed to upload the certificate' });
    }
  }

  /** GET /ops-file/coi/:userId/:file?e=&s= : signed link (manager or the vendor), works in a new tab. */
  async serveCertificate(req: Request, res: Response) {
    try {
      const userId = parseInt(req.params.userId);
      const file = String(req.params.file || '');
      if (!this.vendors.checkSignature(userId, file, Number(req.query.e), String(req.query.s || ''))) return res.status(403).json({ error: 'Link expired' });
      const p = await this.vendors.get(userId);
      if (!p?.coi_path || !p.coi_path.endsWith(file)) return res.status(404).json({ error: 'Not found' });
      const abs = this.vendors.filePath(p);
      if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Not found' });
      res.setHeader('Content-Type', p.coi_mime || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="insurance-certificate.${p.coi_mime === 'application/pdf' ? 'pdf' : 'webp'}"`);
      res.setHeader('Cache-Control', 'private, max-age=600');
      fs.createReadStream(abs).pipe(res);
    } catch (error) {
      console.error('Error serving certificate:', error);
      res.status(500).json({ error: 'Failed to load the certificate' });
    }
  }

  // ---- worker: onboarding + sign-in ----

  private session(user: { id: number; email: string; first_name: string; last_name: string }) {
    this.workers.touchLogin(user.id).catch(err => console.error('last_login update failed:', err));
    return {
      token: generateToken({ userId: user.id, email: user.email, role: 'field_worker' }),
      user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name }
    };
  }

  async inviteInfo(req: Request, res: Response) {
    try {
      const invite = await this.workers.findInviteByToken(req.params.token);
      if (!invite) return res.status(404).json({ error: 'This invite link is invalid or has expired. Ask your manager for a new one.' });
      const company = await this.companies.findById(invite.company_id);
      const existing = await this.users.findByEmail(invite.email);
      res.json({
        company: { name: company?.name, logo_url: company?.logo_url || null },
        email: invite.email, first_name: invite.first_name, last_name: invite.last_name,
        worker_type: invite.worker_type, skills: invite.skills, phone: invite.phone,
        existing_account: !!existing && existing.role === 'field_worker'
      });
    } catch (error) {
      console.error('Error loading invite:', error);
      res.status(500).json({ error: 'Failed to load invite' });
    }
  }

  async acceptInvite(req: Request, res: Response) {
    try {
      const b = req.body || {};
      const first_name = text(b.first_name, 100);
      const last_name = text(b.last_name, 100);
      const password = b.password ? String(b.password) : '';
      const skills = cleanSkills(b.skills);
      const phone = optText(b.phone, 50);
      if (!first_name || !last_name) return res.status(400).json({ error: 'First and last name are required' });
      if (password && (password.length < 8 || password.length > 200)) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      if (skills === null) return res.status(400).json({ error: 'Skills: up to 20 tags of 40 characters' });

      const result = await this.workers.acceptInvite(req.params.token, { first_name, last_name, password: password || undefined, skills, phone });
      if ('error' in result) return res.status(result.status).json({ error: result.error });
      console.log(`Ops invite accepted by ${result.user.email} (${result.created ? 'new account' : 'existing account'})`);
      // the invite link went to this address, so it proves the email like a sign-in code does
      res.status(result.created ? 201 : 200).json({ message: 'Welcome to the team', created: result.created, ...this.session(result.user) });
    } catch (error) {
      console.error('Error accepting invite:', error);
      res.status(500).json({ error: 'Failed to accept invite' });
    }
  }

  async login(req: Request, res: Response) {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = String(req.body?.password || '');
      if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
      const user = await this.users.validatePassword(email, password);
      if (!user || user.role !== 'field_worker' || user.status !== 'active') return res.status(401).json({ error: 'Invalid email or password' });
      res.json(this.session(user));
    } catch (error) {
      console.error('Worker login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /** Always answers the same way so it can't be used to discover which emails have accounts. */
  async requestCode(req: Request, res: Response) {
    const email = normalizeEmail(req.body?.email);
    const reply = () => res.json({ message: `If that email has a StayGuide work account, a sign-in code is on its way. It works for ${CODE_MINUTES} minutes.` });
    try {
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email is required' });
      const user = await this.users.findByEmail(email);
      if (!user || user.role !== 'field_worker' || user.status !== 'active') return reply();
      const code = await this.workers.issueLoginCode(user.id);
      this.email.sendEmail({
        to: user.email,
        fromName: 'StayGuide',
        subject: `${code} is your StayGuide sign-in code`,
        text: `Your StayGuide sign-in code is ${code}. It works for ${CODE_MINUTES} minutes.\n\nIf you didn't ask for it, you can ignore this email.`,
        html: `<p>Your StayGuide sign-in code is</p><p style="font-size:28px;letter-spacing:6px;font-weight:bold">${code}</p><p>It works for ${CODE_MINUTES} minutes. If you didn't ask for it, you can ignore this email.</p>`
      }).catch(err => console.error('Login code email failed:', err));
      reply();
    } catch (error) {
      console.error('Error issuing login code:', error);
      res.status(500).json({ error: 'Failed to send code' });
    }
  }

  async verifyCode(req: Request, res: Response) {
    try {
      const email = normalizeEmail(req.body?.email);
      const code = String(req.body?.code || '').replace(/\s/g, '');
      const user = EMAIL_RE.test(email) ? await this.users.findByEmail(email) : null;
      if (!user || user.role !== 'field_worker' || user.status !== 'active' || !(await this.workers.verifyLoginCode(user.id, code))) {
        return res.status(401).json({ error: 'That code is wrong or has expired. Request a new one.' });
      }
      res.json(this.session(user));
    } catch (error) {
      console.error('Error verifying login code:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ---- worker: web push (2026-10-08 05:40, G7 S5) ----

  async pushKey(req: AuthRequest, res: Response) {
    const key = this.push.publicKey();
    res.json({ enabled: !!key, public_key: key, subscriptions: key ? await this.push.count(req.user!.id).catch(() => 0) : 0 });
  }

  async pushSubscribe(req: AuthRequest, res: Response) {
    try {
      const sub = req.body?.subscription;
      if (!this.push.publicKey()) return res.status(503).json({ error: 'Notifications are not set up on this server' });
      if (!sub || !validEndpoint(sub.endpoint) || typeof sub.keys?.p256dh !== 'string' || typeof sub.keys?.auth !== 'string'
        || sub.keys.p256dh.length > 255 || sub.keys.auth.length > 255) {
        return res.status(400).json({ error: 'Invalid push subscription' });
      }
      await this.push.subscribe(req.user!.id, sub, String(req.headers['user-agent'] || '').slice(0, 255) || null);
      res.status(201).json({ message: 'Notifications on' });
    } catch (error) {
      console.error('Error saving push subscription:', error);
      res.status(500).json({ error: 'Failed to turn on notifications' });
    }
  }

  async pushUnsubscribe(req: AuthRequest, res: Response) {
    try {
      if (typeof req.body?.endpoint !== 'string') return res.status(400).json({ error: 'endpoint is required' });
      await this.push.unsubscribe(req.user!.id, req.body.endpoint);
      res.json({ message: 'Notifications off' });
    } catch (error) {
      console.error('Error removing push subscription:', error);
      res.status(500).json({ error: 'Failed to turn off notifications' });
    }
  }

  async me(req: AuthRequest, res: Response) {
    try {
      const memberships = await this.workers.membershipsForUser(req.user!.id);
      res.json({
        user: { id: req.user!.id, email: req.user!.email, first_name: req.user!.first_name, last_name: req.user!.last_name },
        companies: memberships.map(m => ({
          id: m.company_id, name: m.company_name, slug: m.company_slug, logo_url: m.logo_url, worker_type: m.worker_type,
          // jobs show only while the membership, the company and its Ops add-on are all active
          active: m.status === 'active' && m.company_status === 'active' && entitlementsFor(m as any).ops,
          status: m.status
        }))
      });
    } catch (error) {
      console.error('Error loading worker profile:', error);
      res.status(500).json({ error: 'Failed to load profile' });
    }
  }
}
