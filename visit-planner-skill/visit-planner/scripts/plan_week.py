#!/usr/bin/env python3
"""Which accounts are due a visit, by zone: the start of planning a week.

    python3 plan_week.py [--settings FOLDER] [--export EXPORT] [--me NAME] [--week YYYY-MM-DD] [--zones Z1,Z2] [--all] [--json]

Reads the CRM export (the one Field CRM imports) and works out, for each
account, how long since it was last seen, against the cadence its focus sets,
as Field CRM does: High quarterly (91 days), Medium half-yearly (182), Low
yearly (365), No Focus none. "Last seen" is the export's Last Appointment;
without one, its Last Activity Date (Field CRM's own call history is not
here). An account past its cadence, or never seen, is due.

Only your accounts (Account Manager = "me" in the settings, or --me), unless
--all. Grouped by zone, as Field CRM's map has them, the most overdue High
focus first; --zones keeps only those zones. Claude then proposes the days,
checking your calendar for free time, and books nothing until you say.

The export holds customer data. It is read where it is and never copied into
this skill's folder.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
from find_customer import read_rows, pick  # noqa: E402

CAD = {'High': ('P1 Quarterly', 91), 'Medium': ('P2 Half-yearly', 182), 'Low': ('P3 Yearly', 365), 'No Focus': ('P4 No cadence', None)}
RANK = {'High': 0, 'Medium': 1, 'Low': 2, 'No Focus': 3}


def to_date(v):
    """A date from the export: an Excel date, ISO (2026-03-12), or Australian day first (12/03/2026)."""
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    s = str(v or '').strip()
    if not s:
        return None
    m = re.match(r'(\d{4})-(\d{1,2})-(\d{1,2})', s)
    if m:
        return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{2,4})', s)
    if m:
        y = int(m.group(3))
        return dt.date(y + 2000 if y < 100 else y, int(m.group(2)), int(m.group(1)))
    return None


def due_accounts(rows, me='', on=None, every=False):
    on = on or dt.date.today()
    acc = {}
    for r in rows:
        nm = pick(r, 'Account Name')
        if not nm:
            continue
        a = acc.setdefault(nm, {'account': nm, 'focus': pick(r, 'Account Focus') or 'No Focus', 'manager': pick(r, 'Account Manager'),
                                'appt': None, 'activity': None, 'contacts': 0})
        a['contacts'] += 1 if (pick(r, 'Full Name') or pick(r, 'First Name')) else 0
        for k, col in (('appt', 'Last Appointment'), ('activity', 'Last Activity Date')):
            d = to_date(r.get(col) if col in r else pick(r, col))
            if d and (not a[k] or d > a[k]):
                a[k] = d
    out = []
    for a in acc.values():
        if not every and me and a['manager'].strip().lower() != me.strip().lower():
            continue
        cad, target = CAD.get(a['focus'], CAD['No Focus'])
        if target is None:
            continue
        seen, basis = (a['appt'], 'last appointment') if a['appt'] else (a['activity'], 'last activity') if a['activity'] else (None, 'never')
        days = (on - seen).days if seen else None
        if days is not None and days <= target:
            continue
        z = common.zone_of(a['account'])
        zi = common.zone_info(z)
        out.append({'account': a['account'], 'site': common.suburb_of(a['account']).title(), 'zone': z, 'zone_name': zi['name'], 'tz': zi['tz'],
                    'focus': a['focus'], 'cadence': cad, 'target_days': target, 'days': days, 'basis': basis,
                    'last_seen': seen.isoformat() if seen else '', 'contacts': a['contacts'], 'manager': a['manager']})
    out.sort(key=lambda x: (common.zones()['order'].index(x['zone']) if x['zone'] in common.zones()['order'] else 99,
                            RANK.get(x['focus'], 3), -(x['days'] if x['days'] is not None else 99999)))
    return out


def main():
    ap = argparse.ArgumentParser(description='Accounts due a visit, by zone.')
    ap.add_argument('--settings')
    ap.add_argument('--export', help='the CRM export, if not in the settings')
    ap.add_argument('--me', help='the account manager, as the CRM spells it, if not in the settings')
    ap.add_argument('--week', help='the Monday of the week being planned (default: today)')
    ap.add_argument('--zones', help='only these zones, e.g. Z1,Z2')
    ap.add_argument('--all', action='store_true', help='every account manager\'s accounts')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    s = common.settings(a.settings)
    exp = a.export or s['crm_export']
    if not exp or not os.path.exists(exp):
        sys.exit('No CRM export: set "crm_export" in ' + common.SETTINGS_NAME + ', or give --export.')
    me = a.me or s['me']
    if not me and not a.all:
        sys.exit('Whose accounts? Set "me" in ' + common.SETTINGS_NAME + ' (your name as the CRM spells it), give --me, or --all.')
    on = dt.date.fromisoformat(a.week) if a.week else dt.date.today()
    rows = due_accounts(read_rows(exp), me, on, a.all)
    if a.zones:
        keep = {z.strip().upper() for z in a.zones.split(',')}
        rows = [r for r in rows if r['zone'].upper() in keep]
    if a.json:
        print(json.dumps(rows, indent=1, ensure_ascii=False))
        return
    if not rows:
        print('Nothing due' + (' in ' + a.zones if a.zones else '') + ' as at ' + on.isoformat() + '.')
        return
    print('%d accounts due as at %s%s:' % (len(rows), on.isoformat(), '' if a.all else ' for ' + me))
    zone = None
    for r in rows:
        if r['zone'] != zone:
            zone = r['zone']
            n = sum(1 for x in rows if x['zone'] == zone)
            print('\n%s %s (%d)' % (zone, r['zone_name'], n))
        print('  %s | %s | %s' % (r['account'], r['focus'], ('never seen' if r['days'] is None else '%d days since %s, past %d' % (r['days'], r['basis'], r['target_days']))))


if __name__ == '__main__':
    main()
