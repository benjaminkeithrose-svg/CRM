"""Shared by the quote request scripts: where the settings, the catalogue and the templates are.

The settings live in a folder on the person's PC (the "quote requests folder"),
never in this skill's folder, which may be read only:

    <quote requests folder>/
      quote-request settings.json   {"workbook": "...", "crm_export": "...", "accessories": "...", "out": "...",
                                     "templates": "...", "customer_service_email": "..."}
      belt-catalogue.json           the catalogue read from the workbook (catalogue.py)
      templates/                    their own copies of templates, which win over the built-in ones
      <the requests it makes>

Every path in the settings may be absolute or relative to that folder.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SETTINGS_NAME = 'quote-request settings.json'
CATALOGUE_NAME = 'belt-catalogue.json'


def find_settings(path=None):
    """The settings file: as given, else in the current folder."""
    for p in [path, os.environ.get('QUOTE_REQUEST_SETTINGS'), os.path.join(os.getcwd(), SETTINGS_NAME)]:
        if not p:
            continue
        if os.path.isdir(p):
            p = os.path.join(p, SETTINGS_NAME)
        if os.path.exists(p):
            return os.path.abspath(p)
    return None


def settings(path=None):
    """{'folder', 'file', 'workbook', 'catalogue', 'templates', 'out', 'crm_export', 'accessories', 'customer_service_email'}:
    paths absolute; empty strings where not known."""
    sp = find_settings(path)
    s = {}
    if sp:
        with open(sp, encoding='utf-8') as f:
            s = json.load(f)
    folder = os.path.dirname(sp) if sp else (os.path.abspath(path) if path and os.path.isdir(path) else '')

    def where(v, default=''):
        v = v or default
        if not v:
            return ''
        v = os.path.expandvars(os.path.expanduser(v))
        return v if os.path.isabs(v) or not folder else os.path.join(folder, v)

    return {'folder': folder, 'file': sp or '',
            'workbook': where(s.get('workbook')),
            'catalogue': where(s.get('catalogue'), CATALOGUE_NAME if folder else ''),
            'templates': where(s.get('templates'), 'templates' if folder else ''),
            'out': where(s.get('out'), folder),
            'crm_export': where(s.get('crm_export')),
            'accessories': where(s.get('accessories')),
            'customer_service_email': s.get('customer_service_email') or ''}


def catalogue(args):
    """Load the catalogue from --catalogue, --workbook or the settings; exit with a plain message if none."""
    sys.path.insert(0, HERE)
    import catalogue as cat
    s = settings(getattr(args, 'settings', None))
    wb = getattr(args, 'workbook', None) or s['workbook']
    cache = getattr(args, 'catalogue', None) or s['catalogue'] or None
    try:
        return cat.load(wb or None, cache, refresh=getattr(args, 'refresh', False))
    except ValueError as ex:
        sys.exit('No belt catalogue: ' + str(ex) + '. Give the workbook with --workbook, or set "workbook" in ' + SETTINGS_NAME + '.')
