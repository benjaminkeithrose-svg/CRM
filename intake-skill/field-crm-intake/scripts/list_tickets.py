#!/usr/bin/env python3
"""What is waiting in the intake, and what each needs.

    python3 list_tickets.py --root "<PC folder>" [--json] [--done]

Reads every ticket in <PC folder>\\Intake (Field CRM puts one there for each
finished call or quote request), opens the call's visit folder, and says for
each, oldest first:

  - the customer, date, kind (call or quote request), and whether it came
    again because the call changed after it was first sent;
  - what is in the visit folder: Field CRM's notes or quote request, the call
    file, its photos, recordings, other photos, and Claude's report if made;
  - the call's belts, health checks, notes, projects, open next steps and the
    contacts ticked for documents (with or without an email);
  - the jobs it proposes, for Claude to do and the person to check:
      report        the call report, with the end-game skill (a call, no report
                    newer than the ticket yet)
      quote_email   a draft email to customer service with the quote request
                    Field CRM made (a quote request)
      quote_ask     a call with belts and a next step about a quote: ask
                    whether to make a quote request (the quote request skill)
      customer_email a draft follow-up email to the customer's contacts, with
                    the customer copy, once the report is checked
      follow_ups    dated next steps: offer to book a visit or call with the
                    visit planner skill, or leave them on Field CRM's planner
      projects      projects raised, for Dynamics (kept with the ticket)

Photos dropped anywhere in the Intake folder (downloaded from Google Photos)
are counted: the call report collects each visit's from there by the time
each was taken. --json prints {"tickets": [...], "dropped_photos": [...]}.

--done lists Intake\\Done instead. Nothing is changed.
"""
import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402

QUOTE_WORDS = re.compile(r'\b(quote|rfq|price|pricing)\b', re.I)


def files_in(d):
    try:
        return sorted(os.listdir(d))
    except OSError:
        return []


def look(root, path):
    t = common.read_json(path)
    if not common.is_ticket(t):
        return None
    out = {'ticket': os.path.basename(path), 'path': path, 'callId': t.get('callId'), 'customer': t.get('customer', ''),
           'date': t.get('date', ''), 'kind': 'quote request' if t.get('quote') else (t.get('type') or 'call'),
           'quote': bool(t.get('quote')), 'again': bool(t.get('again')), 'made': t.get('made') or 0,
           'folder': common.visit_dir(root, t), 'contacts': t.get('contacts') or [], 'steps': t.get('steps') or [],
           'problems': [], 'jobs': []}
    if t.get('v') != common.VERSION:
        out['problems'].append('ticket version %r; this skill reads version %d: update the skill' % (t.get('v'), common.VERSION))
        return out
    vd, files = out['folder'], t.get('files') or {}
    names = files_in(vd)
    if not os.path.isdir(vd):
        out['problems'].append('the visit folder is not there: ' + vd)
    out['notes_file'] = files.get('notes') if files.get('notes') in names else ''
    if files.get('notes') and not out['notes_file']:
        out['problems'].append('Field CRM\'s document is missing: ' + files.get('notes'))
    call_file = os.path.join(vd, files.get('call') or 'Field CRM call.json')
    out['call_file'] = call_file if os.path.exists(call_file) else ''
    rep = os.path.join(vd, files.get('report') or 'fieldcrm-import.json')
    out['report_file'] = ''
    if os.path.exists(rep):
        try:
            r = common.read_json(rep)
            if r.get('kind') == common.REPORT_KIND and r.get('callId') in (None, '', t.get('callId')):
                out['report_file'] = rep
                out['report_current'] = (r.get('made') or 0) >= out['made']
        except Exception:
            out['problems'].append('Claude\'s report in the folder cannot be read')
    out['recordings'] = [n for n in names if n.lower().endswith(common.RECORDING)]
    out['other_photos'] = [n for n in names if n.lower().endswith(common.PICTURE)]
    out['documents'] = [n for n in names if n.lower().endswith('.html')]
    belts = health = notes = 0
    projects, quote_belts = [], []
    if out['call_file']:
        try:
            c = common.read_json(call_file)
            if c.get('kind') != common.CALL_KIND:
                out['problems'].append('the call file is not Field CRM\'s')
            else:
                for e in c['call'].get('entries', []):
                    ty = e.get('type')
                    if ty == 'belt':
                        belts += 1
                        quote_belts.append(e.get('ref'))
                    elif ty == 'health':
                        health += 1
                    elif ty == 'note':
                        notes += 1
                    elif ty == 'project':
                        projects.append({k: e.get(k, '') for k in ('project', 'status', 'next', 'target', 'owner', 'notes')})
                out['photos'] = sum(len(e.get('photos') or []) for e in c['call'].get('entries', [])) + len(c['call'].get('loose') or [])
        except Exception as ex:
            out['problems'].append('the call file cannot be read: %s' % ex)
    else:
        out['problems'].append('Field CRM\'s call file is missing in the visit folder')
    out.update(belts=belts, health=health, notes=notes, projects=projects)
    # the jobs
    if out['quote']:
        out['jobs'].append('quote_email')
    else:
        if not (out['report_file'] and out.get('report_current')):
            out['jobs'].append('report')
        if belts and any(QUOTE_WORDS.search(s.get('what', '') + ' ' + s.get('type', '')) for s in out['steps']):
            out['jobs'].append('quote_ask')
        if any(x.get('email') for x in out['contacts']):
            out['jobs'].append('customer_email')
    if any(s.get('date') for s in out['steps']):
        out['jobs'].append('follow_ups')
    if projects and not out['quote']:
        out['jobs'].append('projects')
    return out


def dropped_photos(root):
    """Photos the person dropped anywhere in the Intake folder (from Google Photos), not in Done."""
    out, base = [], common.intake_dir(root)
    for d, dirs, files in os.walk(base):
        dirs[:] = [x for x in dirs if not (d == base and x == common.DONE)]
        out += [os.path.join(d, f) for f in files if f.lower().endswith(common.PICTURE)]
    return sorted(out)


def tickets(root, done=False):
    d = os.path.join(common.intake_dir(root), common.DONE) if done else common.intake_dir(root)
    out = []
    for n in files_in(d):
        if not n.lower().endswith('.json') or n == common.SETTINGS_NAME:
            continue
        try:
            x = look(root, os.path.join(d, n))
        except Exception as ex:
            x = {'ticket': n, 'path': os.path.join(d, n), 'problems': ['cannot be read: %s' % ex], 'jobs': [], 'made': 0}
        if x:
            out.append(x)
    out.sort(key=lambda x: (x.get('date') or '', x.get('made') or 0))
    return out


JOB_SAY = {'report': 'call report (end-game skill)', 'quote_email': 'email the quote request to customer service (draft)',
           'quote_ask': 'ask: make a quote request? (quote request skill)', 'customer_email': 'follow-up email to the customer (draft)',
           'follow_ups': 'dated next steps: offer to book (visit planner skill)', 'projects': 'projects, kept for Dynamics'}


def main():
    ap = argparse.ArgumentParser(description='What is waiting in the intake.')
    ap.add_argument('--root', required=True, help='the PC folder Field CRM files calls in (or its Intake folder)')
    ap.add_argument('--done', action='store_true', help='list Intake\\Done instead')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    root = common.pc_folder(a.root)
    if not os.path.isdir(common.intake_dir(root)):
        sys.exit('No Intake folder in ' + root + '. Field CRM makes it the first time it sends a call (Reports, Send to intake).')
    rows = tickets(root, a.done)
    pics = [] if a.done else dropped_photos(root)
    if a.json:
        print(json.dumps(rows if a.done else {'tickets': rows, 'dropped_photos': pics}, indent=1, ensure_ascii=False))
        return
    if pics:
        print('%d photo%s dropped in the intake (from Google Photos): each call report collects its visit\'s by time.\n' % (len(pics), '' if len(pics) == 1 else 's'))
    if not rows:
        print('Nothing in the intake.' if not a.done else 'Nothing in Intake\\Done.')
        return
    print('%d in the intake%s:' % (len(rows), ' (done)' if a.done else ''))
    for i, r in enumerate(rows, 1):
        print('\n%d. %s, %s: %s%s' % (i, r.get('customer'), r.get('date'), r.get('kind'), ' (changed since it was first sent)' if r.get('again') else ''))
        print('   Folder: ' + str(r.get('folder')))
        if r.get('belts') or r.get('health') or r.get('notes'):
            print('   %d belts, %d health checks, %d notes, %d photos; %d recordings and %d other photos in the folder' % (
                r.get('belts', 0), r.get('health', 0), r.get('notes', 0), r.get('photos', 0), len(r.get('recordings', [])), len(r.get('other_photos', []))))
        for s in r.get('steps', []):
            print('   Next step: %s%s' % (s.get('what'), ', by ' + s['date'] if s.get('date') else ''))
        for p in r.get('problems', []):
            print('   ! ' + p)
        for j in r.get('jobs', []):
            print('   - ' + JOB_SAY.get(j, j))


if __name__ == '__main__':
    main()
