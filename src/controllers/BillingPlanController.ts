// 2026-10-03 23:06, G3 self-serve billing endpoints (company admin) + hardware fulfilment (super admin)
import { Request, Response } from 'express';
import { AuthRequest, Company } from '../types';
import { resolveOwnedCompany } from '../utils/ownership';
import { StripeBillingService, BillingError, getStripe } from '../services/StripeBillingService';
import { entitlementsFor, countActiveProperties } from '../services/EntitlementService';
import { PLANS, HARDWARE, SIGNATURE, PRICE_ENV, PlanId, BillingInterval, HardwareKit, billedQuantity, priceId, PriceKey } from '../config/plans';

const baseUrl = (req: Request) => (process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

export class BillingPlanController {
  private billing = new StripeBillingService();

  private fail(res: Response, error: unknown, what: string) {
    if (error instanceof BillingError) return res.status(error.status).json({ error: error.message });
    console.error(`Billing error (${what}):`, error);
    const message = (error as any)?.raw?.message || (error as any)?.message;
    return res.status(502).json({ error: message ? `Payment provider error: ${message}` : 'Payment provider error. Please try again.' });
  }

  // GET /company/:companySlug/billing/status
  async status(req: AuthRequest, res: Response) {
    try {
      const company = await resolveOwnedCompany(req, res);
      if (!company) return;
      const ent = entitlementsFor(company);
      const properties = await countActiveProperties(company.id);
      res.json({
        plan: ent.plan,
        subscribed_plan: ent.subscribedPlan,
        status: ent.status,
        interval: company.billing_interval || null,
        current_period_end: company.current_period_end || null,
        cancel_at_period_end: !!company.cancel_at_period_end,
        has_billing_account: !!company.stripe_customer_id,
        features: ent.features,
        max_properties: ent.maxProperties,
        properties,
        billed_quantity: ent.plan === 'free' ? 0 : billedQuantity(ent.plan, properties),
        plans: PLANS,
        hardware: HARDWARE,
        signature: SIGNATURE,
        billing_configured: !!getStripe(),
        prices_configured: Object.fromEntries((Object.keys(PRICE_ENV) as PriceKey[]).map(k => [k, !!priceId(k)])),
        hardware_orders: await this.billing.listHardwareOrders(company.id)
      });
    } catch (error) {
      this.fail(res, error, 'status');
    }
  }

  private readPlan(body: any): { plan: PlanId; interval: BillingInterval } | null {
    const plan = body?.plan, interval = body?.interval || 'month';
    if (!['pro', 'portfolio'].includes(plan) || !['month', 'year'].includes(interval)) return null;
    return { plan, interval };
  }

  // POST /company/:companySlug/billing/checkout  { plan, interval }
  async checkout(req: AuthRequest, res: Response) {
    try {
      const company = await resolveOwnedCompany(req, res);
      if (!company) return;
      const choice = this.readPlan(req.body);
      if (!choice) return res.status(400).json({ error: 'plan must be pro or portfolio; interval month or year' });
      const url = await this.billing.createPlanCheckout(company, req.user!.email, choice.plan, choice.interval, baseUrl(req));
      res.json({ url });
    } catch (error) {
      this.fail(res, error, 'checkout');
    }
  }

  // POST /company/:companySlug/billing/invoice  { plan, interval }  (pay by invoice: bank transfer / ACH / card)
  async invoice(req: AuthRequest, res: Response) {
    try {
      const company = await resolveOwnedCompany(req, res);
      if (!company) return;
      const choice = this.readPlan(req.body);
      if (!choice) return res.status(400).json({ error: 'plan must be pro or portfolio; interval month or year' });
      res.json(await this.billing.createInvoiceSubscription(company, req.user!.email, choice.plan, choice.interval));
    } catch (error) {
      this.fail(res, error, 'invoice');
    }
  }

  // POST /company/:companySlug/billing/hardware  { kit: desk|wall, mode: purchase|bundle }
  async hardware(req: AuthRequest, res: Response) {
    try {
      const company = await resolveOwnedCompany(req, res);
      if (!company) return;
      const kit = req.body?.kit as HardwareKit, mode = req.body?.mode;
      if (!['desk', 'wall'].includes(kit) || !['purchase', 'bundle'].includes(mode)) return res.status(400).json({ error: 'kit must be desk or wall; mode purchase or bundle' });
      res.json({ url: await this.billing.createHardwareCheckout(company, req.user!.email, kit, mode, baseUrl(req)) });
    } catch (error) {
      this.fail(res, error, 'hardware');
    }
  }

  // POST /company/:companySlug/billing/portal
  async portal(req: AuthRequest, res: Response) {
    try {
      const company = await resolveOwnedCompany(req, res);
      if (!company) return;
      res.json({ url: await this.billing.createPortalSession(company as Company, baseUrl(req)) });
    } catch (error) {
      this.fail(res, error, 'portal');
    }
  }

  // POST /billing/webhook  (raw body; mounted before express.json in src/index.ts)
  async webhook(req: Request, res: Response) {
    try {
      const result = await this.billing.handleWebhook(req.body as Buffer, req.get('stripe-signature'));
      res.json({ received: true, ...result });
    } catch (error) {
      if (error instanceof BillingError) return res.status(error.status).json({ error: error.message });
      console.error('Webhook processing failed:', error);
      res.status(500).json({ error: 'Webhook processing failed' }); // Stripe retries on 5xx
    }
  }

  // GET /admin/hardware-orders   (super admin)
  async listOrders(req: AuthRequest, res: Response) {
    try {
      res.json({ orders: await this.billing.listHardwareOrders() });
    } catch (error) {
      this.fail(res, error, 'orders');
    }
  }

  // PUT /admin/hardware-orders/:id  { status: shipped|cancelled }   (super admin)
  async updateOrder(req: AuthRequest, res: Response) {
    try {
      const status = req.body?.status;
      if (!['shipped', 'cancelled'].includes(status)) return res.status(400).json({ error: 'status must be shipped or cancelled' });
      const ok = await this.billing.setHardwareOrderStatus(parseInt(req.params.id), status);
      if (!ok) return res.status(404).json({ error: 'Order not found' });
      res.json({ message: 'Updated' });
    } catch (error) {
      this.fail(res, error, 'update order');
    }
  }
}
