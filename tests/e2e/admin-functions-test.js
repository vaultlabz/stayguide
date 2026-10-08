// 2026-10-07 17:30, wired-up functions: /login, admin stats + edit company, helpdesk (company + admin), help page, guest reports card, invoice PDF
const H = require('./helpers');
const { spawn, execSync } = require('child_process');
const B = H.B;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kill = () => { try { execSync('lsof -ti tcp:' + H.PORT + ' -sTCP:LISTEN | xargs kill 2>/dev/null'); } catch {} };

const api = async (path, { token, method = 'GET', body } = {}) => {
  const res = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, type, data: type.includes('json') ? await res.json() : await res.arrayBuffer() };
};

(async () => {
  const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
  spawn('npx', ['ts-node', 'src/index.ts'], { cwd: H.ROOT, env: { ...process.env, PORT: H.PORT, MOCK_DATABASE: 'true', EMAIL_PROVIDER: 'mock' }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }

  // ---- API ----
  const company = await api('/login', { method: 'POST', body: { email: 'admin@demorentals.com', password: 'demo123' } });
  const admin = await api('/login', { method: 'POST', body: { email: 'admin@stayguide.com', password: 'admin123' } });
  const bad = await api('/login', { method: 'POST', body: { email: 'admin@demorentals.com', password: 'wrong' } });
  check('/login company → dashboard redirect', company.status === 200 && company.data.redirect === '/company/demo-rentals/dashboard');
  check('/login super admin → admin dashboard', admin.status === 200 && admin.data.redirect === '/admin/dashboard');
  check('/login wrong password → 401', bad.status === 401);
  const CT = company.data.token, AT = admin.data.token;

  const stats = await api('/admin/stats', { token: AT });
  check('admin stats: properties + revenue', stats.status === 200 && stats.data.total_properties === 2 && stats.data.monthly_revenue === 59.98, JSON.stringify(stats.data));
  check('admin stats forbidden for company admin', (await api('/admin/stats', { token: CT })).status === 403);

  const ticket = await api('/company/demo-rentals/helpdesk/tickets', { token: CT, method: 'POST', body: { subject: 'Pairing <b>fails</b>', message: 'Code says invalid', priority: 'high' } });
  const TID = ticket.data.ticket && ticket.data.ticket.id;
  check('company creates ticket', ticket.status === 201 && TID > 0);
  check('ticket validation', (await api('/company/demo-rentals/helpdesk/tickets', { token: CT, method: 'POST', body: { subject: '', message: 'x' } })).status === 400);
  check('other company tickets → 403', (await api('/company/ocean-view/helpdesk/tickets', { token: CT })).status === 403);
  await api(`/admin/helpdesk/tickets/${TID}/replies`, { token: AT, method: 'POST', body: { message: 'Generate a new code' } });
  await api(`/admin/helpdesk/tickets/${TID}/replies`, { token: AT, method: 'POST', body: { message: 'internal only', is_internal: true } });
  const seen = await api(`/company/demo-rentals/helpdesk/tickets/${TID}`, { token: CT });
  check('company sees public reply, not internal note', seen.data.responses.length === 1 && seen.data.responses[0].message === 'Generate a new code');
  check('admin reply moves ticket to in_progress', seen.data.ticket.status === 'in_progress');
  check('admin sees internal note', (await api(`/admin/helpdesk/tickets/${TID}`, { token: AT })).data.responses.length === 2);
  check('company cannot use admin helpdesk API', (await api('/admin/helpdesk/tickets', { token: CT })).status === 403);
  await api(`/company/demo-rentals/helpdesk/tickets/${TID}/close`, { token: CT, method: 'POST' });
  await api(`/company/demo-rentals/helpdesk/tickets/${TID}/replies`, { token: CT, method: 'POST', body: { message: 'still broken' } });
  check('customer reply reopens closed ticket', (await api(`/admin/helpdesk/tickets/${TID}`, { token: AT })).data.ticket.status === 'open');

  const pdf = await api('/billing/1/pdf', { token: AT });
  check('invoice PDF', pdf.status === 200 && pdf.type === 'application/pdf' && Buffer.from(pdf.data).subarray(0, 5).toString() === '%PDF-');
  check('invoice PDF forbidden for company admin', (await api('/billing/1/pdf', { token: CT })).status === 403);

  // ---- UI ----
  const browser = await H.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  await page.goto(B + '/');
  await page.click('header a[href="/login"]');
  await page.waitForURL(B + '/login');
  await page.fill('#email', 'admin@stayguide.com');
  await page.fill('#password', 'admin123');
  await page.click('#loginBtn');
  await page.waitForURL(B + '/admin/dashboard');
  await page.waitForFunction(() => document.getElementById('monthly-revenue').textContent.startsWith('$'));
  check('UI: landing Sign in → /login → admin dashboard with revenue tile', (await page.textContent('#total-properties')).trim() === '2');

  await page.click('button[onclick="editCompany(2)"]');
  await page.waitForSelector('#companyModal', { state: 'visible' });
  check('UI: edit modal prefilled, admin-user fields hidden', (await page.inputValue('#company-slug')) === 'ocean-view' && !(await page.isVisible('#admin-email')));
  await page.fill('#company-phone', '+1-555-7777');
  await page.click('#company-submit');
  await page.waitForSelector('#modal-success', { state: 'visible' });
  check('UI: edit saves', (await api('/admin/companies/2', { token: AT })).data.company.phone === '+1-555-7777');

  await page.goto(B + '/admin/helpdesk?ticket=' + TID);
  await page.waitForSelector('#detail-view:not([hidden])');
  check('UI: admin helpdesk shows thread + internal note', (await page.locator('.msg.internal').count()) === 1);
  await page.screenshot({ path: H.OUT + '/admin-helpdesk.png', fullPage: true });

  await page.goto(B + '/login');
  await page.fill('#email', 'admin@demorentals.com');
  await page.fill('#password', 'demo123');
  await page.click('#loginBtn');
  await page.waitForURL(B + '/company/demo-rentals/dashboard');
  await page.waitForFunction(() => !document.getElementById('reports-list').textContent.includes('Loading'));
  check('UI: guest reports card lists open reports', (await page.locator('#reports-list select').count()) > 0);

  await page.click('#support-nav');
  await page.waitForURL(/\/helpdesk/);
  await page.click('text=New ticket');
  await page.fill('#new-subject', 'UI ticket');
  await page.fill('#new-message', 'Created from the browser test');
  await page.click('#new-form button[type=submit]');
  await page.waitForSelector('#detail-view:not([hidden])');
  check('UI: company opens a ticket', (await page.textContent('#t-subject')).includes('UI ticket'));
  await page.fill('#reply-message', 'Follow-up');
  await page.click('#reply-form button[type=submit]');
  await page.waitForFunction(() => document.querySelectorAll('#thread .msg').length === 2);
  check('UI: company reply appears in thread', true);
  await page.screenshot({ path: H.OUT + '/company-helpdesk.png', fullPage: true });

  await page.click('#help-link');
  await page.waitForURL(/\/help$/);
  check('UI: help page sections', (await page.locator('.help section').count()) === 7);

  check('no JS errors', errors.length === 0, errors.join(' | '));
  await browser.close(); kill();
  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} admin-functions checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); kill(); process.exit(1); });
