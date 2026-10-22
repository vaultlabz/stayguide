// 2026-10-22 10:59, #63 Privacy Policy + Terms of Service: who runs the service, where to write, and which law applies
// come from .env so the pages need no code change when the legal entity is settled.
import fs from 'fs';
import path from 'path';

// Bump when the Terms or Privacy text changes in a way users must accept again; stored per user at signup
export const TERMS_VERSION = '2026-10-22';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function legalValues(env: Record<string, string | undefined> = process.env) {
  const legalName = env.LEGAL_NAME?.trim() || 'StayGuide';
  return {
    legal_name: legalName,
    contact_email: env.SUPPORT_EMAIL?.trim() || env.ADMIN_EMAIL?.trim() || 'support@stayguide.com',
    jurisdiction: env.LEGAL_JURISDICTION?.trim() || `the state where ${legalName} is organized`,
    effective_date: TERMS_VERSION
  };
}

/** privacy.html / terms.html with {{placeholders}} filled from .env (escaped). */
export function renderLegalPage(viewsDir: string, file: 'privacy.html' | 'terms.html'): string {
  const values = legalValues() as Record<string, string>;
  return fs.readFileSync(path.join(viewsDir, file), 'utf8')
    .replace(/\{\{(\w+)\}\}/g, (match, key) => (key in values ? escapeHtml(values[key]) : match));
}
