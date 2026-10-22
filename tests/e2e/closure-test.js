// 2026-10-22 15:54, #66 close + purge account (super admin). Closes demo-rentals (sign-in, tablet, guest link stop), reopens it,
// closes it again, then lets the scheduler purge it after the waiting period. A second company must not lose anything.
const H = require('./helpers');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const B = H.B;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kill = () => { try { execSync('lsof -ti tcp:' + H.PORT + ' -sTCP:LISTEN | xargs kill 2>/dev/null'); } catch {} };
const DAY = 86400000;

let log = '';
const api = async (p, { token, method = 'GET', body, auth = 'Bearer' } = {}) => {
  const res = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `${auth} ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, headers: res.headers, data: await res.json().catch(() => ({})) };
};

const STORAGE = path.join(H.OUT, 'closure-storage');
const UPLOAD = path.join(H.ROOT, 'public/uploads/properties');
const img = size => path.join(UPLOAD, `property-closure-test-${size}.jpeg`);

let out = [];
(async () => {
  const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
  try {
    kill();
    fs.rmSync(STORAGE, { recursive: true, force: true });
    // files the purge must remove: a job photo folder and an uploaded image in its three sizes
    fs.mkdirSync(path.join(STORAGE, '1', '1'), { recursive: true });
    fs.writeFileSync(path.join(STORAGE, '1', '1', 'photo.webp'), 'x');
    fs.mkdirSync(UPLOAD, { recursive: true });
    for (const s of ['large', 'medium', 'small']) fs.writeFileSync(img(s), 'x');

    const server = spawn('npx', ['ts-node', 'src/index.ts'], { cwd: H.ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: H.PORT, MOCK_DATABASE: process.env.TEST_MOCK_DATABASE || 'true', EMAIL_PROVIDER: 'mock', APP_BASE_URL: '', OPS_SCHEDULER: 'off', OPS_STORAGE_DIR: STORAGE } });
    server.stdout.on('data', d => { log += d; });
    server.stderr.on('data', d => { log += d; });
    for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }

    const ST = (await api('/admin/login', { method: 'POST', body: { email: 'admin@stayguide.com', password: 'admin123' } })).data.token;
    const adminLogin = () => api('/login', { method: 'POST', body: { email: 'admin@demorentals.com', password: 'demo123' } });
    const AT = (await adminLogin()).data.token;
    const company = async slugOrId => (await api('/admin/companies', { token: ST })).data.companies.find(c => c.slug === slugOrId || c.id === slugOrId);
    const P = '/company/demo-rentals/properties/seaside-villa';

    // a second company with a property: must come through untouched
    const su = (await api('/api/signup', { method: 'POST', body: { accept_terms: true, company_name: 'Other Host', first_name: 'O', last_name: 'H', email: 'other@host.test', password: 'other-host-1' } })).data;
    await api(`/company/${su.company.slug}/properties`, { token: su.token, method: 'POST', body: { name: 'Hut', slug: 'hut' } });

    // live things closing must stop
    await api(P, { token: AT, method: 'PUT', body: { main_image_url: '/uploads/properties/property-closure-test-large.jpeg' } });
    const pc = (await api(P + '/devices/pairing-code', { token: AT, method: 'POST', body: {} })).data;
    const dev = (await api('/device/pair', { method: 'POST', body: { code: pc.code } })).data;
    const guide = (await api(P + '/guest-link', { token: AT })).data.url.replace(/^https?:\/\/[^/]+/, '');
    check('setup: tablet and guest link work', (await api('/device/content', { token: dev.token, auth: 'Device' })).status === 200 && (await fetch(B + guide + '/content')).status === 200);

    const demo = await company('demo-rentals');
    const C = `/admin/companies/${demo.id}`;
    check('purge refused before closing', (await api(C + '/purge', { token: ST, method: 'POST', body: { confirm: 'demo-rentals' } })).status === 409);
    check('reopen refused when open', (await api(C + '/reopen', { token: ST, method: 'POST' })).status === 409);
    check('company admin cannot close', (await api(C + '/close', { token: AT, method: 'POST' })).status === 403);

    // ---- export (Terms §8)
    const ex = await api(C + '/export', { token: ST });
    const exText = JSON.stringify(ex.data);
    check('export: JSON download with the data', ex.status === 200 && /attachment; filename="stayguide-demo-rentals-export-/.test(ex.headers.get('content-disposition') || '')
      && ex.data.properties?.length >= 2 && ex.data.work_orders?.length >= 2 && ex.data.users?.some(u => u.email === 'admin@demorentals.com') && ex.data.workers?.some(u => u.email === 'tech@demorentals.com'),
      Object.keys(ex.data).join(','));
    check('export: no secrets', !/password_hash|guest_link_token|token_hash|access_code/.test(exText) && !ex.data.devices && !ex.data.property_access);
    check('export: only this company', ex.data.properties.every(p => p.company_id === demo.id) && !exText.includes('other@host.test'));

    // ---- 2026-10-22 15:58, the super admin dialog: close, then reopen (the API flow below closes it again)
    const browser = await H.launch();
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(B + '/admin/login');
    await page.evaluate(t => localStorage.setItem('stayguide_admin_token', t), ST);
    await page.goto(B + '/admin/dashboard');
    await page.waitForSelector('.companies-table');
    const rowA = () => page.locator('.companies-table tr', { hasText: 'demo-rentals' });
    await rowA().locator('button', { hasText: 'Close…' }).click();
    await page.waitForSelector('#close-dialog[open]');
    check('UI: dialog explains closing', (await page.textContent('#close-body')).includes('cancels the Stripe subscription'));
    await page.click('#close-body button:has-text("Close account")');
    await page.waitForSelector('#close-body button:has-text("Reopen account")');
    check('UI: closed, purge date and Purge now shown', /Everything is deleted automatically on/.test(await page.textContent('#close-body')) && await page.isVisible('#purge-confirm')
      && (await rowA().textContent()).includes('closed'));
    await page.screenshot({ path: H.OUT + '/admin-close-account.png' });
    await page.fill('#purge-confirm', 'wrong');
    await page.click('#close-body button:has-text("Purge now")');
    await page.waitForSelector('#close-msg.error');
    check('UI: Purge now with the wrong slug is refused', (await page.textContent('#close-msg')).includes('slug') && !(await company(demo.id)).purged_at);
    await page.click('#close-body button:has-text("Reopen account")');
    await page.waitForSelector('#close-body button:has-text("Close account")');
    check('UI: reopened', (await rowA().textContent()).includes('active') && (await adminLogin()).status === 200);
    check('UI: no JS errors', errors.length === 0, errors.join(' | '));
    await browser.close();

    // ---- close
    let r = await api(C + '/close', { token: ST, method: 'POST' });
    const purgeAfter = +new Date(r.data.purge_after);
    check('close: 200, purge in 60 days', r.status === 200 && Math.abs(purgeAfter - Date.now() - 60 * DAY) < 60000, JSON.stringify(r.data));
    check('close: admin sign-in blocked', (await adminLogin()).status === 401 || (await adminLogin()).status === 403);
    check('close: existing session ends', (await api('/company/demo-rentals/properties', { token: AT })).status === 401);
    check('close: tablet unpaired', (await api('/device/content', { token: dev.token, auth: 'Device' })).status === 401);
    check('close: guest link stops', (await fetch(B + guide + '/content')).status === 404);
    let row = await company(demo.id);
    check('close: list shows closed + purge date', !!row.closed_at && !row.purged_at && Math.abs(+new Date(row.purge_after) - purgeAfter) < 2000 && row.status === 'inactive');
    check('close: status cannot be edited back to active', (await api(C, { token: ST, method: 'PUT', body: { status: 'active' } })).status === 409);
    check('close: other edits still allowed', (await api(C, { token: ST, method: 'PUT', body: { phone: '505-555-0100', status: 'inactive' } })).status === 200);
    check('close: twice keeps the first date', +new Date((await api(C + '/close', { token: ST, method: 'POST' })).data.closed_at) === +new Date(row.closed_at));

    // ---- reopen, close again
    r = await api(C + '/reopen', { token: ST, method: 'POST' });
    check('reopen: admin can sign in again', r.status === 200 && (await adminLogin()).status === 200);
    check('reopen: tablet stays unpaired', (await api('/device/content', { token: dev.token, auth: 'Device' })).status === 401);
    await api(C + '/close', { token: ST, method: 'POST' });

    // ---- purge
    check('purge now: needs the slug', (await api(C + '/purge', { token: ST, method: 'POST', body: { confirm: 'demo' } })).status === 400);
    const run = async days => (await api('/admin/ops/run-checks', { token: ST, method: 'POST', body: { now: new Date(Date.now() + days * DAY).toISOString() } })).data;
    let c1 = await run(59);
    check('scheduler: not purged before the date', c1.accounts_purged === 0 && !(await company(demo.id)).purged_at, JSON.stringify(c1));
    c1 = await run(61);
    check('scheduler: purged after the date', c1.accounts_purged === 1, JSON.stringify(c1));

    row = await company(demo.id);
    check('purged: company anonymized', row.name === `Closed account #${demo.id}` && row.slug === `closed-${demo.id}` && row.email === `closed-${demo.id}@deleted.invalid` && !row.phone && !!row.purged_at,
      JSON.stringify({ name: row.name, slug: row.slug, email: row.email }));
    check('purged: no properties or admins left', row.property_count === 0 && row.admin_count === 0);
    const kept = (log.match(/Account purged: company \d+ (\{.*\})/) || [])[1];
    const k = kept ? JSON.parse(kept) : {};
    check('purged: billing records kept', k.kept && k.kept.billing === ex.data.billing.length && ex.data.billing.length > 0, kept);
    check('purged: people anonymized (admin + worker only here)', k.people_anonymized === 2 && k.work_orders >= 2 && k.properties >= 2, kept);
    check('purged: admin email no longer signs in', (await adminLogin()).status === 401);
    check('purged: worker email no longer signs in', (await api('/maint/api/login', { method: 'POST', body: { email: 'tech@demorentals.com', password: 'tech1234' } })).status === 401);
    check('purged: job photos removed', !fs.existsSync(path.join(STORAGE, '1')));
    check('purged: uploaded image removed in every size', ['large', 'medium', 'small'].every(s => !fs.existsSync(img(s))));
    check('purged: export gone, reopen refused', (await api(C + '/export', { token: ST })).status === 410 && (await api(C + '/reopen', { token: ST, method: 'POST' })).status === 409);
    check('purged: run again does nothing', (await run(62)).accounts_purged === 0);

    // ---- the other company is untouched
    const other = await company(su.company.slug);
    check('other company: property and admin still there', other && other.property_count === 1 && other.admin_count === 1 && !other.closed_at);
    check('other company: admin still signs in', (await api('/login', { method: 'POST', body: { email: 'other@host.test', password: 'other-host-1' } })).status === 200);
    check('super admin still signs in', (await api('/admin/login', { method: 'POST', body: { email: 'admin@stayguide.com', password: 'admin123' } })).status === 200);
  } catch (e) {
    check('no crash', false, e.stack);
  } finally {
    kill();
    for (const s of ['large', 'medium', 'small']) fs.rmSync(img(s), { force: true });
  }
  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${failed ? '' : ''}${out.length - failed}/${out.length} closure checks passed`);
  if (failed) console.log(log.split('\n').filter(l => /error|Error|purge|closed/i.test(l)).slice(-30).join('\n'));
  process.exit(failed ? 1 : 0);
})();
