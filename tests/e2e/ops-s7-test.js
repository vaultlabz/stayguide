// 2026-10-08 10:00, G7 Ops stage 7: time & pay (list, totals, corrections with reason + history, void, add, CSV exports, worker hours)
const H = require('./helpers');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const B = H.B;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kill = () => { try { execSync('lsof -ti tcp:' + H.PORT + ' -sTCP:LISTEN | xargs kill 2>/dev/null'); } catch {} };

const api = async (p, { token, method = 'GET', body } = {}) => {
  const res = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = {}; try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, text, headers: res.headers };
};
const TZ = 'America/Denver';
// local wall time in TZ → ISO (good enough for test fixtures: DST-safe via Intl offset probe)
function at(daysAgo, hh, mm) {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - daysAgo);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const guess = Date.parse(`${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess)).map(x => [x.type, x.value]));
  const off = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - guess;
  return { iso: new Date(guess - off).toISOString(), ymd };
}

(async () => {
  const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
  const server = spawn('npx', ['ts-node', 'src/index.ts'], { cwd: H.ROOT, env: { ...process.env, PORT: H.PORT, MOCK_DATABASE: process.env.TEST_MOCK_DATABASE || 'true', EMAIL_PROVIDER: 'mock', OPS_SCHEDULER: 'off' }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }

  const CT = (await api('/login', { method: 'POST', body: { email: 'admin@demorentals.com', password: 'demo123' } })).data.token;
  const AT = (await api('/admin/login', { method: 'POST', body: { email: 'admin@stayguide.com', password: 'admin123' } })).data.token;
  const WT = (await api('/maint/api/login', { method: 'POST', body: { email: 'tech@demorentals.com', password: 'tech1234' } })).data.token;
  const C = '/company/demo-rentals/ops';
  const mgr = (p, body, method) => api(C + p, { token: CT, method: method || (body ? 'POST' : 'GET'), body });

  await mgr('/workers/3', { hourly_rate: 40 }, 'PUT');
  const job = (await mgr('/work-orders', { property_id: 1, title: '=HYPERLINK("http://evil")', assignee_user_id: 3 })).data.work_order;
  const y1 = at(1, 9, 0), y2 = at(1, 12, 30);

  // ---- add (manual) + validation
  const add = body => mgr('/time', { work_order_id: job.id, user_id: 3, reason: 'Phone was dead', ...body });
  check('add needs a reason', (await mgr('/time', { work_order_id: job.id, user_id: 3, clock_in: y1.iso, clock_out: y2.iso })).status === 400);
  check('add: out before in refused', (await add({ clock_in: y2.iso, clock_out: y1.iso })).status === 400);
  check('add: future refused', (await add({ clock_in: new Date(Date.now() + 3600e3).toISOString(), clock_out: new Date(Date.now() + 7200e3).toISOString() })).status === 400);
  check('add: over 24 h refused', (await add({ clock_in: at(3, 8, 0).iso, clock_out: at(1, 9, 0).iso })).status === 400);
  check('add: not a team member refused', (await mgr('/time', { work_order_id: job.id, user_id: 2, clock_in: y1.iso, clock_out: y2.iso, reason: 'x' })).status === 400);
  check('add: foreign work order refused', (await mgr('/time', { work_order_id: 99999, user_id: 3, clock_in: y1.iso, clock_out: y2.iso, reason: 'x' })).status === 400);
  const added = await add({ clock_in: y1.iso, clock_out: y2.iso });
  check('add 3.5 h', added.status === 201 && added.data.entry.minutes === 210 && added.data.entry.method_in === 'manual');
  check('add: overlap with the same person refused', (await add({ clock_in: at(1, 10, 0).iso, clock_out: at(1, 11, 0).iso })).status === 400);
  const E1 = added.data.entry.id;

  // ---- list + totals in the manager's time zone
  const range = `from=${at(2, 0, 0).ymd}&to=${at(0, 0, 0).ymd}&tz=${encodeURIComponent(TZ)}`;
  let list = (await mgr(`/time?${range}`)).data;
  const terry = list.totals?.find(t => t.user_id === 3);
  check('totals: hours × rate', terry?.minutes === 210 && terry.hourly_rate === 40 && terry.amount === 140, JSON.stringify(terry));
  check('range excludes other days', (await mgr(`/time?from=${at(10, 0, 0).ymd}&to=${at(9, 0, 0).ymd}&tz=${encodeURIComponent(TZ)}`)).data.entries.length === 0);
  check('bad range refused', (await mgr(`/time?from=2026-12-01&to=2026-01-01`)).status === 400);

  // ---- correct with a reason; history keeps before/after
  check('correct needs a reason', (await mgr(`/time/${E1}`, { clock_out: at(1, 13, 0).iso }, 'PUT')).status === 400);
  const fixed = await mgr(`/time/${E1}`, { clock_out: at(1, 13, 0).iso, reason: 'Left at 1 pm per text' }, 'PUT');
  check('correction saved + flagged', fixed.data.entry?.minutes === 240 && fixed.data.entry.edited === true);
  const hist = (await mgr(`/time/${E1}/history`)).data.history;
  check('history: added then edited, with reason and before/after', hist.map(h => h.action).join() === 'added,edited' && hist[1].reason === 'Left at 1 pm per text'
    && new Date(hist[1].before_json.clock_out).toISOString() === y2.iso && hist[1].editor_name === 'Demo Admin');
  check('job history records the correction', (await mgr(`/work-orders/${job.id}`)).data.events.some(e => e.action === 'time_edited' && e.note === 'Left at 1 pm per text'));

  // ---- open entry closed by the manager
  await api(`/maint/api/jobs/${job.id}/start`, { token: WT, method: 'POST', body: {} });
  list = (await mgr(`/time?${range}`)).data;
  const open = list.entries.find(e => e.open);
  check('open entry listed, not counted', !!open && list.totals.find(t => t.user_id === 3).open === 1 && list.totals.find(t => t.user_id === 3).minutes === 240);
  check('closing an open entry can keep it open? no: closed entry needs out', (await mgr(`/time/${E1}`, { clock_out: null, reason: 'x' }, 'PUT')).status === 400);
  const closed = await mgr(`/time/${open.id}`, { clock_out: new Date().toISOString(), reason: 'Forgot to check out' }, 'PUT');
  const closedHist = (await mgr(`/time/${open.id}/history`)).data.history; // 2026-10-08 12:45, #45: show what came back when it fails
  check('manager checks someone out', closed.data.entry?.open === false && closedHist[0].action === 'closed', JSON.stringify({ status: closed.status, entry: closed.data.entry || closed.data, hist: closedHist }));

  // ---- void
  check('void needs a reason', (await mgr(`/time/${open.id}/void`, {})).status === 400);
  const v = await mgr(`/time/${open.id}/void`, { reason: 'Checked in at the wrong job' });
  check('void keeps the entry, counts nothing', v.data.entry?.voided_at && (await mgr(`/time?${range}`)).data.totals.find(t => t.user_id === 3).entries === 1);
  check('voided entry cannot be edited', (await mgr(`/time/${open.id}`, { clock_out: new Date().toISOString(), reason: 'x' }, 'PUT')).status === 409);

  // ---- CSV
  const csv = await api(`${C}/time/export?${range}`, { token: CT });
  const lines = csv.text.replace(/^\uFEFF/, '').trim().split('\r\n');
  check('time CSV: header + one row (voided left out)', csv.headers.get('content-type').startsWith('text/csv') && lines[0].startsWith('Worker,Email,Date,Check in') && lines.length === 2, String(lines.length));
  check('time CSV: hours, rate, amount, local times, tz', lines[1].includes(',09:00,13:00,4.00,40.00,160.00,') && lines[1].endsWith(TZ));
  check('time CSV: formula text neutralised', lines[1].includes(`"'=HYPERLINK(""http://evil"")"`), lines[1]);
  const sum = (await api(`${C}/time/export?${range}&kind=summary`, { token: CT })).text.replace(/^\uFEFF/, '').trim().split('\r\n');
  check('pay summary CSV', sum[0].startsWith('Worker,Email,Type,From,To,Hours') && sum[1].includes(',4.00,40.00,160.00,1,0'), sum[1]);
  check('export needs Ops', (await api('/company/ocean-view/ops/time/export', { token: AT })).status === 402);

  // ---- access
  check('worker cannot use manager time API', (await api(`${C}/time`, { token: WT })).status === 403);
  const mine = (await api(`/maint/api/time?tz=${encodeURIComponent(TZ)}`, { token: WT })).data.weeks;
  check('worker sees own weekly hours', Array.isArray(mine) && mine.length === 2 && mine.reduce((s, w) => s + w.minutes, 0) === 240, JSON.stringify(mine));

  // ---- UI
  const browser = await H.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: TZ, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(B + '/company/demo-rentals/login');
  await page.evaluate(t => localStorage.setItem('stayguide_token', t), CT);
  await page.goto(B + '/company/demo-rentals/time');
  await page.waitForSelector('#page:not([hidden]) #totals tr');
  check('UI: totals show $160.00', (await page.textContent('#totals')).includes('$160.00'));
  await page.locator('#entries tr', { hasText: 'Added by manager' }).locator('button:has-text("Correct")').click();
  await page.fill('#e-out', (await page.inputValue('#e-out')).replace(/T\d\d:\d\d/, 'T14:00'));
  await page.fill('#e-reason', 'Stayed until 2');
  await page.click('#edit-form button[type=submit]');
  await page.waitForSelector('.notice.success');
  check('UI: correction via dialog → $200.00', (await page.textContent('#totals')).includes('$200.00'));
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Export pay summary")')]);
  const file = await download.path();
  check('UI: pay summary download', download.suggestedFilename().startsWith('demo-rentals-pay-summary-') && fs.readFileSync(file, 'utf8').includes('200.00'));
  await page.locator('#entries tr', { hasText: 'Added by manager' }).locator('button:has-text("History")').click();
  await page.waitForSelector('#hist-dialog[open]');
  check('UI: history dialog lists reasons', (await page.textContent('#hist-body')).includes('Stayed until 2'));
  await page.screenshot({ path: H.OUT + '/ops-time.png', fullPage: true });

  check('no JS errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  try { process.kill(-server.pid); } catch {}
  kill();
  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} ops-s7 checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); kill(); process.exit(1); });
