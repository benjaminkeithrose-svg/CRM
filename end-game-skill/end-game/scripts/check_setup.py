#!/usr/bin/env python3
"""Say what this computer has for the site walk report, and what is missing.

    python3 check_setup.py
"""
import importlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_report import find_browser, LOGO  # noqa: E402


def has(mod):
    try:
        importlib.import_module(mod)
        return True
    except Exception:
        return False


def main():
    ok = True
    print('Python ' + sys.version.split()[0] + (' - fine' if sys.version_info >= (3, 8) else ' - too old, needs 3.8 or later'))
    ok &= sys.version_info >= (3, 8)
    print('Logo: ' + ('found' if os.path.exists(LOGO) else 'MISSING - assets/intralox-logo.png'))
    ok &= os.path.exists(LOGO)
    pil = has('PIL')
    print('Pillow (photo times, smaller photos in the report): ' + ('yes' if pil else 'no - run: pip install pillow'))
    print('pillow-heif (iPhone HEIC photos): ' + ('yes' if has('pillow_heif') else 'no - only needed for HEIC photos: pip install pillow-heif'))
    print('openpyxl (reading an .xlsx CRM export): ' + ('yes' if has('openpyxl') else 'no - only needed for .xlsx: pip install openpyxl'))
    browser = find_browser()
    engines = [n for n, h in [('Chromium/Edge (' + (browser or 'Playwright') + ')', browser or has('playwright')),
                              ('WeasyPrint', has('weasyprint')), ('ReportLab', has('reportlab'))] if h]
    print('PDF: ' + (', '.join(engines) if engines else 'nothing yet - run: pip install reportlab'))
    print()
    if ok and pil and engines:
        print('Ready.')
    elif ok:
        print('Ready for the HTML report. Install what is listed above for the rest.')
    else:
        print('Not ready: see above.')


if __name__ == '__main__':
    main()
