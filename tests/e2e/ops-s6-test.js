// 2026-10-08 08:20, G7 Ops stage 6: vendor profiles, insurance certificates (upload, signed view, confirm), reminders, assignment block
const H = require('./helpers');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { spawn, execSync } = require('child_process');
const B = H.B;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kill = () => { try { execSync('lsof -ti tcp:' + H.PORT + ' -sTCP:LISTEN | xargs kill 2>/dev/null'); } catch {} };

let log = '';
const api = async (p, { token, method = 'GET', body } = {}) => {
  const res = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})), headers: res.headers };
};
const ymd = days => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

(async () => {
  const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
  const STORE = path.join(H.OUT, 'ops-storage-s6');
  fs.rmSync(STORE, { recursive: true, force: true });
  const server = spawn('npx', ['ts-node', 'src/index.ts'], { cwd: H.ROOT, env: { ...process.env, PORT: H.PORT, MOCK_DATABASE: 'true', EMAIL_PROVIDER: 'mock', OPS_STORAGE_DIR: STORE, OPS_SCHEDULER: 'off' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  server.stdout.on('data', d => { log += d; }); server.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }

  const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
  const fakePdf = Buffer.from('not really a pdf');
  const jpg = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#eee' } }).jpeg().toBuffer();
  const uploadCert = async (token, buf, type, expires) => {
    const form = new FormData();
    form.append('expires_on', expires);
    form.append('file', new Blob([buf], { type }), type === 'application/pdf' ? 'coi.pdf' : 'coi.jpg');
    const res = await fetch(`${B}/maint/api/profile/certificate`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  const runChecks = async () => (await api('/admin/ops/run-checks', { token: AT, method: 'POST' })).data;

  const CT = (await api('/login', { method: 'POST', body: { email: 'admin@demorentals.com', password: 'demo123' } })).data.token;
  const AT = (await api('/admin/login', { method: 'POST', body: { email: 'admin@stayguide.com', password: 'admin123' } })).data.token;
  const WT = (await api('/maint/api/login', { method: 'POST', body: { email: 'tech@demorentals.com', password: 'tech1234' } })).data.token;
  const C = '/company/demo-rentals/ops';
  const team = async () => (await api(C + '/team', { token: CT })).data.members.find(m => m.user_id === 3);

  // Terry is a tech: no insurance card
  check('tech: not asked for insurance', (await api('/maint/api/profile', { token: WT })).data.is_vendor === false);
  check('tech: no insurance status on the team', (await team()).vendor.coi.state === 'missing');
  await api(C + '/workers/3', { token: CT, method: 'PUT', body: { worker_type: 'vendor' } });
  check('vendor: asked for insurance', (await api('/maint/api/profile', { token: WT })).data.is_vendor === true);
  check('vendor without certificate can still be assigned (warning only)', (await api(C + '/work-orders', { token: CT, method: 'POST', body: { property_id: 1, title: 'No COI yet', assignee_user_id: 3 } })).status === 201);

  // ---- upload + details
  check('needs an expiry date', (await uploadCert(WT, pdf, 'application/pdf', '')).status === 400);
  check('fake PDF refused', (await uploadCert(WT, fakePdf, 'application/pdf', ymd(60))).status === 400);
  const up = await uploadCert(WT, pdf, 'application/pdf', ymd(60));
  check('PDF certificate uploaded → valid', up.status === 201 && up.data.vendor.coi.state === 'valid' && up.data.vendor.coi.days_left === 60);
  const det = await api('/maint/api/profile/vendor', { token: WT, method: 'PUT', body: { business_name: 'Terry Plumbing LLC', license_no: 'PL-4471', insurance_provider: 'Acme Mutual' } });
  check('business details saved', det.data.vendor?.business_name === 'Terry Plumbing LLC');
  const m1 = await team();
  check('team shows certificate + details', m1.vendor.coi.state === 'valid' && m1.vendor.business_name === 'Terry Plumbing LLC' && m1.vendor.coi.url.startsWith('/ops-file/coi/3/'));
  const view = await fetch(B + m1.vendor.coi.url);
  check('signed link serves the PDF', view.status === 200 && view.headers.get('content-type') === 'application/pdf' && (await view.text()).startsWith('%PDF-'));
  check('tampered link refused', (await fetch(B + m1.vendor.coi.url.replace(/s=./, 's=Z'))).status === 403);
  check('expired link refused', (await fetch(B + m1.vendor.coi.url.replace(/e=\d+/, 'e=1000'))).status === 403);
  check('file is private (not under public/)', fs.existsSync(path.join(STORE, 'coi', '3')) && !fs.existsSync(path.join(H.ROOT, 'public', 'uploads', 'coi')));

  // ---- manager confirm / correct
  check('worker cannot confirm', (await api(C + '/workers/3/coi', { token: WT, method: 'PUT', body: { verify: true } })).status === 403);
  check('other company cannot confirm', [402, 403, 404].includes((await api('/company/ocean-view/ops/workers/3/coi', { token: CT, method: 'PUT', body: { verify: true } })).status));
  check('manager confirms', (await api(C + '/workers/3/coi', { token: CT, method: 'PUT', body: { verify: true } })).data.vendor?.coi.verified === true);
  check('bad date refused', (await api(C + '/workers/3/coi', { token: CT, method: 'PUT', body: { expires_on: 'next year' } })).status === 400);

  // ---- reminders: 30 days, 7 days, expired; never twice
  await api(C + '/workers/3/coi', { token: CT, method: 'PUT', body: { expires_on: ymd(20) } });
  const t1 = (await team()).vendor.coi;
  check('manager date change keeps it confirmed + expiring', t1.state === 'expiring' && t1.days_left === 20 && t1.verified === true);
  let start = log.length;
  check('30-day reminder sent', (await runChecks()).certificate_reminders === 1);
  await sleep(300);
  const r30 = log.slice(start);
  check('reminder emails: vendor + company', /To: tech@demorentals\.com[\s\S]*Insurance certificate expires soon/.test(r30) && /To: admin@demorentals\.com[\s\S]*Insurance certificate expires soon: Terry Tech \(Terry Plumbing LLC\)/.test(r30));
  check('not repeated', (await runChecks()).certificate_reminders === 0);
  await api(C + '/workers/3/coi', { token: CT, method: 'PUT', body: { expires_on: ymd(5) } });
  check('7-day reminder after the date moves', (await runChecks()).certificate_reminders === 1 && (await runChecks()).certificate_reminders === 0);
  await api(C + '/workers/3/coi', { token: CT, method: 'PUT', body: { expires_on: ymd(-1) } });
  start = log.length;
  check('expired reminder', (await runChecks()).certificate_reminders === 1);
  await sleep(300);
  check('expired email says no new work', /cannot be assigned new work/.test(log.slice(start)));
  check('still valid on its expiry day', await (async () => { await api(C + '/workers/3/coi', { token: CT, method: 'PUT', body: { expires_on: ymd(0) } }); return (await team()).vendor.coi.state === 'expiring'; })());
  await api(C + '/workers/3/coi', { token: CT, method: 'PUT', body: { expires_on: ymd(-3) } });

  // ---- assignment block
  const blocked = await api(C + '/work-orders', { token: CT, method: 'POST', body: { property_id: 1, title: 'Blocked', assignee_user_id: 3 } });
  check('expired vendor cannot be assigned (create)', blocked.status === 400 && /insurance certificate has expired/.test(blocked.data.error));
  const open = (await api(C + '/work-orders', { token: CT, method: 'POST', body: { property_id: 1, title: 'Unassigned' } })).data.work_order;
  check('expired vendor cannot be assigned (assign)', (await api(`${C}/work-orders/${open.id}/assign`, { token: CT, method: 'POST', body: { assignee_user_id: 3 } })).status === 400);
  await api(C + '/workers/3', { token: CT, method: 'PUT', body: { worker_type: 'contractor' } });
  check('contractors are not blocked (warning only)', (await api(`${C}/work-orders/${open.id}/assign`, { token: CT, method: 'POST', body: { assignee_user_id: 3 } })).status === 200);
  await api(C + '/workers/3', { token: CT, method: 'PUT', body: { worker_type: 'vendor' } });

  // ---- renewal via photo
  const renew = await uploadCert(WT, jpg, 'image/jpeg', ymd(365));
  check('photo certificate re-encoded, valid again, needs confirming', renew.status === 201 && renew.data.vendor.coi.state === 'valid' && renew.data.vendor.coi.mime === 'image/webp' && renew.data.vendor.coi.verified === false);
  check('old certificate link stops working', (await fetch(B + m1.vendor.coi.url)).status === 404);
  check('assignable again', (await api(C + '/work-orders', { token: CT, method: 'POST', body: { property_id: 1, title: 'Renewed', assignee_user_id: 3 } })).status === 201);
  check('renewal resets reminders', (await runChecks()).certificate_reminders === 0);

  // ---- UI
  const browser = await H.launch();
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept()); };
  await api(C + '/workers/3/coi', { token: CT, method: 'PUT', body: { expires_on: ymd(-2) } });
  const mgr = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); watch(mgr);
  await mgr.goto(B + '/company/demo-rentals/login');
  await mgr.evaluate(t => localStorage.setItem('stayguide_token', t), CT);
  await mgr.goto(B + '/company/demo-rentals/team');
  await mgr.waitForSelector('#team:not([hidden])');
  check('UI team: expired banner + badge', (await mgr.textContent('#coi-alert')).includes('Insurance expired') && (await mgr.textContent('#members')).includes('expired'));
  await mgr.click('#members button:has-text("Change date")');
  await mgr.fill('#coi-date', ymd(200));
  await mgr.click('#coi-form button[value=save]');
  await mgr.waitForSelector('.notice.success');
  check('UI team: change date → valid + confirmed', (await team()).vendor.coi.state === 'valid' && (await team()).vendor.coi.verified === true);
  await api(C + '/workers/3/coi', { token: CT, method: 'PUT', body: { expires_on: ymd(-2) } });
  await mgr.goto(B + '/company/demo-rentals/ops');
  await mgr.waitForSelector('#ops:not([hidden])');
  await mgr.waitForSelector('#c-assignee option[value="3"]', { state: 'attached' });
  await mgr.click('#new-btn');
  check('UI board: expired vendor disabled in Assign to', await mgr.evaluate(() => { const o = [...document.querySelectorAll('#c-assignee option')].find(x => x.value === '3'); return !!o && o.disabled && o.textContent.includes('insurance expired'); }));
  await mgr.screenshot({ path: H.OUT + '/ops-team-coi.png' });

  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage(); watch(phone);
  await phone.goto(B + '/maint');
  await phone.evaluate(t => localStorage.setItem('stayguide_maint_token', t), WT);
  await phone.goto(B + '/maint?profile=1');
  await phone.waitForSelector('#profile-card:not([hidden])');
  check('UI worker: expired warning in the insurance card', (await phone.textContent('#coi-state')).includes('expired'));
  const pdfPath = path.join(H.OUT, 'ops-s6-coi.pdf'); fs.writeFileSync(pdfPath, pdf);
  await phone.setInputFiles('#coi-file', pdfPath);
  await phone.fill('#coi-expires', ymd(300));
  await phone.click('#coi-form button[type=submit]');
  await phone.waitForFunction(() => document.querySelector('#coi-state').textContent.includes('valid until'));
  check('UI worker: upload renews the certificate', (await team()).vendor.coi.state === 'valid');
  await phone.screenshot({ path: H.OUT + '/ops-worker-coi.png', fullPage: true });

  check('no JS errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  try { process.kill(-server.pid); } catch {}
  kill();
  fs.rmSync(STORE, { recursive: true, force: true });
  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} ops-s6 checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); kill(); process.exit(1); });
