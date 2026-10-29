#!/usr/bin/env python3
"""Check the end-game tools work on this computer, using the made-up test visit.

    python3 scripts/self_test.py

It finds the test visit's customer in the made-up CRM export, lines up the
recording and the photos, checks each result is what it should be, then draws
the example's two documents (HTML and, if it can, PDF) into a folder called
self-test-output next to this skill. Nothing else is touched.
"""
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VISIT = os.path.join(ROOT, 'test-visit')
OUT = os.path.join(ROOT, 'self-test-output')

EXPECT_CONVEYORS = ['CV-100', 'CV-200', 'CV-300']
EXPECT_PHOTOS = {  # file: (conveyor or project, confidence)
    'IMG_4101.jpg': ('CV-100', 'high'),
    'IMG_4102.jpg': ('CV-200', 'high'),
    'IMG_4103.jpg': ('CV-200', 'high'),
    'IMG_4104.jpg': ('CV-300', 'high'),
    'IMG_4105.jpg': ('project: new packing line', 'low'),
}

fails = []


def check(ok, what):
    print(('  ok    ' if ok else '  FAIL  ') + what)
    if not ok:
        fails.append(what)


def run(args):
    p = subprocess.run([sys.executable] + args, capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)

    print('1. Reading the call Field CRM saved (fieldcrm_call.py)')
    code, out = run([os.path.join(HERE, 'fieldcrm_call.py'), os.path.join(VISIT, 'Field CRM call.json'), '--json'])
    try:
        fc = json.loads(out)
    except ValueError:
        fc = {}
        print(out)
    check(fc.get('call_id') == 'c1793299000000' and fc.get('customer') == 'Example Foods - Smithfield', 'the call and its CRM account')
    check(len(fc.get('belts', [])) == 1 and fc['belts'][0].get('ref') == 0 and fc['belts'][0].get('asset') == 'CV-200', 'its belt, with its place in the call (ref 0)')

    print('2. Collecting the visit\'s photos by time (collect_photos.py)')
    for margin, expect in (('30', 4), ('600', 5)):
        dest = os.path.join(OUT, 'photos-' + margin)
        code, out = run([os.path.join(HERE, 'collect_photos.py'), '--from', os.path.join(VISIT, 'photos'), '--start', '2026-10-29 09:00',
                         '--minutes', '9.5', '--margin', margin, '--to', dest])
        got = len(os.listdir(dest)) if os.path.isdir(dest) else 0
        check(code == 0 and got == expect, '%s s either side: %d photos (expected %d)' % (margin, got, expect))

    print('3. Finding the customer without a Field CRM call (find_customer.py)')
    code, out = run([os.path.join(HERE, 'find_customer.py'), os.path.join(VISIT, 'crm-export-example.txt'),
                     '--name', 'example foods', '--site', 'smithfield', '--people', 'Jo Bloggs', '--top', '3'])
    best = re.search(r'Best matches:\s*\n\s*\n\s*(.+?)\s{3}score', out)
    check(code == 0 and best and best.group(1) == 'Example Foods - Smithfield',
          'best match: ' + (best.group(1) if best else 'none') + ' (expected Example Foods - Smithfield)')
    if code != 0:
        print(out)

    print('4. Lining up the test visit (walk_timeline.py)')
    tl_path = os.path.join(OUT, 'timeline.json')
    code, out = run([os.path.join(HERE, 'walk_timeline.py'), '--transcript', os.path.join(VISIT, 'transcript.txt'),
                     '--start', '2026-10-29 09:00:00', '--photos', os.path.join(VISIT, 'photos'), '--out', tl_path])
    check(code == 0 and os.path.exists(tl_path), 'timeline.json written')
    if code != 0:
        print(out)
    else:
        tl = json.load(open(tl_path, encoding='utf-8'))
        check([c['conveyor'] for c in tl['conveyors']] == EXPECT_CONVEYORS,
              'conveyors found: ' + ', '.join(c['conveyor'] for c in tl['conveyors']))
        got = {p['file']: p for p in tl['photos']}
        for f, (cv, conf) in EXPECT_PHOTOS.items():
            p = got.get(f)
            if not p:
                check(False, f + ' not found')
                continue
            where = p['conveyor'] or ('project: ' + p['project'] if p.get('project') else '-')
            check(where == cv and p['confidence'] == conf,
                  '%s -> %s, %s (expected %s, %s)%s' % (f, where, p['confidence'], cv, conf,
                                                       '' if p['note'] != 'time from the file date, not the photo'
                                                       else '  [photo time not read: is Pillow installed?]'))

    print('5. Drawing the example (build_report.py)')
    code, out = run([os.path.join(HERE, 'build_report.py'), os.path.join(ROOT, 'examples', 'example-report.json'), '--out', OUT])
    check('WARNING' not in out, 'every photo found and placed')
    for doc, words_in, words_out in (
            ('Site walk notes', ['Needs adding to Dynamics', 'Internal notes', 'not yet confirmed with TSG', 'Belts to quote'], []),
            ('Site walk report', ['Belts to quote', 'Second packing line'], ['Internal notes', '400k', 'Dynamics', 'confirmed with TSG', 'jo.bloggs@'])):
        base = os.path.join(OUT, 'Example Foods - Smithfield - ' + doc + ' - 2026-10-29')
        ok = code == 0 and os.path.exists(base + '.html')
        check(ok, doc + ': HTML made')
        if ok:
            text = open(base + '.html', encoding='utf-8').read()
            for w in words_in:
                check(w in text, doc + ': has "' + w + '"')
            for w in words_out:
                check(w not in text, doc + ': leaves out "' + w + '"')
        if os.path.exists(base + '.pdf'):
            engine = out.split(base + '.pdf  (made with ')[-1].split(')')[0] if base + '.pdf  (made with ' in out else '?'
            check(True, doc + ': PDF made (with ' + engine + ')')
        else:
            print('  --    ' + doc + ': PDF not made here: run "pip install reportlab", or use Save as PDF from the browser')
    if code != 0:
        print(out)

    print('6. The file for Field CRM (make_import.py)')
    code, out = run([os.path.join(HERE, 'make_import.py'), os.path.join(ROOT, 'examples', 'example-report.json'), '--out', OUT])
    imp_path = os.path.join(OUT, 'fieldcrm-import.json')
    check(code == 0 and os.path.exists(imp_path), 'fieldcrm-import.json written')
    if code != 0:
        print(out)
    else:
        imp = json.load(open(imp_path, encoding='utf-8'))
        check(imp.get('kind') == 'field-crm-claude-report' and imp.get('v') == 1 and imp.get('callId') == 'c1793299000000', 'for Field CRM, version 1, for the right call')
        check(len(imp['belts']) == 1 and imp['belts'][0].get('ref') == 0 and imp['belts'][0].get('width') == '457', 'the belt goes back to its place in the call, with the width from the walk')
        check(len(imp['photos']) == 5 and all(p['data'].startswith('data:image/') for p in imp['photos'].values()), '5 photos inside the file')
        check(sum(1 for f in imp['follow_ups'] if f.get('task') is True) == 2, 'two follow-ups become next steps')
        check('data:image/jpeg' not in imp['documents']['internal'] and 'Internal notes' in imp['documents']['internal']
              and 'Internal notes' not in imp['documents']['customer'], 'the documents kept with the call: no photos inside, nothing internal in the customer copy')
        if 'WARNING' in out:
            check(False, 'every photo found: ' + out.strip().splitlines()[-1])

    print()
    if fails:
        print('Self-test FAILED: %d problem(s) above. See DOCUMENTATION.md, "Troubleshooting".' % len(fails))
        sys.exit(1)
    print('Self-test passed. Open the files in ' + OUT + ' and compare them with examples/.')


if __name__ == '__main__':
    main()
