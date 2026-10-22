// 2026-10-22 15:50, #66 close + purge account. Closing stops the account at once (sign-ins, tablets, guest links, billing);
// ACCOUNT_PURGE_DAYS later (default 60, the Privacy Policy promises 90 at most) everything the company stored is deleted and the
// people in it anonymized. Billing records and hardware orders stay for tax, attached to an anonymized company row.
import fs from 'fs';
import path from 'path';
import { RowDataPacket } from 'mysql2';
import { db } from '../utils/database';
import { Company } from '../types';
import { CompanyService } from './CompanyService';
import { getStripe } from './StripeBillingService';
import { STORAGE_DIR } from './OnSiteService';
import { MOCK_MODE } from '../utils/mock-database';
import * as M from '../utils/mock-database';
import * as R from './MockIntegratedReportService';
import { mockBillingRecords } from './MockBillingService';

export const purgeDays = () => Math.max(1, Number(process.env.ACCOUNT_PURGE_DAYS) || 60);
export const purgeDate = (closedAt: Date | string) => new Date(+new Date(closedAt) + purgeDays() * 86400000);
const UPLOADS = path.join(__dirname, '../../public');

export class ClosureError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

/** How a table's rows belong to a company. Each scope is a set of ids that the next scopes build on. */
type Scope = 'company' | 'property' | 'order' | 'ticket' | 'template' | 'time_entry';
const SCOPE_SQL: Record<Scope, string> = {
  company: 'company_id = ?',
  property: 'property_id IN (SELECT id FROM properties WHERE company_id = ?)',
  order: 'work_order_id IN (SELECT id FROM work_orders WHERE company_id = ?)',
  ticket: 'ticket_id IN (SELECT id FROM helpdesk_tickets WHERE company_id = ?)',
  template: 'template_id IN (SELECT id FROM checklist_templates WHERE company_id = ?)',
  time_entry: 'time_entry_id IN (SELECT t.id FROM time_entries t JOIN work_orders w ON w.id = t.work_order_id WHERE w.company_id = ?)'
};

/** Every table holding company data. export: in the data export (secrets like door codes and device tokens are left out);
 *  keep: survives the purge (tax records). Mock arrays are read through the module so reassigned ones stay current. */
const TABLES: { table: string; scope: Scope; mock: () => any[] | undefined; export?: boolean; keep?: boolean; omit?: string[] }[] = [
  { table: 'properties', scope: 'company', mock: () => M.mockProperties, export: true, omit: ['guest_link_token'] },
  { table: 'property_content', scope: 'property', mock: () => M.mockPropertyContent, export: true },
  { table: 'restaurants', scope: 'property', mock: () => M.mockRestaurants, export: true },
  { table: 'howto_videos', scope: 'property', mock: () => M.mockVideos, export: true },
  { table: 'local_info', scope: 'property', mock: () => M.mockLocalInfo, export: true },
  { table: 'announcements', scope: 'property', mock: () => M.mockAnnouncements, export: true },
  { table: 'amenities', scope: 'property', mock: () => M.mockAmenities, export: true },
  { table: 'guest_reports', scope: 'property', mock: () => R.mockGuestReports, export: true },
  { table: 'analytics', scope: 'property', mock: () => undefined },
  { table: 'devices', scope: 'property', mock: () => M.mockDevices },
  { table: 'link_clicks', scope: 'property', mock: () => M.mockLinkClicks, export: true },
  { table: 'section_events', scope: 'property', mock: () => M.mockSectionEvents, export: true },
  { table: 'property_access', scope: 'property', mock: () => M.mockPropertyAccess },
  { table: 'property_qr_tokens', scope: 'property', mock: () => M.mockQrTokens },
  { table: 'showcase_properties', scope: 'company', mock: () => undefined, export: true },
  { table: 'helpdesk_tickets', scope: 'company', mock: () => M.mockHelpdeskTickets, export: true },
  { table: 'helpdesk_responses', scope: 'ticket', mock: () => M.mockHelpdeskResponses, export: true },
  { table: 'work_orders', scope: 'company', mock: () => M.mockWorkOrders, export: true, omit: ['access_code_override_enc'] },
  { table: 'work_order_events', scope: 'order', mock: () => M.mockWorkOrderEvents, export: true },
  { table: 'work_order_photos', scope: 'order', mock: () => M.mockWorkOrderPhotos, export: true },
  { table: 'work_order_checklist', scope: 'order', mock: () => M.mockWorkOrderChecklist, export: true },
  { table: 'time_entries', scope: 'order', mock: () => M.mockTimeEntries, export: true },
  { table: 'time_entry_edits', scope: 'time_entry', mock: () => M.mockTimeEntryEdits, export: true },
  { table: 'checklist_templates', scope: 'company', mock: () => M.mockChecklistTemplates, export: true },
  { table: 'checklist_template_items', scope: 'template', mock: () => M.mockChecklistTemplateItems, export: true },
  { table: 'maintenance_schedules', scope: 'company', mock: () => M.mockMaintenanceSchedules, export: true },
  { table: 'worker_invites', scope: 'company', mock: () => M.mockWorkerInvites },
  { table: 'company_workers', scope: 'company', mock: () => M.mockCompanyWorkers, export: true },
  { table: 'billing', scope: 'company', mock: () => mockBillingRecords as any[], export: true, keep: true },
  { table: 'hardware_orders', scope: 'company', mock: () => M.mockHardwareOrders, export: true, keep: true }
];
/** Rows tied to a person; removed when the person is anonymized. */
const USER_TABLES: [string, () => any[]][] = [
  ['login_codes', () => M.mockLoginCodes], ['password_resets', () => M.mockPasswordResets], ['push_subscriptions', () => M.mockPushSubscriptions],
  ['client_ops', () => M.mockClientOps], ['vendor_profiles', () => M.mockVendorProfiles]
];
const USER_FIELDS = 'id, email, first_name, last_name, role, status, last_login, terms_accepted_at, terms_version, created_at';

/** Mock mode: the id sets each scope stands for. */
function mockScopes(companyId: number): Record<Scope, (row: any) => boolean> {
  const ids = (rows: any[] | undefined, pick: (r: any) => boolean) => new Set((rows || []).filter(pick).map(r => r.id));
  const P = ids(M.mockProperties, r => r.company_id === companyId);
  const W = ids(M.mockWorkOrders, r => r.company_id === companyId);
  const T = ids(M.mockHelpdeskTickets, r => r.company_id === companyId);
  const K = ids(M.mockChecklistTemplates, r => r.company_id === companyId);
  const E = ids(M.mockTimeEntries, r => W.has(r.work_order_id));
  return {
    company: r => r.company_id === companyId, property: r => P.has(r.property_id), order: r => W.has(r.work_order_id),
    ticket: r => T.has(r.ticket_id), template: r => K.has(r.template_id), time_entry: r => E.has(r.time_entry_id)
  };
}
const removeWhere = (rows: any[] | undefined, pick: (r: any) => boolean) => {
  if (!rows) return 0;
  let n = 0;
  for (let i = rows.length - 1; i >= 0; i--) if (pick(rows[i])) { rows.splice(i, 1); n++; }
  return n;
};
const omit = (row: any, keys: string[] = []) => { const r = { ...row }; for (const k of keys) delete r[k]; return r; };

export class AccountClosureService {
  private companies = new CompanyService();

  private async load(companyId: number): Promise<Company & { closed_at?: any; purged_at?: any }> {
    const company: any = await this.companies.findById(companyId);
    if (!company) throw new ClosureError('Company not found', 404);
    return company;
  }

  private async audit(companyId: number, actorId: number | null, action: 'updated' | 'deleted', notes: string, values: object = {}) {
    if (MOCK_MODE) { console.log(`[MOCK] audit companies#${companyId} ${action}: ${notes}`); return; }
    await db.execute(`INSERT INTO system_audit_log (table_name, record_id, action, changed_by, user_type, new_values, notes) VALUES ('companies', ?, ?, ?, 'super_admin', ?, ?)`,
      [companyId, action, actorId, JSON.stringify(values), notes]);
  }

  /** Close now: sign-ins stop, tablets unpair, guest links and QR codes stop, the Stripe subscription ends without a refund. */
  async close(companyId: number, actorId: number | null): Promise<{ closed_at: Date; purge_after: Date; stripe_canceled: boolean }> {
    const company = await this.load(companyId);
    if (company.purged_at) throw new ClosureError('This account was already purged.');
    const closedAt = company.closed_at ? new Date(company.closed_at) : new Date();

    // Billing first: if Stripe refuses, nothing else changed and the admin can try again
    let stripeCanceled = false;
    const subId = company.stripe_subscription_id;
    if (subId && !['canceled', 'legacy', 'incomplete_expired'].includes(String(company.subscription_status))) {
      const stripe = getStripe();
      if (!stripe) throw new ClosureError('The account has a Stripe subscription but Stripe is not configured here. Cancel it in Stripe first.', 503);
      try {
        await stripe.subscriptions.cancel(subId, { prorate: false });
      } catch (e: any) {
        if (e?.code !== 'resource_missing') throw new ClosureError(`Stripe could not cancel the subscription: ${e?.message || e}`, 502);
      }
      stripeCanceled = true;
    }

    if (MOCK_MODE) {
      Object.assign(M.mockCompanies.find(c => c.id === companyId) as any, { status: 'inactive', closed_at: closedAt,
        ...(stripeCanceled ? { subscription_status: 'canceled', cancel_at_period_end: false, ops_addon: false } : {}) });
      M.mockUsers.filter((u: any) => u.company_id === companyId).forEach(u => { u.status = 'inactive'; });
      const s = mockScopes(companyId);
      M.mockDevices.filter(s.property).forEach(d => Object.assign(d, { status: 'revoked', token_hash: null, pairing_code: null }));
      M.mockProperties.filter(s.company).forEach((p: any) => { p.guest_link_token = null; });
      M.mockCompanyWorkers.filter(s.company).forEach(m => { m.status = 'suspended'; });
      M.mockWorkerInvites.filter(s.company).forEach(i => { if (!i.accepted_at && !i.revoked_at) i.revoked_at = new Date(); });
    } else {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        await conn.execute(`UPDATE companies SET status = 'inactive', closed_at = ?${stripeCanceled ? ", subscription_status = 'canceled', cancel_at_period_end = FALSE, ops_addon = FALSE" : ''}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [closedAt, companyId]);
        await conn.execute("UPDATE users SET status = 'inactive' WHERE company_id = ?", [companyId]);
        await conn.execute(`UPDATE devices SET status = 'revoked', token_hash = NULL, pairing_code = NULL WHERE ${SCOPE_SQL.property}`, [companyId]);
        await conn.execute('UPDATE properties SET guest_link_token = NULL WHERE company_id = ?', [companyId]);
        await conn.execute(`DELETE FROM property_qr_tokens WHERE ${SCOPE_SQL.property}`, [companyId]);
        await conn.execute("UPDATE company_workers SET status = 'suspended' WHERE company_id = ?", [companyId]);
        await conn.execute('UPDATE worker_invites SET revoked_at = CURRENT_TIMESTAMP WHERE company_id = ? AND accepted_at IS NULL AND revoked_at IS NULL', [companyId]);
        await conn.commit();
      } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    }
    await this.audit(companyId, actorId, 'updated', `Account closed; data purge after ${purgeDate(closedAt).toISOString().slice(0, 10)}`, { stripe_canceled: stripeCanceled });
    console.log(`Account closed: company ${companyId} (${company.name})`);
    return { closed_at: closedAt, purge_after: purgeDate(closedAt), stripe_canceled: stripeCanceled };
  }

  /** Undo a close before the purge. Admins can sign in again; tablets must be paired again and the plan bought again. */
  async reopen(companyId: number, actorId: number | null): Promise<void> {
    const company = await this.load(companyId);
    if (company.purged_at) throw new ClosureError('This account was purged and cannot be reopened.');
    if (!company.closed_at) throw new ClosureError('This account is not closed.');
    if (MOCK_MODE) {
      Object.assign(M.mockCompanies.find(c => c.id === companyId) as any, { status: 'active', closed_at: null });
      M.mockUsers.filter((u: any) => u.company_id === companyId).forEach(u => { u.status = 'active'; });
      M.mockCompanyWorkers.filter(m => m.company_id === companyId).forEach(m => { m.status = 'active'; });
    } else {
      await db.execute("UPDATE companies SET status = 'active', closed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [companyId]);
      await db.execute("UPDATE users SET status = 'active' WHERE company_id = ?", [companyId]);
      await db.execute("UPDATE company_workers SET status = 'active' WHERE company_id = ?", [companyId]);
    }
    await this.audit(companyId, actorId, 'updated', 'Account reopened');
  }

  /** Everything the company stored, as one JSON document (Terms §8). Door codes, device tokens and password hashes are left out. */
  async exportData(companyId: number): Promise<Record<string, any>> {
    const company = await this.load(companyId);
    if (company.purged_at) throw new ClosureError('This account was purged; only billing records remain.', 410);
    const out: Record<string, any> = { exported_at: new Date().toISOString(), company: omit(company, ['stripe_customer_id', 'stripe_subscription_id']) };
    if (MOCK_MODE) {
      const s = mockScopes(companyId);
      out.users = M.mockUsers.filter((u: any) => u.company_id === companyId).map(u => omit(u, ['password_hash']));
      for (const t of TABLES) if (t.export) out[t.table] = (t.mock() || []).filter(s[t.scope]).map(r => omit(r, t.omit));
    } else {
      out.users = (await db.execute<RowDataPacket[]>(`SELECT ${USER_FIELDS} FROM users WHERE company_id = ?`, [companyId]))[0];
      for (const t of TABLES) {
        if (!t.export) continue;
        const [rows] = await db.execute<RowDataPacket[]>(`SELECT * FROM ${t.table} WHERE ${SCOPE_SQL[t.scope]}`, [companyId]);
        out[t.table] = rows.map(r => omit(r, t.omit));
      }
      // workers are their own accounts; name and email show who did the work
      out.workers = (await db.execute<RowDataPacket[]>(`SELECT ${USER_FIELDS.split(', ').map(f => 'u.' + f).join(', ')} FROM users u JOIN company_workers m ON m.user_id = u.id WHERE m.company_id = ?`, [companyId]))[0];
    }
    if (MOCK_MODE) out.workers = M.mockUsers.filter(u => M.mockCompanyWorkers.some(m => m.company_id === companyId && m.user_id === u.id)).map(u => omit(u, ['password_hash']));
    return out;
  }

  /** Delete the company's data and anonymize its people. Only for a closed account; `early` skips the waiting period. */
  async purge(companyId: number, actorId: number | null, { early = false, now = new Date() } = {}): Promise<Record<string, number>> {
    const company = await this.load(companyId);
    if (company.purged_at) throw new ClosureError('This account was already purged.');
    if (!company.closed_at) throw new ClosureError('Close the account before purging it.');
    if (!early && +now < +purgeDate(company.closed_at)) throw new ClosureError(`The purge is due after ${purgeDate(company.closed_at).toISOString().slice(0, 10)}.`);

    const counts: Record<string, number> = {};
    const files: string[] = [];
    // an uploaded image is stored in three sizes; rows point at -large, so -medium and -small go too
    const collectUploads = (rows: any[]) => {
      for (const m of JSON.stringify(rows).matchAll(/\/uploads\/[\w\-/.]+/g)) {
        if (m[0].includes('..')) continue;
        for (const size of ['large', 'medium', 'small']) files.push(path.join(UPLOADS, m[0].replace(/-large\./, `-${size}.`)));
      }
    };
    let people: number[] = [];

    if (MOCK_MODE) {
      const s = mockScopes(companyId);
      collectUploads([company, ...M.mockProperties.filter(s.company), ...M.mockAmenities.filter(s.property), ...M.mockRestaurants.filter(s.property),
        ...M.mockLocalInfo.filter(s.property), ...M.mockPropertyContent.filter(s.property)]);
      const workers = M.mockCompanyWorkers.filter(s.company).map(m => m.user_id);
      // child scopes first: the id sets were taken above, before their parents go
      for (const t of [...TABLES].reverse()) if (!t.keep) counts[t.table] = removeWhere(t.mock(), s[t.scope]);
      people = [...M.mockUsers.filter((u: any) => u.company_id === companyId).map(u => u.id),
        ...workers.filter(id => !M.mockCompanyWorkers.some(m => m.user_id === id) && M.mockUsers.find(u => u.id === id)?.role === 'field_worker')];
      for (const p of M.mockVendorProfiles.filter(v => people.includes(v.user_id))) if (p.coi_path) files.push(path.join(STORAGE_DIR, p.coi_path));
      for (const [, rows] of USER_TABLES) removeWhere(rows(), r => people.includes(r.user_id));
      for (const u of M.mockUsers.filter(u => people.includes(u.id)) as any[]) Object.assign(u, { email: `deleted-${u.id}@deleted.invalid`, first_name: 'Deleted', last_name: 'user', password_hash: '!', status: 'inactive', last_login: null });
      Object.assign(M.mockCompanies.find(c => c.id === companyId) as any, { name: `Closed account #${companyId}`, slug: `closed-${companyId}`,
        email: `closed-${companyId}@deleted.invalid`, phone: null, address: null, logo_url: null, purged_at: new Date() });
    } else {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        const q = async (sql: string, args: any[] = [companyId]) => (await conn.execute<RowDataPacket[]>(sql, args))[0];
        collectUploads([company, ...await q('SELECT * FROM properties WHERE company_id = ?')]);
        for (const t of ['amenities', 'restaurants', 'local_info', 'property_content']) collectUploads(await q(`SELECT * FROM ${t} WHERE ${SCOPE_SQL.property}`));
        const workers = (await q('SELECT user_id FROM company_workers WHERE company_id = ?')).map(r => r.user_id);
        // audit rows quoting guest reports or amenities go with them
        await conn.execute(`DELETE FROM system_audit_log WHERE (table_name = 'guest_reports' AND record_id IN (SELECT id FROM guest_reports WHERE ${SCOPE_SQL.property}))
          OR (table_name = 'amenities' AND record_id IN (SELECT id FROM amenities WHERE ${SCOPE_SQL.property}))`, [companyId, companyId]);
        for (const t of TABLES) if (!t.keep) counts[t.table] = (await q(`SELECT COUNT(*) AS n FROM ${t.table} WHERE ${SCOPE_SQL[t.scope]}`))[0].n;
        // parents go; foreign keys cascade to the rest (TABLES lists every child, so the counts above match what goes)
        for (const t of ['work_orders', 'maintenance_schedules', 'checklist_templates', 'properties', 'showcase_properties', 'helpdesk_tickets', 'worker_invites', 'company_workers']) {
          await conn.execute(`DELETE FROM ${t} WHERE company_id = ?`, [companyId]);
        }
        const others = workers.length ? (await q(`SELECT DISTINCT user_id FROM company_workers WHERE user_id IN (${workers.map(() => '?').join(',')})`, workers)).map(r => r.user_id) : [];
        const loneWorkers = workers.filter(id => !others.includes(id));
        const solo = loneWorkers.length ? (await q(`SELECT id FROM users WHERE role = 'field_worker' AND id IN (${loneWorkers.map(() => '?').join(',')})`, loneWorkers)).map(r => r.id) : [];
        people = [...(await q('SELECT id FROM users WHERE company_id = ?')).map(r => r.id), ...solo];
        if (people.length) {
          const inList = `(${people.map(() => '?').join(',')})`;
          for (const r of await q(`SELECT coi_path FROM vendor_profiles WHERE coi_path IS NOT NULL AND user_id IN ${inList}`, people)) files.push(path.join(STORAGE_DIR, r.coi_path));
          for (const [t] of USER_TABLES) await conn.execute(`DELETE FROM ${t} WHERE user_id IN ${inList}`, people);
          // anonymized rather than deleted: the audit log and other companies' records may still point at them
          await conn.execute(`UPDATE users SET email = CONCAT('deleted-', id, '@deleted.invalid'), first_name = 'Deleted', last_name = 'user',
            password_hash = '!', status = 'inactive', last_login = NULL WHERE id IN ${inList}`, people);
        }
        await conn.execute(`UPDATE companies SET name = CONCAT('Closed account #', id), slug = CONCAT('closed-', id), email = CONCAT('closed-', id, '@deleted.invalid'),
          phone = NULL, address = NULL, logo_url = NULL, purged_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [companyId]);
        await conn.commit();
      } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    }
    counts.people_anonymized = people.length;

    // Files after the commit: a failed transaction must not leave rows pointing at deleted files
    await fs.promises.rm(path.join(STORAGE_DIR, String(companyId)), { recursive: true, force: true }).catch(() => {});
    let removed = 0;
    for (const f of new Set(files)) if (await fs.promises.unlink(f).then(() => true, () => false)) removed++;
    counts.files_removed = removed;

    const kept = MOCK_MODE ? { billing: mockBillingRecords.filter(b => b.company_id === companyId).length, hardware_orders: M.mockHardwareOrders.filter(o => o.company_id === companyId).length }
      : { billing: (await db.execute<RowDataPacket[]>('SELECT COUNT(*) AS n FROM billing WHERE company_id = ?', [companyId]))[0][0].n,
          hardware_orders: (await db.execute<RowDataPacket[]>('SELECT COUNT(*) AS n FROM hardware_orders WHERE company_id = ?', [companyId]))[0][0].n };
    await this.audit(companyId, actorId, 'deleted', `Account data purged${early ? ' early by a super admin' : ''}; billing records and hardware orders kept for tax`, { ...counts, kept });
    console.log(`Account purged: company ${companyId} ${JSON.stringify({ ...counts, kept })}`);
    return { ...counts, kept_billing: kept.billing, kept_hardware_orders: kept.hardware_orders };
  }

  /** Scheduler: purge every closed account whose waiting period is over. */
  async purgeDue(now = new Date()): Promise<number> {
    const due = (await this.companies.getAllCompanies()).filter((c: any) => c.closed_at && !c.purged_at && +now >= +purgeDate(c.closed_at));
    for (const c of due) await this.purge(c.id, null, { now });
    return due.length;
  }
}
