// The visit planner skill (visit-planner-skill/), separate from the app: runs its
// own self-test (made-up data), and checks its zone map is still the app's.
// If the zone check fails after zones.js changed, regenerate the copy:
//   python3 -c "import re,json;d=json.loads(re.search(r'const ZONE_DATA = (\{.*?\});\s*$',open('zones.js').read(),re.S|re.M).group(1));json.dump(d,open('visit-planner-skill/visit-planner/data/zones.json','w'),ensure_ascii=False,separators=(',',':'))"
import { spawnSync } from 'child_process';
import fs from 'fs';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };

const run = spawnSync('python3', ['visit-planner-skill/visit-planner/scripts/self_test.py'], { encoding: 'utf8' });
const out = String(run.stdout || '') + String(run.stderr || '');
const m = out.match(/Self-test: (\d+) passed, (\d+) failed/);
if (!m && /ENOENT/.test(String(run.error || ''))) console.log('  (skipped: python3 is not available here)');
else {
  ok(m && run.status === 0 && +m[2] === 0, 'skill self-test: ' + out.trim().split('\n').slice(-4).join(' | '));
  ok(m && +m[1] >= 25, 'self-test ran its checks (' + (m ? m[1] : 0) + ')');
}

// the zone map is Field CRM's
const c = {}; vm.createContext(c); vm.runInContext(fs.readFileSync('zones.js', 'utf8') + ';this.Z = ZONE_DATA;', c);
const copy = JSON.parse(fs.readFileSync('visit-planner-skill/visit-planner/data/zones.json', 'utf8'));
ok(JSON.stringify(copy) === JSON.stringify(c.Z), 'data/zones.json is the same as zones.js');

// the cadence days are Field CRM's
const app = fs.readFileSync('app.js', 'utf8'), pw = fs.readFileSync('visit-planner-skill/visit-planner/scripts/plan_week.py', 'utf8');
const days = [...app.match(/const CAD_DAYS = \{([^}]*)\}/)[1].matchAll(/:(\d+)/g)].map(x => x[1]).join();
ok(days === [...pw.match(/CAD = \{([^}]*)\}/)[1].matchAll(/, (\d+)\)/g)].map(x => x[1]).join(), 'cadence days match CAD_DAYS: ' + days);

// nothing but made-up data
const files = [];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => e.isDirectory() ? walk(d + '/' + e.name) : files.push(d + '/' + e.name));
walk('visit-planner-skill');
ok(!files.some(f => /\.(xlsx|xlsm|xls|csv|ics)$/i.test(f)), 'no spreadsheets or calendar files kept in the skill');
ok(!fs.readFileSync('visit-planner-skill/visit-planner/examples/site-visit.json', 'utf8').includes('"uid"'), 'the examples carry no uid (the self-test works on copies)');

console.log(`visit planner skill: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
