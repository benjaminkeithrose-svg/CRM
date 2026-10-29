#!/usr/bin/env python3
"""Find the customer account a site walk was at, in your CRM export.

    python3 find_customer.py EXPORT --name "example foods" --site smithfield --people "Jo Bloggs" "Pat"
    python3 find_customer.py EXPORT --account "Example Foods - Smithfield"

EXPORT is the CRM contacts export Field CRM imports (.xlsx, .xlsm, or .csv / .txt): one
row per contact, with an "Account Name" column. Account names carry the site
after " - " ("Example Foods - Smithfield"), as in Field CRM.

With --name / --site / --people it ranks the accounts against what was heard
on the walk (a transcript mishears names, so the match is forgiving) and
prints the best few, each with its contacts. A person's name heard on the walk
that matches a contact at the account counts strongly. Nothing is guessed:
the scores are for Claude to weigh and the person to confirm.

With --account it prints that one account, as JSON, for report.json: the
account name, account manager, and every contact with role, email and mobile.

The export holds customer data. It is read where it is and never copied into
this skill's folder.
"""
import argparse
import csv
import difflib
import json
import re
import sys

# the column names Field CRM reads (app.js, COL); matched loosely, as Field CRM does
COL = {'acct': 'Account Name', 'full': 'Full Name', 'first': 'First Name', 'last': 'Last Name', 'role': 'Job Role',
       'title': 'Job Title', 'e1': 'Email 1', 'mob': 'Mobile', 'mgr': 'Account Manager', 'rep': 'Account Representative'}


def norm_head(h):
    return str(h or '').replace(' ', ' ').strip().lower()


def pick(row, name):
    want = name.lower()
    for k, v in row.items():
        h = norm_head(k)
        if h == want or h.startswith(want + ' ('):
            return '' if v is None else str(v).replace(' ', ' ').strip()
    return ''


def read_rows(path):
    if not path.lower().endswith(('.xlsx', '.xlsm')):          # .csv, or a CSV saved as .txt
        with open(path, encoding='utf-8-sig', newline='') as f:
            return list(csv.DictReader(f))
    try:
        import openpyxl
    except ImportError:
        sys.exit('Reading .xlsx needs openpyxl: run "pip install openpyxl", or save the export as CSV.')
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    for ws in wb.worksheets:
        if ws.sheet_state != 'visible':
            continue
        it = ws.iter_rows(values_only=True)
        head = next(it, None)
        if not head or not any(norm_head(h) == 'account name' or norm_head(h).startswith('account name (') for h in head):
            continue
        return [dict(zip(head, r)) for r in it]
    sys.exit('No sheet with an "Account Name" column in ' + path)


def accounts(rows):
    out = {}
    for r in rows:
        nm = pick(r, COL['acct'])
        if not nm:
            continue
        a = out.setdefault(nm, {'account': nm, 'customer': re.split(r'\s+-\s+', nm)[0].strip(),
                                'site': (re.split(r'\s+-\s+', nm)[-1].strip() if re.search(r'\s+-\s+', nm) else ''),
                                'account_manager': pick(r, COL['mgr']), 'contacts': []})
        n = pick(r, COL['full'])
        if not n or n.strip('. ') == '':
            n = (pick(r, COL['first']) + ' ' + pick(r, COL['last'])).strip()
        if not n or n.strip('. ') == '' or any(c['name'].lower() == n.lower() for c in a['contacts']):
            continue
        a['contacts'].append({'name': n, 'role': pick(r, COL['role']) or pick(r, COL['title']),
                              'email': pick(r, COL['e1']), 'mobile': pick(r, COL['mob'])})
    return list(out.values())


def words(s):
    s = re.sub(r'\b(pty|ltd|limited|inc|the|and|co|company|group|australia|nz)\b', ' ', str(s or '').lower())
    return [w for w in re.split(r'[^a-z0-9]+', s) if w]


def sim(a, b):
    """How well what was heard matches a name, 0 to 1: forgiving of mishearing and word order."""
    wa, wb = words(a), words(b)
    if not wa or not wb:
        return 0.0
    whole = difflib.SequenceMatcher(None, ' '.join(wa), ' '.join(wb)).ratio()
    each = sum(max(difflib.SequenceMatcher(None, x, y).ratio() for y in wb) for x in wa) / len(wa)
    return round(max(whole, each), 2)


def score(a, name, site, people):
    s_name = sim(name, a['customer']) if name else 0
    s_site = sim(site, a['site'] or a['account']) if site else 0
    met = []
    for p in people:
        best = max(((sim(p, c['name']), c['name']) for c in a['contacts']), default=(0, ''))
        if best[0] >= 0.8:
            met.append(best[1])
    total = 3 * s_name + 2 * s_site + 1.5 * len(met)
    return round(total, 2), s_name, s_site, met


def main():
    ap = argparse.ArgumentParser(description='Find the customer account in the CRM export.')
    ap.add_argument('export', help='the CRM contacts export (.xlsx, .xlsm or .csv)')
    ap.add_argument('--name', default='', help='the customer as heard or written')
    ap.add_argument('--site', default='', help='the site or suburb as heard or written')
    ap.add_argument('--people', nargs='*', default=[], help='people named on the walk')
    ap.add_argument('--account', help='print this account (exact name) as JSON')
    ap.add_argument('--top', type=int, default=5)
    a = ap.parse_args()

    accts = accounts(read_rows(a.export))
    if a.account:
        m = [x for x in accts if x['account'].lower() == a.account.lower()]
        if not m:
            sys.exit('No account named "%s". Closest: %s' % (a.account, ', '.join(
                difflib.get_close_matches(a.account, [x['account'] for x in accts], 5, 0.4)) or 'none'))
        print(json.dumps(m[0], indent=2, ensure_ascii=False))
        return
    if not (a.name or a.site or a.people):
        sys.exit('Give at least one of --name, --site or --people.')
    ranked = sorted(((score(x, a.name, a.site, a.people), x) for x in accts), key=lambda t: -t[0][0])[:a.top]
    print('%d accounts in the export. Best matches:' % len(accts))
    for (total, s_name, s_site, met), x in ranked:
        if total <= 0:
            continue
        print('\n  %s   score %.2f  (name %.2f, site %.2f%s)' % (x['account'], total, s_name, s_site,
                                                             ', people: ' + ', '.join(met) if met else ''))
        if x['account_manager']:
            print('    Account manager: ' + x['account_manager'])
        for c in x['contacts'][:12]:
            print('    - ' + ', '.join(v for v in [c['name'], c['role']] if v))
        if len(x['contacts']) > 12:
            print('    ... and %d more' % (len(x['contacts']) - 12))


if __name__ == '__main__':
    main()
