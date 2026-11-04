#!/usr/bin/env python3
"""Make one meeting from meeting.json and a template: a calendar file, and the
same as an event for the Outlook connection.

    python3 make_meeting.py meeting.json [--settings FOLDER] [--out FOLDER] [--json]
    python3 make_meeting.py --list-templates [--settings FOLDER]
    python3 make_meeting.py --show-template site-visit [--settings FOLDER]

Writes "<date> <Title> - <Customer>.ics" in the output folder (the visits
folder by default). With --json it also prints the event as JSON, for Claude
to create or update through the Outlook connection: subject, start and end in
the customer's time zone (IANA and Windows names, and UTC), location, the body
as HTML and text, show as, reminder, categories, online meeting, and the
attendees, which are empty unless the meeting says "invite": true.

The calendar file never has an organiser or attendees, whatever the meeting
says: Outlook then keeps it as your own appointment and never emails a
customer about it (Field CRM v163). Inviting is done through the Outlook
connection, after asking, or in Outlook.

The first run gives the meeting a "uid", written back into meeting.json; a
later run after a change raises its "sequence", so the new file or event
replaces the old one instead of adding a second.
"""
import argparse
import copy
import datetime as dt
import hashlib
import html
import json
import os
import re
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import ics  # noqa: E402

BUILT_IN = os.path.join(common.ROOT, 'templates')
WINDOWS_TZ = {'Australia/Sydney': 'AUS Eastern Standard Time', 'Australia/Melbourne': 'AUS Eastern Standard Time',
              'Australia/Brisbane': 'E. Australia Standard Time', 'Australia/Adelaide': 'Cen. Australia Standard Time',
              'Australia/Darwin': 'AUS Central Standard Time', 'Australia/Perth': 'W. Australia Standard Time',
              'Australia/Hobart': 'Tasmania Standard Time', 'Pacific/Auckland': 'New Zealand Standard Time'}
SHOW_AS = {'oof': 'oof', 'busy': 'busy', 'tentative': 'tentative', 'free': 'free'}


def esc(v):
    return html.escape('' if v is None else str(v), quote=True)


def given(v):
    return v not in (None, '', [], {}) and str(v).strip() != ''


def nice_date(s):
    try:
        return dt.date.fromisoformat(str(s)[:10]).strftime('%A %d %B %Y').replace(' 0', ' ')
    except Exception:
        return str(s or '')


def key_of(s):
    return re.sub(r'\s+', ' ', str(s or '')).strip().lower()


# ---------------------------------------------------------------- templates

def template_dirs(s):
    return [d for d in [s.get('templates'), BUILT_IN] if d]


def load_template(name, s):
    if name and os.path.isfile(name):
        with open(name, encoding='utf-8') as f:
            return json.load(f), name
    for d in template_dirs(s):
        p = os.path.join(d, (name or 'site-visit') + '.json')
        if os.path.exists(p):
            with open(p, encoding='utf-8') as f:
                return json.load(f), p
    sys.exit('No template called "%s". Run with --list-templates to see them.' % name)


def apply_changes(t, ch, warn):
    """One meeting's changes: title, subject, minutes, busy, reminder, location, hide, rename, sections."""
    t = copy.deepcopy(t)
    for k in ('title', 'subject', 'minutes', 'busy', 'reminder', 'location', 'categories'):
        if ch and k in ch:
            t[k] = ch[k]
    for name in (ch or {}).get('hide') or []:
        hit = [x for x in t['sections'] if key_of(x.get('heading')) == key_of(name)]
        if not hit:
            warn.append('change hides "%s", which is not in the template' % name)
        for x in hit:
            x['hidden'] = True
    for old, new in ((ch or {}).get('rename') or {}).items():
        hit = [x for x in t['sections'] if key_of(x.get('heading')) == key_of(old)]
        if not hit:
            warn.append('change renames "%s", which is not in the template' % old)
        for x in hit:
            x['heading'] = new
    for sec in (ch or {}).get('sections') or []:
        new = {'type': 'extra', 'heading': sec.get('heading', ''), 'rows': sec.get('rows') or [], 'items': sec.get('items') or [], 'text': sec.get('text')}
        heads = [key_of(x.get('heading')) for x in t['sections']]
        after = key_of(sec.get('after'))
        t['sections'].insert(heads.index(after) + 1 if after in heads else len(t['sections']), new)
    return t


# ---------------------------------------------------------------- the meeting

def resolve(m, s):
    """The meeting's values, with what follows from the account: site, zone, time zone."""
    v = dict(m)
    cust = m.get('customer') or ''
    sub = common.suburb_of(cust)
    z = m.get('zone') or (common.zone_of(cust) if sub else '')
    zi = common.zone_info(z) if z else None
    v['site'] = m.get('site') or (sub.title() if sub else '')
    v['site_full'] = m.get('location') or ', '.join(x for x in [v['site'], re.split(r'\s+-\s+', cust)[0].strip() if cust else ''] if x)
    v['zone'] = (z + ' ' + zi['name']) if zi and z != 'Z12' else ''
    v['tz'] = m.get('tz') or (zi['tz'] if zi and z != 'Z12' else s['home_tz'])
    v['account_manager'] = m.get('account_manager') or s['me']
    v['minutes'] = int(m.get('minutes') or 0)
    return v


def body(t, v):
    """The invite body, as HTML with every style on its element (Outlook keeps nothing else) and as text."""
    F = 'font-family:Arial,Helvetica,sans-serif'
    H = '<p style="margin:14px 0 4px;color:#00708D;font-size:11px;letter-spacing:1px;text-transform:uppercase;%s"><b>%s</b></p>'
    h = ['<html><body style="%s;font-size:13px;color:#222222">' % F,
         '<div style="border-left:4px solid #ED1C24;padding-left:10px;margin:0 0 12px"><div style="font-size:15px;font-weight:bold;color:#222222">%s</div>'
         '<div style="font-size:11px;color:#4D4D4F;letter-spacing:1px;text-transform:uppercase">%s</div></div>' % (esc(v.get('customer')), esc(t.get('title')))]
    txt = [v.get('customer') or '', t.get('title', ''), '']
    for sec in t['sections']:
        if sec.get('hidden'):
            continue
        kind, head = sec['type'], sec.get('heading') or ''
        if kind == 'rows' or (kind == 'extra' and sec.get('rows')):
            rows = [(lab, v.get(key) if kind == 'rows' else key) for lab, key in sec['rows']]
            rows = [(lab, val) for lab, val in rows if given(val)]
            if rows:
                if head:
                    h.append(H % (F, esc(head))); txt.append(head.upper())
                h.append('<table cellpadding="3" style="border-collapse:collapse;font-size:12px">' + ''.join(
                    '<tr><td style="color:#77787A;padding-right:12px">%s</td><td style="color:#222222"><b>%s</b></td></tr>' % (esc(a), esc(b)) for a, b in rows) + '</table>')
                txt += ['%s: %s' % (a, b) for a, b in rows] + ['']
        if kind in ('text', 'extra'):
            val = v.get(sec['key']) if kind == 'text' else sec.get('text')
            val = val if given(val) else sec.get('empty')
            if given(val):
                if head:
                    h.append(H % (F, esc(head))); txt.append(head.upper())
                h.append('<div style="%s">%s</div>' % (F, esc(val).replace('\n', '<br>')))
                txt += [str(val), '']
        if kind in ('list',) or (kind == 'extra' and sec.get('items')):
            items = (v.get(sec['key']) if kind == 'list' else None) or sec.get('items') or sec.get('default') or []
            if isinstance(items, str):
                items = [items]
            items = [x for x in items if given(x)]
            if items:
                h.append(H % (F, esc(head))); txt.append(head.upper())
                h.append('<ul style="margin:0 0 6px 18px;padding:0">' + ''.join('<li>%s</li>' % esc(x) for x in items) + '</ul>')
                txt += ['- ' + str(x) for x in items] + ['']
        if kind == 'contacts':
            cs = [c for c in v.get('contacts') or [] if given(c.get('name'))]
            if cs:
                h.append(H % (F, esc(head))); txt.append(head.upper())
                h.append('<table cellpadding="5" style="border-collapse:collapse;font-size:12px;border:1px solid #CCCCCC">' + ''.join(
                    '<tr><td><b>%s</b></td><td>%s</td><td>%s</td><td>%s</td></tr>' % (
                        esc(c['name']), esc(c.get('role') or ''), esc(c.get('mobile') or ''), esc(c.get('email') or '')) for c in cs) + '</table>')
                txt += ['- ' + ' | '.join(x for x in [c['name'], c.get('role'), c.get('mobile'), c.get('email')] if given(x)) for c in cs] + ['']
    h.append('<p style="margin-top:18px;font-size:10px;color:#77787A;border-top:1px solid #E3E3E3;padding-top:8px">Made with the visit planner skill.</p></body></html>')
    return ''.join(h), '\n'.join(txt).strip()


def utc_of(date, hhmm, tz, add=0):
    try:
        from zoneinfo import ZoneInfo
        t = dt.datetime.strptime(date + ' ' + hhmm, '%Y-%m-%d %H:%M').replace(tzinfo=ZoneInfo(tz)) + dt.timedelta(minutes=add)
        return t.astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    except Exception:
        return ''          # no time zone database on this PC: the local time and zone name are enough


def digest(m):
    keep = {k: v for k, v in m.items() if k not in ('uid', 'sequence', 'built')}
    return hashlib.sha1(json.dumps(keep, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:12]


def build(path, s, out_dir=None):
    with open(path, encoding='utf-8') as f:
        m = json.load(f)
    warn = []
    t, tpath = load_template(m.get('template') or 'site-visit', s)
    t = apply_changes(t, m.get('changes'), warn)
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(m.get('date') or '')):
        sys.exit('The meeting needs a "date" as YYYY-MM-DD.')
    if not re.fullmatch(r'\d{1,2}:\d{2}', str(m.get('start') or '')):
        sys.exit('The meeting needs a "start" as HH:MM.')
    v = resolve(m, s)
    v['minutes'] = v['minutes'] or int(t.get('minutes') or 60)
    if v['tz'] not in ics.TZDB:
        warn.append('time zone %s has no rules here; the file says it by name only' % v['tz'])
    # its identity: a uid once, and a higher sequence whenever it changes
    d = digest(m)
    if not m.get('uid'):
        m['uid'] = uuid.uuid4().hex + '@visit-planner.intralox'
        m['sequence'] = 0
    elif m.get('built') != d:
        m['sequence'] = int(m.get('sequence') or 0) + 1
    m['built'] = d
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(m, f, indent=2, ensure_ascii=False)
    subject = m.get('subject') or t['subject'].format(**{k: (val if val is not None else '') for k, val in v.items() if isinstance(val, (str, int))})
    location = t.get('location', '').format(**{k: (val if val is not None else '') for k, val in v.items() if isinstance(val, (str, int))}) if t.get('location') else ''
    page, text = body(t, v)
    ev = {'uid': m['uid'], 'sequence': m['sequence'], 'tz': v['tz'], 'date': m['date'], 'start': m['start'].zfill(5), 'minutes': v['minutes'],
          'subject': subject, 'location': location, 'text': text, 'html': page, 'categories': t.get('categories') or [],
          'busy': t.get('busy', 'busy'), 'reminder': t.get('reminder')}
    out_dir = out_dir or s.get('out') or os.path.dirname(os.path.abspath(path))
    os.makedirs(out_dir, exist_ok=True)
    name = re.sub(r'[\\/:*?"<>|]+', ' ', '%s %s - %s' % (m['date'], t.get('title', 'Meeting'), re.split(r'\s+-\s+', m.get('customer') or 'Meeting')[0])).strip()
    file = os.path.join(out_dir, name + '.ics')
    with open(file, 'w', encoding='utf-8', newline='') as f:
        f.write(ics.calendar([ev]))
    end = (dt.datetime.strptime(m['date'] + ' ' + ev['start'], '%Y-%m-%d %H:%M') + dt.timedelta(minutes=ev['minutes'])).strftime('%Y-%m-%dT%H:%M:%S')
    contacts = [c for c in m.get('contacts') or [] if given(c.get('name'))]
    event = {'uid': m['uid'], 'sequence': m['sequence'], 'subject': subject,
             'start': {'dateTime': m['date'] + 'T' + ev['start'] + ':00', 'timeZone': v['tz'], 'windowsTimeZone': WINDOWS_TZ.get(v['tz'], ''),
                       'utc': utc_of(m['date'], ev['start'], v['tz'])},
             'end': {'dateTime': end, 'timeZone': v['tz'], 'windowsTimeZone': WINDOWS_TZ.get(v['tz'], ''),
                     'utc': utc_of(m['date'], ev['start'], v['tz'], ev['minutes'])},
             'location': location, 'body_html': page, 'body_text': text, 'show_as': SHOW_AS.get(ev['busy'], 'busy'),
             'reminder_minutes': ev['reminder'], 'categories': ev['categories'], 'is_online_meeting': bool(t.get('online')),
             'invite': bool(m.get('invite')),
             'attendees': [{'name': c['name'], 'email': c['email']} for c in contacts if m.get('invite') and given(c.get('email'))]}
    missing = []
    if m.get('invite'):
        missing = [c['name'] for c in contacts if not given(c.get('email'))]
        if missing:
            warn.append('no email for %s, so they cannot be invited' % ', '.join(missing))
    return {'file': file, 'event': event, 'template': tpath, 'warnings': warn, 'sequence': m['sequence'], 'minutes': ev['minutes']}


def main():
    ap = argparse.ArgumentParser(description='Make a meeting: a calendar file, and the event for the Outlook connection.')
    ap.add_argument('meeting', nargs='?')
    ap.add_argument('--settings')
    ap.add_argument('--out')
    ap.add_argument('--json', action='store_true', help='print the event for the Outlook connection')
    ap.add_argument('--list-templates', action='store_true')
    ap.add_argument('--show-template', metavar='NAME')
    a = ap.parse_args()
    s = common.settings(a.settings)
    if a.list_templates:
        seen = set()
        for d in template_dirs(s):
            if os.path.isdir(d):
                for fn in sorted(os.listdir(d)):
                    if fn.endswith('.json') and fn not in seen:
                        seen.add(fn)
                        t = json.load(open(os.path.join(d, fn), encoding='utf-8'))
                        print('%s: %s, %s min%s\n  %s' % (fn[:-5], t.get('title'), t.get('minutes'), '' if d == BUILT_IN else ' (your own copy)', t.get('about', '')))
        return
    if a.show_template:
        t, p = load_template(a.show_template, s)
        print('# ' + p)
        print(json.dumps(t, indent=2, ensure_ascii=False))
        return
    if not a.meeting:
        ap.error('give meeting.json')
    r = build(a.meeting, s, a.out)
    if a.json:
        print(json.dumps(r['event'], indent=1, ensure_ascii=False))
        return
    e = r['event']
    print('%s, %s %s (%s), %d min' % (e['subject'], nice_date(e['start']['dateTime'][:10]), e['start']['dateTime'][11:16], e['start']['timeZone'], r['minutes']))
    print('Calendar file: ' + r['file'] + ('' if not r['sequence'] else '  (change %d: it replaces the earlier one)' % r['sequence']))
    print('Invite: ' + ('yes, to ' + ', '.join(x['name'] for x in e['attendees']) if e['invite'] else 'no: your own appointment, nobody is emailed'))
    for w in r['warnings']:
        print('Warning: ' + w)


if __name__ == '__main__':
    main()
