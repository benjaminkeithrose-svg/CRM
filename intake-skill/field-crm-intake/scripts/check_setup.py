#!/usr/bin/env python3
"""Say what this computer has for the intake, and what is missing.

    python3 check_setup.py --root "<PC folder>"
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True, help='the PC folder Field CRM files calls in')
    a = ap.parse_args()
    root = common.pc_folder(a.root)
    ok = sys.version_info >= (3, 8)
    print('Python ' + sys.version.split()[0] + (' - fine' if ok else ' - too old, needs 3.8 or later'))
    print('PC folder: ' + root + (' - found' if os.path.isdir(root) else ' - NOT FOUND'))
    ok &= os.path.isdir(root)
    has = os.path.isdir(common.intake_dir(root))
    print('Intake folder: ' + ('found' if has else 'not there yet - Field CRM makes it the first time it sends a call (Reports, Send to intake)'))
    s = common.settings(root)
    if s['file']:
        print('Settings: ' + s['file'])
        print('  Me: ' + (s['me'] or 'not set'))
        print('  Customer service (quote requests go to): ' + (s['customer_service'] or 'not set - quote emails need an address'))
        print('  Signature: ' + ('set' if s['signature'] else 'not set (your name is used)'))
    else:
        print('Settings: none yet. Make "%s" in the Intake folder (see DOCUMENTATION.md).' % common.SETTINGS_NAME)
    print()
    print('Ready.' if ok else 'Not ready: see above.')


if __name__ == '__main__':
    main()
