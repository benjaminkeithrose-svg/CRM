#!/usr/bin/env python3
"""Check the quote request skill end to end, with made-up data only.

    python3 self_test.py

Makes a made-up plant audit workbook in a temporary quote requests folder,
reads the catalogue from it, runs the lookups, draws both examples, tries a
change for one request and a template of your own, and checks what comes out.
The last line says how many checks passed. Nothing is left behind.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

passed, failed = 0, []


def ok(cond, what):
    global passed
    if cond:
        passed += 1
    else:
        failed.append(what)


def run(*args):
    p = subprocess.run([sys.executable] + list(args), capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


def main():
    tmp = tempfile.mkdtemp(prefix='quote-request-test-')
    try:
        import example_workbook
        import catalogue
        import lookup
        import build_request
        import common

        wb = example_workbook.build(tmp)
        with open(os.path.join(tmp, common.SETTINGS_NAME), 'w', encoding='utf-8') as f:
            json.dump({'workbook': os.path.basename(wb), 'out': 'requests'}, f)
        s = common.settings(tmp)
        ok(s['workbook'] == wb and s['catalogue'].endswith('belt-catalogue.json'), 'settings resolve beside the settings file')

        # the catalogue, read as Field CRM reads it
        c = catalogue.load(s['workbook'], s['catalogue'])
        ok(c['counts'] == {'combos': 10, 'geom': 4, 'sprockets': 18, 'series': 2}, 'catalogue counts: %s' % c['counts'])
        ok(c['pitch'] == {'100': 25.4, '200': 50.8}, 'pitch per series')
        ok(c['indentGroups'] == [['FLAT TOP', ['25', '38']], ['FRICTION TOP', ['50']]], 'indent groups')
        ok(sorted(c['rods']) == ['ACETAL', 'NYLON', 'POLYPROPYLENE'], 'rod materials')
        ok(os.path.exists(s['catalogue']), 'catalogue cached')
        c2 = catalogue.load(s['workbook'], s['catalogue'])
        ok(c2['read_at'] == c['read_at'], 'cache used while the workbook is unchanged')

        cat = lookup.Cat(c)
        ok(cat.ser('S100')[0] == '100' and cat.ser('Series 200')[0] == '200', 'series named loosely')
        ok(cat.ser('300')[0] is None and cat.ser('300')[1], 'unknown series gives the nearest')
        ok(lookup.pick('flat top', cat.styles('100'))[0] == 'FLAT TOP', 'style matched loosely')
        ok(lookup.pick('polyprop', cat.materials('100', 'FLAT TOP'))[0] == 'POLYPROPYLENE', 'material by part of its name')
        w = cat.width('100', 'FLAT TOP', 'POLYPROPYLENE', 600)
        ok(w and not w['standard'] and (w['lower'], w['upper']) == (559, 610), 'width check off-increment: %s' % w)
        ok(cat.width('100', 'FLAT TOP', 'POLYPROPYLENE', 609.6)['standard'], 'width check on-increment')
        ok(cat.width('100', 'FLUSH GRID', 'ACETAL', 600) is None, 'no geometry: cannot check')
        w2 = cat.width('200', 'RAISED RIB', 'POLYETHYLENE', 618)
        ok(w2 and not w2['standard'] and (w2['lower'], w2['upper']) == (616, 819), 'width check, two-link steps and edges: %s' % w2)
        ok(cat.width('200', 'RAISED RIB', 'POLYETHYLENE', 615.6)['standard'], 'width check, built width with edges')

        # the lookup command line, as Claude runs it
        code, out = run(os.path.join(HERE, 'lookup.py'), '--settings', tmp, 'belt', '--series', '100', '--style', 'flat top',
                        '--material', 'acetal', '--colour', 'green', '--width', '600')
        ok(code == 0 and 'not among the colours on file' in out and 'Nearest built: 559 mm or 610 mm' in out, 'lookup belt: ' + out[-200:])
        code, out = run(os.path.join(HERE, 'lookup.py'), 'sprockets', '--series', '100', '--settings', tmp, '--bore', '40mm sq',
                        '--pd', '5.1 in 16t', '--material', 'acetal', '--json')
        rows = json.loads(out)['rows'] if code == 0 else []
        ok([r['part_number'] for r in rows] == ['EX-100-0013', 'EX-100-0014'], 'lookup sprockets narrowed: %s' % out[-200:])
        code, out = run(os.path.join(HERE, 'lookup.py'), '--settings', tmp, 'styles', '--series', '300')
        ok(code == 2 and 'Nearest' in out, 'lookup refuses an unknown series')
        code, out = run(os.path.join(HERE, 'lookup.py'), '--settings', tmp, 'part', 'ex-200-0018')
        ok(code == 0 and '8.0 IN 12T' in out, 'lookup by part number')

        # the examples, drawn into the folder
        ex = os.path.join(ROOT, 'examples')
        res = build_request.build(os.path.join(ex, 'example-belt-request.json'), s)
        page = open(res['files']['file'], encoding='utf-8').read()
        mail = open(res['files']['email'], encoding='utf-8').read()
        text = open(res['files']['text'], encoding='utf-8').read()
        ok(os.path.dirname(res['files']['file']) == os.path.join(tmp, 'requests'), 'written to the settings\' out folder')
        ok('Belt request for quote' in page and 'data:image/png;base64' in page and 'data:image/jpeg;base64' in page, 'file has the logo and the photo')
        ok('confirmed with TSG' not in page and 'Needs adding to Dynamics' in page, 'no TSG line when not confirmed; CRM flag')
        ok('<th class="grp" colspan="2">Pat Example</th>' in page and '<th>Role</th>' not in page, 'contacts one under another')
        ok('<style' not in mail and 'class=' not in mail and '<img' not in mail, 'email body: inline styles, no pictures')
        ok('1 photo is in the attached request file' in mail, 'email says where the photo is')
        ok('Belt width (mm): 600' in text and 'TO CONFIRM' in text, 'plain text copy')
        ok(res['missing'] == [] and not res['warnings'], 'belt example complete: %s %s' % (res['missing'], res['warnings']))
        i_qty, i_series = page.find('>Quantity<'), page.find('>Series<')
        ok(0 < i_qty < i_series, 'quantity leads the belt fields, as in Field CRM')

        res = build_request.build(os.path.join(ex, 'example-sprocket-request.json'), s)
        page = open(res['files']['file'], encoding='utf-8').read()
        ok('Sprocket and parts request for quote' in page and 'EX-200-0018' in page and 'Wear strip' in page, 'sprocket example')
        ok(page.find('Delivery address') > page.find('Site or area') > 0 and 'Photos from the customer' not in page, 'one-off changes applied')

        # a request with gaps, and changes of every kind
        req = {'template': 'belt-quote', 'customer': 'Example Foods', 'date': '2026-11-02', 'in_crm': False,
               'belts': [{'qty': 2, 'series': '100', 'style': 'FLAT TOP', 'splice': 'Hinged', 'retrofit': 'Yes',
                          'other': {'Old belt': 'Brand X'}}],
               'changes': {'hide': ['Belt: Retrofit', 'Notes'], 'rename': {'Belts to quote': 'Belts wanted'},
                           'require': ['Colour'], 'add_fields': [{'group': 'Belt', 'label': 'Splice type', 'key': 'splice', 'after': 'Rod material'}],
                           'sections': [{'heading': 'Delivery', 'rows': [['Address', '1 Example Street']]}],
                           'title': 'Belt quote', 'footer': ''}}
        rp = os.path.join(tmp, 'gaps.json')
        with open(rp, 'w', encoding='utf-8') as f:
            json.dump(req, f)
        res = build_request.build(rp, s)
        page = open(res['files']['file'], encoding='utf-8').read()
        ok('Belt 1: Colour' in res['missing'] and 'Belt 1: Belt width (mm)' in res['missing'] and 'Site or area' in res['missing'],
           'required fields not given are listed: %s' % res['missing'])
        ok('Not in CRM' in page, 'account not in the CRM is flagged')
        ok('Retrofit' not in page and 'Belts wanted' in page and 'Belt quote' in page, 'hide, rename and title')
        ok(page.find('Splice type') > page.find('Rod material') > 0 and 'Hinged' in page, 'added field, after the named one')
        ok('Old belt' in page and 'Brand X' in page, 'an item\'s own extra rows')
        ok(page.find('>Delivery<') > page.find('Belts wanted') > 0 and 'class="ft"' not in page, 'extra section placed, footer removed')
        req['changes'] = {'hide': ['Nonsense field']}
        with open(rp, 'w', encoding='utf-8') as f:
            json.dump(req, f)
        ok(any('Nonsense field' in w for w in build_request.build(rp, s)['warnings']), 'a change naming nothing is warned about')

        # a template of their own wins over the built-in one
        os.makedirs(s['templates'], exist_ok=True)
        t = json.load(open(os.path.join(ROOT, 'templates', 'belt-quote.json'), encoding='utf-8'))
        t['title'] = 'Our belt request'
        with open(os.path.join(s['templates'], 'belt-quote.json'), 'w', encoding='utf-8') as f:
            json.dump(t, f)
        res = build_request.build(os.path.join(ex, 'example-belt-request.json'), s)
        ok(res['template'].startswith(s['templates']) and 'Our belt request' in open(res['files']['file'], encoding='utf-8').read(),
           'own template copy wins')
        code, out = run(os.path.join(HERE, 'build_request.py'), '--list-templates', '--settings', tmp)
        ok(code == 0 and 'your own copy' in out and 'sprocket-quote' in out, 'templates listed')

        # the accessories: Field CRM's OneTrack list, made up here
        al = os.path.join(tmp, 'accessories.json')
        with open(al, 'w', encoding='utf-8') as f:
            json.dump({'kind': 'field-crm-accessories', 'version': 1, 'source': 'Made-up list',
                       'groups': [{'id': 'wearstrip', 'name': 'Wearstrip', 'fields': ['Type', 'Frame size'], 'defaults': {'Type': 'Snap-on', 'Frame size': '1/4 in'}},
                                  {'id': 'tool', 'name': 'Tool', 'fields': ['Type', 'For']}],
                       'items': [{'group': 'wearstrip', 'desc': 'Snap-on wearstrip, 1/4 in frame', 'opts': {'Type': 'Snap-on', 'Frame size': '1/4 in'}, 'item': 'EX-W5'},
                                 {'group': 'tool', 'desc': '3-link belt puller set', 'opts': {'Type': 'Belt puller', 'For': '3-link'}, 'item': 'EX-T1', 'series': ['100']},
                                 {'group': 'tool', 'desc': '5-link belt puller set', 'opts': {'Type': 'Belt puller', 'For': '5-link'}, 'item': 'EX-T2', 'series': ['200']}]}, f)
        code, out = run(os.path.join(HERE, 'lookup.py'), '--settings', tmp, '--accessories', al, 'accessories')
        ok(code == 0 and 'usual: Type Snap-on, Frame size 1/4 in' in out, 'accessory groups, with the usual wearstrip: ' + out[-160:])
        code, out = run(os.path.join(HERE, 'lookup.py'), '--settings', tmp, '--accessories', al, 'accessories', '--group', 'tool', '--series', 'S100')
        ok(code == 0 and 'EX-T1' in out and 'EX-T2' not in out, 'accessories for a series: ' + out[-160:])
        os.remove(os.path.join(s['templates'], 'belt-quote.json'))   # the built-in template again
        res = build_request.build(os.path.join(ex, 'example-belt-request.json'), s)
        page = open(res['files']['file'], encoding='utf-8').read()
        ok('<th class="grp" colspan="2">Accessories</th>' in page and 'Qty 2 \u00b7 EX-W5 \u00b7 Carryway, both sides' in page, 'a belt\'s accessories print as a band')

        # the built-in templates match each other's shape
        for fn in os.listdir(os.path.join(ROOT, 'templates')):
            tt = json.load(open(os.path.join(ROOT, 'templates', fn), encoding='utf-8'))
            ok(tt.get('id') + '.json' == fn and tt.get('sections'), 'template %s is well formed' % fn)
    except Exception as ex:
        import traceback
        failed.append('crashed: ' + ''.join(traceback.format_exception_only(type(ex), ex)).strip())
        traceback.print_exc()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    for f in failed:
        print('  x ' + f)
    print('Self-test: %d passed, %d failed' % (passed, len(failed)))
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
