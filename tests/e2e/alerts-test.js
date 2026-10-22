// 2026-10-22 11:37, #64 health check + error alert emails. Two server runs:
// 1) normal database (mock, or MySQL under test:mysql): /api/health 200, no alert email for normal traffic
// 2) MySQL on an unreachable port: /api/health 503 "unreachable" → one alert email at once, later 503s held and sent as one summary
const H = require('./helpers');
const { spawn, execSync } = require('child_process');
const B = H.B;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kill = () => { try { execSync('lsof -ti tcp:' + H.PORT + ' -sTCP:LISTEN | xargs kill 2>/dev/null'); } catch {} };

function start(env) {
  let log = '';
  const child = spawn('npx', ['ts-node', 'src/index.ts'], {
    cwd: H.ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: H.PORT, APP_BASE_URL: '', EMAIL_PROVIDER: 'mock', ALERTS: 'on', ALERT_EMAIL: 'ops@stayguide.test', OPS_SCHEDULER: 'off', ...env }
  });
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  return { log: () => log };
}
const up = async () => { for (let i = 0; i < 80; i++) { try { await fetch(B + '/api/health'); return; } catch {} await sleep(500); } };
const alertSubjects = log => [...log.matchAll(/To: ops@stayguide\.test\nSubject: (.+)/g)].map(m => m[1]);

(async () => {
  const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
  try {
    kill();
    const realDb = process.env.TEST_MOCK_DATABASE === 'false';
    let srv = start({ MOCK_DATABASE: realDb ? 'false' : 'true' });
    await up();
    let r = await fetch(B + '/api/health');
    let body = await r.json();
    check('db up: health 200 healthy', r.status === 200 && body.status === 'healthy' && body.database === (realDb ? 'connected' : 'mock'), JSON.stringify(body));
    check('404 does not alert', (await fetch(B + '/no-such-page')).status === 404);
    await sleep(500);
    check('db up: no alert emails', alertSubjects(srv.log()).length === 0);
    kill(); await sleep(1000);

    srv = start({ MOCK_DATABASE: 'false', DB_HOST: '127.0.0.1', DB_PORT: '1', ALERT_COOLDOWN_MS: '4000' });
    await up();
    r = await fetch(B + '/api/health');
    body = await r.json();
    check('db down: health 503 unreachable', r.status === 503 && body.status === 'unhealthy' && body.database === 'unreachable', JSON.stringify(body));
    await sleep(800);
    check('db down: alert email at once', alertSubjects(srv.log())[0] === '[StayGuide] Error: HTTP 503 GET /api/health', JSON.stringify(alertSubjects(srv.log())));
    await fetch(B + '/api/health'); await fetch(B + '/g/secretToken123456789012345/content?x=1');
    await sleep(800);
    check('db down: later errors held during cooldown', alertSubjects(srv.log()).length === 1);
    await sleep(4000);
    const subjects = alertSubjects(srv.log());
    check('db down: one summary after cooldown', subjects.length === 2 && /^\[StayGuide\] \d+ more errors? in the last/.test(subjects[1]), JSON.stringify(subjects));
    check('alert text masks guide tokens', !srv.log().includes('secretToken123456789012345'));
  } catch (e) {
    check('no crash', false, e.message);
  } finally {
    kill();
  }
  console.log(out.join('\n'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} alerts checks passed`);
  process.exit(failed ? 1 : 0);
})();
