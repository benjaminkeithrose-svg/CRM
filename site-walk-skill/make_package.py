#!/usr/bin/env python3
"""Rebuild the site walk report skill's zip after a change.

    python3 site-walk-skill/make_package.py [--out FOLDER]

In order, it:
  1. makes DOCUMENTATION.html again from DOCUMENTATION.md (needs: pip install markdown);
  2. draws the example documents again from examples/example-report.json;
  3. runs the skill's self-test, and stops if it fails;
  4. zips the site-walk-report folder (the folder itself at the top of the zip,
     as Claude's skill upload expects) into site-walk-report.zip in FOLDER
     (default: the current folder). The zip is not kept in the repository.

The skill is a separate product from Field CRM that lives here for now. It is
not part of the app: the service worker never caches it.
"""
import argparse
import base64
import os
import re
import shutil
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.join(HERE, 'site-walk-report')
SKIP = ('self-test-output', '__pycache__')

css = '''
:root{color-scheme:light}
html{background:#E9EAEB}
body{font-family:"Helvetica Neue",Roboto,Arial,sans-serif;font-size:15px;line-height:1.55;color:#222;margin:16px auto;max-width:860px;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.18)}
.mast{background:#ED1C24;padding:14px 32px}.mast img{height:28px;display:block}
.pg{padding:8px 32px 32px}
.eyebrow{font-size:11px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;color:#479EBC;margin:22px 0 4px}
h1{font-size:26px;margin:0 0 12px;letter-spacing:-.015em}
h2{font-size:14px;margin:34px 0 12px;padding-bottom:6px;border-bottom:1px solid #E3E3E3;color:#00708D;letter-spacing:.09em;text-transform:uppercase}
h3{font-size:16px;margin:24px 0 8px;color:#222}
table{border-collapse:collapse;width:100%;margin:0 0 16px;font-size:14px;border:1px solid #B9BCBF;display:block;overflow-x:auto}
th{background:#E3F0F5;color:#00708D;text-align:left;padding:7px 10px;border:1px solid #B9BCBF;font-size:12px;letter-spacing:.06em;text-transform:uppercase}
td{padding:7px 10px;border:1px solid #D4D6D8;vertical-align:top}
td:first-child code{white-space:nowrap}
code{font-family:inherit;background:#F2F3F4;padding:1px 5px;border-radius:3px;font-size:.93em;color:#00287B}
pre{background:#F7F8F8;border-left:3px solid #479EBC;padding:12px 14px;overflow-x:auto;line-height:1.35}
pre code{background:none;padding:0;color:#222;font-family:Consolas,"Courier New",monospace;font-size:13px}
hr{border:0;border-top:1px solid #E3E3E3;margin:24px 0}
a{color:#00287B}
.ft{background:#363738;color:#fff;font-size:12px;letter-spacing:.04em;padding:10px 32px}
@media (max-width:600px){.pg{padding:4px 16px 24px}.mast{padding:12px 16px}}
@media print{html{background:#fff}body{box-shadow:none;margin:0;max-width:none}h2,h3{break-after:avoid}tr,pre{break-inside:avoid}}
'''


def docs_html():
    try:
        import markdown
    except ImportError:
        sys.exit('Needs the markdown package: pip install markdown')
    text = open(os.path.join(SKILL, 'DOCUMENTATION.md'), encoding='utf-8').read()
    body = markdown.markdown(text, extensions=['tables', 'fenced_code'])
    title = re.search(r'<h1>(.*?)</h1>', body).group(1)
    body = re.sub(r'<h1>.*?</h1>', '', body, count=1)
    with open(os.path.join(SKILL, 'assets', 'intralox-logo.png'), 'rb') as f:
        logo = base64.b64encode(f.read()).decode()
    html = ('<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>' + title + '</title><style>' + css + '</style></head><body>'
            '<div class="mast"><img alt="Intralox" src="data:image/png;base64,' + logo + '"></div><div class="pg">'
            '<p class="eyebrow">Claude skill</p><h1>' + title + '</h1>' + body + '</div>'
            '<div class="ft">' + title + ' · Intralox</div></body></html>')
    with open(os.path.join(SKILL, 'DOCUMENTATION.html'), 'w', encoding='utf-8') as f:
        f.write(html)
    print('1. DOCUMENTATION.html made')


def run(args):
    p = subprocess.run([sys.executable] + args, capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


def main():
    ap = argparse.ArgumentParser(description='Rebuild the site walk report skill zip.')
    ap.add_argument('--out', default='.', help='folder to write site-walk-report.zip into')
    a = ap.parse_args()

    docs_html()
    code, out = run([os.path.join(SKILL, 'scripts', 'build_report.py'), os.path.join(SKILL, 'examples', 'example-report.json')])
    print('2. Example documents drawn' if code == 0 else out)
    if code:
        sys.exit(1)
    code, out = run([os.path.join(SKILL, 'scripts', 'self_test.py')])
    print('3. ' + out.strip().splitlines()[-1])
    for s in SKIP:
        for root, dirs, _ in os.walk(SKILL):
            if s in dirs:
                shutil.rmtree(os.path.join(root, s))
    if code:
        print(out)
        sys.exit(1)

    dest = os.path.join(os.path.abspath(a.out), 'site-walk-report.zip')
    with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(SKILL):
            dirs[:] = sorted(d for d in dirs if d not in SKIP)
            for fn in sorted(files):
                p = os.path.join(root, fn)
                z.write(p, os.path.relpath(p, HERE))
    print('4. Zip: ' + dest)


if __name__ == '__main__':
    main()
