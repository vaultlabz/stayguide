import { Request, Response } from 'express';
import { CompanyService } from '../services/CompanyService';
import { UserService } from '../services/UserService';
import { AuthRequest, Company } from '../types';
// 2026-10-07 15:40, admin stats
import { PropertyService } from '../services/PropertyService';
import { PLANS, PlanId, billedQuantity } from '../config/plans';
import { AccountClosureService, ClosureError, purgeDate } from '../services/AccountClosureService'; // 2026-10-22 15:52, #66

/** Estimated monthly revenue for one company. Legacy (grandfathered) accounts pay their manual per-property fee;
 *  Stripe plans use plans.ts prices (annual Pro is spread over 12 months). Past-due and canceled pay nothing. */
export function monthlyRevenueFor(company: Company, activeProperties: number): number {
  const c = company as any;
  const plan = (c.plan || 'free') as PlanId;
  if (c.subscription_status === 'legacy') return activeProperties * (parseFloat(c.monthly_fee_per_property) || 0);
  if (!['active', 'trialing'].includes(c.subscription_status) || !PLANS[plan]) return 0;
  const qty = billedQuantity(plan, activeProperties);
  if (plan === 'pro' && c.billing_interval === 'year') return qty * (PLANS.pro.price.year || 0) / 12;
  return qty * PLANS[plan].price.month;
}

export class CompanyController {
  private companyService = new CompanyService();
  private userService = new UserService();
  private propertyService = new PropertyService();

  async getAllCompanies(req: AuthRequest, res: Response) {
    try {
      // 2026-10-09 12:31, #61 per-company property and admin counts for the super admin table
      const companies = await Promise.all((await this.companyService.getAllCompanies()).map(async c => {
        const [properties, admins] = await Promise.all([this.propertyService.getPropertiesByCompany(c.id), this.userService.listCompanyAdmins(c.id)]);
        return { ...c, property_count: properties.length, active_property_count: properties.filter(p => p.status === 'active').length,
          admin_count: admins.filter(u => u.status === 'active').length,
          purge_after: c.closed_at && !c.purged_at ? purgeDate(c.closed_at) : null }; // 2026-10-22 15:52, #66
      }));

      res.json({
        message: 'Companies retrieved successfully',
        companies,
        total: companies.length
      });
    } catch (error) {
      console.error('Error getting companies:', error);
      res.status(500).json({ error: 'Failed to retrieve companies' });
    }
  }

  // 2026-10-07 15:40, admin dashboard stat tiles: active properties and estimated monthly recurring revenue
  async getStats(req: AuthRequest, res: Response) {
    try {
      const companies = (await this.companyService.getAllCompanies()).filter(c => c.status === 'active');
      let totalProperties = 0;
      let monthlyRevenue = 0;
      for (const company of companies) {
        const active = (await this.propertyService.getPropertiesByCompany(company.id)).filter(p => p.status === 'active').length;
        totalProperties += active;
        monthlyRevenue += monthlyRevenueFor(company, active);
      }
      res.json({ total_properties: totalProperties, monthly_revenue: Math.round(monthlyRevenue * 100) / 100 });
    } catch (error) {
      console.error('Error getting admin stats:', error);
      res.status(500).json({ error: 'Failed to retrieve stats' });
    }
  }

  async getCompany(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const companyId = parseInt(id);

      if (isNaN(companyId)) {
        return res.status(400).json({ error: 'Invalid company ID' });
      }

      const company = await this.companyService.findById(companyId);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      console.log(`Company details retrieved: ${company.name}`);
      res.json({
        message: 'Company retrieved successfully',
        company
      });
    } catch (error) {
      console.error('Error getting company:', error);
      res.status(500).json({ error: 'Failed to retrieve company' });
    }
  }

  async createCompany(req: AuthRequest, res: Response) {
    try {
      const {
        name,
        slug,
        email,
        phone,
        address,
        logo_url,
        connection_fee,
        monthly_fee_per_property,
        admin_email,
        admin_password,
        admin_first_name,
        admin_last_name
      } = req.body;

      // Validate required fields
      if (!name || !slug || !email) {
        return res.status(400).json({ 
          error: 'Company name, slug, and email are required' 
        });
      }

      if (!admin_email || !admin_password || !admin_first_name || !admin_last_name) {
        return res.status(400).json({ 
          error: 'Admin user details are required' 
        });
      }

      // Check if company slug already exists
      const existingCompany = await this.companyService.findBySlug(slug);
      if (existingCompany) {
        return res.status(409).json({ error: 'Company slug already exists' });
      }

      // Check if admin email already exists
      const existingUser = await this.userService.findByEmail(admin_email);
      if (existingUser) {
        return res.status(409).json({ error: 'Admin email already exists' });
      }

      // Create company
      const company = await this.companyService.createCompany({
        name,
        slug: slug.toLowerCase(),
        email,
        phone,
        address,
        logo_url,
        connection_fee: parseFloat(connection_fee) || 0.00,
        monthly_fee_per_property: parseFloat(monthly_fee_per_property) || 0.00
      });

      // Create company admin user
      const adminUser = await this.userService.createUser({
        email: admin_email,
        password: admin_password,
        first_name: admin_first_name,
        last_name: admin_last_name,
        role: 'company_admin',
        company_id: company.id
      });

      console.log(`Company created: ${company.name} by ${req.user?.email}`);
      res.status(201).json({
        message: 'Company and admin user created successfully',
        company,
        admin_user: {
          id: adminUser.id,
          email: adminUser.email,
          first_name: adminUser.first_name,
          last_name: adminUser.last_name,
          role: adminUser.role
        }
      });
    } catch (error) {
      console.error('Error creating company:', error);
      res.status(500).json({ error: 'Failed to create company' });
    }
  }

  async updateCompany(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const companyId = parseInt(id);

      if (isNaN(companyId)) {
        return res.status(400).json({ error: 'Invalid company ID' });
      }

      const existingCompany = await this.companyService.findById(companyId);
      if (!existingCompany) {
        return res.status(404).json({ error: 'Company not found' });
      }

      // 2026-10-22 15:52, #66 a closed account is reopened (or purged) through its own endpoints, never by editing the status
      if (existingCompany.purged_at) return res.status(409).json({ error: 'This account was purged.' });
      if (existingCompany.closed_at && req.body.status !== undefined && req.body.status !== existingCompany.status) return res.status(409).json({ error: 'This account is closed. Use Reopen to restore it.' });

      const updates = req.body;
      
      // Don't allow slug changes if it would conflict
      if (updates.slug && updates.slug !== existingCompany.slug) {
        const slugExists = await this.companyService.findBySlug(updates.slug);
        if (slugExists) {
          return res.status(409).json({ error: 'Company slug already exists' });
        }
        updates.slug = updates.slug.toLowerCase();
      }

      // Convert fee strings to numbers
      if (updates.connection_fee) {
        updates.connection_fee = parseFloat(updates.connection_fee);
      }
      if (updates.monthly_fee_per_property) {
        updates.monthly_fee_per_property = parseFloat(updates.monthly_fee_per_property);
      }
      if ('ops_addon' in updates) updates.ops_addon = updates.ops_addon === true || updates.ops_addon === 'true'; // 2026-10-07 18:30

      const updatedCompany = await this.companyService.updateCompany(companyId, updates);

      console.log(`Company updated: ${updatedCompany?.name} by ${req.user?.email}`);
      res.json({
        message: 'Company updated successfully',
        company: updatedCompany
      });
    } catch (error) {
      console.error('Error updating company:', error);
      res.status(500).json({ error: 'Failed to update company' });
    }
  }

  async deleteCompany(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const companyId = parseInt(id);

      if (isNaN(companyId)) {
        return res.status(400).json({ error: 'Invalid company ID' });
      }

      const company = await this.companyService.findById(companyId);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      await this.companyService.deleteCompany(companyId);

      console.log(`Company deleted: ${company.name} by ${req.user?.email}`);
      res.json({
        message: 'Company deactivated successfully',
        company_id: companyId
      });
    } catch (error) {
      console.error('Error deleting company:', error);
      res.status(500).json({ error: 'Failed to delete company' });
    }
  }

  // ---- 2026-10-22 15:52, #66 close account, data export, purge (super admin) ----
  private closure = new AccountClosureService();

  private async closureAction(req: AuthRequest, res: Response, run: (id: number) => Promise<unknown>) {
    const companyId = parseInt(req.params.id);
    if (isNaN(companyId)) return res.status(400).json({ error: 'Invalid company ID' });
    try {
      res.json(await run(companyId));
    } catch (error) {
      if (error instanceof ClosureError) return res.status(error.status).json({ error: error.message });
      console.error('Account closure action failed:', error);
      res.status(500).json({ error: 'The action failed. Nothing was changed if the error came from the database.' });
    }
  }

  closeAccount(req: AuthRequest, res: Response) {
    return this.closureAction(req, res, async id => ({ message: 'Account closed', ...await this.closure.close(id, req.user?.id ?? null) }));
  }

  reopenAccount(req: AuthRequest, res: Response) {
    return this.closureAction(req, res, async id => { await this.closure.reopen(id, req.user?.id ?? null); return { message: 'Account reopened' }; });
  }

  /** Purge before the waiting period ends: the body must repeat the company slug. */
  purgeAccount(req: AuthRequest, res: Response) {
    return this.closureAction(req, res, async id => {
      const company = await this.companyService.findById(id);
      if (company && req.body?.confirm !== company.slug) throw new ClosureError('Type the company slug to confirm the purge.', 400);
      return { message: 'Account data purged', counts: await this.closure.purge(id, req.user?.id ?? null, { early: true }) };
    });
  }

  async exportAccount(req: AuthRequest, res: Response) {
    const companyId = parseInt(req.params.id);
    if (isNaN(companyId)) return res.status(400).json({ error: 'Invalid company ID' });
    try {
      const data = await this.closure.exportData(companyId);
      res.setHeader('Content-Disposition', `attachment; filename="stayguide-${String(data.company.slug).replace(/[^\w-]/g, '')}-export-${data.exported_at.slice(0, 10)}.json"`);
      res.json(data);
    } catch (error) {
      if (error instanceof ClosureError) return res.status(error.status).json({ error: error.message });
      console.error('Account export failed:', error);
      res.status(500).json({ error: 'Export failed' });
    }
  }
}
