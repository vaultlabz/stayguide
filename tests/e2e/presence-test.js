// 2026-10-10 10:32, #62 presence at the property: GPS on crew check-in/out (distance, at the property / away / none),
// property spot (pin + learned from a QR check-in), arrived / left emails + switch, late / no-show alerts, anonymous guest
// activity with the optional guide location question (never stored), tenancy, and the UI (arrival / leaving prompt,
// dashboard cards + location editor, ops "On site now", guide question).
const H = require('./helpers');
const { spawn, execSync } = require('child_process');
const B = H.B;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kill = () => { try { execSync('lsof -ti tcp:' + H.PORT + ' -sTCP:LISTEN | xargs kill 2>/dev/null'); } catch {} };
const iso = ms => new Date(Date.now() + ms).toISOString();
const MIN = 60000, HOUR = 3600000;

let log = '';
const api = async (p, { token, method = 'GET', body, device } = {}) => {
  const auth = device ? { Authorization: `Device ${device}` } : token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...auth }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = {}; try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, text };
};
// mock emails are printed to the server log
const mailAfter = async (fn, re) => { const start = log.length; const r = await fn(); for (let i = 0; i < 30; i++) { if (re.test(log.slice(start))) break; await sleep(100); } return { r, mail: log.slice(start).match(re) }; };

// Mountain Cabin (property 2) and Seaside Villa (property 1)
const CABIN = { lat: 39.7392, lng: -104.9903 };
const near = (p, acc = 10) => ({ lat: p.lat + 0.0003, lng: p.lng + 0.0002, accuracy: acc }); // ~40 m
const far = (p, acc = 15) => ({ lat: p.lat + 0.011, lng: p.lng, accuracy: acc }); // ~1.2 km
const SEASIDE = { lat: 34.0102, lng: -118.4965 };
const pw = f => ({ latitude: f.lat, longitude: f.lng, accuracy: f.accuracy }); // Playwright's geolocation shape

const out = [];
(async () => {
  const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
  kill();
  const server = spawn('npx', ['ts-node', 'src/index.ts'], { cwd: H.ROOT, env: { ...process.env, PORT: H.PORT, MOCK_DATABASE: process.env.TEST_MOCK_DATABASE || 'true', EMAIL_PROVIDER: 'mock', APP_BASE_URL: '', OPS_SCHEDULER: 'off' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  server.stdout.on('data', d => { log += d; });
  server.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }

  const CT = (await api('/login', { method: 'POST', body: { email: 'admin@demorentals.com', password: 'demo123' } })).data.token;
  const AT = (await api('/admin/login', { method: 'POST', body: { email: 'admin@stayguide.com', password: 'admin123' } })).data.token;
  const WT = (await api('/maint/api/login', { method: 'POST', body: { email: 'tech@demorentals.com', password: 'tech1234' } })).data.token;
  const C = '/company/demo-rentals';
  const mgr = (p, body, method) => api(C + p, { token: CT, method: method || (body ? 'POST' : 'GET'), body });
  const wkr = (p, body, method) => api('/maint/api/jobs' + p, { token: WT, method: method || (body ? 'POST' : 'GET'), body });
  const mk = async (body) => (await mgr('/ops/work-orders', { property_id: 2, title: 'Presence job', assignee_user_id: 3, window_start: iso(-10 * MIN), window_end: iso(2 * HOUR), ...body })).data.work_order.id;
  const presence = async () => (await mgr('/presence')).data;
  const prop = async (slug) => (await presence()).properties.find(p => p.slug === slug);
  // newest by id: MySQL keeps whole seconds, so entries made in the same second can tie on clock_in
  const entry = async (jobId) => (await mgr('/ops/time')).data.entries.filter(e => e.work_order_id === jobId).sort((x, y) => x.id - y.id).pop();

  // ---- property spot
  check('bad location → 400', (await mgr('/properties/mountain-cabin/site', { location: 'somewhere nice' }, 'PUT')).status === 400);
  const pin = await mgr('/properties/mountain-cabin/site', { location: `https://www.google.com/maps/place/Cabin/@${CABIN.lat},${CABIN.lng},17z` }, 'PUT');
  check('maps link pin saved', pin.status === 200 && pin.data.site.lat === CABIN.lat && pin.data.site.lng === CABIN.lng && pin.data.site_source === 'pin', pin.text);
  check('presence shows the spot', (await prop('mountain-cabin')).site?.lat === CABIN.lat);
  check('plain coordinates accepted', (await mgr('/properties/mountain-cabin/site', { location: `${CABIN.lat}, ${CABIN.lng}` }, 'PUT')).status === 200);
  check('another company cannot set it', [403, 404].includes((await api('/company/ocean-view/properties/mountain-cabin/site', { token: CT, method: 'PUT', body: { location: '1, 1' } })).status));
  check('another company cannot read presence', [403, 404].includes((await api('/company/ocean-view/presence', { token: CT })).status));
  check('worker cannot use the manager API', [401, 403].includes((await api(C + '/presence', { token: WT })).status));
  check('super admin can read presence', (await api(C + '/presence', { token: AT })).status === 200);

  // ---- check-in / check-out with location, arrived / left emails
  const A = await mk({ title: 'Turnover A' });
  const inA = await mailAfter(() => wkr(`/${A}/check-in`, { location: near(CABIN) }), /Terry Tech arrived at Mountain Cabin[\s\S]*?at the property/);
  check('check-in near the property → distance stored', inA.r.status === 200 && inA.r.data.distance !== null && inA.r.data.distance < 150, inA.r.text);
  check('"arrived" email with "at the property"', !!inA.mail);
  const ea = await entry(A);
  check('time entry: place_in at the property', ea.place_in.state === 'at' && ea.lat_in !== null, JSON.stringify(ea.place_in));
  const onNow = (await prop('mountain-cabin')).crew_on_site;
  check('presence: Terry on site now, at the property', onNow.length === 1 && onNow[0].worker_name === 'Terry Tech' && onNow[0].place.state === 'at' && onNow[0].job_id === A, JSON.stringify(onNow));
  check('worker job list says where they are checked in', (await wkr('')).data.on_site?.job_id === A);
  check('worker job carries the property spot', (await wkr('')).data.jobs.find(j => j.id === A).property.site?.lat === CABIN.lat);
  const outA = await mailAfter(() => wkr(`/${A}/check-out`, { location: far(CABIN) }), /Terry Tech left Mountain Cabin \(\d+ min on site\)[\s\S]*?1\.2 km from the property/);
  check('check-out far away → "left" email with time on site and distance', outA.r.status === 200 && !!outA.mail);
  const eo = await entry(A);
  check('time entry: place_out away ~1.2 km', eo.place_out.state === 'away' && eo.dist_out > 1100 && eo.dist_out < 1300, JSON.stringify(eo));
  check('job history: check-in distance recorded', (await mgr(`/ops/work-orders/${A}`)).data.events.some(e => e.action === 'checked_in' && typeof e.data?.distance === 'number'));

  const nolocIn = await mailAfter(() => wkr(`/${A}/check-in`, {}), /arrived at Mountain Cabin[\s\S]*?no location from the phone/);
  check('check-in without location still works', nolocIn.r.status === 200 && !!nolocIn.mail);
  check('time entry: no location', (await entry(A)).place_in.state === 'none');
  check('junk location ignored, not an error', (await wkr(`/${A}/check-out`, { location: { lat: 'x', lng: 500, accuracy: -1 } })).status === 200 && (await entry(A)).place_out.state === 'none');

  // switch off arrived / left emails
  check('settings: presence_emails on by default', (await mgr('/ops/settings')).data.presence_emails === true);
  check('presence_emails must be boolean', (await mgr('/ops/settings', { presence_emails: 'no' }, 'PUT')).status === 400);
  check('switch arrival emails off', (await mgr('/ops/settings', { presence_emails: false }, 'PUT')).data.presence_emails === false && (await mgr('/ops/settings')).data.presence_emails === false);
  const quiet = await mailAfter(() => wkr(`/${A}/check-in`, { location: near(CABIN) }), /arrived at Mountain Cabin/);
  check('no arrival email when switched off', quiet.r.status === 200 && !quiet.mail);
  await wkr(`/${A}/check-out`, { location: near(CABIN) });
  check('approval threshold still saves alongside', (await mgr('/ops/settings', { presence_emails: true, approval_threshold: 300 }, 'PUT')).data.approval_threshold === 300 && (await mgr('/ops/settings')).data.presence_emails === true);

  // Start / Submit also check in / out and carry the location
  const S = await mk({ title: 'Start-submit job', window_start: iso(-5 * MIN) });
  await wkr(`/${S}/start`, { location: near(CABIN) });
  check('Start checks in with the location', (await entry(S))?.place_in?.state === 'at');
  await wkr(`/${S}/submit`, { notes: 'done', location: far(CABIN) });
  check('Submit checks out with the location', (await entry(S))?.place_out?.state === 'away');

  // ---- QR check-in learns the property spot (only with a precise fix, never over a pin)
  const qr = (await mgr('/ops/access/1/qr')).data.url.split('/').pop();
  const Q = await mk({ property_id: 1, title: 'QR job' });
  check('seaside: no spot yet', (await prop('seaside-villa')).site === null);
  await api(`/maint/api/scan/${qr}`, { token: WT, method: 'POST', body: { job_id: Q, location: { ...SEASIDE, accuracy: 200 } } });
  check('vague QR fix does not set the spot', (await prop('seaside-villa')).site === null);
  check('vague fix: property spot not set', (await entry(Q)).place_in.state === 'unset');
  await api(`/maint/api/scan/${qr}`, { token: WT, method: 'POST', body: { job_id: Q } }); // out
  await api(`/maint/api/scan/${qr}`, { token: WT, method: 'POST', body: { job_id: Q, location: { ...SEASIDE, accuracy: 20 } } });
  const learned = await prop('seaside-villa');
  check('precise QR fix sets the spot (source qr)', learned.site?.lat === SEASIDE.lat && learned.site_source === 'qr', JSON.stringify(learned.site));
  check('that check-in counts as at the property', (await entry(Q)).place_in.state === 'at');
  await api(`/maint/api/scan/${qr}`, { token: WT, method: 'POST', body: { job_id: Q } });
  await mgr('/properties/seaside-villa/site', { lat: 34.0195, lng: -118.4912 }, 'PUT');
  await api(`/maint/api/scan/${qr}`, { token: WT, method: 'POST', body: { job_id: Q, location: { ...SEASIDE, accuracy: 5 } } });
  const pinned = await prop('seaside-villa');
  check('a manager pin is never overwritten by QR', pinned.site.lat === 34.0195 && pinned.site_source === 'pin');
  await api(`/maint/api/scan/${qr}`, { token: WT, method: 'POST', body: { job_id: Q } });
  check('spot can be cleared', (await mgr('/properties/seaside-villa/site', { clear: true }, 'PUT')).data.site === null && (await prop('seaside-villa')).site === null);

  // ---- late / no-show
  const run = () => api('/admin/ops/run-checks', { token: AT, method: 'POST', body: {} });
  const L = await mk({ title: 'Late job', window_start: iso(-40 * MIN) });
  const U = await mk({ title: 'Urgent late job', priority: 'urgent', window_start: iso(-20 * MIN) });
  const N = await mk({ title: 'Not late yet', window_start: iso(-20 * MIN) });
  const D = await mk({ title: 'Here already', window_start: iso(-40 * MIN) });
  const O = await mk({ title: 'Old job', window_start: iso(-48 * HOUR), window_end: iso(-46 * HOUR) });
  await wkr(`/${D}/check-in`, { location: near(CABIN) });
  const lateStart = log.length;
  const late = await mailAfter(run, /Late: Terry Tech has not arrived at Mountain Cabin[\s\S]*?Late job/);
  await sleep(500);
  const lateLog = log.slice(lateStart); // only what this run sent (assignment emails also name the jobs)
  check('late email for a job 40 min into its window', !!late.mail && late.r.data.late_alerts >= 2, JSON.stringify(late.r.data));
  check('urgent job late after 15 min', /Urgent late job/.test(lateLog));
  check('normal job not late after 20 min', !/#\d+ Not late yet/.test(lateLog));
  check('no late email when someone checked in', !/#\d+ Here already/.test(lateLog));
  check('jobs from days ago are left alone', !/#\d+ Old job/.test(lateLog));
  const again = await mailAfter(run, /Late:[\s\S]*?Late job/);
  check('each late job is reported once', !again.mail);
  await mgr(`/ops/work-orders/${L}`, { window_start: iso(-35 * MIN) }, 'PUT');
  const moved = await mailAfter(run, /Late:[\s\S]*?Late job/);
  check('moving the window re-arms the late alert', !!moved.mail);
  await wkr(`/${D}/check-out`, {});

  // ---- guest activity (anonymous) + optional guide location
  const linkUrl = (await mgr('/properties/mountain-cabin/guest-link')).data.url;
  const gt = linkUrl.split('/g/')[1];
  const visit = (body) => api(`/g/${gt}/events`, { method: 'POST', body: { events: [{ section: 'home', action: 'visit' }, { section: 'wifi', action: 'open' }], ...body } });
  await visit({ location: near(CABIN) });
  let g = (await prop('mountain-cabin')).guests;
  check('guide visit counted, location ignored while the question is off', g.guide.visits_24h === 1 && g.guide.on_site_visits_24h === 0 && !!g.last_activity_at, JSON.stringify(g));
  check('guide_location_check must be boolean', (await mgr('/properties/mountain-cabin', { guide_location_check: 'yes' }, 'PUT')).status === 400);
  await mgr('/properties/mountain-cabin', { guide_location_check: true }, 'PUT');
  check('guide content says to ask', (await api(`/g/${gt}/content`)).data.property.guide_location_check == true);
  await visit({ location: near(CABIN) });
  await visit({ location: far(CABIN) });
  await visit({});
  g = (await prop('mountain-cabin')).guests;
  check('on-site guide opens counted, away / unanswered not', g.guide.visits_24h === 4 && g.guide.on_site_visits_24h === 1, JSON.stringify(g.guide));
  const guestText = (await api(`/g/${gt}/content`)).text;
  check('guest content never includes the property spot', !guestText.includes('site_lat') && !guestText.includes(String(CABIN.lat)));
  const pc = (await mgr('/properties/mountain-cabin/devices/pairing-code', {})).data;
  const dev = (await api('/device/pair', { method: 'POST', body: { code: pc.code } })).data.token;
  check('tablet content never includes the property spot', !(await api('/device/content', { device: dev })).text.includes(String(CABIN.lat)));
  await api('/device/events', { device: dev, method: 'POST', body: { events: [{ section: 'home', action: 'visit' }, { section: 'house', action: 'open' }, { section: 'videos', action: 'play' }], location: far(CABIN) } });
  g = (await prop('mountain-cabin')).guests;
  check('tablet use counted and tablet online', g.tablet.events_24h === 3 && g.tablet.online === true, JSON.stringify(g.tablet));
  check('ocean view sees none of it', [403, 404].includes((await api('/company/ocean-view/presence', { token: CT })).status));

  // ---- UI
  const browser = await H.launch();
  const errors = [];
  // crew app: arrival prompt → check in → walk away → leaving prompt → check out
  const P = await mk({ title: 'Prompt job', window_start: iso(-5 * MIN) });
  const crew = await browser.newContext({ viewport: { width: 390, height: 844 }, geolocation: pw(near(CABIN, 12)), permissions: ['geolocation'] });
  await crew.addInitScript(t => { try { localStorage.setItem('stayguide_maint_token', t); } catch {} }, WT);
  const page = await crew.newPage();
  page.on('pageerror', e => errors.push('maint: ' + e.message));
  await page.goto(B + '/maint');
  await page.waitForSelector('#presence-prompt:not([hidden])', { timeout: 15000 });
  check('UI: "You\'re at Mountain Cabin" prompt', (await page.textContent('#presence-prompt')).includes("You're at Mountain Cabin"));
  check('UI: phone card says location is on', (await page.textContent('#phone-settings')).includes('Location is on'));
  await page.screenshot({ path: H.OUT + '/presence-arrival.png' });
  await page.click('#presence-prompt button');
  await page.waitForSelector('#v-job:not([hidden])');
  await page.waitForFunction(() => document.body.innerText.includes('Checked in since'));
  const pe = (await mgr('/ops/time')).data.entries.filter(e => e.open).sort((x, y) => x.id - y.id).pop();
  check('UI: one tap checked in (and started), at the property', pe?.place_in?.state === 'at' && (await wkr(`/${pe?.work_order_id}`)).data.job.status === 'in_progress', JSON.stringify(pe?.place_in));
  await crew.setGeolocation(pw(far(CABIN)));
  await page.goto(B + '/maint');
  await page.waitForFunction(() => document.getElementById('presence-prompt').innerText.includes('Leaving'), null, { timeout: 15000 });
  check('UI: away from the property → "Leaving Mountain Cabin?"', (await page.textContent('#presence-prompt')).includes('Leaving Mountain Cabin?'));
  await page.screenshot({ path: H.OUT + '/presence-leaving.png' });
  await page.click('#presence-prompt button');
  await page.waitForSelector('#v-job:not([hidden])');
  await page.waitForFunction(() => !document.body.innerText.includes('Checked in since'));
  const po = await entry(pe.work_order_id);
  check('UI: checked out from the prompt, away', po.clock_out && po.place_out.state === 'away', JSON.stringify(po.place_out));
  await crew.close();
  // no permission: no prompt, offer to turn location on; check-in still works
  const blocked = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await blocked.addInitScript(t => { try { localStorage.setItem('stayguide_maint_token', t); } catch {} }, WT);
  const bp = await blocked.newPage();
  bp.on('pageerror', e => errors.push('maint-blocked: ' + e.message));
  await bp.goto(B + '/maint');
  await bp.waitForFunction(() => document.getElementById('phone-settings').innerText.includes('Use location for check-in'), null, { timeout: 15000 });
  check('UI: without permission no prompt, "Use location for check-in" offered', await bp.isHidden('#presence-prompt'));
  await blocked.close();

  // manager: on site now on the board, dashboard card, location editor
  await wkr(`/${P}/check-in`, { location: near(CABIN) });
  const m = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await m.addInitScript(t => { try { localStorage.setItem('stayguide_token', t); } catch {} }, CT);
  const mp = await m.newPage();
  mp.on('pageerror', e => errors.push('dashboard: ' + e.message));
  await mp.goto(B + C + '/ops');
  await mp.waitForSelector('#onsite-card:not([hidden])', { timeout: 15000 });
  const onsiteText = await mp.textContent('#onsite');
  check('UI: board shows "On site now" with worker, property and at the property', onsiteText.includes('Terry Tech') && onsiteText.includes('Mountain Cabin') && onsiteText.includes('at the property'));
  await mp.screenshot({ path: H.OUT + '/presence-board.png' });
  await mp.goto(B + C + '/dashboard');
  await mp.waitForFunction(() => (document.getElementById('presence-2') || {}).innerText?.includes('Guests'), null, { timeout: 15000 });
  const card = await mp.textContent('#presence-2');
  check('UI: property card shows crew on site and guest activity', card.includes('Terry Tech') && card.includes('guide opened 4×') && card.includes('1 at the property') && card.includes('tablet used 3×'), card);
  await mp.screenshot({ path: H.OUT + '/presence-dashboard.png' });
  await mp.evaluate(() => editProperty('mountain-cabin'));
  await mp.waitForFunction(() => document.getElementById('site-state').textContent.includes('39.73920'), null, { timeout: 10000 });
  check('UI: editor shows the property location', (await mp.textContent('#site-state')).includes('39.73920, -104.99030'));
  check('UI: guide location question checkbox reflects the setting', await mp.isChecked('#guide-location-check'));
  await mp.fill('#site-input', '39.7400, -104.9910');
  await mp.click('#site-section button:has-text("Save")');
  await mp.waitForFunction(() => document.getElementById('site-state').textContent.includes('39.74000'));
  check('UI: pasted coordinates saved', (await prop('mountain-cabin')).site.lat === 39.74);
  await m.close();
  await wkr(`/${P}/check-out`, {});
  await mgr('/properties/mountain-cabin/site', { location: `${CABIN.lat}, ${CABIN.lng}` }, 'PUT');

  // manager time page: Where column
  const tm = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await tm.addInitScript(t => { try { localStorage.setItem('stayguide_token', t); } catch {} }, CT);
  const tp = await tm.newPage();
  tp.on('pageerror', e => errors.push('time: ' + e.message));
  await tp.goto(B + C + '/time');
  await tp.waitForFunction(() => document.getElementById('entries').innerText.includes('In: at property'), null, { timeout: 15000 });
  const timeText = await tp.textContent('#entries');
  check('UI: time page shows where (at property / away / no location)', timeText.includes('In: at property') && /Out: 1\.\d km away/.test(timeText) && timeText.includes('no location'));
  await tm.close();

  // guest guide: the question, answered yes at the property
  const guest = await browser.newContext({ viewport: { width: 390, height: 844 }, geolocation: pw(near(CABIN, 25)), permissions: ['geolocation'] });
  const gp = await guest.newPage();
  gp.on('pageerror', e => errors.push('guide: ' + e.message));
  await gp.goto(linkUrl);
  await gp.waitForSelector('#guide-location', { timeout: 15000 });
  check('UI: guide asks "Are you at Mountain Cabin?"', (await gp.textContent('#guide-location')).includes('Are you at Mountain Cabin?'));
  await gp.screenshot({ path: H.OUT + '/presence-guide-question.png' });
  await gp.click('#guide-location button:has-text("Share location")');
  await gp.waitForSelector('#guide-location', { state: 'detached' });
  let gv = null;
  for (let i = 0; i < 30; i++) { gv = (await prop('mountain-cabin')).guests.guide; if (gv.visits_24h === 5) break; await sleep(200); }
  check('UI: answered visit counted as at the property', gv.visits_24h === 5 && gv.on_site_visits_24h === 2, JSON.stringify(gv));
  await gp.reload();
  await gp.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' || document.body.innerText.length > 50);
  await sleep(500);
  check('UI: not asked again on this phone', !(await gp.$('#guide-location')));
  await guest.close();

  check('no page JS errors', errors.length === 0, errors.join(' | '));
  await browser.close();
})().catch(e => out.push('FAIL crashed — ' + (e && e.stack || e))).finally(() => {
  kill();
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(out.join('\n'));
  console.log(`\n${out.length - failed}/${out.length} presence checks passed`);
  process.exit(failed ? 1 : 0);
});
