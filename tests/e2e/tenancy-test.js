// 2026-10-09 12:34, #61 multi-tenant check at every level: several admins per company (invite, sign-in, deactivate,
// last-admin guard), companies with different property counts and settings, the super admin's view of all of them, and
// a second company's admin probing every ID-taking endpoint of the first company (must never succeed or change data).
const H = require('./helpers');
const { spawn, execSync } = require('child_process');
const B = H.B;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kill = () => { try { execSync('lsof -ti tcp:' + H.PORT + ' -sTCP:LISTEN | xargs kill 2>/dev/null'); } catch {} };

let log = '';
const api = async (path, { token, method = 'GET', body } = {}) => {
  const res = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const waitLog = async (after, re) => { const start = log.length; await after(); for (let i = 0; i < 40; i++) { const m = log.slice(start).match(re); if (m) return m; await sleep(100); } return null; };
const RESET = /\/reset-password\?token=([A-Za-z0-9_-]{43})/;

let out = [];
(async () => {
  const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
  kill();
  const server = spawn('npx', ['ts-node', 'src/index.ts'], { cwd: H.ROOT, env: { ...process.env, PORT: H.PORT, MOCK_DATABASE: process.env.TEST_MOCK_DATABASE || 'true', EMAIL_PROVIDER: 'mock', APP_BASE_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  server.stdout.on('data', d => { log += d; });
  server.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }

  const ST = (await api('/admin/login', { method: 'POST', body: { email: 'admin@stayguide.com', password: 'admin123' } })).data.token;
  const AT = (await api('/login', { method: 'POST', body: { email: 'admin@demorentals.com', password: 'demo123' } })).data.token;
  const WT = (await api('/maint/api/login', { method: 'POST', body: { email: 'tech@demorentals.com', password: 'tech1234' } })).data.token;

  // invite an admin, then sign them in through the emailed set-password link
  const addAdmin = async (token, slug, email, first) => {
    let r;
    const m = await waitLog(async () => { r = await api(`/company/${slug}/admins`, { token, method: 'POST', body: { email, first_name: first, last_name: 'Admin' } }); }, RESET);
    if (r.status !== 201 || !m) return { r };
    await api('/reset-password', { method: 'POST', body: { token: m[1], password: `${first.toLowerCase()}-pass-123` } });
    const login = await api('/login', { method: 'POST', body: { email, password: `${first.toLowerCase()}-pass-123` } });
    return { r, token: login.data.token, id: r.data.admin.id, login };
  };

  // ---- several admins per company
  const adminsA = await api('/company/demo-rentals/admins', { token: AT });
  check('company admin lists their admins (self marked)', adminsA.status === 200 && adminsA.data.admins.length === 1 && adminsA.data.admins[0].is_me);
  const a2 = await addAdmin(AT, 'demo-rentals', 'Second@DemoRentals.com', 'Casey');
  check('company admin adds a second admin (email normalized)', a2.r.status === 201 && a2.r.data.admin.email === 'second@demorentals.com', JSON.stringify(a2.r.data));
  check('invite response never contains the link token', !JSON.stringify(a2.r.data).includes('token'));
  check('second admin sets a password and signs in to the same company', a2.login && a2.login.data.redirect === '/company/demo-rentals/dashboard', JSON.stringify(a2.login && a2.login.data));
  const propsA1 = (await api('/company/demo-rentals/properties', { token: AT })).data;
  const propsA2 = (await api('/company/demo-rentals/properties', { token: a2.token })).data;
  check('both admins see the same properties', JSON.stringify(propsA1) === JSON.stringify(propsA2) && (propsA1.properties || propsA1).length === 2);
  check('duplicate email → 409', (await api('/company/demo-rentals/admins', { token: AT, method: 'POST', body: { email: 'tech@demorentals.com', first_name: 'X', last_name: 'Y' } })).status === 409);
  check('invalid invite → 400', (await api('/company/demo-rentals/admins', { token: AT, method: 'POST', body: { email: 'nope', first_name: 'X', last_name: 'Y' } })).status === 400);
  check("can't deactivate yourself", (await api(`/company/demo-rentals/admins/${adminsA.data.admins[0].id}`, { token: AT, method: 'PUT', body: { status: 'inactive' } })).status === 400);
  check('admin deactivates the other admin', (await api(`/company/demo-rentals/admins/${a2.id}`, { token: AT, method: 'PUT', body: { status: 'inactive' } })).data.admin?.status === 'inactive');
  check('deactivated admin is signed out', (await api('/company/demo-rentals/properties', { token: a2.token })).status === 401);
  check('deactivated admin cannot sign in', (await api('/login', { method: 'POST', body: { email: 'second@demorentals.com', password: 'casey-pass-123' } })).status === 401);
  check('reactivate works', (await api(`/company/demo-rentals/admins/${a2.id}`, { token: AT, method: 'PUT', body: { status: 'active' } })).data.admin?.status === 'active');
  const a2b = (await api('/login', { method: 'POST', body: { email: 'second@demorentals.com', password: 'casey-pass-123' } })).data.token;
  await api(`/company/demo-rentals/admins/${adminsA.data.admins[0].id}`, { token: a2b, method: 'PUT', body: { status: 'inactive' } });
  check('last active admin cannot be deactivated', (await api(`/company/demo-rentals/admins/${a2.id}`, { token: ST, method: 'PUT', body: { status: 'inactive' } })).status === 400);
  await api(`/company/demo-rentals/admins/${adminsA.data.admins[0].id}`, { token: ST, method: 'PUT', body: { status: 'active' } });
  const AT2 = (await api('/login', { method: 'POST', body: { email: 'admin@demorentals.com', password: 'demo123' } })).data.token;
  check('super admin reactivated the original admin', !!AT2);

  // ---- second company: super admin gives it an admin and Ops; it builds 3 properties with different settings
  check('super admin enables Ops for Ocean View', (await api('/admin/companies/2', { token: ST, method: 'PUT', body: { ops_addon: true } })).status === 200);
  const b1 = await addAdmin(ST, 'ocean-view', 'owner@oceanview.com', 'Robin');
  check('super admin adds an admin to a company that had none', b1.r.status === 201 && !!b1.token, JSON.stringify(b1.r.data));
  const BT = b1.token;
  for (const [name, theme, unit] of [['Pier House', 'dark', 'C'], ['Dune Loft', 'light', 'F'], ['Tide Cottage', 'auto', 'F']]) {
    const slug = name.toLowerCase().replace(/ /g, '-');
    await api('/company/ocean-view/properties', { token: BT, method: 'POST', body: { name, slug, wifi_name: `${name} wifi`, wifi_password: 'pass12345' } });
    await api(`/company/ocean-view/properties/${slug}`, { token: BT, method: 'PUT', body: { tablet_theme: theme, temperature_unit: unit } });
  }
  const propsB = (await api('/company/ocean-view/properties', { token: BT })).data;
  const listB = propsB.properties || propsB;
  check('Ocean View has its own 3 properties', listB.length === 3 && listB.every(p => p.company_id === 2), JSON.stringify(listB.map(p => [p.slug, p.company_id])));
  check('per-property settings kept separately', listB.find(p => p.slug === 'pier-house')?.tablet_theme === 'dark' && listB.find(p => p.slug === 'dune-loft')?.temperature_unit === 'F' && listB.find(p => p.slug === 'pier-house')?.temperature_unit === 'C');
  const listA = (await api('/company/demo-rentals/properties', { token: AT2 })).data;
  check('Demo Rentals still sees only its 2', (listA.properties || listA).length === 2);

  // ---- super admin sees every company with its own counts
  const all = (await api('/admin/companies', { token: ST })).data.companies;
  const ca = all.find(c => c.slug === 'demo-rentals'), cb = all.find(c => c.slug === 'ocean-view');
  check('super admin: per-company property counts', ca.property_count === 2 && cb.property_count === 3, JSON.stringify([ca.property_count, cb.property_count]));
  check('super admin: per-company admin counts', ca.admin_count === 2 && cb.admin_count === 1, JSON.stringify([ca.admin_count, cb.admin_count]));
  check('super admin reads any company\'s properties', (await api('/company/ocean-view/properties', { token: ST })).status === 200 && (await api('/company/demo-rentals/properties', { token: ST })).status === 200);
  check('company admin cannot use super admin routes', (await api('/admin/companies', { token: BT })).status === 403);

  // ---- Demo Rentals creates resources Ocean View will probe
  const invA = (await api('/company/demo-rentals/ops/invites', { token: AT2, method: 'POST', body: { email: 'pat@example.com', first_name: 'Pat', last_name: 'P', worker_type: 'cleaner' } })).data.invite;
  const tixA = (await api('/company/demo-rentals/helpdesk/tickets', { token: AT2, method: 'POST', body: { subject: 'Demo question', message: 'Hello from Demo Rentals' } })).data.ticket;
  await api('/company/demo-rentals/properties/seaside-villa/devices/pairing-code', { token: AT2, method: 'POST', body: { name: 'Lobby' } });
  const devA = ((await api('/company/demo-rentals/properties/seaside-villa/devices', { token: AT2 })).data.devices || [])[0];
  const now = Date.now();
  const timeA = (await api('/company/demo-rentals/ops/time', { token: AT2, method: 'POST', body: { work_order_id: 1, user_id: 3, clock_in: new Date(now - 3 * 3600e3).toISOString(), clock_out: new Date(now - 2 * 3600e3).toISOString(), reason: 'Forgot to clock in' } })).data.entry;
  check('setup: Demo Rentals resources created', !!(invA && tixA && devA && timeA), JSON.stringify({ invA: !!invA, tixA: !!tixA, devA: !!devA, timeA: !!timeA }));

  const before = JSON.stringify([
    (await api('/company/demo-rentals/ops/work-orders/1', { token: AT2 })).data,
    (await api('/company/demo-rentals/properties/seaside-villa/content', { token: AT2 })).data,
    (await api('/company/demo-rentals/properties/seaside-villa/amenities', { token: AT2 })).data,
    (await api('/company/demo-rentals/ops/checklists/1', { token: AT2 })).data,
    (await api('/company/demo-rentals/admins', { token: AT2 })).data
  ]);

  // ---- Ocean View's admin probes Demo Rentals (through Demo's slug, and through its own slug with Demo's ids)
  const own = 'pier-house';
  const probes = [
    ['GET', '/company/demo-rentals/properties'], ['GET', '/company/demo-rentals/properties/seaside-villa'],
    ['PUT', '/company/demo-rentals/properties/seaside-villa', { name: 'Hacked' }], ['DELETE', '/company/demo-rentals/properties/seaside-villa'],
    ['GET', '/company/demo-rentals/properties/seaside-villa/content'], ['GET', '/company/demo-rentals/properties/seaside-villa/devices'],
    ['GET', '/company/demo-rentals/analytics/summary'], ['GET', '/company/demo-rentals/billing/status'],
    ['GET', '/company/demo-rentals/admins'], ['POST', '/company/demo-rentals/admins', { email: 'mole@oceanview.com', first_name: 'M', last_name: 'M' }],
    ['GET', '/company/demo-rentals/ops/work-orders'], ['GET', '/company/demo-rentals/helpdesk/tickets'],
    ['GET', '/company/demo-rentals/ops/team'], ['GET', '/company/demo-rentals/ops/time'],
    // own slug, foreign ids
    ['GET', '/company/ocean-view/ops/work-orders/1'], ['PUT', '/company/ocean-view/ops/work-orders/1', { title: 'Hacked' }],
    ['POST', '/company/ocean-view/ops/work-orders/1/cancel', { reason: 'x' }], ['PUT', '/company/ocean-view/ops/work-orders/1/access', { code: '1234' }],
    ['PUT', '/company/ocean-view/ops/work-orders/1/checklist', { template_id: 1 }],
    ['POST', '/company/ocean-view/ops/work-orders/from-report/1', {}],
    ['POST', '/company/ocean-view/ops/work-orders', { property_id: 1, title: 'Sneaky', category: 'other' }],
    ['GET', '/company/ocean-view/ops/access/1'], ['PUT', '/company/ocean-view/ops/access/1', { door_code: '0000' }],
    ['GET', '/company/ocean-view/ops/access/1/qr'], ['POST', '/company/ocean-view/ops/access/1/qr', {}],
    ['GET', '/company/ocean-view/ops/checklists/1'], ['PUT', '/company/ocean-view/ops/checklists/1', { name: 'Hacked' }],
    ['PUT', '/company/ocean-view/ops/schedules/1', { title: 'Hacked' }], ['POST', '/company/ocean-view/ops/schedules', { property_id: 1, title: 'Sneaky', every: 1, unit: 'week', start_on: '2026-11-01' }],
    ['PUT', '/company/ocean-view/ops/workers/3', { status: 'suspended' }], ['PUT', '/company/ocean-view/ops/workers/3/coi', { confirm: true }],
    ['POST', `/company/ocean-view/ops/invites/${invA && invA.id}/resend`, {}], ['DELETE', `/company/ocean-view/ops/invites/${invA && invA.id}`],
    ['PUT', `/company/ocean-view/ops/time/${timeA && timeA.id}`, { reason: 'x', clock_out: new Date().toISOString() }],
    ['POST', `/company/ocean-view/ops/time/${timeA && timeA.id}/void`, { reason: 'x' }], ['GET', `/company/ocean-view/ops/time/${timeA && timeA.id}/history`],
    ['POST', '/company/ocean-view/ops/time', { work_order_id: 1, user_id: 3, clock_in: new Date(now - 5 * 3600e3).toISOString(), clock_out: new Date(now - 4 * 3600e3).toISOString(), reason: 'x' }],
    ['GET', `/company/ocean-view/helpdesk/tickets/${tixA && tixA.id}`], ['POST', `/company/ocean-view/helpdesk/tickets/${tixA && tixA.id}/replies`, { message: 'hi' }],
    ['POST', `/company/ocean-view/helpdesk/tickets/${tixA && tixA.id}/close`, {}],
    ['PUT', `/company/ocean-view/admins/${adminsA.data.admins[0].id}`, { status: 'inactive' }],
    ['DELETE', `/company/ocean-view/properties/${own}/devices/${devA && devA.id}`],
    ['PUT', `/company/ocean-view/properties/${own}/content/restaurants/1`, { name: 'Hacked' }], ['DELETE', `/company/ocean-view/properties/${own}/content/restaurants/1`],
    ['PUT', `/company/ocean-view/properties/${own}/amenities/1`, { name: 'Hacked' }], ['DELETE', `/company/ocean-view/properties/${own}/amenities/1`],
    // routes outside /company/<slug> that take raw ids
    ['GET', '/billing/company/1'], ['GET', '/billing/1'], ['GET', '/billing/1/pdf'], ['PUT', '/billing/1/status', { status: 'paid' }], ['POST', '/billing/1/payment-intent', {}],
    ['POST', '/billing/company/1', { amount: 1 }],
    ['GET', '/reports/property/1'], ['PUT', '/reports/1/status', { status: 'closed' }], ['GET', '/reports/all'], ['GET', '/reports/urgent'],
    ['GET', '/reports/amenity/1'], ['POST', '/reports/amenity/1/auto-close', {}],
    ['GET', '/admin/amenities/amenities'], ['PUT', '/admin/amenities/amenities/1', { name: 'Hacked' }], ['DELETE', '/admin/amenities/amenities/1'],
    ['GET', '/admin/amenities/properties'], ['POST', '/admin/amenities/amenities/bulk-update', { amenity_ids: [1], updates: { status: 'inactive' } }]
  ];
  const leaks = [];
  for (const [method, path, body] of probes) {
    const r = await api(path, { token: BT, method, body });
    if (![400, 401, 403, 404, 402].includes(r.status)) leaks.push(`${method} ${path} → ${r.status}`);
  }
  check(`other company's admin blocked on all ${probes.length} probes`, leaks.length === 0, leaks.join(' | '));

  const after = JSON.stringify([
    (await api('/company/demo-rentals/ops/work-orders/1', { token: AT2 })).data,
    (await api('/company/demo-rentals/properties/seaside-villa/content', { token: AT2 })).data,
    (await api('/company/demo-rentals/properties/seaside-villa/amenities', { token: AT2 })).data,
    (await api('/company/demo-rentals/ops/checklists/1', { token: AT2 })).data,
    (await api('/company/demo-rentals/admins', { token: AT2 })).data
  ]);
  check('Demo Rentals data unchanged after the probes', before === after);
  check('Demo Rentals invite, ticket and time entry still there',
    (await api('/company/demo-rentals/ops/team', { token: AT2 })).data.invites.some(i => i.id === invA.id)
    && (await api(`/company/demo-rentals/helpdesk/tickets/${tixA.id}`, { token: AT2 })).data.ticket?.status !== 'closed'
    && !(await api('/company/demo-rentals/ops/time', { token: AT2 })).data.entries?.find(e => e.id === timeA.id)?.voided_at);

  // ---- field worker: company admin APIs are closed; only their companies' jobs
  check('field worker blocked from company admin APIs', (await api('/company/demo-rentals/admins', { token: WT })).status === 403 && (await api('/company/ocean-view/properties', { token: WT })).status === 403);
  const jobs = (await api('/maint/api/jobs', { token: WT })).data;
  check('field worker sees only Demo Rentals jobs', Array.isArray(jobs.jobs) && jobs.jobs.every(j => j.company_id === undefined || j.company_id === 1), JSON.stringify(jobs).slice(0, 200));

  // ---- UI: Team page Admins card (Ops off company) and super admin Admins dialog
  const browser = await H.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await api('/admin/companies/2', { token: ST, method: 'PUT', body: { ops_addon: false } });
  await page.goto(B + '/company/ocean-view/login');
  await page.evaluate(t => localStorage.setItem('stayguide_token', t), BT);
  await page.goto(B + '/company/ocean-view/team');
  await page.waitForSelector('#admins tr td strong');
  check('Team page shows Admins without the Ops add-on', (await page.textContent('#admins')).includes('Robin') && !(await page.isHidden('#upgrade')));
  await page.fill('#adm-first', 'Jamie'); await page.fill('#adm-last', 'Lee'); await page.fill('#adm-email', 'jamie@oceanview.com');
  await page.click('#admin-form button[type=submit]');
  await page.waitForFunction(() => document.getElementById('admins').textContent.includes('Jamie'));
  check('Team page adds an admin (shown as invited)', (await page.textContent('#admins')).includes('invited'));
  await page.screenshot({ path: H.OUT + '/team-admins.png', fullPage: true });

  await page.goto(B + '/admin/login');
  await page.evaluate(t => localStorage.setItem('stayguide_admin_token', t), ST);
  await page.goto(B + '/admin/dashboard');
  await page.waitForSelector('.companies-table');
  const rowB = page.locator('.companies-table tr', { hasText: 'ocean-view' });
  check('admin table shows plan, properties and admins', (await rowB.textContent()).replace(/\s+/g, ' ').includes('3') && (await rowB.textContent()).includes('pro'));
  await rowB.locator('button', { hasText: 'Admins' }).click();
  await page.waitForSelector('#admins-dialog[open] #admins-rows tr');
  check('super admin Admins dialog lists the company admins', (await page.textContent('#admins-rows')).includes('Robin') && (await page.textContent('#admins-rows')).includes('Jamie'));
  await page.screenshot({ path: H.OUT + '/admin-company-admins.png' });
  check('no page JS errors', errors.length === 0, errors.join(' | '));
  await browser.close();
})().catch(e => out.push('FAIL crashed — ' + (e && e.stack || e))).finally(() => {
  kill();
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(out.join('\n'));
  console.log(`\n${out.length - failed}/${out.length} tenancy checks passed`);
  process.exit(failed ? 1 : 0);
});
