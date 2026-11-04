"""Shared by the intake scripts: the files Field CRM writes and reads, and the settings.

Field CRM (v193) files each finished call in the PC folder, in its visit
folder (Customer\\Site\\date, or Customer\\Quote requests\\date), and puts a
ticket in the Intake folder inside the PC folder. The kinds and versions here
are the app's (IN_KIND, CL_OUT_KIND, CL_IN_KIND in app.js): change both sides
together. tests/qa-intake-skill.mjs checks they agree.
"""
import json
import os
import re

TICKET_KIND = 'field-crm-intake-ticket'
CALL_KIND = 'field-crm-call-for-claude'
REPORT_KIND = 'field-crm-claude-report'
HANDLED_KIND = 'field-crm-intake-handled'
VERSION = 1
INTAKE = 'Intake'
DONE = 'Done'
SETTINGS_NAME = 'intake settings.json'
# what a ticket carries (inTicket in app.js); the repo test checks the app writes each
TICKET_FIELDS = ['kind', 'v', 'made', 'app', 'again', 'callId', 'customer', 'site', 'date', 'type', 'quote', 'noReport',
                 'mgr', 'folder', 'folderParts', 'files', 'contacts', 'steps']
RECORDING = ('.mp3', '.m4a', '.wav', '.aac', '.ogg', '.opus', '.webm')
PICTURE = ('.jpg', '.jpeg', '.png', '.heic', '.webp')


def pc_folder(path):
    """The PC folder, given it or its Intake folder."""
    p = os.path.abspath(os.path.expanduser(path or '.'))
    if os.path.basename(p).lower() == INTAKE.lower() and not os.path.isdir(os.path.join(p, INTAKE)):
        p = os.path.dirname(p)
    return p


def intake_dir(root):
    return os.path.join(root, INTAKE)


def settings(root):
    """Intake\\intake settings.json: me, email, customer_service, signature. All optional."""
    out = {'me': '', 'email': '', 'customer_service': '', 'signature': '', 'file': ''}
    f = os.path.join(intake_dir(root), SETTINGS_NAME)
    if os.path.exists(f):
        with open(f, encoding='utf-8') as fh:
            out.update({k: v for k, v in json.load(fh).items() if v is not None})
        out['file'] = f
    return out


def read_json(path):
    with open(path, encoding='utf-8-sig') as f:
        return json.load(f)


def is_ticket(d):
    return isinstance(d, dict) and d.get('kind') == TICKET_KIND


def visit_dir(root, t):
    parts = t.get('folderParts') or re.split(r'[\\/]', t.get('folder') or '')
    return os.path.join(root, *[p for p in parts if p])


def write_json(path, d):
    tmp = path + '.part'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(d, f, indent=1, ensure_ascii=False)
    os.replace(tmp, path)
