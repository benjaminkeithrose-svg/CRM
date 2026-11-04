"""Shared by the visit planner's scripts: the settings, the zone map, the CRM export.

The settings live in a folder on the person's PC (the "visits folder"), never in
this skill's folder, which may be read only:

    <visits folder>/
      visit-planner settings.json   {"me": "...", "email": "...", "crm_export": "...",
                                     "home_tz": "Australia/Sydney", "out": "...", "templates": "..."}
      templates/                    their own copies of templates, which win over the built-in ones
      <the meetings it makes>

Every path in the settings may be absolute or relative to that folder.
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SETTINGS_NAME = 'visit-planner settings.json'
ZONES_FILE = os.path.join(ROOT, 'data', 'zones.json')    # a copy of Field CRM's zones.js: geography only
TZ_FALLBACK = 'Australia/Sydney'


def find_settings(path=None):
    for p in [path, os.environ.get('VISIT_PLANNER_SETTINGS'), os.path.join(os.getcwd(), SETTINGS_NAME)]:
        if not p:
            continue
        if os.path.isdir(p):
            p = os.path.join(p, SETTINGS_NAME)
        if os.path.exists(p):
            return os.path.abspath(p)
    return None


def settings(path=None):
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

    return {'folder': folder, 'file': sp or '', 'me': s.get('me') or '', 'email': s.get('email') or '',
            'crm_export': where(s.get('crm_export')), 'home_tz': s.get('home_tz') or TZ_FALLBACK,
            'out': where(s.get('out'), folder), 'templates': where(s.get('templates'), 'templates' if folder else ''),
            'day_start': s.get('day_start') or '08:00', 'day_end': s.get('day_end') or '17:00'}


# ---------------------------------------------------------------- zones, as Field CRM finds them

_Z = None


def zones():
    global _Z
    if _Z is None:
        with open(ZONES_FILE, encoding='utf-8') as f:
            d = json.load(f)
        sub2 = {}
        for z in d['zoneOrder']:             # in zone order, the later zone winning, as Field CRM does
            for x in d['zones'].get(z, {}).get('subs', []):
                sub2[x.upper()] = z
        _Z = {'zones': d['zones'], 'order': d['zoneOrder'], 'sub2zone': sub2}
    return _Z


def suburb_of(name):
    """The site after the last " - " in a CRM account name, as Field CRM's suburbOf."""
    n = str(name or '').replace('\u00a0', ' ').strip()
    parts = re.split(r'\s-\s*|\s*-\s', n)
    if len(parts) == 1:
        return ''
    return re.sub(r'\(.*?\)', '', parts[-1]).strip().upper()


def zone_of(name):
    """Field CRM's zoneOf, without the account overrides (they hold customer names and stay on the device)."""
    Z = zones()
    sub = suburb_of(name)
    if not sub:
        return 'Z12'
    canon = sub.title().upper()
    if canon in Z['sub2zone']:
        return Z['sub2zone'][canon]
    w = canon.split()
    for k in range(len(w) - 1, 0, -1):
        z = Z['sub2zone'].get(' '.join(w[:k]))
        if z:
            return z
    return 'Z12'


def zone_info(z):
    zz = zones()['zones'].get(z) or {}
    return {'id': z, 'name': zz.get('name', 'unzoned'), 'hub': zz.get('hub', ''), 'tz': zz.get('tz') or TZ_FALLBACK,
            'tz_assumed': bool(zz.get('tzAssumed', not zz))}
