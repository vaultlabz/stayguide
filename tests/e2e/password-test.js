// 2026-10-09 12:21, #56 forgot / reset / change password: API rules (generic answers, single-use links, older links voided,
// sessions signed out), all three roles, and the UI (sign-in link, reset page, dashboard Password dialog)
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
// mock emails are printed to the server log; the text part carries the full reset link
const waitLog = async (after, re) => { const start = log.length; await after(); for (let i = 0; i < 40; i++) { const m = log.slice(start).match(re); if (m) return m; await sleep(100); } return null; };
const resetToken = async (email) => { let r; const m = await waitLog(async () => { r = await api('/forgot-password', { method: 'POST', body: { email } }); }, /\/reset-password\?token=([A-Za-z0-9_-]{43})/); return { r, token: m && m[1] }; };
const login = (email, password) => api('/login', { method: 'POST', body: { email, password } });

let out = [];
(async () => {
  const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
  kill();
  const server = spawn('npx', ['ts-node', 'src/index.ts'], { cwd: H.ROOT, env: { ...process.env, PORT: H.PORT, MOCK_DATABASE: process.env.TEST_MOCK_DATABASE || 'true', EMAIL_PROVIDER: 'mock', APP_BASE_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  server.stdout.on('data', d => { log += d; });
  server.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }

  // ---- forgot: same answer for known and unknown accounts, token only in the email
  const oldSession = (await login('admin@demorentals.com', 'demo123')).data.token;
  check('old session works before reset', (await api('/api/auth/profile', { token: oldSession })).status === 200);
  check('invalid email → 400', (await api('/forgot-password', { method: 'POST', body: { email: 'nope' } })).status === 400);
  const unknown = await api('/forgot-password', { method: 'POST', body: { email: 'nobody@example.com' } });
  const first = await resetToken('Admin@DemoRentals.com');
  check('same answer for unknown and known email', unknown.status === 200 && first.r.status === 200 && unknown.data.message === first.r.data.message);
  check('reset link emailed (case-insensitive email)', !!first.token);
  check('response never contains the token', !JSON.stringify(first.r.data).includes(first.token || 'x'));

  // ---- a newer link voids the older one
  const second = await resetToken('admin@demorentals.com');
  check('older link stops working after a new request', (await api('/reset-password', { method: 'POST', body: { token: first.token, password: 'new-pass-123' } })).data.code === 'RESET_INVALID');

  // ---- reset
  check('short password → 400', (await api('/reset-password', { method: 'POST', body: { token: second.token, password: 'short' } })).status === 400);
  check('unknown token → 400 RESET_INVALID', (await api('/reset-password', { method: 'POST', body: { token: 'x'.repeat(43), password: 'new-pass-123' } })).data.code === 'RESET_INVALID');
  await sleep(1100); // sessions issued in an earlier second than the change are the ones signed out
  let done;
  const changedMail = await waitLog(async () => { done = await api('/reset-password', { method: 'POST', body: { token: second.token, password: 'new-pass-123' } }); }, /Your StayGuide password was changed/);
  check('reset succeeds → sign-in page', done.status === 200 && done.data.redirect === '/login', JSON.stringify(done.data));
  check('"password changed" email sent', !!changedMail);
  check('link is single-use', (await api('/reset-password', { method: 'POST', body: { token: second.token, password: 'another-pass-1' } })).status === 400);
  const ended = await api('/api/auth/profile', { token: oldSession });
  check('session from before the reset is signed out', ended.status === 401 && ended.data.code === 'SESSION_ENDED', JSON.stringify(ended));
  check('old password rejected', (await login('admin@demorentals.com', 'demo123')).status === 401);
  const fresh = await login('admin@demorentals.com', 'new-pass-123');
  check('new password signs in', !!fresh.data.token);

  // ---- change password (signed in)
  const CT = fresh.data.token;
  check('change: wrong current → 400', (await api('/account/password', { token: CT, method: 'POST', body: { current_password: 'nope', new_password: 'third-pass-123' } })).status === 400);
  check('change: same as current → 400', (await api('/account/password', { token: CT, method: 'POST', body: { current_password: 'new-pass-123', new_password: 'new-pass-123' } })).status === 400);
  check('change: needs sign-in', (await api('/account/password', { method: 'POST', body: { current_password: 'a', new_password: 'third-pass-123' } })).status === 401);
  await sleep(1100);
  const ch = await api('/account/password', { token: CT, method: 'POST', body: { current_password: 'new-pass-123', new_password: 'third-pass-123' } });
  check('change succeeds and returns a fresh token', ch.status === 200 && !!ch.data.token);
  check('fresh token works', (await api('/api/auth/profile', { token: ch.data.token })).status === 200);
  check('previous token signed out', (await api('/api/auth/profile', { token: CT })).status === 401);
  check('changed password signs in', !!(await login('admin@demorentals.com', 'third-pass-123')).data.token);

  // ---- every role: super admin (change) and field worker (reset → worker app)
  const AT = (await api('/admin/login', { method: 'POST', body: { email: 'admin@stayguide.com', password: 'admin123' } })).data.token;
  check('super admin can change password', (await api('/account/password', { token: AT, method: 'POST', body: { current_password: 'admin123', new_password: 'super-pass-123' } })).status === 200);
  check('super admin signs in with it', !!(await api('/admin/login', { method: 'POST', body: { email: 'admin@stayguide.com', password: 'super-pass-123' } })).data.token);
  const worker = await resetToken('tech@demorentals.com');
  const wr = await api('/reset-password', { method: 'POST', body: { token: worker.token, password: 'worker-pass-1' } });
  check('field worker reset → worker app', wr.status === 200 && wr.data.redirect === '/maint', JSON.stringify(wr.data));
  check('field worker signs in to the work app with it', (await api('/maint/api/login', { method: 'POST', body: { email: 'tech@demorentals.com', password: 'worker-pass-1' } })).status === 200);

  // ---- UI
  const browser = await H.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(B + '/login');
  await page.click('a[href="/forgot-password"]');
  await page.waitForSelector('#requestForm:not([hidden])');
  check('sign-in page links to forgot password', page.url().endsWith('/forgot-password'));
  let uiToken;
  const m = await waitLog(async () => { await page.fill('#email', 'admin@demorentals.com'); await page.click('#requestForm button'); await page.waitForSelector('#success-message:visible'); }, /\/reset-password\?token=([A-Za-z0-9_-]{43})/);
  uiToken = m && m[1];
  check('UI: request shows the generic message', (await page.textContent('#success-message')).includes('reset link is on its way'));
  await page.goto(B + '/reset-password?token=' + uiToken);
  await page.waitForSelector('#resetForm:not([hidden])');
  check('UI: token removed from the address bar', !page.url().includes('token='));
  await page.fill('#password', 'ui-pass-1234'); await page.fill('#confirm', 'ui-pass-9999'); await page.click('#resetForm button');
  check('UI: mismatch caught before sending', (await page.textContent('#error-message')).includes('do not match'));
  await page.fill('#confirm', 'ui-pass-1234'); await page.click('#resetForm button');
  await page.waitForSelector('#success-message:visible');
  check('UI: reset done, link back to sign in', (await page.getAttribute('#signin-link', 'href')) === '/login');
  await page.screenshot({ path: H.OUT + '/password-reset.png' });

  // dashboard Password dialog
  await page.goto(B + '/login');
  await page.fill('#email', 'admin@demorentals.com'); await page.fill('#password', 'ui-pass-1234'); await page.click('#loginBtn');
  await page.waitForURL(/\/company\/demo-rentals\/dashboard/);
  await page.click('[data-change-password]');
  await page.waitForSelector('#sg-pw-dialog[open]');
  await page.fill('#sg-pw-current', 'ui-pass-1234'); await page.fill('#sg-pw-new', 'dash-pass-123'); await page.fill('#sg-pw-confirm', 'dash-pass-123');
  await page.screenshot({ path: H.OUT + '/password-change-dialog.png' });
  await page.click('#sg-pw-save');
  await page.waitForSelector('#sg-pw-msg.ok');
  await Promise.all([page.waitForLoadState('load'), page.click('#sg-pw-cancel')]);
  await page.waitForFunction(() => document.getElementById('user-name').textContent !== 'Loading...', null, { timeout: 10000 });
  check('UI: dashboard change keeps this tab signed in', page.url().includes('/company/demo-rentals/dashboard') && !(await page.textContent('#user-name')).includes('Loading'));
  check('UI: new password works', !!(await login('admin@demorentals.com', 'dash-pass-123')).data.token);
  check('no page JS errors', errors.length === 0, errors.join(' | '));
  await browser.close();
})().catch(e => out.push('FAIL crashed — ' + (e && e.stack || e))).finally(() => {
  kill();
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(out.join('\n'));
  console.log(`\n${out.length - failed}/${out.length} password checks passed`);
  process.exit(failed ? 1 : 0);
});
