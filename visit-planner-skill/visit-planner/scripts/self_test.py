#!/usr/bin/env python3
"""Check the visit planner end to end, with made-up data only.

    python3 self_test.py

Makes a visits folder in a temporary place with the examples, makes each
meeting, checks the calendar files and the events for the Outlook connection,
a change raising the sequence, an invite only when asked, the week plan from
the made-up CRM export, and a template of your own. The last line says how
many checks passed. Nothing is left behind.
"""
import datetime as dt
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


def main():
    tmp = tempfile.mkdtemp(prefix='visit-planner-test-')
    try:
        import common
        import make_meeting
        import plan_week
        ex = os.path.join(ROOT, 'examples')
        os.makedirs(os.path.join(tmp, 'meetings'))
        for fn in ('site-visit.json', 'health-check.json', 'teams-call.json'):
            shutil.copy(os.path.join(ex, fn), os.path.join(tmp, 'meetings', fn))
        with open(os.path.join(tmp, common.SETTINGS_NAME), 'w', encoding='utf-8') as f:
            json.dump({'me': 'Jo Bloggs', 'email': 'jo@example.com', 'crm_export': os.path.join(ex, 'crm-export-example.txt'), 'home_tz': 'Australia/Perth'}, f)
        s = common.settings(tmp)
        M = lambda n: os.path.join(tmp, 'meetings', n + '.json')

        # zones, as Field CRM finds them
        ok(common.zone_of('Example Foods - Smithfield') == 'Z1' and common.zone_of('Example Snacks - Brisbane') == 'Z13', 'zones from the site')
        ok(common.zone_of('No site here') == 'Z12' and common.zone_info('Z25')['tz'] == 'Pacific/Auckland', 'no site: unconfirmed; NZ has its own time')

        # a site visit: own appointment, nobody emailed
        r = make_meeting.build(M('site-visit'), s)
        cal = open(r['file'], encoding='utf-8', newline='').read()
        e = r['event']
        ok(os.path.basename(r['file']) == '2026-11-10 Site visit - Example Foods.ics', 'file named by day, kind and customer: ' + os.path.basename(r['file']))
        ok('DTSTART;TZID=Australia/Sydney:20261110T100000' in cal and 'DTEND;TZID=Australia/Sydney:20261110T113000' in cal, 'Sydney time, 90 minutes')
        ok('BEGIN:VTIMEZONE' in cal and 'TZID:Australia/Sydney' in cal and 'AEDT' in cal, 'its time zone rules go with it')
        ok('ORGANIZER' not in cal and 'ATTENDEE' not in cal, 'no organiser or attendees in the file')
        ok('X-MICROSOFT-CDO-BUSYSTATUS:OOF' in cal and 'SUMMARY:Site visit: Example Foods - Smithfield' in cal, 'out of office, Field CRM\'s subject')
        ok(all(len(l.encode('utf-8')) <= 75 for l in cal.split('\r\n')) and '\r\n' in cal, 'lines folded at 75 octets, CRLF')
        ok('Send the belt quote for Conveyor 4' in e['body_html'] and 'Pat Example' in e['body_html'] and 'Z1 Sydney Metro' in e['body_text'], 'agenda, follow-ups, people and zone in the body')
        ok(not e['invite'] and e['attendees'] == [] and e['show_as'] == 'oof', 'event for Outlook: no attendees')
        ok(e['start']['windowsTimeZone'] == 'AUS Eastern Standard Time' and e['start']['dateTime'] == '2026-11-10T10:00:00', 'event times with both zone names')
        ok(r['sequence'] == 0 and json.load(open(M('site-visit'))).get('uid'), 'a uid is written back')
        r2 = make_meeting.build(M('site-visit'), s)
        ok(r2['sequence'] == 0 and r2['event']['uid'] == e['uid'], 'made again unchanged: the same version')
        m = json.load(open(M('site-visit'))); m['start'] = '11:00'; json.dump(m, open(M('site-visit'), 'w'))
        r3 = make_meeting.build(M('site-visit'), s)
        cal3 = open(r3['file'], encoding='utf-8').read()
        ok(r3['sequence'] == 1 and r3['event']['uid'] == e['uid'] and 'SEQUENCE:1' in cal3 and 'T110000' in cal3, 'moved: same uid, sequence up, so it replaces the old one')

        # a health check, invite asked for
        r = make_meeting.build(M('health-check'), s)
        cal = open(r['file'], encoding='utf-8').read()
        ok(r['event']['invite'] and [a['email'] for a in r['event']['attendees']] == ['sam@example.com'], 'invite: the contacts become attendees for Outlook')
        ok('ATTENDEE' not in cal, 'but never in the calendar file')
        ok('Belt replacement ruler' in r['event']['body_text'] and 'Spiral to cold store' in r['event']['body_text'] and 'TRIGGER:-PT1440M' in cal, 'what to bring, the lines, a reminder the day before')

        # a Teams call, in Brisbane time, shortened for this one
        r = make_meeting.build(M('teams-call'), s)
        cal = open(r['file'], encoding='utf-8').read()
        ok('TZID=Australia/Brisbane:20261112T140000' in cal and 'T142000' in cal and r['event']['is_online_meeting'], 'Brisbane time, 20 minutes, online')
        ok('LOCATION:Microsoft Teams' in cal and 'X-MICROSOFT-CDO-BUSYSTATUS:BUSY' in cal, 'busy, not out of office')

        # no site: the home time zone; a change hides a section
        json.dump({'template': 'site-visit', 'customer': 'Example Group', 'date': '2026-11-13', 'start': '09:00', 'notes': 'x',
                   'changes': {'hide': ['Notes'], 'title': 'Plant tour', 'subject': 'Plant tour: {customer}'}}, open(M('other'), 'w'))
        r = make_meeting.build(M('other'), s)
        cal = open(r['file'], encoding='utf-8').read()
        ok('TZID=Australia/Perth:' in cal and 'SUMMARY:Plant tour: Example Group' in cal and 'NOTES' not in r['event']['body_text'], 'home time zone; title, subject and hide changed')

        # a template of their own wins
        os.makedirs(s['templates'])
        t = json.load(open(os.path.join(ROOT, 'templates', 'site-visit.json')))
        t['minutes'] = 120
        json.dump(t, open(os.path.join(s['templates'], 'site-visit.json'), 'w'))
        r = make_meeting.build(M('other'), s)
        ok(r['minutes'] == 120 and r['template'].startswith(s['templates']), 'own template copy wins')

        # the week plan
        from find_customer import read_rows
        rows = plan_week.due_accounts(read_rows(s['crm_export']), 'Jo Bloggs', dt.date(2026, 11, 9))
        names = [x['account'] for x in rows]
        ok(names == ['Example Foods - Smithfield', 'Example Dairy - Wetherill Park', 'Example Meats - Dandenong', 'Example Snacks - Brisbane'], 'due, by zone: ' + str(names))
        ok('Example Pies - Penrith' not in names and 'Example Bakery - Geelong' not in names and 'Example Seafood - Auckland' not in names,
           'not those seen recently, someone else\'s, or with no cadence')
        ok(rows[0]['days'] == 160 and rows[0]['basis'] == 'last appointment' and rows[2]['basis'] == 'last activity' and rows[3]['days'] is None,
           'days since the last appointment, else the last activity; never seen')
        p = subprocess.run([sys.executable, os.path.join(HERE, 'plan_week.py'), '--settings', tmp, '--week', '2026-11-09', '--zones', 'Z1'], capture_output=True, text=True)
        ok(p.returncode == 0 and 'Z1 Sydney Metro' in p.stdout and 'Dandenong' not in p.stdout, 'the command line, one zone')
        ok(plan_week.to_date('12/03/2026') == dt.date(2026, 3, 12) and plan_week.to_date('2026-03-12') == dt.date(2026, 3, 12), 'Australian day-first dates')

        # the zone map is Field CRM's
        d = json.load(open(common.ZONES_FILE, encoding='utf-8'))
        ok(len(d['zones']) == 31 and d['zoneOrder'][0] == 'Z1', 'the zone map has its 31 zones')
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
