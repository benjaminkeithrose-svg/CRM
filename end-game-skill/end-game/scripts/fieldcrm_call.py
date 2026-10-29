#!/usr/bin/env python3
"""Read the call Field CRM saved for Claude, and say what is in it.

    python3 fieldcrm_call.py "<visit folder>/Field CRM call.json"
    python3 fieldcrm_call.py "<download>/... - Field CRM call.json" --photos-out "<visit folder>/from Field CRM"

Field CRM's Save for Claude writes `Field CRM call.json` into the visit's
folder, with the call's photos beside it in `from Field CRM/`. On a phone it is
one downloaded file with the photos inside it; --photos-out writes those out
as files.

It prints the customer, the date, the people, each belt with its place in the
call (ref: give it back as the belt's "ref" in report.json, so Field CRM fills
in that belt rather than adding another), the notes and the photos. --json
prints the same as JSON instead.
"""
import argparse
import base64
import json
import os
import re
import sys

KIND = 'field-crm-call-for-claude'
SPEC = ['series', 'style', 'beltmat', 'colour', 'rodmat', 'width', 'beltlen', 'qty', 'sprocket', 'sprbore', 'sprpn']


def load(path):
    with open(path, encoding='utf-8') as f:
        d = json.load(f)
    if d.get('kind') != KIND:
        sys.exit(path + ' is not a call saved by Field CRM for Claude (kind %r).' % d.get('kind'))
    if d.get('v') != 1:
        sys.exit('This file is version %r; this skill reads version 1. Update the skill.' % d.get('v'))
    return d


def write_photos(d, out):
    os.makedirs(out, exist_ok=True)
    n = 0
    for x in [p for e in d['call'].get('entries', []) for p in e.get('photos', [])] + d['call'].get('loose', []):
        data = x.get('data')
        if not data or not data.startswith('data:'):
            continue
        name = os.path.basename(x['file'])
        with open(os.path.join(out, name), 'wb') as f:
            f.write(base64.b64decode(data.split(',', 1)[1]))
        x['file'] = os.path.join(os.path.basename(out.rstrip('/\\')), name).replace('\\', '/')
        x.pop('data', None)
        n += 1
    return n


def summary(d):
    c, a = d['call'], d.get('account') or {}
    out = {
        'call_id': c['id'], 'customer': c['customer'], 'in_crm': not c.get('manualAccount'), 'date': c.get('iso') or c.get('date'),
        'type': c.get('type'), 'site': c.get('site'), 'account_manager': a.get('mgr') or c.get('mgr'),
        'contacts_on_call': c.get('contacts', []),
        'account_contacts': a.get('contacts', []),
        'belts': [], 'notes': [], 'other_entries': [], 'loose_photos': [x['file'] for x in c.get('loose', [])],
        'summary': c.get('summary', ''),
    }
    for e in c.get('entries', []):
        photos = [x['file'] for x in e.get('photos', [])]
        if e.get('type') == 'belt':
            given = lambda v: v is not None and v is not False and v != ''   # 0 is a ref, not nothing
            out['belts'].append(dict({k: e.get(k) for k in ['ref', 'asset', 'beltdesc'] + SPEC + ['comment', 'tsg'] if given(e.get(k))}, photos=photos))
        elif e.get('type') == 'note':
            out['notes'].append({'ref': e['ref'], 'topic': e.get('topic', ''), 'text': e.get('text', ''), 'photos': photos})
        else:
            out['other_entries'].append({'ref': e['ref'], 'type': e.get('type'), 'what': e.get('fault') or e.get('asset') or e.get('name') or '', 'photos': photos})
    return out


def main():
    ap = argparse.ArgumentParser(description='Read the call Field CRM saved for Claude.')
    ap.add_argument('file', help='Field CRM call.json')
    ap.add_argument('--photos-out', help='write photos held inside the file (a phone download) into this folder')
    ap.add_argument('--json', action='store_true', help='print as JSON')
    a = ap.parse_args()
    d = load(a.file)
    if d.get('photosInline'):
        if a.photos_out:
            print('Photos written: %d into %s' % (write_photos(d, a.photos_out), a.photos_out))
        else:
            print('note: the photos are inside this file; give --photos-out to write them out')
    s = summary(d)
    if a.json:
        print(json.dumps(s, indent=2, ensure_ascii=False))
        return
    print('Call %s: %s, %s (%s)%s' % (s['call_id'], s['customer'], s['date'], s['type'], '' if s['in_crm'] else '  [NOT IN THE CRM]'))
    print('Account manager: ' + (s['account_manager'] or '-'))
    print('People on the call: ' + (', '.join('%s (%s)%s' % (x['name'], x.get('role') or '-', '' if x.get('in_crm') else ' not in CRM') for x in s['contacts_on_call']) or 'none'))
    if s['summary']:
        print('Summary typed in Field CRM: ' + re.sub(r'\s+', ' ', s['summary'])[:300])
    print('Belts logged in Field CRM: %d' % len(s['belts']))
    for b in s['belts']:
        spec = ', '.join('%s %s' % (k, b[k]) for k in SPEC if k in b)
        print('  ref %d  %-12s %s%s' % (b['ref'], b.get('asset') or '(no asset)', spec or '(no spec yet)', ('  photos: ' + ', '.join(b['photos'])) if b['photos'] else ''))
    for n in s['notes']:
        print('Note (%s): %s' % (n['topic'] or '-', re.sub(r'\s+', ' ', n['text'])[:200]))
    for o in s['other_entries']:
        print('Also logged: %s %s' % (o['type'], o['what']))
    if s['loose_photos']:
        print('Other photos from Field CRM: ' + ', '.join(s['loose_photos']))


if __name__ == '__main__':
    main()
