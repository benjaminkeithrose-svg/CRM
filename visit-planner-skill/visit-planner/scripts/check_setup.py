#!/usr/bin/env python3
"""Say what this computer has for the visit planner, and what is missing.

    python3 check_setup.py [--settings FOLDER]
"""
import argparse
import importlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402


def has(mod):
    try:
        importlib.import_module(mod)
        return True
    except Exception:
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--settings')
    a = ap.parse_args()
    ok = sys.version_info >= (3, 8)
    print('Python ' + sys.version.split()[0] + (' - fine' if ok else ' - too old, needs 3.8 or later'))
    print('Zone map: ' + ('found' if os.path.exists(common.ZONES_FILE) else 'MISSING - data/zones.json'))
    ok &= os.path.exists(common.ZONES_FILE)
    print('openpyxl (reads an .xlsx CRM export): ' + ('yes' if has('openpyxl') else 'no - only needed for .xlsx: pip install openpyxl'))
    tz = False
    try:
        from zoneinfo import ZoneInfo
        ZoneInfo('Australia/Sydney')
        tz = True
    except Exception:
        pass
    print('Time zone database (UTC times for the Outlook connection): ' + ('yes' if tz else 'no - optional: pip install tzdata'))
    s = common.settings(a.settings)
    print()
    if not s['file']:
        print('Settings: not found. Make "%s" in the visits folder (see DOCUMENTATION.md).' % common.SETTINGS_NAME)
    else:
        print('Settings: ' + s['file'])
        print('  Me: ' + (s['me'] or 'not set (needed to plan a week)'))
        print('  CRM export: ' + (s['crm_export'] + (' - found' if os.path.exists(s['crm_export']) else ' - NOT FOUND') if s['crm_export'] else 'not set'))
        print('  Home time zone: ' + s['home_tz'])
        print('  Meetings written to: ' + s['out'])
        print('  Your own templates: ' + s['templates'] + ('' if os.path.isdir(s['templates']) else ' (none yet)'))
    print()
    print('Ready.' if ok else 'Not ready: see above.')


if __name__ == '__main__':
    main()
