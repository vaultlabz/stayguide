import { BillingRecord, CreateBillingRequest, BillingStats } from '../types/billing';
import { mockDelay, MOCK_MODE } from '../utils/mock-database';

// Mock billing data
const mockBillingRecords: BillingRecord[] = [
  {
    id: 1,
    company_id: 1,
    billing_period_start: new Date('2025-01-01'),
    billing_period_end: new Date('2025-01-31'),
    connection_fee: 99.00,
    property_count: 2,
    monthly_fee_per_property: 29.99,
    total_amount: 158.98,
    status: 'paid',
    invoice_number: 'INV-202501-1-001',
    stripe_payment_intent_id: 'pi_mock_paid_123',
    stripe_customer_id: 'cus_mock_demo_rentals',
    paid_at: new Date('2025-01-05'),
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-05')
  },
  {
    id: 2,
    company_id: 1,
    billing_period_start: new Date('2025-02-01'),
    billing_period_end: new Date('2025-02-28'),
    connection_fee: 0.00,
    property_count: 2,
    monthly_fee_per_property: 29.99,
    total_amount: 59.98,
    status: 'pending',
    invoice_number: 'INV-202502-1-002',
    created_at: new Date('2025-02-01'),
    updated_at: new Date('2025-02-01')
  },
  {
    id: 3,
    company_id: 2,
    billing_period_start: new Date('2025-01-01'),
    billing_period_end: new Date('2025-01-31'),
    connection_fee: 149.00,
    property_count: 1,
    monthly_fee_per_property: 39.99,
    total_amount: 188.99,
    status: 'overdue',
    invoice_number: 'INV-202501-2-003',
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01')
  }
];

export class MockBillingService {
  async createBillingRecord(data: CreateBillingRequest): Promise<BillingRecord> {
    if (!MOCK_MODE) throw new Error('Mock mode not enabled');
    
    await mockDelay();
    
    // Get company billing info from mock data
    const companyBilling = this.getMockCompanyBilling(data.company_id);
    const total_amount = companyBilling.connection_fee + (data.property_count * companyBilling.monthly_fee_per_property);
    
    const newBilling: BillingRecord = {
      id: Math.max(...mockBillingRecords.map(b => b.id)) + 1,
      company_id: data.company_id,
      billing_period_start: data.billing_period_start,
      billing_period_end: data.billing_period_end,
      connection_fee: companyBilling.connection_fee,
      property_count: data.property_count,
      monthly_fee_per_property: companyBilling.monthly_fee_per_property,
      total_amount,
      status: 'pending',
      invoice_number: this.generateInvoiceNumber(data.company_id),
      created_at: new Date(),
      updated_at: new Date()
    };
    
    mockBillingRecords.push(newBilling);
    console.log(`[MOCK] Billing record created: ${newBilling.invoice_number}`);
    return newBilling;
  }

  async getBillingRecordById(id: number): Promise<BillingRecord | null> {
    if (!MOCK_MODE) return null;
    
    await mockDelay();
    const billing = mockBillingRecords.find(b => b.id === id);
    
    if (billing) {
      console.log(`[MOCK] Billing record found: ${billing.invoice_number}`);
      return billing;
    }
    
    return null;
  }

  async getBillingRecordsByCompany(companyId: number): Promise<BillingRecord[]> {
    if (!MOCK_MODE) return [];
    
    await mockDelay();
    const billings = mockBillingRecords.filter(b => b.company_id === companyId);
    
    console.log(`[MOCK] Retrieved ${billings.length} billing records for company ${companyId}`);
    return billings.sort((a, b) => b.billing_period_start.getTime() - a.billing_period_start.getTime());
  }

  async updateBillingStatus(id: number, status: string, stripePaymentIntentId?: string): Promise<BillingRecord | null> {
    if (!MOCK_MODE) return null;
    
    await mockDelay();
    const billingIndex = mockBillingRecords.findIndex(b => b.id === id);
    
    if (billingIndex === -1) return null;
    
    mockBillingRecords[billingIndex] = {
      ...mockBillingRecords[billingIndex],
      status: status as any,
      stripe_payment_intent_id: stripePaymentIntentId,
      paid_at: status === 'paid' ? new Date() : mockBillingRecords[billingIndex].paid_at,
      updated_at: new Date()
    };
    
    console.log(`[MOCK] Billing record ${id} status updated to: ${status}`);
    return mockBillingRecords[billingIndex];
  }

  async getBillingStats(companyId?: number): Promise<BillingStats> {
    if (!MOCK_MODE) return this.getEmptyStats();
    
    await mockDelay();
    
    const billings = companyId 
      ? mockBillingRecords.filter(b => b.company_id === companyId)
      : mockBillingRecords;
    
    const stats: BillingStats = {
      total_revenue: billings.reduce((sum, b) => sum + b.total_amount, 0),
      monthly_revenue: billings.filter(b => b.status === 'paid').reduce((sum, b) => sum + b.total_amount, 0),
      pending_amount: billings.filter(b => b.status === 'pending').reduce((sum, b) => sum + b.total_amount, 0),
      overdue_amount: billings.filter(b => b.status === 'overdue').reduce((sum, b) => sum + b.total_amount, 0),
      total_invoices: billings.length,
      paid_invoices: billings.filter(b => b.status === 'paid').length
    };
    
    console.log(`[MOCK] Billing stats calculated for ${companyId ? 'company ' + companyId : 'all companies'}`);
    return stats;
  }

  private getMockCompanyBilling(companyId: number): {connection_fee: number, monthly_fee_per_property: number} {
    // Demo data matching mock companies
    const billingInfo = {
      1: { connection_fee: 99.00, monthly_fee_per_property: 29.99 }, // Demo Rentals
      2: { connection_fee: 149.00, monthly_fee_per_property: 39.99 }  // Ocean View
    };
    
    return billingInfo[companyId as keyof typeof billingInfo] || { connection_fee: 99.00, monthly_fee_per_property: 29.99 };
  }

  private generateInvoiceNumber(companyId: number): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const timestamp = Date.now().toString().slice(-6);
    return `INV-${year}${month}-${companyId}-${timestamp}`;
  }

  private getEmptyStats(): BillingStats {
    return {
      total_revenue: 0,
      monthly_revenue: 0,
      pending_amount: 0,
      overdue_amount: 0,
      total_invoices: 0,
      paid_invoices: 0
    };
  }
}