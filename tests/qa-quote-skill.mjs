// The quote request skill (quote-request-skill/), separate from the app: runs its own
// self-test, which reads a made-up plant audit workbook, runs the lookups and draws
// both example requests. Needs python3 with openpyxl; skipped (not failed) without them.
import { spawnSync } from 'child_process';
import fs from 'fs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };

const run = spawnSync('python3', ['quote-request-skill/quote-request/scripts/self_test.py'], { encoding: 'utf8' });
const out = String(run.stdout || '') + String(run.stderr || '');
const m = out.match(/Self-test: (\d+) passed, (\d+) failed/);
if (!m && /No module named 'openpyxl'|ENOENT/.test(out + String(run.error || ''))) {
  console.log('  (skipped: python3 with openpyxl is not available here)');
} else {
  ok(m && run.status === 0 && +m[2] === 0, 'skill self-test: ' + out.trim().split('\n').slice(-4).join(' | '));
  ok(m && +m[1] >= 40, 'self-test ran its checks (' + (m ? m[1] : 0) + ')');
}

// the belt fields follow Field CRM's beltSpecGroups, in its order
const app = fs.readFileSync('app.js', 'utf8');
const body = app.slice(app.indexOf('function beltSpecGroups'), app.indexOf('function beltSpecRows'));
const appLabels = [...body.matchAll(/\['([^']+)',\s*b\.\w+/g)].map(x => x[1]);
const tpl = JSON.parse(fs.readFileSync('quote-request-skill/quote-request/templates/belt-quote.json', 'utf8'));
const items = tpl.sections.find(s => s.type === 'items');
const tplLabels = items.groups.flatMap(g => g.fields.map(f => f.label)).filter(l => !['Quantity', 'Quote contact'].includes(l));
const appOrder = appLabels.filter(l => !['Quantity', 'Quote contact'].includes(l));
ok(appOrder.length > 20 && JSON.stringify(tplLabels) === JSON.stringify(appOrder),
  'belt-quote template fields match beltSpecGroups: ' + tplLabels.filter((l, i) => l !== appOrder[i]).slice(0, 3).join(', '));

// nothing but made-up data in the skill
const files = [];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => e.isDirectory() ? walk(d + '/' + e.name) : files.push(d + '/' + e.name));
walk('quote-request-skill');
ok(!files.some(f => /\.(xlsx|xlsm|xls|csv)$/i.test(f)), 'no spreadsheets kept in the skill');

console.log(`quote request skill: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
