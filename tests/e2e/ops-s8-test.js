// 2026-10-08 12:10, G7 Ops stage 8: preventive schedules, overdue / unassigned digests, company time zone, admin Ops metrics
const H = require('./helpers');
const { spawn, execSync } = require('child_process');
const B = H.B;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kill = () => { try { execSync('lsof -ti tcp:' + H.PORT + ' -sTCP:LISTEN | xargs kill 2>/dev/null'); } catch {} };

let log = '';
const api = async (p, { token, method = 'GET', body } = {}) => {
  const res = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const todayIn = tz => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const localHM = (iso, tz) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

(async () => {
  const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
  const server = spawn('npx', ['ts-node', 'src/index.ts'], { cwd: H.ROOT, env: { ...process.env, PORT: H.PORT, MOCK_DATABASE: process.env.TEST_MOCK_DATABASE || 'true', EMAIL_PROVIDER: 'mock', OPS_SCHEDULER: 'off', NODE_ENV: 'development' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  server.stdout.on('data', d => { log += d; }); server.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }

  const CT = (await api('/login', { method: 'POST', body: { email: 'admin@demorentals.com', password: 'demo123' } })).data.token;
  const AT = (await api('/admin/login', { method: 'POST', body: { email: 'admin@stayguide.com', password: 'admin123' } })).data.token;
  const WT = (await api('/maint/api/login', { method: 'POST', body: { email: 'tech@demorentals.com', password: 'tech1234' } })).data.token;
  const C = '/company/demo-rentals/ops';
  const mgr = (p, body, method) => api(C + p, { token: CT, method: method || (body ? 'POST' : 'GET'), body });
  const run = async now => (await api('/admin/ops/run-checks', { token: AT, method: 'POST', body: now ? { now } : {} })).data;
  const orders = async () => (await mgr('/work-orders')).data.work_orders;

  // ---- time zone
  check('settings show the company time zone', (await mgr('/settings')).data.timezone === 'America/Denver');
  check('unknown time zone refused', (await mgr('/settings', { timezone: 'Mars/Olympus' }, 'PUT')).status === 400);
  check('set time zone', (await mgr('/settings', { timezone: 'Asia/Tokyo' }, 'PUT')).data.timezone === 'Asia/Tokyo');
  const TZ = 'Asia/Tokyo', today = todayIn(TZ);

  // ---- validation
  check('seeded schedule listed', (await mgr('/schedules')).data.schedules?.some(s => s.title === 'Monthly safety inspection'));
  check('day 31 refused', (await mgr('/schedules', { title: 'x', property_id: 1, recurrence: 'monthly', month_day: 31 })).status === 400);
  check('foreign property refused', (await mgr('/schedules', { title: 'x', property_id: 999, recurrence: 'weekly', weekday: 0 })).status === 400);
  check('worker cannot manage schedules', (await api(C + '/schedules', { token: WT })).status === 403);
  check('Ops needed', (await api('/company/ocean-view/ops/schedules', { token: AT })).status === 402);

  // ---- weekly schedule starting today, default person, checklist → job created now, once
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const weekly = await mgr('/schedules', { title: 'Hot tub service', property_id: 1, type: 'maintenance', recurrence: 'weekly', weekday: dow, start_on: today,
    window_start_time: '10:30', window_hours: 3, lead_days: 2, default_assignee_user_id: 3, checklist_template_id: 2 });
  check('create weekly schedule (due today)', weekly.status === 201 && weekly.data.schedule.next_due_on === today, JSON.stringify(weekly.data));
  const SID = weekly.data.schedule.id;
  const r1 = await run();
  const job = (await orders()).find(o => o.schedule_id === SID);
  check('job created by the scheduler', r1.scheduled_jobs >= 1 && !!job && job.status === 'assigned' && job.assignee_user_id === 3 && job.created_by === null);
  check('window in the company time zone (10:30 Tokyo, 3 h)', job && localHM(job.window_start, TZ) === '10:30' && (new Date(job.window_end) - new Date(job.window_start)) === 3 * 3600e3);
  check('checklist attached', (await mgr(`/work-orders/${job.id}`)).data.checklist.length === 3);
  check('assigned person emailed', /Subject: New job: Hot tub service/.test(log));
  check('schedule advanced one week', (await mgr('/schedules')).data.schedules.find(s => s.id === SID).next_due_on === addDays(today, 7));
  await run();
  check('no duplicate on the next run', (await orders()).filter(o => o.schedule_id === SID).length === 1);

  // ---- every N days with lead time creates the occurrences inside the window
  const n = await mgr('/schedules', { title: 'Pool chemicals', property_id: 2, recurrence: 'every_n_days', interval_days: 2, start_on: today, lead_days: 3 });
  await run();
  const pool = (await orders()).filter(o => o.schedule_id === n.data.schedule.id);
  check('every 2 days, 3 days ahead → 2 jobs (today, +2)', pool.length === 2 && pool.every(o => o.status === 'new'), String(pool.length));
  check('next occurrence +4', (await mgr('/schedules')).data.schedules.find(s => s.id === n.data.schedule.id).next_due_on === addDays(today, 4));

  // ---- future start, paused, vendor with expired insurance
  const later = await mgr('/schedules', { title: 'Gutters', property_id: 1, recurrence: 'monthly', month_day: 1, start_on: addDays(today, 40), lead_days: 3 });
  const paused = await mgr('/schedules', { title: 'Paused job', property_id: 1, recurrence: 'weekly', weekday: dow, start_on: today, lead_days: 1 });
  await mgr(`/schedules/${paused.data.schedule.id}`, { active: false }, 'PUT');
  await mgr('/workers/3', { worker_type: 'vendor' }, 'PUT');
  const form = new FormData(); form.append('expires_on', addDays(today, -5)); form.append('file', new Blob([Buffer.from('%PDF-1.4\n%%EOF\n')], { type: 'application/pdf' }), 'c.pdf');
  await fetch(`${B}/maint/api/profile/certificate`, { method: 'POST', headers: { Authorization: `Bearer ${WT}` }, body: form });
  const v = await mgr('/schedules', { title: 'Vendor job', property_id: 1, recurrence: 'weekly', weekday: dow, start_on: today, lead_days: 1, default_assignee_user_id: 3 });
  await run();
  const all = await orders();
  check('future start: nothing yet', !all.some(o => o.schedule_id === later.data.schedule.id));
  check('paused: nothing', !all.some(o => o.schedule_id === paused.data.schedule.id));
  const vj = all.find(o => o.schedule_id === v.data.schedule.id);
  check('expired vendor not auto-assigned (job left unassigned, noted)', vj && vj.assignee_user_id === null && (await mgr(`/work-orders/${vj.id}`)).data.events.some(e => e.action === 'scheduled' && e.data?.default_assignee_skipped));
  await mgr('/workers/3', { worker_type: 'tech' }, 'PUT');

  // ---- overdue + unassigned digests
  const past = new Date(Date.now() - 2 * 3600e3).toISOString();
  const late = (await mgr('/work-orders', { property_id: 2, title: 'Late job', assignee_user_id: 3, due_at: past })).data.work_order;
  let start = log.length;
  const d1 = await run();
  await sleep(300);
  check('overdue digest to the manager', d1.overdue_alerts >= 1 && /Subject: Work orders: \d+ overdue/.test(log.slice(start)) && log.slice(start).includes(`#${late.id} Late job`));
  check('overdue reported once', (await run()).overdue_alerts === 0);
  start = log.length;
  const d2 = await run(new Date(Date.now() + 25 * 3600e3).toISOString());
  await sleep(300);
  check('unassigned after 24 h → digest', d2.unassigned_alerts >= 1 && /Waiting for someone to be assigned/.test(log.slice(start)));
  check('unassigned reported once', (await run(new Date(Date.now() + 26 * 3600e3).toISOString())).unassigned_alerts === 0);

  // ---- admin metrics
  const m = (await api('/admin/ops/metrics', { token: AT })).data;
  const demo = m.companies?.find(c => c.slug === 'demo-rentals');
  check('admin metrics per company', !!demo && demo.workers >= 1 && demo.open >= 3 && demo.overdue >= 1 && demo.schedules >= 4 && m.totals.monthly_revenue === null && m.price_per_property === null);
  check('metrics are super-admin only', (await api('/admin/ops/metrics', { token: CT })).status === 403);

  // ---- UI
  const browser = await H.launch();
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept()); };
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); watch(page);
  await page.goto(B + '/company/demo-rentals/login');
  await page.evaluate(t => localStorage.setItem('stayguide_token', t), CT);
  await page.goto(B + '/company/demo-rentals/schedules');
  await page.waitForSelector('#page:not([hidden]) #rows tr');
  await page.waitForSelector('#s-assignee option[value="3"]', { state: 'attached' });
  await page.click('#new-btn');
  await page.fill('#s-title', 'HVAC filter');
  await page.selectOption('#s-rec', 'every_n_days');
  await page.fill('#s-int', '90');
  await page.selectOption('#s-assignee', '3');
  await page.click('#editor-form button[type=submit]');
  await page.waitForSelector('.notice.success');
  const ui = (await mgr('/schedules')).data.schedules.find(s => s.title === 'HVAC filter');
  check('UI: create schedule (every 90 days, default person)', ui?.interval_days === 90 && ui.default_assignee_user_id === 3);
  await page.locator('#rows tr', { hasText: 'HVAC filter' }).locator('button:has-text("Pause")').click();
  // 2026-10-09 13:10, wait for this row: "Paused job" (paused earlier) already put 'paused' on the page, so the old wait raced the save
  await page.waitForFunction(() => [...document.querySelectorAll('#rows tr')].some(tr => tr.textContent.includes('HVAC filter') && tr.textContent.includes('paused')));
  check('UI: pause', (await mgr('/schedules')).data.schedules.find(s => s.title === 'HVAC filter').active === false);
  await page.screenshot({ path: H.OUT + '/ops-schedules.png', fullPage: true });
  await page.goto(B + '/company/demo-rentals/ops');
  await page.waitForSelector('#ops:not([hidden])');
  check('UI board: overdue banner', (await page.textContent('#alerts')).includes('overdue'));
  const adm = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); watch(adm);
  await adm.goto(B + '/admin/login');
  await adm.evaluate(t => localStorage.setItem('stayguide_admin_token', t), AT);
  await adm.goto(B + '/admin/dashboard');
  await adm.waitForSelector('#ops-section:not([hidden])');
  check('UI admin: Ops section with Demo Rentals', (await adm.textContent('#ops-content')).includes('Demo Rentals') && (await adm.textContent('#ops-summary')).includes('price not set'));

  check('no JS errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  try { process.kill(-server.pid); } catch {}
  kill();
  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} ops-s8 checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); kill(); process.exit(1); });
