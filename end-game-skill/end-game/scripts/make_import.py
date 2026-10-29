#!/usr/bin/env python3
"""Write fieldcrm-import.json: the report, for Field CRM's Import call report.

    python3 make_import.py "<visit folder>/source/report.json" --out "<visit folder>"

It carries, from report.json:
  - the notes (Field CRM's summary) and the internal notes;
  - the contacts met (in_crm false for anyone not in the CRM);
  - the belts to quote, each with its "ref" when it is a belt Field CRM
    already has (Field CRM then fills only that belt's empty fields);
  - the photos, inside the file, made smaller (longest side 1600 px);
  - the follow-ups, those with "task": true becoming next steps on the planner;
  - the review list;
  - the two documents, without their photos (those are on the call), to be
    kept with the call.

Field CRM reads it from the visit's folder (the PC folder) or as a picked
file. It never changes anything typed in Field CRM, and importing the same
file twice adds nothing twice.
"""
import argparse
import base64
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_report import Report, build_html, load_image, BELT_GROUPS  # noqa: E402

KIND = 'field-crm-claude-report'
FILE = 'fieldcrm-import.json'
BELT_KEYS = [k for _, fields in BELT_GROUPS for _, k, _ in fields] + ['asset', 'qty', 'qcontact', 'comment']


def main():
    ap = argparse.ArgumentParser(description='Write fieldcrm-import.json for Field CRM.')
    ap.add_argument('report', help='report.json')
    ap.add_argument('--out', help='folder to write it into (default: the folder above report.json\'s, the visit folder)')
    a = ap.parse_args()

    with open(a.report, encoding='utf-8') as f:
        d = json.load(f)
    base = os.path.dirname(os.path.abspath(a.report))
    out = a.out or os.path.dirname(base)
    fc = d.get('fieldcrm') or {}

    r = Report(d, base)
    docs = {'internal': build_html(r, 'internal', lean=True), 'customer': build_html(Report(d, base), 'customer', lean=True)}

    photos, warn = {}, []
    used = set(d.get('other_photos') or []) | {p for b in d.get('belts') or [] for p in b.get('photos') or []}
    for pid in sorted(used):
        p = (d.get('photos') or {}).get(pid)
        if not p:
            warn.append(pid + ' (not in photos)')
            continue
        path = p['file'] if os.path.isabs(p['file']) else os.path.join(base, p['file'])
        try:
            data, mime, _ = load_image(path, 1600)
        except Exception as ex:
            warn.append(pid + ' (' + str(ex) + ')')
            continue
        photos[pid] = {'data': 'data:' + mime + ';base64,' + base64.b64encode(data).decode(),
                       'caption': p.get('caption', ''), 'time': p.get('time', '')}

    belts = []
    for b in d.get('belts') or []:
        x = {k: b[k] for k in BELT_KEYS if b.get(k) not in (None, '')}
        if isinstance(b.get('ref'), int):
            x['ref'] = b['ref']
        if b.get('tsg') is True:
            x['tsg'] = True
        x['photos'] = [p for p in b.get('photos') or [] if p in photos]
        belts.append(x)

    imp = {
        'kind': KIND, 'v': 1, 'made': int(os.path.getmtime(a.report) * 1000),
        'callId': fc.get('call_id') or '', 'customer': d.get('customer', ''), 'date': d.get('date', ''),
        'summary': d.get('notes', ''), 'internal_notes': d.get('internal_notes', ''),
        'contacts': [{k: c.get(k) for k in ('name', 'role', 'email', 'mobile', 'in_crm') if c.get(k) is not None} for c in d.get('contacts') or []],
        'belts': belts,
        'other_photos': [p for p in d.get('other_photos') or [] if p in photos],
        'photos': photos,
        'follow_ups': [{k: f.get(k) for k in ('what', 'who', 'when', 'date', 'task') if f.get(k) not in (None, '')} for f in d.get('follow_ups') or []],
        'review': [str(x) for x in d.get('review') or []],
        'documents': docs,
    }
    os.makedirs(out, exist_ok=True)
    dest = os.path.join(out, FILE)
    with open(dest, 'w', encoding='utf-8') as f:
        json.dump(imp, f, ensure_ascii=False)
    tasks = sum(1 for f in imp['follow_ups'] if f.get('task') is True)
    print('Written: %s (%.1f MB)' % (dest, os.path.getsize(dest) / 1048576))
    print('  for call %s; %d belts (%d already in Field CRM), %d photos, %d contacts, %d follow-ups (%d as next steps)' % (
        imp['callId'] or '(none: Field CRM asks which call)', len(belts), sum(1 for b in belts if 'ref' in b), len(photos),
        len(imp['contacts']), len(imp['follow_ups']), tasks))
    if warn:
        print('WARNING: photos left out: ' + ', '.join(warn))


if __name__ == '__main__':
    main()
