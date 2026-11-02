#!/usr/bin/env python3
"""Say what this computer has for quote requests, and what is missing.

    python3 check_setup.py [--settings FOLDER]
"""
import argparse
import importlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402

LOGO = os.path.join(common.ROOT, 'assets', 'intralox-logo.png')


def has(mod):
    try:
        importlib.import_module(mod)
        return True
    except Exception:
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--settings', help='the quote requests folder, or its settings file')
    a = ap.parse_args()
    ok = sys.version_info >= (3, 8)
    print('Python ' + sys.version.split()[0] + (' - fine' if ok else ' - too old, needs 3.8 or later'))
    print('Logo: ' + ('found' if os.path.exists(LOGO) else 'MISSING - assets/intralox-logo.png'))
    ok &= os.path.exists(LOGO)
    xl = has('openpyxl')
    print('openpyxl (reads the plant audit workbook and an .xlsx CRM export): ' + ('yes' if xl else 'no - run: pip install openpyxl'))
    print('Pillow (smaller photos in the request): ' + ('yes' if has('PIL') else 'no - photos go in full size; to fix: pip install pillow'))
    print('pillow-heif (iPhone HEIC photos): ' + ('yes' if has('pillow_heif') else 'no - only needed for HEIC photos: pip install pillow-heif'))

    s = common.settings(a.settings)
    print()
    if not s['file']:
        print('Settings: not found. Make "%s" in the quote requests folder (see DOCUMENTATION.md).' % common.SETTINGS_NAME)
    else:
        print('Settings: ' + s['file'])
        wb = s['workbook']
        print('  Workbook: ' + (wb + (' - found' if os.path.exists(wb) else ' - NOT FOUND') if wb else 'not set'))
        crm = s['crm_export']
        print('  CRM export: ' + (crm + (' - found' if os.path.exists(crm) else ' - NOT FOUND') if crm else 'not set (only needed to check customers and contacts)'))
        print('  Customer service email: ' + (s['customer_service_email'] or 'not set'))
        print('  Catalogue kept in: ' + s['catalogue'] + (' (made)' if os.path.exists(s['catalogue']) else ' (made on first lookup)'))
        print('  Your own templates: ' + s['templates'] + ('' if os.path.isdir(s['templates']) else ' (none yet)'))
        print('  Requests written to: ' + s['out'])
        if wb and os.path.exists(wb) and xl:
            import catalogue
            try:
                c = catalogue.load(wb, s['catalogue'])
                n = c['counts']
                print('  Catalogue: %d belt combinations in %d series, %d sprocket rows' % (n['combos'], n['series'], n['sprockets']))
            except ValueError as ex:
                ok = False
                print('  Catalogue: could not read it - ' + str(ex))
    print()
    print('Ready.' if ok and xl else 'Not ready: see above.')


if __name__ == '__main__':
    main()
