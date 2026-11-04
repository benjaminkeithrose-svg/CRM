#!/usr/bin/env python3
"""A call from Field CRM as a quote request for the quote request skill.

    python3 to_quote.py "<visit folder>/Field CRM call.json" [--belts 0,3] [--out request.json] [--ref "..."]

Writes the quote request skill's request.json from the call: the customer,
site, date, account manager, the contacts on the call (with in_crm), each
belt (all of them, or those whose ref is in --belts) with its spec, sprocket,
accessories and photos, and the call's notes. Belt fields keep Field CRM's
names, which the quote request skill uses too. Photos point at the files in
"from Field CRM" beside the call file, so the request is written in the same
visit folder by default.

The quote request skill then checks each belt against the catalogue and
draws the request: `build_request.py request.json`. Nothing is sent.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402

# a belt entry's own bookkeeping, not part of the spec
SKIP = {'type', 'ref', 'photos', 'acc', 'id', 'src', 'est', 'why', 'walk', 'created', 'updated'}


def given(v):
    return v is not None and v is not False and v != '' and v != []


def build(call_file, belts=None, ref=''):
    d = common.read_json(call_file)
    if d.get('kind') != common.CALL_KIND:
        sys.exit(call_file + ' is not a call saved by Field CRM.')
    c = d['call']
    a = d.get('account') or {}
    req = {'template': 'belt-quote', 'customer': c.get('customer', ''), 'site': c.get('site', ''),
           'date': c.get('iso') or '', 'account_manager': a.get('mgr') or c.get('mgr', ''),
           'customer_ref': ref or ('Site call on ' + (c.get('iso') or c.get('date') or '')),
           'from_field_crm': {'call_id': c.get('id'), 'file': os.path.basename(call_file)},
           'contacts': [{k: x.get(k) for k in ('name', 'role', 'email', 'mobile', 'in_crm') if given(x.get(k)) or k == 'in_crm'}
                        for x in c.get('contacts', []) if x.get('name')],
           'belts': [], 'notes': [], 'photos': {}}
    n = 0

    def photo(p, caption):
        nonlocal n
        n += 1
        pid = 'p%d' % n
        req['photos'][pid] = {'file': p['file'], 'caption': caption}
        return pid

    for e in c.get('entries', []):
        if e.get('type') == 'belt' and (belts is None or e.get('ref') in belts):
            b = {k: v for k, v in e.items() if k not in SKIP and given(v)}
            b['field_crm_ref'] = e.get('ref')
            b['accessories'] = [{'desc': x.get('desc', ''), 'part_number': x.get('item', ''), 'qty': x.get('qty') or 1, 'note': x.get('note', '')}
                                for x in e.get('acc') or [] if x.get('desc')]
            if not b['accessories']:
                del b['accessories']
            name = e.get('asset') or e.get('beltdesc') or 'Belt'
            b['photos'] = [photo(p, name) for p in e.get('photos') or []]
            req['belts'].append(b)
        elif e.get('type') == 'note' and e.get('text'):
            req['notes'].append({'topic': e.get('topic') or 'Note', 'text': e['text']})
    if not req['belts']:
        sys.exit('No belts in this call' + (' with those refs' if belts is not None else '') + ': nothing to quote.')
    return req


def main():
    ap = argparse.ArgumentParser(description='A Field CRM call as a quote request.')
    ap.add_argument('call_file')
    ap.add_argument('--belts', help='only these belts, by ref (from list_tickets or fieldcrm_call.py), e.g. 0,3')
    ap.add_argument('--out', help='where to write request.json (default: beside the call file)')
    ap.add_argument('--ref', default='', help='the customer reference line')
    a = ap.parse_args()
    belts = [int(x) for x in a.belts.split(',')] if a.belts else None
    req = build(a.call_file, belts, a.ref)
    out = a.out or os.path.join(os.path.dirname(os.path.abspath(a.call_file)), 'request.json')
    common.write_json(out, req)
    print('Wrote %s: %d belt%s for %s' % (out, len(req['belts']), '' if len(req['belts']) == 1 else 's', req['customer']))


if __name__ == '__main__':
    main()
