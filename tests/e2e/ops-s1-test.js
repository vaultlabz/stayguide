// 2026-10-07 19:50, G7 Ops stage 1: Team page, invites, onboarding, worker sign-in (password + email code), gating, isolation
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
// mock emails are printed to the server log; the text part carries the full invite link / code
const lastInviteToken = async (after) => { const start = log.length; await after(); for (let i = 0; i < 40; i++) { const m = log.slice(start).match(/\/maint\/invite\/([A-Za-z0-9_-]{43})/); if (m) return m[1]; await sleep(100); } return null; };
const lastCode = async (after) => { const start = log.length; await after(); for (let i = 0; i < 40; i++) { const m = log.slice(start).match(/sign-in code is (\d{6})/); if (m) return m[1]; await sleep(100); } return null; };

(async () => {
  const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
  const server = spawn('npx', ['ts-node', 'src/index.ts'], { cwd: H.ROOT, env: { ...process.env, PORT: H.PORT, MOCK_DATABASE: 'true', EMAIL_PROVIDER: 'mock' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  server.stdout.on('data', d => { log += d; });
  server.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }

  const CT = (await api('/login', { method: 'POST', body: { email: 'admin@demorentals.com', password: 'demo123' } })).data.token;
  const AT = (await api('/admin/login', { method: 'POST', body: { email: 'admin@stayguide.com', password: 'admin123' } })).data.token;

  // ---- gating + validation
  check('Ops off (ocean-view) → 402 upgrade_required', (await api('/company/ocean-view/ops/team', { token: AT })).data.code === 'upgrade_required');
  check('company admin of another company → 403', (await api('/company/ocean-view/ops/team', { token: CT })).status === 403);
  check('invite validation (bad email / type)', (await api('/company/demo-rentals/ops/invites', { token: CT, method: 'POST', body: { email: 'nope', first_name: 'A', last_name: 'B', worker_type: 'tech' } })).status === 400
    && (await api('/company/demo-rentals/ops/invites', { token: CT, method: 'POST', body: { email: 'a@b.co', first_name: 'A', last_name: 'B', worker_type: 'boss' } })).status === 400);
  check('admin email cannot be invited', (await api('/company/demo-rentals/ops/invites', { token: CT, method: 'POST', body: { email: 'admin@demorentals.com', first_name: 'A', last_name: 'B', worker_type: 'tech' } })).status === 409);

  // ---- invite → accept (API)
  let invite;
  const token = await lastInviteToken(async () => {
    invite = await api('/company/demo-rentals/ops/invites', { token: CT, method: 'POST', body: { email: 'Sam.Tech@Example.com', first_name: 'Sam', last_name: 'Tech', worker_type: 'tech', skills: 'HVAC, pool' } });
  });
  check('invite created, email normalized, skills tagged', invite.status === 201 && invite.data.invite.email === 'sam.tech@example.com' && invite.data.invite.skills.join() === 'hvac,pool');
  check('invite response never contains the token', !JSON.stringify(invite.data).includes(token || 'x'));
  check('invite email sent as "<company> via StayGuide"', /From: Demo Rentals LLC via StayGuide/.test(log));
  const info = await api(`/maint/api/invite/${token}`);
  check('invite info shows company branding', info.status === 200 && info.data.company.name === 'Demo Rentals LLC' && info.data.existing_account === false);
  check('short password rejected', (await api(`/maint/api/invite/${token}/accept`, { method: 'POST', body: { first_name: 'Sam', last_name: 'Tech', password: 'short' } })).status === 400);
  const accept = await api(`/maint/api/invite/${token}/accept`, { method: 'POST', body: { first_name: 'Sam', last_name: 'Tech', password: 'wrench-2026' } });
  const WT = accept.data.token;
  check('accept creates account + signs in', accept.status === 201 && !!WT);
  check('invite link single-use', (await api(`/maint/api/invite/${token}`)).status === 404);
  const me = await api('/maint/api/me', { token: WT });
  check('/maint/api/me lists the company as active', me.data.companies?.length === 1 && me.data.companies[0].active === true && me.data.companies[0].slug === 'demo-rentals');

  // ---- isolation
  check('worker token rejected by company API', (await api('/company/demo-rentals/properties', { token: WT })).status === 403);
  check('worker token rejected by admin API', (await api('/admin/companies', { token: WT })).status === 403);
  check('worker cannot sign in to dashboards', (await api('/login', { method: 'POST', body: { email: 'sam.tech@example.com', password: 'wrench-2026' } })).status === 401);
  check('admin token rejected by /maint/api/me', (await api('/maint/api/me', { token: CT })).status === 403);

  // ---- sign-in
  check('password sign-in (case-insensitive email)', !!(await api('/maint/api/login', { method: 'POST', body: { email: 'SAM.TECH@example.com', password: 'wrench-2026' } })).data.token);
  const unknown = await api('/maint/api/login-code', { method: 'POST', body: { email: 'nobody@example.com' } });
  let known;
  const code = await lastCode(async () => { known = await api('/maint/api/login-code', { method: 'POST', body: { email: 'sam.tech@example.com' } }); });
  check('code request answers the same for unknown emails', unknown.status === 200 && known.status === 200 && unknown.data.message === known.data.message);
  check('wrong code rejected', (await api('/maint/api/login-code/verify', { method: 'POST', body: { email: 'sam.tech@example.com', code: '000000' } })).status === 401);
  check('right code signs in', !!(await api('/maint/api/login-code/verify', { method: 'POST', body: { email: 'sam.tech@example.com', code } })).data.token);
  check('code is single-use', (await api('/maint/api/login-code/verify', { method: 'POST', body: { email: 'sam.tech@example.com', code } })).status === 401);
  const code2 = await lastCode(() => api('/maint/api/login-code', { method: 'POST', body: { email: 'sam.tech@example.com' } }));
  for (let i = 0; i < 5; i++) await api('/maint/api/login-code/verify', { method: 'POST', body: { email: 'sam.tech@example.com', code: '111111' } });
  check('code locked after 5 wrong tries', (await api('/maint/api/login-code/verify', { method: 'POST', body: { email: 'sam.tech@example.com', code: code2 } })).status === 401);

  // ---- manager edits / suspends
  const uid = accept.data.user.id;
  const upd = await api(`/company/demo-rentals/ops/workers/${uid}`, { token: CT, method: 'PUT', body: { status: 'suspended', hourly_rate: '42.5', skills: ['hvac'] } });
  check('manager edits rate/skills and suspends', upd.data.worker?.status === 'suspended' && upd.data.worker.hourly_rate === 42.5);
  check('suspended membership shows inactive to the worker', (await api('/maint/api/me', { token: WT })).data.companies[0].active === false);
  await api(`/company/demo-rentals/ops/workers/${uid}`, { token: CT, method: 'PUT', body: { status: 'active' } });
  check('re-inviting a member → 409', (await api('/company/demo-rentals/ops/invites', { token: CT, method: 'POST', body: { email: 'sam.tech@example.com', first_name: 'S', last_name: 'T', worker_type: 'tech' } })).status === 409);

  // ---- second company: same account joins (multi-company membership)
  await api('/admin/companies/2', { token: AT, method: 'PUT', body: { ops_addon: true } });
  const OT = (await api('/admin/login', { method: 'POST', body: { email: 'admin@stayguide.com', password: 'admin123' } })).data.token;
  const token2 = await lastInviteToken(() => api('/company/ocean-view/ops/invites', { token: OT, method: 'POST', body: { email: 'sam.tech@example.com', first_name: 'Sam', last_name: 'Tech', worker_type: 'contractor' } }));
  check('existing worker sees "existing account" on a 2nd invite', (await api(`/maint/api/invite/${token2}`)).data.existing_account === true);
  const acc2 = await api(`/maint/api/invite/${token2}/accept`, { method: 'POST', body: { first_name: 'Sam', last_name: 'Tech', password: 'changed-pass-1' } });
  check('2nd invite adds membership, keeps password', acc2.status === 200 && acc2.data.created === false
    && !!(await api('/maint/api/login', { method: 'POST', body: { email: 'sam.tech@example.com', password: 'wrench-2026' } })).data.token);
  check('worker now in both companies', (await api('/maint/api/me', { token: WT })).data.companies.length === 2);
  // demo-rentals: seeded Terry Tech + Sam; ocean-view: only Sam
  const demoTeam = (await api('/company/demo-rentals/ops/team', { token: CT })).data.members.map(m => m.email).sort().join();
  const oceanTeam = (await api('/company/ocean-view/ops/team', { token: OT })).data.members.map(m => m.email).join();
  check('each company sees only its own member list', demoTeam === 'sam.tech@example.com,tech@demorentals.com' && oceanTeam === 'sam.tech@example.com', demoTeam + ' | ' + oceanTeam);
  check('seeded demo worker can sign in', !!(await api('/maint/api/login', { method: 'POST', body: { email: 'tech@demorentals.com', password: 'tech1234' } })).data.token);
  check('Team shows last sign-in', !!(await api('/company/demo-rentals/ops/team', { token: CT })).data.members.find(m => m.email === 'sam.tech@example.com').last_login);

  // ---- revoke / resend
  const t3 = await lastInviteToken(() => api('/company/demo-rentals/ops/invites', { token: CT, method: 'POST', body: { email: 'cleo@example.com', first_name: 'Cleo', last_name: 'Clean', worker_type: 'cleaner' } }));
  const pending = (await api('/company/demo-rentals/ops/team', { token: CT })).data.invites;
  const t4 = await lastInviteToken(() => api(`/company/demo-rentals/ops/invites/${pending[0].id}/resend`, { token: CT, method: 'POST' }));
  check('resend replaces the old link', (await api(`/maint/api/invite/${t3}`)).status === 404 && (await api(`/maint/api/invite/${t4}`)).status === 200);
  await api(`/company/demo-rentals/ops/invites/${pending[0].id}`, { token: CT, method: 'DELETE' });
  check('canceled invite link stops working', (await api(`/maint/api/invite/${t4}`)).status === 404);

  // ---- UI
  const browser = await H.launch();
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept()); };

  const mgr = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage(); watch(mgr);
  await mgr.goto(B + '/company/demo-rentals/login');
  await mgr.evaluate(t => localStorage.setItem('stayguide_token', t), CT);
  await mgr.goto(B + '/company/demo-rentals/team');
  await mgr.waitForSelector('#team:not([hidden])');
  check('UI: Team page lists the member', (await mgr.textContent('#members')).includes('Sam Tech'));
  let uiToken = await lastInviteToken(async () => {
    await mgr.fill('#inv-first', 'Vic'); await mgr.fill('#inv-last', 'Vendor'); await mgr.fill('#inv-email', 'vic@example.com');
    await mgr.selectOption('#inv-type', 'vendor'); await mgr.fill('#inv-skills', 'electrical');
    await mgr.click('#invite-form button[type=submit]');
  });
  await mgr.waitForSelector('.notice.success');
  check('UI: invite form sends invite + shows it pending', !!uiToken && (await mgr.textContent('#invites')).includes('vic@example.com'));
  await mgr.screenshot({ path: H.OUT + '/ops-team.png', fullPage: true });

  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage(); watch(phone);
  await phone.goto(`${B}/maint/invite/${uiToken}`);
  await phone.waitForSelector('#v-form:not([hidden])');
  check('UI: invite page branded with the company', (await phone.textContent('#brand')).includes('Demo Rentals LLC') && (await phone.textContent('.powered')).includes('StayGuide'));
  await phone.click('#accept-btn');
  await phone.waitForURL(B + '/maint');
  await phone.waitForSelector('#v-home:not([hidden])');
  check('UI: code-only onboarding lands on the app home', (await phone.textContent('#hello')).includes('Vic') && (await phone.textContent('#brand')).includes('Demo Rentals LLC'));
  await phone.screenshot({ path: H.OUT + '/ops-maint-home.png' });
  const sw = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('UI: no horizontal scroll at 390px', sw <= 0, String(sw));

  await phone.click('#signout');
  await phone.waitForSelector('#v-email:not([hidden])');
  const uiCode = await lastCode(async () => { await phone.fill('#email', 'vic@example.com'); await phone.click('#email-form button[value=code]'); await phone.waitForSelector('#v-code:not([hidden])'); });
  await phone.fill('#code', uiCode);
  await phone.click('#code-form button[type=submit]');
  await phone.waitForSelector('#v-home:not([hidden])');
  check('UI: email-code sign-in works', (await phone.textContent('#hello')).includes('Vic'));

  check('no JS errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  try { process.kill(-server.pid); } catch {}
  kill();
  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} ops-s1 checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); kill(); process.exit(1); });
