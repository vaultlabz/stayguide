// 2026-10-22 16:39, #67 business events for the operator (StayGuide's own inbox, not the customer's): a hardware kit to ship,
// new signups, new / ended subscriptions, failed payments. Sent to SUPPORT_EMAIL (falls back to ADMIN_EMAIL), like helpdesk
// tickets. OPERATOR_EMAILS=off turns them off. Never throws: a lost notice must not fail a signup or a Stripe webhook.
import { EmailService } from '../services/EmailService';

const recipient = () => process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL || '';
const escape = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
export const appBase = () => (process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

/** One email per event. `lines` become the body, one per line ('' = blank line); null/undefined/false are dropped. */
export function notifyOperator(subject: string, lines: (string | null | undefined | false)[]): void {
  if (process.env.OPERATOR_EMAILS === 'off' || !recipient()) return;
  const text = lines.filter(l => typeof l === 'string').join('\n');
  new EmailService().sendEmail({
    to: recipient(), fromName: 'StayGuide', subject: `[StayGuide] ${subject}`.slice(0, 150), text,
    html: `<pre style="font: 14px/1.5 system-ui, sans-serif; white-space: pre-wrap">${escape(text)}</pre>`
  }).catch(err => console.error('[notify] operator email failed:', err));
}

/** Stripe address object → one line per part. */
export function formatAddress(shipping: any): string[] {
  const a = shipping?.address || {};
  return [shipping?.name, shipping?.phone, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(' '), a.country].filter(Boolean);
}
