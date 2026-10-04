import { RowDataPacket } from 'mysql2';
import { db } from '../utils/database';
import { Company } from '../types';
import { MockCompanyService } from './MockCompanyService';
import { MOCK_MODE, mockCompanies } from '../utils/mock-database';
import { pickAllowedFields, buildSetClause, COMPANY_UPDATE_FIELDS } from '../utils/sql';

export class CompanyService {
  private mockService = new MockCompanyService();

  async findById(id: number): Promise<Company | null> {
    if (MOCK_MODE) {
      return this.mockService.findById(id);
    }
    
    try {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM companies WHERE id = ?',
        [id]
      );

      if (rows.length === 0) {
        return null;
      }

      const company = rows[0] as Company;
      console.log(`Company found: ${company.name}`);
      return company;
    } catch (error) {
      console.error('Error finding company by ID:', error);
      throw new Error('Database error');
    }
  }

  // 2026-10-03 23:06, G3 billing state: written only by BillingService / webhooks, never from request bodies
  static readonly BILLING_FIELDS = ['plan', 'billing_interval', 'subscription_status', 'stripe_customer_id', 'stripe_subscription_id', 'current_period_end', 'cancel_at_period_end'] as const;

  async setBillingState(id: number, state: Partial<Company>): Promise<void> {
    const fields = pickAllowedFields(state as Record<string, any>, CompanyService.BILLING_FIELDS);
    if (!Object.keys(fields).length) return;
    if (MOCK_MODE) {
      const company: any = mockCompanies.find(c => c.id === id);
      if (company) Object.assign(company, fields);
      return;
    }
    const { setClause, values } = buildSetClause(fields);
    await db.execute(`UPDATE companies SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...values, id]);
  }

  async findByStripeCustomerId(customerId: string): Promise<Company | null> {
    if (MOCK_MODE) return (mockCompanies.find((c: any) => c.stripe_customer_id === customerId) as unknown as Company) || null;
    const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM companies WHERE stripe_customer_id = ?', [customerId]);
    return (rows[0] as Company) || null;
  }

  async findBySlug(slug: string): Promise<Company | null> {
    if (MOCK_MODE) {
      return this.mockService.findBySlug(slug);
    }
    
    try {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM companies WHERE slug = ? AND status = "active"',
        [slug]
      );

      if (rows.length === 0) {
        return null;
      }

      const company = rows[0] as Company;
      console.log(`Company found by slug: ${company.name}`);
      return company;
    } catch (error) {
      console.error('Error finding company by slug:', error);
      throw new Error('Database error');
    }
  }

  async getAllCompanies(): Promise<Company[]> {
    if (MOCK_MODE) {
      return this.mockService.getAllCompanies();
    }
    
    try {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM companies ORDER BY created_at DESC'
      );

      const companies = rows as Company[];
      console.log(`Retrieved ${companies.length} companies`);
      return companies;
    } catch (error) {
      console.error('Error getting all companies:', error);
      throw new Error('Database error');
    }
  }

  async createCompany(companyData: {
    name: string;
    slug: string;
    email: string;
    phone?: string;
    address?: string;
    logo_url?: string;
    connection_fee?: number;
    monthly_fee_per_property?: number;
  }): Promise<Company> {
    if (MOCK_MODE) {
      return this.mockService.createCompany(companyData);
    }
    
    try {
      const [result] = await db.execute(
        `INSERT INTO companies (name, slug, email, phone, address, logo_url, connection_fee, monthly_fee_per_property, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [
          companyData.name,
          companyData.slug,
          companyData.email,
          companyData.phone || null,
          companyData.address || null,
          companyData.logo_url || null,
          companyData.connection_fee || 0.00,
          companyData.monthly_fee_per_property || 0.00
        ]
      );

      const insertResult = result as any;
      const newCompany = await this.findById(insertResult.insertId);
      
      if (!newCompany) {
        throw new Error('Failed to create company');
      }

      console.log(`Company created: ${newCompany.name}`);
      return newCompany;
    } catch (error) {
      console.error('Error creating company:', error);
      throw new Error('Failed to create company');
    }
  }

  async updateCompany(id: number, updates: Partial<Company>): Promise<Company | null> {
    // 2026-10-03 11:34, whitelist columns (SQL injection fix)
    const fields = pickAllowedFields(updates, COMPANY_UPDATE_FIELDS);

    if (MOCK_MODE) {
      return this.mockService.updateCompany(id, fields);
    }

    try {
      if (Object.keys(fields).length === 0) {
        return this.findById(id);
      }

      const { setClause, values } = buildSetClause(fields);

      await db.execute(
        `UPDATE companies SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...values, id]
      );

      const updatedCompany = await this.findById(id);
      console.log(`Company updated: ${updatedCompany?.name}`);
      return updatedCompany;
    } catch (error) {
      console.error('Error updating company:', error);
      throw new Error('Failed to update company');
    }
  }

  async deleteCompany(id: number): Promise<boolean> {
    if (MOCK_MODE) {
      return this.mockService.deleteCompany(id);
    }
    
    try {
      await db.execute(
        'UPDATE companies SET status = "inactive", updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      );

      console.log(`Company marked as inactive: ${id}`);
      return true;
    } catch (error) {
      console.error('Error deleting company:', error);
      throw new Error('Failed to delete company');
    }
  }
}