// 2026-10-03 23:06, G3 Stripe Billing: Checkout (cards + ACH), bank-transfer invoices, Customer Portal, webhooks, quantity sync.
// Configured entirely from env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_* (see src/config/plans.ts).
import Stripe from 'stripe';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { db } from '../utils/database';
import { Company } from '../types';
import { CompanyService } from './CompanyService';
import { countActiveProperties } from './EntitlementService';
import { PlanId, BillingInterval, HardwareKit, PriceKey, priceId, billedQuantity } from '../config/plans';
import { MOCK_MODE, mockStripeEvents, mockHardwareOrders } from '../utils/mock-database';

export class BillingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

let client: Stripe | null | undefined;

/** Stripe client, or null when billing isn't configured. STRIPE_API_HOST/PORT/PROTOCOL exist for tests only. */
export function getStripe(): Stripe | null {
  if (client !== undefined) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return (client = null);
  const options: Stripe.StripeConfig = { maxNetworkRetries: 2, timeout: 20000 };
  if (process.env.STRIPE_API_HOST) {
    options.host = process.env.STRIPE_API_HOST;
    options.port = Number(process.env.STRIPE_API_PORT || 443);
    options.protocol = (process.env.STRIPE_API_PROTOCOL as 'http' | 'https') || 'https';
  }
  return (client = new Stripe(key, options));
}

const requireStripe = (): Stripe => {
  const stripe = getStripe();
  if (!stripe) throw new BillingError('Billing is not configured yet. Please contact StayGuide support.', 503);
  return stripe;
};

const requirePrice = (key: PriceKey): string => {
  const id = priceId(key);
  if (!id) throw new BillingError(`Billing price "${key}" is not configured.`, 503);
  return id;
};

const ACH_OPTIONS: Stripe.Checkout.SessionCreateParams.PaymentMethodOptions = {
  us_bank_account: { financial_connections: { permissions: ['payment_method'] }, verification_method: 'automatic' }
};

/** current_period_end moved onto subscription items in newer API versions; support both shapes. */
const periodEnd = (sub: any): Date | null => {
  const ts = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
  return ts ? new Date(ts * 1000) : null;
};

export class StripeBillingService {
  private companyService = new CompanyService();

  private async ensureCustomer(company: Company, email: string): Promise<string> {
    if (company.stripe_customer_id) return company.stripe_customer_id;
    const stripe = requireStripe();
    const customer = await stripe.customers.create({
      name: company.name,
      email,
      metadata: { company_id: String(company.id), company_slug: company.slug }
    });
    await this.companyService.setBillingState(company.id, { stripe_customer_id: customer.id });
    company.stripe_customer_id = customer.id;
    return customer.id;
  }

  private hasLiveSubscription(company: Company): boolean {
    return !!company.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(String(company.subscription_status));
  }

  private planPrice(plan: PlanId, interval: BillingInterval): string {
    if (plan === 'pro') return requirePrice(interval === 'year' ? 'pro_year' : 'pro_month');
    if (plan === 'portfolio') {
      if (interval !== 'month') throw new BillingError('Portfolio is billed monthly.');
      return requirePrice('portfolio_month');
    }
    throw new BillingError('Unknown plan');
  }

  /** Checkout for Pro (monthly/annual, per property) or Portfolio (monthly, per 5-property block). Cards + ACH. */
  async createPlanCheckout(company: Company, email: string, plan: PlanId, interval: BillingInterval, baseUrl: string): Promise<string> {
    if (this.hasLiveSubscription(company)) throw new BillingError('You already have a subscription. Use "Manage billing" to change plan.', 409);
    const stripe = requireStripe();
    const price = this.planPrice(plan, interval);
    const quantity = billedQuantity(plan, await countActiveProperties(company.id));
    const customer = await this.ensureCustomer(company, email);
    const metadata = { company_id: String(company.id), kind: 'plan', plan, interval };

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      client_reference_id: String(company.id),
      line_items: [{ price, quantity }],
      allowed_payment_method_types: ['card', 'us_bank_account'],
      payment_method_options: ACH_OPTIONS,
      allow_promotion_codes: true,
      subscription_data: { metadata },
      metadata,
      success_url: `${baseUrl}/company/${company.slug}/billing?checkout=success`,
      cancel_url: `${baseUrl}/company/${company.slug}/billing?checkout=cancelled`
    });
    return session.url!;
  }

  /** Pay-by-invoice (bank transfer / ACH / card) subscription, e.g. for annual plans. */
  async createInvoiceSubscription(company: Company, email: string, plan: PlanId, interval: BillingInterval): Promise<{ hosted_invoice_url: string | null }> {
    if (this.hasLiveSubscription(company)) throw new BillingError('You already have a subscription. Use "Manage billing" to change plan.', 409);
    const stripe = requireStripe();
    const price = this.planPrice(plan, interval);
    const quantity = billedQuantity(plan, await countActiveProperties(company.id));
    const customer = await this.ensureCustomer(company, email);

    const sub = await stripe.subscriptions.create({
      customer,
      items: [{ price, quantity }],
      collection_method: 'send_invoice',
      days_until_due: 14,
      payment_settings: { payment_method_types: ['customer_balance', 'us_bank_account', 'card'] },
      metadata: { company_id: String(company.id), kind: 'plan', plan, interval },
      expand: ['latest_invoice']
    });
    await this.applySubscription(company.id, sub, plan, interval);
    const invoice: any = sub.latest_invoice;
    return { hosted_invoice_url: invoice && typeof invoice === 'object' ? invoice.hosted_invoice_url || null : null };
  }

  /** Hardware: one-time purchase (card / ACH / bank transfer, ships to an address) or monthly bundle (kit + Pro). */
  async createHardwareCheckout(company: Company, email: string, kit: HardwareKit, mode: 'purchase' | 'bundle', baseUrl: string): Promise<string> {
    const stripe = requireStripe();
    const customer = await this.ensureCustomer(company, email);
    const metadata = { company_id: String(company.id), kind: 'hardware', kit, mode };
    const urls = {
      success_url: `${baseUrl}/company/${company.slug}/billing?hardware=success`,
      cancel_url: `${baseUrl}/company/${company.slug}/billing?hardware=cancelled`
    };

    let session: Stripe.Checkout.Session;
    if (mode === 'bundle') {
      if (this.hasLiveSubscription(company)) throw new BillingError('You already have a subscription. Add hardware as a one-time purchase, or contact us to switch to a bundle.', 409);
      session = await stripe.checkout.sessions.create({
        mode: 'subscription', customer, client_reference_id: String(company.id),
        line_items: [{ price: requirePrice(kit === 'desk' ? 'bundle_desk' : 'bundle_wall'), quantity: 1 }],
        allowed_payment_method_types: ['card', 'us_bank_account'], payment_method_options: ACH_OPTIONS,
        shipping_address_collection: { allowed_countries: ['US'] },
        subscription_data: { metadata: { ...metadata, plan: 'pro', interval: 'month' } },
        metadata: { ...metadata, plan: 'pro', interval: 'month' }, ...urls
      });
    } else {
      session = await stripe.checkout.sessions.create({
        mode: 'payment', customer, client_reference_id: String(company.id),
        line_items: [{ price: requirePrice(kit === 'desk' ? 'kit_desk' : 'kit_wall'), quantity: 1 }],
        allowed_payment_method_types: ['card', 'us_bank_account', 'customer_balance'],
        payment_method_options: {
          ...ACH_OPTIONS,
          customer_balance: { funding_type: 'bank_transfer', bank_transfer: { type: 'us_bank_transfer' } }
        },
        shipping_address_collection: { allowed_countries: ['US'] },
        metadata, ...urls
      });
    }
    await this.recordHardwareOrder(company.id, kit, mode, session.id);
    return session.url!;
  }

  async createPortalSession(company: Company, baseUrl: string): Promise<string> {
    const stripe = requireStripe();
    if (!company.stripe_customer_id) throw new BillingError('No billing account yet. Choose a plan first.', 409);
    const session = await stripe.billingPortal.sessions.create({
      customer: company.stripe_customer_id,
      return_url: `${baseUrl}/company/${company.slug}/billing`
    });
    return session.url;
  }

  /**
   * Keep the subscription quantity equal to the plan's billed quantity for active properties.
   * Adding properties prorates now (FR-BIL-01 "pro-rated on add"); removing stops at the next invoice (no refund mid-cycle).
   */
  async syncQuantity(companyId: number): Promise<void> {
    const stripe = getStripe();
    const company = await this.companyService.findById(companyId);
    if (!stripe || !company?.stripe_subscription_id || !['pro', 'portfolio'].includes(String(company.plan))) return;
    if (company.subscription_status === 'legacy' || company.subscription_status === 'canceled') return;

    const sub = await stripe.subscriptions.retrieve(company.stripe_subscription_id);
    const item = sub.items.data[0];
    if (!item) return;
    const target = billedQuantity(company.plan as PlanId, await countActiveProperties(companyId));
    if (item.quantity === target) return;
    await stripe.subscriptionItems.update(item.id, {
      quantity: target,
      proration_behavior: target > (item.quantity || 0) ? 'create_prorations' : 'none'
    });
  }

  // ---- Webhooks ----

  /** Verify the signature, apply each event once. Throws BillingError(400) on bad signatures. */
  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<{ duplicate: boolean; type: string }> {
    const stripe = requireStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new BillingError('Webhook secret not configured', 503);
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature || '', secret);
    } catch (error) {
      throw new BillingError(`Invalid signature: ${(error as Error).message}`, 400);
    }

    if (!(await this.markEventProcessed(event.id, event.type))) return { duplicate: true, type: event.type };

    const obj: any = event.data.object;
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.async_payment_failed':
        await this.onCheckoutSession(event.type, obj);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.onSubscription(obj, event.type === 'customer.subscription.deleted');
        break;
      case 'invoice.payment_failed': {
        const company = obj.customer ? await this.companyService.findByStripeCustomerId(obj.customer) : null;
        if (company && company.subscription_status !== 'canceled') await this.companyService.setBillingState(company.id, { subscription_status: 'past_due' });
        break;
      }
      default:
        break; // other events are acknowledged and ignored
    }
    return { duplicate: false, type: event.type };
  }

  private async companyFor(obj: any): Promise<Company | null> {
    const id = Number(obj?.metadata?.company_id || obj?.client_reference_id);
    if (id) {
      const company = await this.companyService.findById(id);
      if (company) return company;
    }
    return obj?.customer ? this.companyService.findByStripeCustomerId(String(obj.customer)) : null;
  }

  private async onCheckoutSession(type: string, session: any) {
    const company = await this.companyFor(session);
    if (!company) return;
    const meta = session.metadata || {};

    if (meta.kind === 'hardware') {
      const paid = type === 'checkout.session.async_payment_succeeded' || session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
      const failed = type === 'checkout.session.async_payment_failed';
      await this.updateHardwareOrder(session.id, failed ? 'cancelled' : paid ? 'paid' : 'pending', session.amount_total, session.shipping_details || session.collected_information?.shipping_details);
    }

    // Plan subscriptions (and hardware bundles, which include Pro): link the subscription
    if (session.mode === 'subscription' && session.subscription && type === 'checkout.session.completed') {
      const stripe = requireStripe();
      const sub = await stripe.subscriptions.retrieve(String(session.subscription));
      await this.applySubscription(company.id, sub, (meta.plan || 'pro') as PlanId, (meta.interval || 'month') as BillingInterval);
    }
  }

  private async onSubscription(sub: any, deleted: boolean) {
    const company = await this.companyFor(sub);
    if (!company) return;
    // Only the company's current subscription drives entitlements (ignore stale/other subscriptions)
    if (company.stripe_subscription_id && company.stripe_subscription_id !== sub.id) return;
    if (deleted) {
      await this.companyService.setBillingState(company.id, { subscription_status: 'canceled', cancel_at_period_end: false });
      return;
    }
    const plan = (sub.metadata?.plan || company.plan || 'pro') as PlanId;
    const interval = (sub.metadata?.interval || sub.items?.data?.[0]?.price?.recurring?.interval || 'month') as BillingInterval;
    await this.applySubscription(company.id, sub, plan, interval);
  }

  private async applySubscription(companyId: number, sub: any, plan: PlanId, interval: BillingInterval) {
    await this.companyService.setBillingState(companyId, {
      plan,
      billing_interval: interval,
      subscription_status: sub.status,
      stripe_subscription_id: sub.id,
      current_period_end: periodEnd(sub),
      cancel_at_period_end: !!sub.cancel_at_period_end
    });
  }

  // ---- persistence (MySQL + mock) ----

  private async markEventProcessed(id: string, type: string): Promise<boolean> {
    if (MOCK_MODE) {
      if (mockStripeEvents.has(id)) return false;
      mockStripeEvents.add(id);
      return true;
    }
    const [result] = await db.execute<ResultSetHeader>('INSERT IGNORE INTO stripe_events (id, type) VALUES (?, ?)', [id, type]);
    return result.affectedRows === 1;
  }

  private async recordHardwareOrder(companyId: number, kit: HardwareKit, mode: string, sessionId: string) {
    if (MOCK_MODE) {
      mockHardwareOrders.push({ id: mockHardwareOrders.length + 1, company_id: companyId, kit, mode, status: 'pending', stripe_checkout_session_id: sessionId, amount_total: null, shipping_details: null, created_at: new Date() });
      return;
    }
    await db.execute('INSERT INTO hardware_orders (company_id, kit, mode, stripe_checkout_session_id) VALUES (?, ?, ?, ?)', [companyId, kit, mode, sessionId]);
  }

  private async updateHardwareOrder(sessionId: string, status: string, amountTotal: number | null, shipping: any) {
    const amount = typeof amountTotal === 'number' ? amountTotal / 100 : null;
    const shippingJson = shipping ? JSON.stringify(shipping) : null;
    if (MOCK_MODE) {
      const order = mockHardwareOrders.find(o => o.stripe_checkout_session_id === sessionId);
      if (order) Object.assign(order, { status, amount_total: amount, shipping_details: shippingJson });
      return;
    }
    await db.execute(
      'UPDATE hardware_orders SET status = ?, amount_total = COALESCE(?, amount_total), shipping_details = COALESCE(?, shipping_details) WHERE stripe_checkout_session_id = ?',
      [status, amount, shippingJson, sessionId]
    );
  }

  async listHardwareOrders(companyId?: number): Promise<any[]> {
    if (MOCK_MODE) return mockHardwareOrders.filter(o => companyId === undefined || o.company_id === companyId).slice().reverse();
    const [rows] = companyId === undefined
      ? await db.execute<RowDataPacket[]>('SELECT o.*, c.name AS company_name, c.slug AS company_slug FROM hardware_orders o JOIN companies c ON c.id = o.company_id ORDER BY o.created_at DESC LIMIT 200')
      : await db.execute<RowDataPacket[]>('SELECT * FROM hardware_orders WHERE company_id = ? ORDER BY created_at DESC', [companyId]);
    return rows;
  }

  async setHardwareOrderStatus(id: number, status: 'shipped' | 'cancelled'): Promise<boolean> {
    if (MOCK_MODE) {
      const order = mockHardwareOrders.find(o => o.id === id);
      if (!order) return false;
      order.status = status;
      return true;
    }
    const [result] = await db.execute<ResultSetHeader>('UPDATE hardware_orders SET status = ? WHERE id = ?', [status, id]);
    return result.affectedRows > 0;
  }
}
