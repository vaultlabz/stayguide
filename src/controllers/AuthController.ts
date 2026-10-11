import { Request, Response } from 'express';
import { UserService } from '../services/UserService';
import { CompanyService } from '../services/CompanyService';
import { generateToken, comparePassword } from '../utils/auth';
import { AuthRequest } from '../types';
import { PasswordService, passwordProblem, RESET_MINUTES } from '../services/PasswordService'; // 2026-10-09 12:16, #56
import { EmailService } from '../services/EmailService';

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const baseUrl = (req: Request) => (process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

export class AuthController {
  private userService = new UserService();
  private companyService = new CompanyService();
  private passwords = new PasswordService();
  private email = new EmailService();

  async adminLogin(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const user = await this.userService.validatePassword(email, password);
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        companyId: user.company_id
      });

      console.log(`Admin login successful: ${user.email}`);
      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Admin login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // 2026-10-07 17:15, POST /login: sign in with email + password only; the company comes from the account (task #44, replaces prompt() for the slug)
  async signIn(req: Request, res: Response) {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }
      const user = await this.userService.validatePassword(email, password);
      if (!user || (user.role !== 'company_admin' && user.role !== 'super_admin')) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      let company = null;
      if (user.role === 'company_admin') {
        company = user.company_id ? await this.companyService.findById(user.company_id) : null;
        if (!company || company.status !== 'active') {
          return res.status(403).json({ error: 'This company account is not active. Contact StayGuide support.' });
        }
      }
      const token = generateToken({ userId: user.id, email: user.email, role: user.role, companyId: user.company_id });
      console.log(`Sign-in successful: ${user.email}${company ? ` for ${company.name}` : ' (super admin)'}`);
      res.json({
        message: 'Login successful',
        token,
        redirect: company ? `/company/${company.slug}/dashboard` : '/admin/dashboard'
      });
    } catch (error) {
      console.error('Sign-in error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async companyLogin(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      const { companySlug } = req.params;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      if (!companySlug) {
        return res.status(400).json({ error: 'Company slug is required' });
      }

      const company = await this.companyService.findBySlug(companySlug);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      const user = await this.userService.validatePassword(email, password);
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (user.role === 'company_admin' && user.company_id !== company.id) {
        return res.status(403).json({ error: 'Access denied for this company' });
      }

      if (user.role !== 'super_admin' && user.role !== 'company_admin') {
        return res.status(403).json({ error: 'Company access required' });
      }

      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        companyId: user.company_id
      });

      console.log(`Company login successful: ${user.email} for ${company.name}`);
      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role,
          company_id: user.company_id
        },
        company: {
          id: company.id,
          name: company.name,
          slug: company.slug
        }
      });
    } catch (error) {
      console.error('Company login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async logout(req: AuthRequest, res: Response) {
    try {
      console.log(`User logged out: ${req.user?.email}`);
      res.json({ message: 'Logout successful' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async profile(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const user = await this.userService.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      let company = null;
      if (user.company_id) {
        company = await this.companyService.findById(user.company_id);
      }

      res.json({
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role,
          company_id: user.company_id,
          last_login: user.last_login
        },
        company: company ? {
          id: company.id,
          name: company.name,
          slug: company.slug
        } : null
      });
    } catch (error) {
      console.error('Profile error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // 2026-10-09 12:16, #56 POST /forgot-password { email }: same answer whether or not the account exists
  async forgotPassword(req: Request, res: Response) {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email is required' });
    try {
      const reset = await this.passwords.createReset(email);
      if (reset) {
        const link = `${baseUrl(req)}/reset-password?token=${reset.token}`;
        this.email.sendEmail({
          to: reset.user.email, fromName: 'StayGuide', subject: 'Reset your StayGuide password',
          text: `Hi ${reset.user.first_name},\n\nSomeone (hopefully you) asked to reset your StayGuide password.\n\nChoose a new password: ${link}\n\nThe link works once, for ${RESET_MINUTES} minutes. If you didn't ask for this, ignore this email; your password stays the same.`,
          html: `<p>Hi ${esc(reset.user.first_name)},</p><p>Someone (hopefully you) asked to reset your StayGuide password.</p>`
            + `<p><a href="${link}">Choose a new password</a></p><p style="color:#666">The link works once, for ${RESET_MINUTES} minutes. If you didn't ask for this, ignore this email; your password stays the same.</p>`
        }).catch(err => console.error('Reset email failed:', err));
      }
      res.json({ message: `If that email has a StayGuide account, a reset link is on its way. It works for ${RESET_MINUTES} minutes.` });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // 2026-10-09 12:16, #56 POST /reset-password { token, password }
  async resetPassword(req: Request, res: Response) {
    const problem = passwordProblem(req.body?.password);
    if (problem) return res.status(400).json({ error: problem });
    try {
      const user = await this.passwords.resetWithToken(String(req.body?.token || ''), req.body.password);
      if (!user) return res.status(400).json({ error: 'This reset link is invalid, already used or expired. Request a new one.', code: 'RESET_INVALID' });
      this.notifyChanged(user.email, user.first_name, baseUrl(req));
      res.json({ message: 'Password updated. Sign in with your new password.', redirect: user.role === 'field_worker' ? '/maint' : '/login' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // 2026-10-09 12:16, #56 POST /account/password { current_password, new_password } (signed in). Other sessions are signed
  // out; the response carries a fresh token for this one.
  async changePassword(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ error: 'Authentication required' });
      const { current_password, new_password } = req.body || {};
      const problem = passwordProblem(new_password);
      if (problem) return res.status(400).json({ error: problem });
      if (typeof current_password !== 'string' || !(await comparePassword(current_password, req.user.password_hash))) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
      if (current_password === new_password) return res.status(400).json({ error: 'Choose a password different from the current one' });
      await this.passwords.setPassword(req.user.id, new_password);
      this.notifyChanged(req.user.email, req.user.first_name, baseUrl(req));
      const token = generateToken({ userId: req.user.id, email: req.user.email, role: req.user.role, companyId: req.user.company_id });
      res.json({ message: 'Password changed. Other devices were signed out.', token });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  private notifyChanged(to: string, firstName: string, base: string) {
    this.email.sendEmail({
      to, fromName: 'StayGuide', subject: 'Your StayGuide password was changed',
      text: `Hi ${firstName},\n\nYour StayGuide password was just changed and other devices were signed out.\n\nIf this wasn't you, reset it now: ${base}/forgot-password`,
      html: `<p>Hi ${esc(firstName)},</p><p>Your StayGuide password was just changed and other devices were signed out.</p><p>If this wasn't you, <a href="${base}/forgot-password">reset it now</a>.</p>`
    }).catch(err => console.error('Password-changed email failed:', err));
  }
}
