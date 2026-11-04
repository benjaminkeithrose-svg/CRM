#!/usr/bin/env python3
"""The review page: what was made, what is in Outlook as a draft, what to check.

    python3 review.py --root "<PC folder>" [--date 2026-11-04] [--out page.html]

Writes Intake\\Review <date>.html: for each call handled that day (from
Intake\\Done), the documents made with links to them, each email draft in
Outlook (to, subject, and that it is a draft: nothing is sent), meetings
booked, what was left and why, and what to check. Then what is still waiting
in the intake. Inline styles, prints on A4. Opened in the browser on the PC,
the links open the files.
"""
import argparse
import datetime as dt
import html
import os
import pathlib
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import list_tickets  # noqa: E402

F = "font-family:'Helvetica Neue',Roboto,Arial,sans-serif"
TH = 'background:#E3F0F5;color:#00708D;text-align:left;padding:6px 8px;border:1px solid #B9BCBF;font-size:12px;letter-spacing:.06em;text-transform:uppercase'
TD = 'padding:6px 8px;border:1px solid #D4D6D8;vertical-align:top;font-size:14px'
H2 = 'font-size:14px;margin:26px 0 8px;padding-bottom:5px;border-bottom:1px solid #E3E3E3;color:#00708D;letter-spacing:.09em;text-transform:uppercase'
E = html.escape


def link(path, label=None):
    try:
        u = pathlib.Path(path).resolve().as_uri()
    except Exception:
        return E(label or path)
    return '<a style="color:#00287B" href="' + E(u) + '">' + E(label or os.path.basename(path)) + '</a>'


def rows(pairs):
    return ''.join('<tr><th style="' + TH + ';width:28%">' + E(k) + '</th><td style="' + TD + '">' + v + '</td></tr>' for k, v in pairs if v)


def page(root, day):
    done = [t for t in list_tickets.tickets(root, True)]
    today = []
    for x in done:
        t = common.read_json(x['path'])
        h = t.get('handled') or {}
        if str(h.get('at', '')).startswith(day):
            today.append((x, t, h))
    waiting = list_tickets.tickets(root)
    p = ['<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><title>Intake review ' + E(day) + '</title>'
         '<style>@page{size:A4;margin:14mm}</style></head><body style="' + F + ';color:#222;margin:16px;-webkit-print-color-adjust:exact;print-color-adjust:exact">',
         '<p style="font-size:11px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;color:#479EBC;margin:0 0 4px">Field CRM intake</p>',
         '<h1 style="font-size:24px;margin:0 0 6px">Review, ' + E(day) + '</h1>',
         '<p style="margin:0 0 4px;font-size:14px">' + str(len(today)) + (' call' if len(today) == 1 else ' calls') + ' worked through; ' +
         str(len(waiting)) + ' still waiting. <b>Nothing has been sent.</b> Every email is a draft in Outlook: read it there, then press Send.</p>']
    for x, t, h in today:
        vd = common.visit_dir(root, t)
        p.append('<h2 style="' + H2 + '">' + E(t.get('customer', '')) + ', ' + E(t.get('date', '')) + (' · quote request' if t.get('quote') else '') + '</h2>')
        p.append('<table style="border-collapse:collapse;width:100%;border:1px solid #B9BCBF">')
        drafts = ''.join('<div style="margin:0 0 6px"><b>' + E(d.get('subject', '')) + '</b><br>To ' + E(', '.join(d.get('to') or []) or 'nobody yet') +
                         ' · <span style="color:#00708D">draft, not sent</span>' + ('' if d.get('outlook_id') else ' · <span style="color:#8A5A00">not in Outlook yet</span>') + '</div>'
                         for d in h.get('drafts') or [])
        p.append(rows([
            ('Folder', link(vd, t.get('folder') or vd)),
            ('Made', '<br>'.join(link(os.path.join(vd, m), m) for m in h.get('made') or [])),
            ('Drafts in Outlook', drafts),
            ('Booked', '<br>'.join(E(b.get('what', '')) + ' ' + E(b.get('date', '')) + ('' if b.get('outlook_id') else ' (calendar file)') for b in h.get('booked') or [])),
            ('To check', '<br>'.join(E(c) for c in h.get('to_check') or [])),
            ('Left', '<br>'.join(E(s.get('job', '')) + ': ' + E(s.get('why', '')) for s in h.get('skipped') or [])),
            ('Projects', '<br>'.join(E(pr.get('project', '')) + (' · ' + E(pr.get('status')) if pr.get('status') else '')
                                     for pr in h.get('projects') or next((x.get('projects') for x in reversed(t.get('handled_before') or []) if x.get('projects')), []))),
            ('Into Field CRM', 'Reports, Bring in from Claude' if any(str(m).endswith('fieldcrm-import.json') for m in h.get('made') or []) else ''),
        ]))
        p.append('</table>')
    if waiting:
        p.append('<h2 style="' + H2 + '">Still in the intake</h2><table style="border-collapse:collapse;width:100%;border:1px solid #B9BCBF">')
        p.append('<tr><th style="' + TH + '">Call</th><th style="' + TH + '">Waiting for</th></tr>')
        for w in waiting:
            p.append('<tr><td style="' + TD + '">' + E(str(w.get('customer', ''))) + ', ' + E(str(w.get('date', ''))) + '</td><td style="' + TD + '">' +
                     E('; '.join(list_tickets.JOB_SAY.get(j, j) for j in w.get('jobs') or []) or '—') +
                     ''.join('<br><span style="color:#B2232F">' + E(pr) + '</span>' for pr in w.get('problems') or []) + '</td></tr>')
        p.append('</table>')
    p.append('</body></html>')
    return ''.join(p), len(today), len(waiting)


def main():
    ap = argparse.ArgumentParser(description='The intake review page.')
    ap.add_argument('--root', required=True)
    ap.add_argument('--date', help='the day handled (default today)')
    ap.add_argument('--out')
    a = ap.parse_args()
    root = common.pc_folder(a.root)
    day = a.date or dt.date.today().isoformat()
    doc, n, w = page(root, day)
    out = a.out or os.path.join(common.intake_dir(root), 'Review ' + day + '.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(doc)
    print('Wrote %s: %d handled, %d waiting' % (out, n, w))


if __name__ == '__main__':
    main()
