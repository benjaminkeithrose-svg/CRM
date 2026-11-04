// The intake skill (intake-skill/), separate from the app: runs its own
// self-test (made-up data), and checks it reads what Field CRM writes: the
// ticket's kind and fields (inTicket), the call file's and the report's kinds.
import { spawnSync } from 'child_process';
import fs from 'fs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
const S = 'intake-skill/field-crm-intake';

const run = spawnSync('python3', [S + '/scripts/self_test.py'], { encoding: 'utf8' });
const out = String(run.stdout || '') + String(run.stderr || '');
const m = out.match(/Self-test: (\d+) passed, (\d+) failed/);
if (!m && /ENOENT/.test(String(run.error || ''))) console.log('  (skipped: python3 is not available here)');
else {
  ok(m && run.status === 0 && +m[2] === 0, 'skill self-test: ' + out.trim().split('\n').slice(-4).join(' | '));
  ok(m && +m[1] >= 35, 'self-test ran its checks (' + (m ? m[1] : 0) + ')');
}

const app = fs.readFileSync('app.js', 'utf8'), py = fs.readFileSync(S + '/scripts/common.py', 'utf8');
const pyConst = n => (py.match(new RegExp(n + " = '([^']+)'")) || [])[1];
const appKind = (app.match(/\bIN_KIND = '([^']+)'/) || [])[1];
ok(appKind && appKind === pyConst('TICKET_KIND'), 'the ticket kind is the app\'s: ' + appKind);
ok(app.includes("CL_OUT_KIND = '" + pyConst('CALL_KIND') + "'") && app.includes("CL_IN_KIND = '" + pyConst('REPORT_KIND') + "'"), 'the call file and report kinds are the app\'s');
ok(/kind: IN_KIND, v: 1\b/.test(app) && /VERSION = 1\b/.test(py), 'both on version 1');
const body = app.slice(app.indexOf('function inTicket('), app.indexOf('\n}', app.indexOf('function inTicket(')));
const fields = JSON.parse(py.match(/TICKET_FIELDS = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
const missing = fields.filter(f => !new RegExp('\\b' + f + ':').test(body));
ok(fields.length >= 15 && !missing.length, 'every field the skill reads is written by inTicket' + (missing.length ? ': missing ' + missing : ''));
const ex = JSON.parse(fs.readFileSync(S + '/examples/ticket-call.json', 'utf8'));
ok(fields.every(f => f in ex) && Object.keys(ex).every(f => fields.includes(f)), 'the example ticket has exactly those fields');
ok(app.includes("IN_DIR = 'Intake'") && /INTAKE = 'Intake'/.test(py), 'both call the folder Intake');
ok(app.includes("CL_IMPORT_FILE = 'fieldcrm-import.json'") || /CL_IMPORT_FILE\s*=\s*'fieldcrm-import.json'/.test(app), 'Claude\'s report is still fieldcrm-import.json');

// nothing but made-up data
const files = [];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => e.isDirectory() ? walk(d + '/' + e.name) : files.push(d + '/' + e.name));
walk('intake-skill');
ok(!files.some(f => /\.(xlsx|xlsm|xls|csv|ics|zip|m4a|mp3)$/i.test(f)), 'no spreadsheets, calendars, recordings or zips kept in the skill');
ok(files.filter(f => /examples\/.*\.json$/.test(f)).every(f => !/@(?!example\.com)[a-z0-9-]+\.[a-z]/i.test(fs.readFileSync(f, 'utf8'))), 'example emails are all @example.com');

console.log(`intake skill: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
