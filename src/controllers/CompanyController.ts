import { Request, Response } from 'express';
import { CompanyService } from '../services/CompanyService';
import { UserService } from '../services/UserService';
import { AuthRequest } from '../types';

export class CompanyController {
  private companyService = new CompanyService();
  private userService = new UserService();

  async getAllCompanies(req: AuthRequest, res: Response) {
    try {
      const companies = await this.companyService.getAllCompanies();
      
      console.log(`Retrieved ${companies.length} companies for admin: ${req.user?.email}`);
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
}