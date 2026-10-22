// 2026-10-07 23:20, G7 Ops stage 2: work orders (lifecycle, cost approval, permissions, guest privacy, guest report → work order, board + worker app UI)
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
const sinceLog = async (fn, re) => { const start = log.length; await fn(); for (let i = 0; i < 40; i++) { if (re.test(log.slice(start))) return true; await sleep(100); } return false; };

(async () => {
  const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
  const server = spawn('npx', ['ts-node', 'src/index.ts'], { cwd: H.ROOT, env: { ...process.env, PORT: H.PORT, MOCK_DATABASE: process.env.TEST_MOCK_DATABASE || 'true', EMAIL_PROVIDER: 'mock' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  server.stdout.on('data', d => { log += d; });
  server.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }

  const CT = (await api('/login', { method: 'POST', body: { email: 'admin@demorentals.com', password: 'demo123' } })).data.token;
  const AT = (await api('/admin/login', { method: 'POST', body: { email: 'admin@stayguide.com', password: 'admin123' } })).data.token;
  const WT = (await api('/maint/api/login', { method: 'POST', body: { email: 'tech@demorentals.com', password: 'tech1234' } })).data.token;
  const M = '/company/demo-rentals/ops/work-orders';
  const mgr = (path, body) => api(M + path, { token: CT, method: body ? 'POST' : 'GET', body });
  const wkr = (path, body) => api('/maint/api/jobs' + path, { token: WT, method: body ? 'POST' : 'GET', body });

  // ---- gating / isolation
  check('board 402 without Ops', (await api('/company/ocean-view/ops/work-orders', { token: AT })).data.code === 'upgrade_required');
  check('seeded board: #1 assigned to Terry, #2 new', (await mgr('')).data.work_orders?.map(o => `${o.id}:${o.status}`).sort().join() === '1:assigned,2:new');
  check('worker sees only own job', (await wkr('')).data.jobs?.map(j => j.id).join() === '1');
  check('worker cannot open an unassigned job', (await wkr('/2')).status === 404);
  check('worker cannot use manager API', (await api(M, { token: WT })).status === 403);
  check('worker cannot verify via worker API', (await wkr('/1/verify', {})).status === 404);
  check('manager cannot use worker API', (await api('/maint/api/jobs', { token: CT })).status === 403);

  // ---- create validation
  check('create: foreign property rejected', (await mgr('', { property_id: 999, title: 'x' })).status === 400);
  check('create: admin cannot be assignee', (await mgr('', { property_id: 1, title: 'x', assignee_user_id: 2 })).status === 400);
  check('create: window must end after start', (await mgr('', { property_id: 1, title: 'x', window_start: '2026-10-10T12:00', window_end: '2026-10-10T09:00' })).status === 400);
  let created;
  const mailed = await sinceLog(async () => { created = await mgr('', { property_id: 2, title: 'Gutter cleaning', type: 'maintenance', priority: 'low', assignee_user_id: 3, approved_amount: 300 }); }, /Subject: New job: Gutter cleaning/);
  check('create assigned + pre-approved, worker emailed', created.status === 201 && created.data.work_order.status === 'assigned' && created.data.work_order.approved_amount === 300 && mailed);
  const G = created.data.work_order.id;

  // ---- cost approval
  check('estimate under pre-approval does not need approval', (await wkr(`/${G}/estimate`, { amount: 280 })).data.job?.status === 'assigned');
  let est;
  const askMail = await sinceLog(async () => { est = await wkr('/1/estimate', { amount: 400, note: 'Igniter' }); }, /Subject: Approval needed: \$400\.00/);
  check('estimate over $250 → awaiting approval + manager emailed', est.data.job?.status === 'awaiting_approval' && askMail);
  check('start blocked while awaiting approval', (await wkr('/1/start', {})).status === 409);
  check('reject needs a reason', (await mgr('/1/reject', {})).status === 400);
  check('approve → back to assigned with approved amount', (await mgr('/1/approve', {})).data.work_order?.approved_amount === 400);
  check('start', (await wkr('/1/start', {})).data.job?.status === 'in_progress');
  check('estimate during work above approval → on hold again', (await wkr('/1/estimate', { amount: 500 })).data.job?.status === 'awaiting_approval');
  check('approve resumes in progress', (await mgr('/1/approve', { amount: 500 })).data.work_order?.status === 'in_progress');
  const sub = await wkr('/1/submit', { notes: 'Replaced igniter', cost_actual: 560 });
  check('submit over approved +10% is flagged', sub.data.job?.status === 'done' && sub.data.flags?.includes('over_budget'));
  check('bounce needs a reason, then reopens', (await mgr('/1/bounce', {})).status === 400 && (await mgr('/1/bounce', { reason: 'Need receipt' })).data.work_order?.status === 'in_progress');
  await wkr('/1/submit', { notes: 'Receipt attached', cost_actual: 540 });
  check('verify', (await mgr('/1/verify', {})).data.work_order?.status === 'verified');
  check('verified job cannot be canceled or edited', (await mgr('/1/cancel', {})).status === 409 && (await api(M + '/1', { token: CT, method: 'PUT', body: { title: 'x' } })).status === 409);
  const ev = (await mgr('/1')).data.events.map(e => e.action).join();
  check('audit trail in order', ev === 'created,assigned,estimated,approval_requested,approved,started,checked_in,estimated,approval_requested,approved,submitted,checked_out,bounced,submitted,verified' /* 2026-10-08: S3 adds check-in/out */, ev);
  const wev = (await wkr('/1')).data.events;
  check('worker history hides manager identity', wev.every(e => ['You', 'Demo Rentals LLC', 'StayGuide', 'Previous assignee'].includes(e.by)));

  // ---- reject path
  const R = (await mgr('', { property_id: 1, title: 'Replace water heater', assignee_user_id: 3 })).data.work_order.id;
  await wkr(`/${R}/estimate`, { amount: 2000 });
  const rej = await mgr(`/${R}/reject`, { reason: 'Get a second quote' });
  check('reject → new + unassigned', rej.data.work_order?.status === 'new' && rej.data.work_order.assignee_user_id === null);
  check('rejected worker loses access', (await wkr(`/${R}`)).status === 404);

  // ---- guest report → work order (manager), privacy
  const fr = await mgr('/from-report/1', {});
  check('report → work order', fr.status === 201 && fr.data.work_order.guest_report_id === 1);
  check('duplicate report → 409 with existing order', (await mgr('/from-report/1', {})).status === 409);
  const FR = fr.data.work_order.id;
  await mgr(`/${FR}/assign`, { assignee_user_id: 3 });
  const wj = await wkr(`/${FR}`);
  const raw = JSON.stringify(wj.data);
  check('worker sees report summary but no guest name/phone/room', wj.data.report?.title === 'Pool heater not working' && !raw.includes('John Smith') && !raw.includes('+1-555-0123') && !/guest_(name|phone|room|ip)/.test(raw));
  const reports = (await api('/reports/property/1', { token: CT })).data.reports;
  check('linked report moved to in_progress', reports.find(r => r.id === 1)?.status === 'in_progress');
  await wkr(`/${FR}/start`, {}); await wkr(`/${FR}/submit`, { notes: 'Fixed' }); await mgr(`/${FR}/verify`, {});
  check('verifying resolves the guest report', (await api('/reports/property/1', { token: CT })).data.reports.find(r => r.id === 1)?.status === 'resolved');

  // ---- urgent guest report auto-creates an unassigned work order
  const link = (await api('/company/demo-rentals/properties/seaside-villa/guest-link', { token: CT })).data.url;
  const gtoken = link.split('/g/')[1];
  const urgent = await api(`/g/${gtoken}/report`, { method: 'POST', body: { category: 'maintenance', title: 'Water leaking from ceiling', description: 'Dripping in the bedroom', priority: 'urgent', urgency_level: 'immediate', location: 'Bedroom', guest_name: 'Pat Guest', guest_phone: '555-0199' } });
  await sleep(800);
  const auto = (await mgr('')).data.work_orders.find(o => o.title === 'Water leaking from ceiling');
  check('urgent report → unassigned urgent work order', urgent.status === 201 && auto?.status === 'new' && auto.priority === 'urgent' && auto.created_by === null);
  check('urgent email links to the work order', /Work order #\d+ was created/.test(log));

  // ---- settings
  check('threshold setting: set + clear', (await api('/company/demo-rentals/ops/settings', { token: CT, method: 'PUT', body: { approval_threshold: 100 } })).data.approval_threshold === 100
    && (await api('/company/demo-rentals/ops/settings', { token: CT, method: 'PUT', body: { approval_threshold: '' } })).data.approval_threshold === null);
  const N = (await mgr('', { property_id: 1, title: 'No-threshold job', assignee_user_id: 3 })).data.work_order.id;
  check('no threshold → big estimate needs no approval', (await wkr(`/${N}/estimate`, { amount: 99999 })).data.job?.status === 'assigned');
  await api('/company/demo-rentals/ops/settings', { token: CT, method: 'PUT', body: { approval_threshold: 250 } });

  // ---- UI: manager board
  const browser = await H.launch();
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept()); };
  const board = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); watch(board);
  await board.goto(B + '/company/demo-rentals/login');
  await board.evaluate(t => localStorage.setItem('stayguide_token', t), CT);
  await board.goto(B + '/company/demo-rentals/ops');
  await board.waitForSelector('#ops:not([hidden])');
  check('UI board: 5 columns + urgent auto job in New', (await board.locator('.col').count()) === 5 && (await board.locator('.col').first().textContent()).includes('Water leaking'));
  await board.click('#new-btn');
  await board.fill('#c-title', 'Replace porch light');
  await board.selectOption('#c-property', '1');
  await board.selectOption('#c-assignee', '3');
  await board.click('#create-form button[type=submit]');
  await board.waitForSelector('.notice.success');
  check('UI board: create dialog → card in Assigned', (await board.locator('.col').nth(1).textContent()).includes('Replace porch light'));
  await board.locator('.wo', { hasText: 'Replace porch light' }).click();
  await board.waitForSelector('#detail[open]');
  await board.fill('#d-note', 'Use the warm white bulbs');
  await board.click('#detail form:last-of-type button[type=submit]');
  await board.waitForFunction(() => document.querySelector('#detail .timeline').textContent.includes('warm white'));
  check('UI board: comment shows in history', true);
  await board.click('button:has-text("Cancel work order")');
  await board.fill('#reason', 'Owner will do it');
  await board.click('#reason-submit');
  await board.waitForFunction(() => document.querySelector('#detail').textContent.includes('Canceled'));
  check('UI board: cancel with inline reason (no prompt)', true);
  await board.screenshot({ path: H.OUT + '/ops-board.png', fullPage: true });

  // ---- UI: worker app
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage(); watch(phone);
  await phone.goto(B + '/maint');
  await phone.evaluate(t => localStorage.setItem('stayguide_maint_token', t), WT);
  await phone.goto(B + '/maint');
  await phone.waitForSelector('#v-home:not([hidden])');
  check('UI worker: job list with Today section', (await phone.textContent('#jobs')).includes('Today'));
  await phone.locator('#jobs button', { hasText: 'Gutter cleaning' }).click();
  await phone.waitForSelector('#v-job:not([hidden])');
  check('UI worker: job detail branded + property shown', (await phone.textContent('#brand')).includes('Demo Rentals LLC') && (await phone.textContent('#job')).includes('Mountain Cabin'));
  await phone.click('button:has-text("Start job")');
  await phone.waitForSelector('.notice.success');
  await phone.fill('#done-notes', 'Cleared all gutters');
  await phone.fill('#done-cost', '120');
  await phone.click('button:has-text("Submit for review")');
  await phone.waitForFunction(() => document.querySelector('#job').textContent.includes('will verify'));
  check('UI worker: start → submit', (await api(M + '/' + G, { token: CT })).data.work_order.status === 'done');
  await phone.screenshot({ path: H.OUT + '/ops-worker-job.png', fullPage: true });
  const sw = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('UI worker: no horizontal scroll at 390px', sw <= 0, String(sw));

  check('no JS errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  try { process.kill(-server.pid); } catch {}
  kill();
  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} ops-s2 checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); kill(); process.exit(1); });
