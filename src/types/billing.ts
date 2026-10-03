export interface BillingRecord {
  id: number;
  company_id: number;
  billing_period_start: Date;
  billing_period_end: Date;
  connection_fee: number;
  property_count: number;
  monthly_fee_per_property: number;
  total_amount: number;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  invoice_number?: string;
  stripe_payment_intent_id?: string;
  stripe_customer_id?: string;
  paid_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreateBillingRequest {
  company_id: number;
  billing_period_start: Date;
  billing_period_end: Date;
  property_count: number;
}

export interface StripePaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: string;
  client_secret: string;
}

export interface BillingStats {
  total_revenue: number;
  monthly_revenue: number;
  pending_amount: number;
  overdue_amount: number;
  total_invoices: number;
  paid_invoices: number;
}