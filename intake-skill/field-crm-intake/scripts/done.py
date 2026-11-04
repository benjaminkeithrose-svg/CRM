#!/usr/bin/env python3
"""Move a ticket to Intake\\Done, with what was done for it.

    python3 done.py --root "<PC folder>" --ticket "<ticket name>" --handled handled.json

handled.json is what Claude did and left for this call:

    {"made":    ["Example Foods - Smithfield - Site walk notes - 2026-11-03.html", ...],
     "drafts":  [{"kind": "customer", "to": ["pat@example.com"], "subject": "...", "outlook_id": "...", "file": "drafts/..."}],
     "booked":  [{"what": "Site visit", "date": "2026-12-01", "outlook_id": "..."}],
     "skipped": [{"job": "quote_ask", "why": "Ben said not yet"}],
     "to_check": ["Belt 2 width not given"],
     "projects": [{"project": "Spiral upgrade", "status": "Proposal", ...}]}

The ticket keeps everything it had and gains "handled" (with the time), so
the Done folder is the record of the week: the weekly Dynamics file is made
from it later. A ticket that came again (the call changed) keeps what was
done the first time under "handled_before". Nothing else moves: the visit
folder stays as it is.
"""
import argparse
import datetime as dt
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402

KEYS = ('made', 'drafts', 'booked', 'skipped', 'to_check', 'projects', 'note')


def move(root, ticket, handled, now=None):
    src = os.path.join(common.intake_dir(root), ticket)
    if not os.path.exists(src):
        sys.exit('No ticket called "%s" in %s.' % (ticket, common.intake_dir(root)))
    t = common.read_json(src)
    if not common.is_ticket(t):
        sys.exit(ticket + ' is not a Field CRM intake ticket.')
    ddir = os.path.join(common.intake_dir(root), common.DONE)
    os.makedirs(ddir, exist_ok=True)
    dest = os.path.join(ddir, ticket)
    if os.path.exists(dest):
        old = common.read_json(dest)
        before = old.get('handled_before') or []
        if old.get('handled'):
            before.append(old['handled'])
        if before:
            t['handled_before'] = before
    h = {k: handled[k] for k in KEYS if handled.get(k)}
    h['at'] = (now or dt.datetime.now()).isoformat(timespec='seconds')
    h['kind'] = common.HANDLED_KIND
    t['handled'] = h
    common.write_json(dest, t)
    # a newer ticket may have come in while this one was worked on: then it stays
    cur = common.read_json(src)
    if (cur.get('made') or 0) <= (t.get('made') or 0):
        os.remove(src)
        return dest, True
    return dest, False


def main():
    ap = argparse.ArgumentParser(description='Move a ticket to Intake\\Done.')
    ap.add_argument('--root', required=True)
    ap.add_argument('--ticket', required=True)
    ap.add_argument('--handled', help='handled.json: what was made, drafted, booked, skipped')
    a = ap.parse_args()
    h = common.read_json(a.handled) if a.handled else {}
    dest, moved = move(common.pc_folder(a.root), a.ticket, h)
    print(('Moved to ' if moved else 'Recorded in ') + dest + ('' if moved else ' (a newer ticket for this call came in, so it stays in the intake)'))


if __name__ == '__main__':
    main()
