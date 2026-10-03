import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { db } from '../utils/database';
import { BillingRecord, CreateBillingRequest, BillingStats } from '../types/billing';
import { MockBillingService } from './MockBillingService';
import { EmailService } from './EmailService';
import { MOCK_MODE } from '../utils/mock-database';

export class BillingService {
  private mockService: MockBillingService;
  private emailService: EmailService;

  constructor() {
    this.mockService = new MockBillingService();
    this.emailService = new EmailService();
  }

  async createBillingRecord(data: CreateBillingRequest): Promise<BillingRecord> {
    if (MOCK_MODE) {
      return this.mockService.createBillingRecord(data);
    }

    try {
      console.log('Creating billing record for company:', data.company_id);
      
      // Calculate total amount (connection fee + monthly fees)
      const company = await this.getCompanyBillingInfo(data.company_id);
      const total_amount = company.connection_fee + (data.property_count * company.monthly_fee_per_property);
      
      const query = `
        INSERT INTO billing (
          company_id, billing_period_start, billing_period_end, 
          connection_fee, property_count, monthly_fee_per_property, total_amount,
          invoice_number, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `;
      
      const invoice_number = this.generateInvoiceNumber(data.company_id);
      
      const [result] = await db.execute<ResultSetHeader>(query, [
        data.company_id,
        data.billing_period_start,
        data.billing_period_end,
        company.connection_fee,
        data.property_count,
        company.monthly_fee_per_property,
        total_amount,
        invoice_number
      ]);

      const insertId = result.insertId;
      const newBilling = await this.getBillingRecordById(insertId);
      if (!newBilling) {
        throw new Error('Failed to retrieve created billing record');
      }

      // Send invoice email
      try {
        await this.sendInvoiceEmail(newBilling);
      } catch (emailError) {
        console.error('Failed to send invoice email:', emailError);
        // Don't fail the billing creation if email fails
      }

      return newBilling;
    } catch (error) {
      console.error('Error creating billing record:', error);
      throw error;
    }
  }

  async getBillingRecordById(id: number): Promise<BillingRecord | null> {
    if (MOCK_MODE) {
      return this.mockService.getBillingRecordById(id);
    }

    try {
      const query = 'SELECT * FROM billing WHERE id = ?';
      const [rows] = await db.execute<RowDataPacket[]>(query, [id]);
      
      if (rows.length === 0) return null;
      
      console.log(`Billing record found: ${id}`);
      return rows[0] as BillingRecord;
    } catch (error) {
      console.error('Error fetching billing record:', error);
      throw error;
    }
  }

  async getBillingRecordsByCompany(companyId: number): Promise<BillingRecord[]> {
    if (MOCK_MODE) {
      return this.mockService.getBillingRecordsByCompany(companyId);
    }

    try {
      const query = `
        SELECT * FROM billing 
        WHERE company_id = ? 
        ORDER BY billing_period_start DESC
      `;
      const [rows] = await db.execute<RowDataPacket[]>(query, [companyId]);
      
      console.log(`Retrieved ${rows.length} billing records for company ${companyId}`);
      return rows as BillingRecord[];
    } catch (error) {
      console.error('Error fetching company billing records:', error);
      throw error;
    }
  }

  async updateBillingStatus(id: number, status: string, stripePaymentIntentId?: string): Promise<BillingRecord | null> {
    if (MOCK_MODE) {
      return this.mockService.updateBillingStatus(id, status, stripePaymentIntentId);
    }

    try {
      const setPaidAt = status === 'paid' ? ', paid_at = NOW()' : '';
      const query = `
        UPDATE billing 
        SET status = ?, stripe_payment_intent_id = ?${setPaidAt}
        WHERE id = ?
      `;
      
      // 2026-10-03 12:45, mysql2 rejects undefined bind values (optional payment intent id)
      await db.execute(query, [status, stripePaymentIntentId ?? null, id]);
      console.log(`Billing record ${id} status updated to: ${status}`);
      
      const updatedBilling = await this.getBillingRecordById(id);
      
      // Send appropriate email based on status change
      if (updatedBilling) {
        try {
          if (status === 'paid') {
            await this.sendPaymentConfirmationEmail(updatedBilling);
          } else if (status === 'overdue') {
            await this.sendOverdueNoticeEmail(updatedBilling);
          }
        } catch (emailError) {
          console.error('Failed to send status change email:', emailError);
          // Don't fail the status update if email fails
        }
      }
      
      return updatedBilling;
    } catch (error) {
      console.error('Error updating billing status:', error);
      throw error;
    }
  }

  async getBillingStats(companyId?: number): Promise<BillingStats> {
    if (MOCK_MODE) {
      return this.mockService.getBillingStats(companyId);
    }

    try {
      const whereClause = companyId ? 'WHERE company_id = ?' : '';
      const query = `
        SELECT 
          SUM(total_amount) as total_revenue,
          SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) as paid_revenue,
          SUM(CASE WHEN status = 'pending' THEN total_amount ELSE 0 END) as pending_amount,
          SUM(CASE WHEN status = 'overdue' THEN total_amount ELSE 0 END) as overdue_amount,
          COUNT(*) as total_invoices,
          COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_invoices
        FROM billing ${whereClause}
      `;
      
      const params = companyId ? [companyId] : [];
      const [rows] = await db.execute<RowDataPacket[]>(query, params);
      const statsRows = rows as any[];
      
      const stats = statsRows[0];
      return {
        total_revenue: parseFloat(stats.total_revenue) || 0,
        monthly_revenue: parseFloat(stats.paid_revenue) || 0,
        pending_amount: parseFloat(stats.pending_amount) || 0,
        overdue_amount: parseFloat(stats.overdue_amount) || 0,
        total_invoices: stats.total_invoices || 0,
        paid_invoices: stats.paid_invoices || 0
      };
    } catch (error) {
      console.error('Error fetching billing stats:', error);
      throw error;
    }
  }

  private async getCompanyBillingInfo(companyId: number): Promise<{connection_fee: number, monthly_fee_per_property: number}> {
    const query = 'SELECT connection_fee, monthly_fee_per_property FROM companies WHERE id = ?';
    const [rows] = await db.execute<RowDataPacket[]>(query, [companyId]);
    const companies = rows as any[];
    
    if (companies.length === 0) {
      throw new Error('Company not found');
    }
    
    return {
      connection_fee: parseFloat(companies[0].connection_fee),
      monthly_fee_per_property: parseFloat(companies[0].monthly_fee_per_property)
    };
  }

  private generateInvoiceNumber(companyId: number): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const timestamp = Date.now().toString().slice(-6);
    return `INV-${year}${month}-${companyId}-${timestamp}`;
  }

  private async sendInvoiceEmail(billing: BillingRecord): Promise<void> {
    try {
      const company = await this.getCompanyDetails(billing.company_id);
      const user = await this.getCompanyAdminUser(billing.company_id);
      
      const paymentLink = `${process.env.APP_BASE_URL || 'http://localhost:3002'}/company/${company.slug}/billing`;
      
      await this.emailService.sendInvoiceEmail({
        invoice: billing,
        company,
        user,
        paymentLink
      });
      
      console.log(`Invoice email sent for ${billing.invoice_number} to ${company.email}`);
    } catch (error) {
      console.error('Error sending invoice email:', error);
      throw error;
    }
  }

  private async sendPaymentConfirmationEmail(billing: BillingRecord): Promise<void> {
    try {
      const company = await this.getCompanyDetails(billing.company_id);
      const user = await this.getCompanyAdminUser(billing.company_id);
      
      await this.emailService.sendPaymentConfirmationEmail({
        invoice: billing,
        company,
        user
      });
      
      console.log(`Payment confirmation sent for ${billing.invoice_number} to ${company.email}`);
    } catch (error) {
      console.error('Error sending payment confirmation email:', error);
      throw error;
    }
  }

  private async sendOverdueNoticeEmail(billing: BillingRecord): Promise<void> {
    try {
      const company = await this.getCompanyDetails(billing.company_id);
      const user = await this.getCompanyAdminUser(billing.company_id);
      
      const paymentLink = `${process.env.APP_BASE_URL || 'http://localhost:3002'}/company/${company.slug}/billing`;
      
      await this.emailService.sendOverdueNoticeEmail({
        invoice: billing,
        company,
        user,
        paymentLink
      });
      
      console.log(`Overdue notice sent for ${billing.invoice_number} to ${company.email}`);
    } catch (error) {
      console.error('Error sending overdue notice email:', error);
      throw error;
    }
  }

  private async getCompanyDetails(companyId: number): Promise<any> {
    if (MOCK_MODE) {
      // Return mock company data
      const mockCompanies = [
        { id: 1, name: 'Demo Rentals LLC', slug: 'demo-rentals', email: 'admin@demorentals.com' },
        { id: 2, name: 'Ocean View Properties', slug: 'ocean-view', email: 'admin@oceanview.com' }
      ];
      return mockCompanies.find(c => c.id === companyId) || mockCompanies[0];
    }

    const query = 'SELECT id, name, slug, email FROM companies WHERE id = ?';
    const [rows] = await db.execute<RowDataPacket[]>(query, [companyId]);
    
    if (rows.length === 0) {
      throw new Error('Company not found');
    }
    
    return rows[0];
  }

  private async getCompanyAdminUser(companyId: number): Promise<any> {
    if (MOCK_MODE) {
      // Return mock user data
      return {
        id: 1,
        email: 'admin@demorentals.com',
        first_name: 'Demo',
        last_name: 'Admin'
      };
    }

    const query = 'SELECT id, email, first_name, last_name FROM users WHERE company_id = ? AND role = "company_admin" AND status = "active" LIMIT 1';
    const [rows] = await db.execute<RowDataPacket[]>(query, [companyId]);
    
    if (rows.length === 0) {
      // Fallback to company email if no admin user found
      return {
        id: 0,
        email: 'admin@company.com',
        first_name: 'Company',
        last_name: 'Admin'
      };
    }
    
    return rows[0];
  }

  async getInvoiceWithCompanyDetails(billingId: number): Promise<{company: any, user: any}> {
    const billing = await this.getBillingRecordById(billingId);
    if (!billing) {
      throw new Error('Billing record not found');
    }

    const company = await this.getCompanyDetails(billing.company_id);
    const user = await this.getCompanyAdminUser(billing.company_id);

    return { company, user };
  }

  async resendInvoiceEmail(billingId: number): Promise<boolean> {
    try {
      const billing = await this.getBillingRecordById(billingId);
      if (!billing) {
        throw new Error('Billing record not found');
      }

      await this.sendInvoiceEmail(billing);
      return true;
    } catch (error) {
      console.error('Error resending invoice email:', error);
      return false;
    }
  }
}