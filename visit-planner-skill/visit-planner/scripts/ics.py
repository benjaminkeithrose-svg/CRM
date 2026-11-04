"""Calendar files, written the way Field CRM writes them (buildIcs in app.js).

- Every line folded at 75 octets (not characters), never splitting a character.
- CRLF line ends; the customer's own time zone with its VTIMEZONE.
- A stable UID and a SEQUENCE, so a changed meeting replaces the earlier one.
- No ORGANIZER and no ATTENDEE, ever: with them Outlook takes the item as a
  meeting you called and offers to email the customers on any change (Field
  CRM v163). Inviting people is done in Outlook, or through the Outlook
  connection after asking.
"""
import datetime as dt

# Field CRM's TZDB: standard and daylight rules for the zones it covers
TZDB = {
    'Australia/Sydney': {'std': ['+1100', '+1000', 'AEST', '19700405T030000', 'FREQ=YEARLY;BYMONTH=4;BYDAY=1SU'],
                         'dst': ['+1000', '+1100', 'AEDT', '19701004T020000', 'FREQ=YEARLY;BYMONTH=10;BYDAY=1SU']},
    'Australia/Adelaide': {'std': ['+1030', '+0930', 'ACST', '19700405T030000', 'FREQ=YEARLY;BYMONTH=4;BYDAY=1SU'],
                           'dst': ['+0930', '+1030', 'ACDT', '19701004T020000', 'FREQ=YEARLY;BYMONTH=10;BYDAY=1SU']},
    'Australia/Brisbane': {'std': ['+1000', '+1000', 'AEST', '19700101T000000', None]},
    'Australia/Darwin': {'std': ['+0930', '+0930', 'ACST', '19700101T000000', None]},
    'Australia/Perth': {'std': ['+0800', '+0800', 'AWST', '19700101T000000', None]},
    'Pacific/Auckland': {'std': ['+1300', '+1200', 'NZST', '19700405T030000', 'FREQ=YEARLY;BYMONTH=4;BYDAY=1SU'],
                         'dst': ['+1200', '+1300', 'NZDT', '19700927T020000', 'FREQ=YEARLY;BYMONTH=9;BYDAY=-1SU']},
}


def esc(s):
    return str('' if s is None else s).replace('\\', '\\\\').replace(';', '\;').replace(',', '\\,').replace('\r\n', '\n').replace('\n', '\\n')


def fold(line):
    out, cur, used, budget = [], '', 0, 75
    for ch in line:
        n = len(ch.encode('utf-8'))
        if used + n > budget:
            out.append(cur)
            cur, used, budget = ch, n, 74          # a continuation spends one octet on its leading space
        else:
            cur += ch
            used += n
    out.append(cur)
    return '\r\n '.join(out)


def stamp():
    return dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')


def local(date, hhmm, add_min=0):
    t = dt.datetime.strptime(date + ' ' + hhmm, '%Y-%m-%d %H:%M') + dt.timedelta(minutes=add_min)
    return t.strftime('%Y%m%dT%H%M%S')


def vtimezone(tzid):
    z = TZDB.get(tzid)
    if not z:
        return []
    L = ['BEGIN:VTIMEZONE', 'TZID:' + tzid]
    for kind, key in (('STANDARD', 'std'), ('DAYLIGHT', 'dst')):
        spec = z.get(key)
        if not spec:
            continue
        frm, to, nm, start, rrule = spec
        L += ['BEGIN:' + kind, 'DTSTART:' + start, 'TZOFFSETFROM:' + frm, 'TZOFFSETTO:' + to, 'TZNAME:' + nm]
        if rrule:
            L.append('RRULE:' + rrule)
        L.append('END:' + kind)
    L.append('END:VTIMEZONE')
    return L


def calendar(events):
    """events: dicts {uid, sequence, tz, date, start, minutes, subject, location, text, html, categories, busy}."""
    L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Intralox//Visit planner skill//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
    for tz in sorted({e['tz'] for e in events}):
        L += vtimezone(tz)
    for e in events:
        L += ['BEGIN:VEVENT', 'UID:' + e['uid'], 'SEQUENCE:' + str(e.get('sequence', 0)), 'DTSTAMP:' + stamp(), 'LAST-MODIFIED:' + stamp(),
              'DTSTART;TZID=%s:%s' % (e['tz'], local(e['date'], e['start'])),
              'DTEND;TZID=%s:%s' % (e['tz'], local(e['date'], e['start'], e['minutes'])),
              'SUMMARY:' + esc(e['subject']), 'LOCATION:' + esc(e.get('location', '')),
              'DESCRIPTION:' + esc(e.get('text', ''))]
        if e.get('html'):
            L.append('X-ALT-DESC;FMTTYPE=text/html:' + esc(e['html']))
        if e.get('categories'):
            L.append('CATEGORIES:' + ','.join(esc(c) for c in e['categories']))
        L += ['X-MICROSOFT-CDO-BUSYSTATUS:' + {'oof': 'OOF', 'tentative': 'TENTATIVE', 'free': 'FREE'}.get(e.get('busy'), 'BUSY'),
              'TRANSP:' + ('TRANSPARENT' if e.get('busy') == 'free' else 'OPAQUE')]
        if e.get('reminder'):
            L += ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'TRIGGER:-PT%dM' % int(e['reminder']), 'END:VALARM']
        L.append('END:VEVENT')
    L.append('END:VCALENDAR')
    return '\r\n'.join(fold(l) for l in L) + '\r\n'
