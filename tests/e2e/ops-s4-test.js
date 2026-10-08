// 2026-10-08 04:00, G7 Ops stage 4: checklist templates, job checklists, photo steps, submit gate, review queue, bounce + reopen
const H = require('./helpers');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { spawn, execSync } = require('child_process');
const B = H.B;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kill = () => { try { execSync('lsof -ti tcp:' + H.PORT + ' -sTCP:LISTEN | xargs kill 2>/dev/null'); } catch {} };

const api = async (p, { token, method = 'GET', body } = {}) => {
  const res = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const upload = async (token, jobId, file, extra = {}) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(extra)) form.append(k, String(v));
  form.append('photo', new Blob([fs.readFileSync(file)], { type: 'image/jpeg' }), 'p.jpg');
  const res = await fetch(`${B}/maint/api/jobs/${jobId}/photos`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

(async () => {
  const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
  const STORE = path.join(H.OUT, 'ops-storage-s4');
  fs.rmSync(STORE, { recursive: true, force: true });
  const server = spawn('npx', ['ts-node', 'src/index.ts'], { cwd: H.ROOT, env: { ...process.env, PORT: H.PORT, MOCK_DATABASE: 'true', EMAIL_PROVIDER: 'mock', OPS_STORAGE_DIR: STORE }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch {} await sleep(500); }
  const img = path.join(H.OUT, 'ops-s4-photo.jpg');
  await sharp({ create: { width: 800, height: 600, channels: 3, background: '#48c' } }).jpeg().toFile(img);

  const CT = (await api('/login', { method: 'POST', body: { email: 'admin@demorentals.com', password: 'demo123' } })).data.token;
  const AT = (await api('/admin/login', { method: 'POST', body: { email: 'admin@stayguide.com', password: 'admin123' } })).data.token;
  const WT = (await api('/maint/api/login', { method: 'POST', body: { email: 'tech@demorentals.com', password: 'tech1234' } })).data.token;
  const C = '/company/demo-rentals/ops';
  const mgr = (p, body, method) => api(C + p, { token: CT, method: method || (body ? 'POST' : 'GET'), body });
  const wkr = (p, body, method) => api('/maint/api/jobs' + p, { token: WT, method: method || (body ? 'POST' : 'GET'), body });

  // ---- templates
  const list = (await mgr('/checklists')).data.templates;
  check('seeded templates', list?.map(t => t.name).join() === 'Monthly safety inspection,Turnover clean');
  check('templates need Ops', (await api('/company/ocean-view/ops/checklists', { token: AT })).data.code === 'upgrade_required');
  check('worker cannot manage templates', (await api(C + '/checklists', { token: WT })).status === 403);
  check('validation: needs steps', (await mgr('/checklists', { name: 'Empty', type: 'cleaning', items: [] })).status === 400);
  check('validation: blank step', (await mgr('/checklists', { name: 'Bad', type: 'cleaning', items: [{ label: '  ' }] })).status === 400);
  const made = await mgr('/checklists', { name: 'Hot tub service', type: 'maintenance', items: [{ label: 'Test chemicals', requires_photo: true }, { label: 'Clean filter' }] });
  check('create template', made.status === 201 && made.data.template.items.length === 2 && made.data.template.items[0].requires_photo === true);
  const TPL = made.data.template.id;

  // ---- attach at creation; job keeps its copy when the template changes later
  const job = (await mgr('/work-orders', { property_id: 1, title: 'Hot tub', type: 'maintenance', assignee_user_id: 3, checklist_template_id: TPL })).data.work_order;
  check('foreign/unknown template rejected', (await mgr('/work-orders', { property_id: 1, title: 'x', checklist_template_id: 999 })).status === 400);
  await mgr(`/checklists/${TPL}`, { items: [{ label: 'Only step' }] }, 'PUT');
  let wj = (await wkr(`/${job.id}`)).data;
  check('job keeps its own copy after template edit', wj.checklist.length === 2 && wj.checklist[0].label === 'Test chemicals');
  const [photoStep, plainStep] = wj.checklist;

  // ---- worker ticks
  check('cannot tick before starting', (await wkr(`/${job.id}/checklist/${plainStep.id}`, { done: true })).status === 409);
  await wkr(`/${job.id}/start`, {});
  check('photo step needs a photo', (await wkr(`/${job.id}/checklist/${photoStep.id}`, { done: true })).status === 409);
  check('plain step ticks', (await wkr(`/${job.id}/checklist/${plainStep.id}`, { done: true })).data.checklist?.find(i => i.id === plainStep.id).done === true);
  check('submit blocked while a step is open', (await wkr(`/${job.id}/submit`, {})).status === 409);
  const up = await upload(WT, job.id, img, { checklist_item_id: photoStep.id });
  check('photo linked to the step', up.status === 201 && (await wkr(`/${job.id}`)).data.checklist[0].photo_url?.startsWith('/ops-photo/'));
  check('step from another job rejected', (await upload(WT, job.id, img, { checklist_item_id: 99999 })).status === 400);
  await wkr(`/${job.id}/checklist/${photoStep.id}`, { done: true });
  // deleting the photo un-ticks the photo step
  const up2 = await upload(WT, job.id, img, { checklist_item_id: photoStep.id });
  await wkr(`/${job.id}/checklist/${photoStep.id}`, { done: true });
  await wkr(`/${job.id}/photos/${up2.data.photo.id}`, null, 'DELETE');
  check('removing the step photo un-ticks it', (await wkr(`/${job.id}`)).data.checklist[0].done === false);
  await upload(WT, job.id, img, { checklist_item_id: photoStep.id });
  await wkr(`/${job.id}/checklist/${photoStep.id}`, { done: true });
  check('checklist changes locked once started', (await mgr(`/work-orders/${job.id}/checklist`, { template_id: 1 }, 'PUT')).status === 409);
  const sub = await wkr(`/${job.id}/submit`, { notes: 'All good' });
  check('submit with complete checklist', sub.data.job?.status === 'done');

  // ---- review queue + bounce with reopen
  const rq = (await mgr('/review')).data.jobs;
  const entry = rq?.find(j => j.work_order.id === job.id);
  check('review queue shows the job with checklist + photos', !!entry && entry.checklist.every(i => i.done) && entry.photos.length >= 1);
  const b = await mgr(`/work-orders/${job.id}/bounce`, { reason: 'Photo is blurry', reopen_item_ids: [photoStep.id] });
  check('bounce reopens the chosen step', b.data.work_order?.status === 'in_progress');
  wj = (await wkr(`/${job.id}`)).data;
  check('reopened photo step needs a new photo', wj.checklist[0].done === false && wj.checklist[0].photo_url === null && wj.checklist[1].done === true);
  check('bounce event records reopened steps', (await mgr(`/work-orders/${job.id}`)).data.events.find(e => e.action === 'bounced')?.data?.reopened === 1);
  check('left the review queue', !(await mgr('/review')).data.jobs.some(j => j.work_order.id === job.id));

  // ---- attach/change on an untouched job; archive
  const j2r = await mgr('/work-orders', { property_id: 2, title: 'Inspection', type: 'inspection' });
  check('create without assignee field', j2r.status === 201);
  const j2 = j2r.data.work_order;
  check('attach later', (await mgr(`/work-orders/${j2.id}/checklist`, { template_id: 2 }, 'PUT')).data.checklist?.length === 3);
  check('change while untouched', (await mgr(`/work-orders/${j2.id}/checklist`, { template_id: 1 }, 'PUT')).data.checklist?.length === 6);
  check('remove', (await mgr(`/work-orders/${j2.id}/checklist`, { template_id: null }, 'PUT')).data.checklist?.length === 0);
  await mgr(`/checklists/${TPL}`, { active: false }, 'PUT');
  check('archived template hidden + not attachable', !(await mgr('/checklists')).data.templates.some(t => t.id === TPL) && (await mgr(`/work-orders/${j2.id}/checklist`, { template_id: TPL }, 'PUT')).status === 400);
  check('archived listed with ?archived=1', (await mgr('/checklists?archived=1')).data.templates.some(t => t.id === TPL && !t.active));

  // ---- UI
  const browser = await H.launch();
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept()); };
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); watch(page);
  await page.goto(B + '/company/demo-rentals/login');
  await page.evaluate(t => localStorage.setItem('stayguide_token', t), CT);
  await page.goto(B + '/company/demo-rentals/checklists');
  await page.waitForSelector('#layout:not([hidden]) .tpl');
  await page.click('button:has-text("New checklist")');
  await page.fill('#t-name', 'Pool opening');
  await page.fill('#steps li:nth-child(1) input[aria-label]', 'Remove cover');
  await page.click('button:has-text("Add step")');
  await page.fill('#steps li:nth-child(2) input[aria-label]', 'Balance water');
  await page.check('#steps li:nth-child(2) input[type=checkbox]');
  await page.click('#steps li:nth-child(2) button[aria-label^="Move step 2 up"]');
  await page.click('#editor button[type=submit]');
  await page.waitForSelector('.notice.success');
  const saved = (await mgr('/checklists')).data.templates.find(t => t.name === 'Pool opening');
  check('UI editor: create, reorder, photo flag', saved?.items.map(i => `${i.label}:${i.requires_photo}`).join() === 'Balance water:true,Remove cover:false');
  await page.screenshot({ path: H.OUT + '/ops-checklists.png', fullPage: true });

  await page.goto(B + '/company/demo-rentals/ops');
  await page.waitForSelector('#ops:not([hidden])');
  await page.click('#new-btn');
  await page.fill('#c-title', 'UI turnover');
  await page.selectOption('#c-property', '1');
  await page.selectOption('#c-assignee', '3');
  await page.selectOption('#c-checklist', { label: 'Turnover clean (6 steps)' });
  await page.click('#create-form button[type=submit]');
  await page.waitForSelector('.notice.success');
  const uiJob = (await mgr('/work-orders')).data.work_orders.find(o => o.title === 'UI turnover');
  check('UI board: create with checklist', uiJob?.checklist_template_id === 1);

  // worker completes it on the phone
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage(); watch(phone);
  await phone.goto(B + '/maint');
  await phone.evaluate(t => localStorage.setItem('stayguide_maint_token', t), WT);
  await phone.goto(`${B}/maint?job=${uiJob.id}`);
  await phone.waitForSelector('#checklist-card');
  await phone.click('button:has-text("Start job")');
  await phone.waitForSelector('#checklist-card input[type=checkbox]:not([disabled])');
  for (const input of await phone.locator('#checklist-card input[type=file]').all()) {
    await phone.locator('#checklist-card input[type=file]').first().setInputFiles(img);
    await phone.waitForFunction(() => document.querySelector('.notice.success')?.textContent.includes('step ticked'));
    await phone.evaluate(() => document.querySelector('.notice')?.remove());
  }
  for (let i = 0; i < 6; i++) {
    const box = phone.locator('#checklist-card input[type=checkbox]:not(:checked):not([disabled])').first();
    if (!(await box.count())) break;
    await box.check();
    await phone.waitForTimeout(400);
  }
  await phone.waitForFunction(() => /6\/6/.test(document.querySelector('#checklist-card h2').textContent));
  check('UI worker: photo steps + ticks reach 6/6', true);
  await phone.click('button:has-text("Submit for review")');
  await phone.waitForFunction(() => document.querySelector('#job').textContent.includes('will verify'));
  check('UI worker: submit after checklist', (await mgr(`/work-orders/${uiJob.id}`)).data.work_order.status === 'done');
  await phone.screenshot({ path: H.OUT + '/ops-worker-checklist.png', fullPage: true });

  await page.reload();
  await page.waitForSelector('#review-card:not([hidden])');
  check('UI board: review queue lists the job', (await page.textContent('#review')).includes('UI turnover'));
  await page.locator('.review-item', { hasText: 'UI turnover' }).locator('button:has-text("Review")').click();
  await page.waitForSelector('#detail[open] .checklist img');
  check('UI board: dialog shows checklist with photos', (await page.locator('#detail .checklist li').count()) === 6);
  await page.click('#detail button:has-text("Send back")');
  await page.fill('#reason', 'Redo the bathroom');
  await page.locator('#reopen-box label', { hasText: 'Clean bathrooms' }).locator('input').check();
  await page.click('#reason-submit');
  await page.waitForFunction(() => document.querySelector('#detail').textContent.includes('In progress'));
  const after = (await mgr(`/work-orders/${uiJob.id}`)).data.checklist;
  check('UI board: send back reopens the chosen step', after.filter(i => !i.done).map(i => i.label).join() === 'Clean bathrooms (toilet, shower, sink, mirror)');
  await page.screenshot({ path: H.OUT + '/ops-review.png', fullPage: true });

  check('no JS errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  try { process.kill(-server.pid); } catch {}
  kill();
  fs.rmSync(STORE, { recursive: true, force: true });
  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} ops-s4 checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); kill(); process.exit(1); });
