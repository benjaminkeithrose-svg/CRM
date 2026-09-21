// Runs every suite in this folder from the repo root and reports one line each.
// Exit code is non-zero if any suite fails, so `npm test` is a usable gate.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const suites = readdirSync(new URL('.', import.meta.url))
  .filter(f => f.startsWith('qa-') && f.endsWith('.mjs')).sort();
let bad = 0;
for (const s of suites) {
  const r = spawnSync(process.execPath, ['tests/' + s], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const pass = (out.match(/PASS (\d+)/) || [])[1];
  const fail = (out.match(/FAIL (\d+)/) || [])[1];
  const ok = r.status === 0;
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'FAIL ') + s.padEnd(34) +
    (pass ? pass + ' passed' : '') + (fail ? ', ' + fail + ' failed' : '') +
    (!pass && !fail ? (ok ? 'clean' : 'crashed') : ''));
  if (!ok) console.log(out.split('\n').filter(l => /^\s+x |Error|at /.test(l)).slice(0, 12).join('\n'));
}
console.log(bad ? `\n${bad} suite(s) failed` : `\nall ${suites.length} suites passed`);
process.exit(bad ? 1 : 0);
