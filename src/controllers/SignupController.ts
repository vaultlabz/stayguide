// 2026-10-03 23:06, G3 self-serve signup: company + owner account on the Free plan, no sales call (PRD FR-ONB-01)
import { Request, Response } from 'express';
import crypto from 'crypto';
import { CompanyService } from '../services/CompanyService';
import { UserService } from '../services/UserService';
import { generateToken } from '../utils/auth';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const slugify = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'company';

export class SignupController {
  private companyService = new CompanyService();
  private userService = new UserService();

  async signup(req: Request, res: Response) {
    try {
      const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
      const companyName = str(req.body?.company_name);
      const email = str(req.body?.email).toLowerCase();
      const firstName = str(req.body?.first_name);
      const lastName = str(req.body?.last_name);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';

      if (!companyName || companyName.length > 120) return res.status(400).json({ error: 'Company name is required (max 120 characters)' });
      if (!firstName || !lastName || firstName.length > 100 || lastName.length > 100) return res.status(400).json({ error: 'First and last name are required' });
      if (!EMAIL.test(email) || email.length > 255) return res.status(400).json({ error: 'A valid email address is required' });
      if (password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Password must be 8–128 characters' });

      if (await this.userService.findByEmail(email)) {
        return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
      }

      // Unique slug: name-based, with a short random suffix on collision
      let slug = slugify(companyName);
      for (let attempt = 0; attempt < 5 && (await this.companyService.findBySlug(slug)); attempt++) {
        slug = `${slugify(companyName).slice(0, 52)}-${crypto.randomBytes(3).toString('hex')}`;
      }

      let company;
      try {
        company = await this.companyService.createCompany({ name: companyName, slug, email });
      } catch {
        // e.g. slug or email unique constraint on an inactive company
        slug = `${slugify(companyName).slice(0, 52)}-${crypto.randomBytes(3).toString('hex')}`;
        company = await this.companyService.createCompany({ name: companyName, slug, email });
      }
      await this.companyService.setBillingState(company.id, { plan: 'free', subscription_status: null });

      const user = await this.userService.createUser({
        email, password, first_name: firstName, last_name: lastName, role: 'company_admin', company_id: company.id
      });

      const token = generateToken({ userId: user.id, email: user.email, role: user.role, companyId: company.id });
      console.log(`Self-serve signup: ${company.name} (${company.slug})`);
      res.status(201).json({
        message: 'Account created',
        token,
        company: { id: company.id, name: company.name, slug: company.slug, plan: 'free' },
        user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, role: user.role }
      });
    } catch (error) {
      console.error('Signup error:', error);
      res.status(500).json({ error: 'Could not create the account. Please try again.' });
    }
  }
}
