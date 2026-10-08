// 2026-10-08 11:50, #45: run the e2e suites against real MySQL. Before each suite the DB is reset to the mock demo data
// (scripts/seed-mysql-from-mock.js), so every suite starts from the same state it gets in mock mode.
//   npm run build && node scripts/test-mysql.js [suite ...]     e.g. node scripts/test-mysql.js phase3 ops-s2
// Needs DB_* in .env (DB_NAME must end in _dev or _test). Runs every suite and reports all failures (npm test stops at the first).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ALL = require('../package.json').scripts['test:e2e'].match(/tests\/e2e\/[\w-]+-test\.js/g).map(f => path.basename(f, '-test.js'));
const suites = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const env = { ...process.env, TEST_MOCK_DATABASE: 'false' };
const results = [];
for (const s of suites) {
  const seed = spawnSync('node', ['scripts/seed-mysql-from-mock.js'], { cwd: ROOT, env, encoding: 'utf8' });
  if (seed.status !== 0) { console.error(seed.stderr); process.exit(1); }
  const t0 = Date.now();
  // output goes straight to a file: suites call process.exit(), which truncates output still queued on a pipe
  const logFile = path.join(ROOT, `tests/e2e/output/mysql-${s}.log`);
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const fd = fs.openSync(logFile, 'w');
  const run = spawnSync('node', [`tests/e2e/${s}-test.js`], { cwd: ROOT, env, stdio: ['ignore', fd, fd], timeout: 600000 });
  fs.closeSync(fd);
  const out = fs.readFileSync(logFile, 'utf8');
  const fails = out.split('\n').filter(l => /^\s*FAIL\b|Error\b/.test(l));
  results.push({ s, ok: run.status === 0, secs: Math.round((Date.now() - t0) / 1000), fails, tail: out.trim().split('\n').slice(-1)[0] });
  console.log(`${run.status === 0 ? 'PASS' : 'FAIL'} ${s} (${results.at(-1).secs}s) ${results.at(-1).tail}`);
  for (const f of fails.slice(0, 15)) console.log('   ' + f.slice(0, 300));
}
const bad = results.filter(r => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} suites passed on MySQL${bad.length ? ': failed ' + bad.map(r => r.s).join(', ') : ''}`);
process.exit(bad.length ? 1 : 0);
