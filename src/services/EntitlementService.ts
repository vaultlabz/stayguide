// 2026-10-03 23:06, G3: what a company is allowed to do, derived from plan + subscription status.
import { Response } from 'express';
import { Company } from '../types';
import { PLANS, PlanId, PlanDef, OPS_ADDON } from '../config/plans';
import { PropertyService } from './PropertyService';

/** Statuses that keep paid features on. past_due is a grace period while Stripe retries payment. */
const ACTIVE_STATUSES = new Set(['legacy', 'active', 'trialing', 'past_due']);

export interface Entitlements {
  plan: PlanId;                 // effective plan (falls back to free when the subscription lapses)
  subscribedPlan: PlanId;       // plan on record
  status: string | null;
  features: PlanDef['features'];
  maxProperties: number | null;
  ops: boolean;                 // 2026-10-07 18:30, G7 Ops add-on (needs an active paid plan + the add-on)
}

export function entitlementsFor(company: Pick<Company, 'plan' | 'subscription_status' | 'ops_addon'> | null | undefined): Entitlements {
  const subscribedPlan: PlanId = (company?.plan as PlanId) || 'free';
  const status = company?.subscription_status ?? null;
  const plan: PlanId = subscribedPlan !== 'free' && status && ACTIVE_STATUSES.has(status) ? subscribedPlan : 'free';
  const ops = !!company?.ops_addon && OPS_ADDON.requires.includes(plan);
  return { plan, subscribedPlan, status, features: PLANS[plan].features, maxProperties: PLANS[plan].maxProperties, ops };
}

export async function countActiveProperties(companyId: number): Promise<number> {
  const properties = await new PropertyService().getPropertiesByCompany(companyId);
  return properties.filter(p => p.status === 'active').length;
}

/** Uniform 402 so the dashboard can show an upgrade prompt. */
export function upgradeRequired(res: Response, feature: string, message: string) {
  return res.status(402).json({ error: message, code: 'upgrade_required', feature, upgrade_url: 'billing' });
}
