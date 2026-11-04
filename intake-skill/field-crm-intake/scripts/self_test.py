#!/usr/bin/env python3
"""Check the intake end to end, with made-up data only.

    python3 self_test.py

Lays out a PC folder in a temporary place as Field CRM v193 leaves it (a
call and a quote request filed, a ticket each in Intake), then lists the
tickets and their jobs, turns the call into a quote request, makes the email
drafts, moves a ticket to Done with what was done, a ticket coming again,
and the review page. The last line says how many checks passed. Nothing is
left behind.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EX = os.path.join(ROOT, 'examples')
sys.path.insert(0, HERE)
passed, failed = 0, []


def ok(cond, what):
    global passed
    if cond:
        passed += 1
    else:
        failed.append(what)


def lay_out(tmp):
    """The PC folder as Field CRM leaves it."""
    import common
    intake = os.path.join(tmp, 'Intake')
    os.makedirs(intake)
    shutil.copy(os.path.join(EX, 'intake settings.json'), os.path.join(intake, common.SETTINGS_NAME))
    names = {}
    for fn in ('ticket-call.json', 'ticket-quote.json'):
        t = common.read_json(os.path.join(EX, fn))
        name = '%s %s (%s).json' % (t['date'], t['customer'], t['callId'][-5:])
        names[fn] = name
        common.write_json(os.path.join(intake, name), t)
        vd = common.visit_dir(tmp, t)
        os.makedirs(os.path.join(vd, 'from Field CRM'))
        shutil.copy(os.path.join(EX, 'Field CRM call.json'), os.path.join(vd, 'Field CRM call.json'))
        with open(os.path.join(vd, t['files']['notes']), 'w', encoding='utf-8') as f:
            f.write('<html><body>Field CRM document</body></html>')
        for p in ('Belt 1 CV-200 - 1.jpg', 'Additional - 1.jpg'):
            with open(os.path.join(vd, 'from Field CRM', p), 'wb') as f:
                f.write(b'\xff\xd8\xff\xe0 made-up')
    vd = common.visit_dir(tmp, common.read_json(os.path.join(EX, 'ticket-call.json')))
    for n in ('Plaud 2026-11-03.m4a', 'IMG_4101.jpg'):
        open(os.path.join(vd, n), 'wb').close()
    with open(os.path.join(intake, 'not a ticket.json'), 'w') as f:
        json.dump({'kind': 'something-else'}, f)
    return names


def main():
    tmp = tempfile.mkdtemp(prefix='intake-test-')
    try:
        import common
        import list_tickets
        import to_quote
        import draft_email
        import done
        import review
        names = lay_out(tmp)
        call_t, quote_t = names['ticket-call.json'], names['ticket-quote.json']

        # the PC folder, given it or its Intake folder
        ok(common.pc_folder(os.path.join(tmp, 'Intake')) == tmp and common.pc_folder(tmp) == tmp, 'the PC folder, from it or from Intake')

        # what is waiting
        rows = list_tickets.tickets(tmp)
        ok([r['ticket'] for r in rows] == [call_t, quote_t], 'both tickets, oldest first, the stray file left out: ' + str([r['ticket'] for r in rows]))
        c, q = rows
        ok(not c['problems'] and c['call_file'] and c['notes_file'] and c['belts'] == 1 and c['notes'] == 1 and c['photos'] == 2,
           'the call: its folder, Field CRM\'s files, a belt, a note, two photos: ' + str(c['problems']))
        ok(c['recordings'] == ['Plaud 2026-11-03.m4a'] and c['other_photos'] == ['IMG_4101.jpg'], 'the recording and the camera roll photo in the folder')
        ok(c['jobs'] == ['report', 'quote_ask', 'customer_email', 'follow_ups', 'projects'], 'the call\'s jobs: ' + str(c['jobs']))
        ok(c['projects'][0]['project'] == 'Spiral upgrade', 'the project, kept for Dynamics')
        ok(q['quote'] and q['jobs'] == ['quote_email'] and q['notes_file'].endswith('_belt_RFQ.html'), 'the quote request: email it to customer service: ' + str(q['jobs']))
        p = subprocess.run([sys.executable, os.path.join(HERE, 'list_tickets.py'), '--root', tmp], capture_output=True, text=True)
        ok(p.returncode == 0 and '2 in the intake' in p.stdout and 'call report (end-game skill)' in p.stdout and 'Next step: Send the CV-200 belt quote, by 2026-11-07' in p.stdout,
           'the command line lists them')

        # a report already made, newer than the ticket: no report job
        vd = c['folder']
        common.write_json(os.path.join(vd, 'fieldcrm-import.json'), {'kind': common.REPORT_KIND, 'v': 1, 'made': c['made'] + 1, 'callId': c['callId']})
        ok('report' not in list_tickets.tickets(tmp)[0]['jobs'], 'a report newer than the ticket: no report to make')
        common.write_json(os.path.join(vd, 'fieldcrm-import.json'), {'kind': common.REPORT_KIND, 'v': 1, 'made': c['made'] - 1, 'callId': c['callId']})
        ok('report' in list_tickets.tickets(tmp)[0]['jobs'], 'an older report (the call changed since): make it again')
        os.remove(os.path.join(vd, 'fieldcrm-import.json'))

        # a ticket of a newer version is not guessed at
        t = common.read_json(c['path']); t['v'] = 2
        common.write_json(os.path.join(tmp, 'Intake', 'zz newer.json'), t)
        r = [x for x in list_tickets.tickets(tmp) if x['ticket'] == 'zz newer.json'][0]
        ok(r['problems'] and 'update the skill' in r['problems'][0] and not r['jobs'], 'a newer ticket version: update the skill, no jobs')
        os.remove(os.path.join(tmp, 'Intake', 'zz newer.json'))

        # the call as a quote request
        req = to_quote.build(c['call_file'])
        b = req['belts'][0]
        ok(req['template'] == 'belt-quote' and req['customer'] == 'Example Foods - Smithfield' and req['date'] == '2026-11-03' and req['account_manager'] == 'Jo Bloggs',
           'the request: template, customer, date, account manager')
        ok(b['asset'] == 'CV-200' and b['series'] == '800' and b['width'] == 610 and b['field_crm_ref'] == 0 and 'type' not in b and 'acc' not in b and 'tsg' not in b,
           'the belt keeps Field CRM\'s field names, without its bookkeeping: ' + str(sorted(b)))
        ok(b['accessories'] == [{'desc': 'Snap-on wearstrip, 500 ft, for a 1/4 in frame', 'part_number': 'EX-W5', 'qty': 2, 'note': 'Carryway'}], 'its accessories, as the quote request skill reads them')
        ok(req['photos'][b['photos'][0]]['file'] == 'from Field CRM/Belt 1 CV-200 - 1.jpg' and os.path.exists(os.path.join(vd, req['photos']['p1']['file'])),
           'its photo, beside the call file')
        ok([x['name'] for x in req['contacts']] == ['Pat Example', 'Sam Example'] and req['contacts'][1]['in_crm'] is False and 'email' not in req['contacts'][1],
           'the contacts, with in_crm, empty fields left out')
        ok(req['notes'] == [{'topic': 'Other', 'text': 'Shutdown planned for the week of 1 December.'}], 'the call\'s notes')
        p = subprocess.run([sys.executable, os.path.join(HERE, 'to_quote.py'), c['call_file'], '--belts', '5'], capture_output=True, text=True)
        ok(p.returncode != 0 and 'nothing to quote' in (p.stderr + p.stdout), 'no belt with that ref: says so')

        # the email drafts
        out, d = draft_email.build(tmp, quote_t, 'quote')
        ok(d['to'] == ['quotes@example.com'] and d['subject'] == 'Quote request: Example Foods - Smithfield (3 November 2026)' and not d['send'],
           'the quote email: to customer service, its subject, never sent')
        ok(len(d['attachments']) == 1 and d['attachments'][0].endswith('_belt_RFQ.html') and not d['warnings'], 'Field CRM\'s quote request attached')
        ok('Jo Bloggs<br>Account Manager' in d['body_html'] and 'style=' in d['body_html'] and 'class=' not in d['body_html'], 'inline styles only, with the signature')
        out, d = draft_email.build(tmp, call_t, 'customer')
        ok(d['to'] == ['pat@example.com'] and d['subject'] == 'Our visit on 3 November 2026: Example Foods - Smithfield' and 'Hi Pat,' in d['body_text'],
           'the customer email: the contacts ticked for documents, greeted by name')
        ok(any('no customer copy' in w for w in d['warnings']) and not d['attachments'], 'no customer copy yet: says so, attaches nothing')
        with open(os.path.join(vd, 'Example Foods - Smithfield - Site walk report - 2026-11-03.html'), 'w') as f:
            f.write('<html></html>')
        d0 = common.read_json(out); d0['outlook_id'] = 'AAMkExample1'; common.write_json(out, d0)
        out2, d = draft_email.build(tmp, call_t, 'customer', body='Hi Pat,\n\nThanks for the walk.\n\n- CV-200 rods\n- Spiral measure')
        ok(out2 == out and d['outlook_id'] == 'AAMkExample1' and d['attachments'][0].endswith('Site walk report - 2026-11-03.html'),
           'made again: the same draft (its Outlook id kept), now with the customer copy')
        ok('<ul' in d['body_html'] and '<li style="margin:0 0 4px">CV-200 rods</li>' in d['body_html'], 'a list in the body stays a list')

        # done: moved, with what was done
        h = common.read_json(os.path.join(EX, 'handled.json'))
        dest, moved = done.move(tmp, call_t, h)
        dt_ = common.read_json(dest)
        ok(moved and not os.path.exists(os.path.join(tmp, 'Intake', call_t)) and os.path.dirname(dest).endswith(os.path.join('Intake', 'Done')), 'moved to Intake\\Done')
        ok(dt_['callId'] == 'c-example-1' and dt_['steps'] and dt_['handled']['drafts'][0]['outlook_id'] == 'AAMkExample1' and dt_['handled']['at'] and
           dt_['handled']['kind'] == common.HANDLED_KIND, 'the ticket keeps everything, and gains what was done')
        ok(os.path.isdir(vd) and os.path.exists(os.path.join(vd, 'Field CRM call.json')), 'the visit folder is left as it is')

        # the same call again (changed in Field CRM)
        t = common.read_json(os.path.join(EX, 'ticket-call.json')); t['again'] = True; t['made'] += 1000
        common.write_json(os.path.join(tmp, 'Intake', call_t), t)
        r = list_tickets.tickets(tmp)
        ok(any(x['ticket'] == call_t and x['again'] for x in r), 'it comes again, marked as changed')
        dest, moved = done.move(tmp, call_t, {'made': ['fieldcrm-import.json'], 'note': 'second pass'})
        dt_ = common.read_json(dest)
        ok(moved and dt_['handled'].get('note') == 'second pass' and len(dt_.get('handled_before', [])) == 1 and dt_['handled_before'][0]['drafts'],
           'done again: the first time kept under handled_before')
        # a newer ticket arriving while one is worked on stays
        common.write_json(os.path.join(tmp, 'Intake', quote_t), dict(common.read_json(os.path.join(tmp, 'Intake', quote_t))))
        work = common.read_json(os.path.join(tmp, 'Intake', quote_t))
        newer = dict(work, made=work['made'] + 5000)
        orig_read = common.read_json
        calls = {'n': 0}

        def read_then_newer(path):
            calls['n'] += 1
            if path.endswith(quote_t) and 'Done' not in path and calls['n'] > 1:
                return newer
            return orig_read(path)
        common.read_json = read_then_newer
        try:
            dest, moved = done.move(tmp, quote_t, {'drafts': [{'kind': 'quote', 'subject': 'x', 'to': ['quotes@example.com']}]})
        finally:
            common.read_json = orig_read
        ok(not moved and os.path.exists(os.path.join(tmp, 'Intake', quote_t)), 'a newer ticket that came in meanwhile stays in the intake')

        # the review page
        day = dt_['handled']['at'][:10]
        doc, n, w = review.page(tmp, day)
        ok(n == 2 and w == 1, 'review: two handled today, one waiting: %d, %d' % (n, w))
        for k in ('Nothing has been sent', 'draft, not sent', 'Bring in from Claude', 'Spiral upgrade', 'file:'):
            ok(k in doc, 'the review page has: ' + k)
        ok('class=' not in doc and '@page{size:A4' in doc, 'inline styles, A4')
        p = subprocess.run([sys.executable, os.path.join(HERE, 'review.py'), '--root', tmp, '--date', day], capture_output=True, text=True)
        ok(p.returncode == 0 and os.path.exists(os.path.join(tmp, 'Intake', 'Review ' + day + '.html')), 'the command line writes Intake\\Review <date>.html')
        p = subprocess.run([sys.executable, os.path.join(HERE, 'check_setup.py'), '--root', tmp], capture_output=True, text=True)
        ok(p.returncode == 0 and 'quotes@example.com' in p.stdout and 'Ready.' in p.stdout, 'check_setup reads the settings')
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
