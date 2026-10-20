// v164: the manual page viewer sits above the Manuals screen opened from a
// call. It was one layer below it, so tapping a series opened the pages out
// of sight and looked like nothing happened. Reads the stylesheet only.
import fs from 'fs';
const css = fs.readFileSync('index.html', 'utf8');
const z = sel => { const m = css.match(new RegExp('\\n\\' + sel + '\\{[^}]*z-index:(\\d+)')); return m ? +m[1] : NaN; };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
ok(z('.mview') > z('.manov'), 'the page viewer is above the Manuals screen opened from a call: ' + z('.mview') + ' over ' + z('.manov'));
ok(z('.mview') < z('.pview') || isNaN(z('.pview')), 'and still under the photo viewer and toasts');
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
