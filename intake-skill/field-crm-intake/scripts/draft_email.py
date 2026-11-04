#!/usr/bin/env python3
"""An email for Outlook, as a draft: never sent.

    python3 draft_email.py --root "<PC folder>" --ticket "<ticket name>" --kind quote|customer|other
                           [--to a@b,c@d] [--cc ...] [--subject "..."] [--body body.txt] [--attach file ...]

Writes drafts\\<kind> - <customer>.json in the call's visit folder: to, cc,
subject, the body as inline-styled HTML (Outlook keeps nothing else) and as
plain text, and the attachments, full paths. Claude then creates the draft in
Outlook through the Outlook connection with exactly these fields, and keeps
its id in the file as "outlook_id". It never sends: the person reads the
draft in Outlook and presses Send.

  quote     to customer service (customer_service in the settings, or --to),
            the quote request Field CRM made attached, subject
            "Quote request: <customer> (<date>)"
  customer  to the contacts ticked for documents on the call (--to to change),
            the customer copy attached if it is in the folder, subject
            "Our visit on <date>: <customer>"
  other     anything else: --to and --subject needed

--body is a text file Claude writes: what the email says, in plain words. A
blank line starts a paragraph; lines starting "- " are a list. Without it, a
short standard body for the kind is used. The signature from the settings
goes at the end.
"""
import argparse
import datetime as dt
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402

FONT = 'font-family:\'Helvetica Neue\',Roboto,Arial,sans-serif;font-size:15px;line-height:1.5;color:#222'


def nice(d):
    try:
        x = dt.date.fromisoformat(d)
        return '%d %s %d' % (x.day, x.strftime('%B'), x.year)
    except Exception:
        return d or ''


def paras_html(text):
    out, lst = [], []

    def flush():
        if lst:
            out.append('<ul style="margin:0 0 12px 20px;padding:0">' + ''.join('<li style="margin:0 0 4px">' + html.escape(x) + '</li>' for x in lst) + '</ul>')
            lst.clear()
    for block in re.split(r'\n\s*\n', text.strip()):
        lines = block.split('\n')
        for ln in lines:
            if re.match(r'\s*[-•]\s+', ln):
                lst.append(re.sub(r'^\s*[-•]\s+', '', ln))
            else:
                flush()
                if ln.strip():
                    out.append('<p style="margin:0 0 12px">' + html.escape(ln.strip()) + '</p>')
        flush()
    return ''.join(out)


def standard(kind, t, to_names):
    first = ', '.join(n.split()[0] for n in to_names if n) if to_names else ''
    if kind == 'quote':
        return 'Hi team,\n\nPlease quote the attached request for %s.\n\nThanks' % t.get('customer', '')
    if kind == 'customer':
        return ('Hi %s,\n\nThanks for your time on %s. The notes from the visit are attached.\n\n'
                'Let me know if anything is missing or not right.\n\nRegards' % (first or 'all', nice(t.get('date'))))
    return ''


def build(root, ticket, kind, to=None, cc=None, subject=None, body=None, attach=None):
    s = common.settings(root)
    tp = os.path.join(common.intake_dir(root), ticket)
    if not os.path.exists(tp):
        tp = os.path.join(common.intake_dir(root), common.DONE, ticket)
    t = common.read_json(tp)
    vd = common.visit_dir(root, t)
    names = os.listdir(vd) if os.path.isdir(vd) else []
    warn = []
    to_names = []
    if to is None:
        if kind == 'quote':
            to = [s['customer_service']] if s.get('customer_service') else []
            if not to:
                warn.append('no customer service address: set "customer_service" in ' + common.SETTINGS_NAME + ' or give --to')
        elif kind == 'customer':
            ppl = [x for x in t.get('contacts') or [] if x.get('email')]
            to = [x['email'] for x in ppl]
            to_names = [x.get('name', '') for x in ppl]
            if not to:
                warn.append('no contact on the call with an email, ticked for documents')
        else:
            to = []
    if attach is None:
        attach = []
        notes = (t.get('files') or {}).get('notes')
        if kind == 'quote' and notes in names:
            attach.append(os.path.join(vd, notes))
        if kind == 'customer':
            cust = [n for n in names if n.lower().endswith('.html') and re.search(r'customer|report', n, re.I) and n != notes]
            attach += [os.path.join(vd, n) for n in cust[:1]]
            if not cust:
                warn.append('no customer copy in the folder yet: make the report first, or attach it')
    for p in attach:
        if not os.path.exists(p):
            warn.append('attachment not found: ' + p)
    if subject is None:
        subject = {'quote': 'Quote request: %s (%s)' % (t.get('customer', ''), nice(t.get('date'))),
                   'customer': 'Our visit on %s: %s' % (nice(t.get('date')), t.get('customer', ''))}.get(kind, '')
    if not subject:
        sys.exit('Give --subject for an email of kind "%s".' % kind)
    text = body if body is not None else standard(kind, t, to_names)
    sig = s.get('signature') or s.get('me') or ''
    text_full = text.rstrip() + ('\n\n' + sig if sig else '')
    body_html = ('<div style="' + FONT + '">' + paras_html(text) +
                 ('<p style="margin:12px 0 0">' + '<br>'.join(html.escape(x) for x in sig.split('\n')) + '</p>' if sig else '') + '</div>')
    d = {'kind': 'field-crm-intake-draft', 'v': 1, 'email_kind': kind, 'ticket': os.path.basename(tp), 'callId': t.get('callId'),
         'to': [x for x in to if x], 'cc': [x for x in (cc or []) if x], 'subject': subject,
         'body_html': body_html, 'body_text': text_full, 'attachments': attach, 'send': False,
         'made': dt.datetime.now().isoformat(timespec='seconds'), 'warnings': warn}
    os.makedirs(os.path.join(vd, 'drafts'), exist_ok=True)
    out = os.path.join(vd, 'drafts', re.sub(r'[<>:"/\\|?*]+', ' ', '%s - %s.json' % (kind, t.get('customer') or 'call')).strip())
    prev = common.read_json(out) if os.path.exists(out) else {}
    if prev.get('outlook_id'):
        d['outlook_id'] = prev['outlook_id']     # made again: update that draft, not a second one
    common.write_json(out, d)
    return out, d


def main():
    ap = argparse.ArgumentParser(description='An email draft for Outlook (never sent).')
    ap.add_argument('--root', required=True)
    ap.add_argument('--ticket', required=True)
    ap.add_argument('--kind', choices=['quote', 'customer', 'other'], required=True)
    ap.add_argument('--to')
    ap.add_argument('--cc')
    ap.add_argument('--subject')
    ap.add_argument('--body', help='a text file with what the email says')
    ap.add_argument('--attach', nargs='*')
    a = ap.parse_args()
    body = open(a.body, encoding='utf-8').read() if a.body else None
    out, d = build(common.pc_folder(a.root), a.ticket, a.kind,
                   a.to.split(',') if a.to else None, a.cc.split(',') if a.cc else None, a.subject, body, a.attach)
    print(json.dumps({'file': out, 'to': d['to'], 'cc': d['cc'], 'subject': d['subject'], 'attachments': d['attachments'],
                      'warnings': d['warnings'], 'outlook_id': d.get('outlook_id', '')}, indent=1, ensure_ascii=False))


if __name__ == '__main__':
    main()
