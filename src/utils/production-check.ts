// 2026-10-09 08:15, #46: config sanity check run at startup when NODE_ENV=production. Errors stop the server before it
// listens (a half-configured launch fails loudly instead of at the first login or access code); warnings are logged.
import { parseOpsKey } from './secret-box';

type Env = Record<string, string | undefined>;

const PLACEHOLDER = /your_|change_?me|example|^secret$/i;

export function productionConfigProblems(env: Env, nodeVersion: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  const [major, minor] = nodeVersion.replace(/^v/, '').split('.').map(Number);
  if (major < 20 || (major === 20 && minor < 9)) errors.push(`Node ${nodeVersion} is too old (need >= 20.9)`);

  const jwt = env.JWT_SECRET || '';
  if (jwt.length < 32 || PLACEHOLDER.test(jwt)) errors.push('JWT_SECRET must be a random value of 32+ characters (openssl rand -hex 32)');
  if (env.MOCK_DATABASE === 'true') errors.push('MOCK_DATABASE=true in production (data would live in memory only)');
  if (!env.DB_NAME || !env.DB_USER) errors.push('DB_NAME and DB_USER must be set');
  if (!/^https:\/\/[^/]+/.test(env.APP_BASE_URL || '')) errors.push('APP_BASE_URL must be the public https:// address (used in emails, guest links and Stripe redirects)');
  if (!parseOpsKey(env.OPS_SECRET_KEY || '')) errors.push('OPS_SECRET_KEY must be 32 bytes, hex or base64 (openssl rand -hex 32)');

  const stripe = env.STRIPE_SECRET_KEY || '';
  if (!stripe) warnings.push('STRIPE_SECRET_KEY is empty: billing is off');
  else {
    if (stripe.startsWith('sk_test_')) warnings.push('STRIPE_SECRET_KEY is a test key');
    if (!env.STRIPE_WEBHOOK_SECRET) errors.push('STRIPE_WEBHOOK_SECRET is required when Stripe is on (subscriptions never activate without webhooks)');
  }
  if (!env.TRUST_PROXY) warnings.push('TRUST_PROXY is empty: behind Plesk nginx set it to 1 so rate limits see real client IPs');
  if ((env.EMAIL_PROVIDER || 'mock') === 'mock') warnings.push('EMAIL_PROVIDER=mock: emails are only logged, not sent');
  else if (env.EMAIL_PROVIDER === 'smtp' && !env.SMTP_HOST) errors.push('EMAIL_PROVIDER=smtp needs SMTP_HOST');
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) warnings.push('VAPID keys missing: worker push notifications are off (npx web-push generate-vapid-keys)');
  if (!env.SUPPORT_EMAIL) warnings.push('SUPPORT_EMAIL is empty: helpdesk tickets go to ADMIN_EMAIL');
  return { errors, warnings };
}

export function assertProductionConfig(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const { errors, warnings } = productionConfigProblems(process.env, process.version);
  warnings.forEach(w => console.warn(`[config] warning: ${w}`));
  if (errors.length) {
    errors.forEach(e => console.error(`[config] error: ${e}`));
    console.error('[config] refusing to start in production; fix the settings above (see DEPLOYMENT_GUIDE.md)');
    process.exit(1);
  }
}
