#!/usr/bin/env python3
"""Draw the end-game documents: report.json in, two documents out, each as HTML and PDF.

  - Site walk notes (internal): the call details and contacts, with "Not in CRM"
    flags; the notes; the internal notes; the photos; and the belts to quote,
    laid out as Field CRM's belt request for quote, for customer service.
  - Site walk report (customer copy): the same without the internal notes,
    the CRM flags, contact details and the TSG line.

Claude fills in report.json; this script draws it, so two documents never
differ in layout. The look is Field CRM's own call notes and quote request:
the same stylesheet, the same belt fields in the same order, A4.

    python3 build_report.py path/to/report.json
    python3 build_report.py report.json --only customer
    python3 build_report.py report.json --html-only
    python3 build_report.py report.json --pdf-engine reportlab

The HTML is self-contained (photos and logo inside it), so it can be attached
to an email or opened anywhere. The PDF is made by the first of these that is
available: Chromium or Edge (identical to the HTML), WeasyPrint, or ReportLab
(close to the HTML, drawn natively). With none of them, the script says how to
make the PDF from the HTML by hand.

The fields of report.json are described in DOCUMENTATION.md, and
examples/example-report.json is a complete one.
"""
import argparse
import base64
import datetime as dt
import html
import io
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LOGO = os.path.join(ROOT, 'assets', 'intralox-logo.png')
DASH = '—'

# ---------------------------------------------------------------- helpers

def esc(v):
    return html.escape('' if v is None else str(v), quote=True)


def text_html(t):
    """Free text: a blank line starts a paragraph; lines starting with - or • are a list."""
    t = ('' if t is None else str(t)).strip()
    if not t:
        return ''
    out, para, items = [], [], []

    def flush():
        if para:
            out.append('<p>' + '<br>'.join(esc(x) for x in para) + '</p>')
            para.clear()
        if items:
            out.append('<ul>' + ''.join('<li>' + esc(x) + '</li>' for x in items) + '</ul>')
            items.clear()

    for line in t.splitlines():
        s = line.strip()
        if not s:
            flush()
            continue
        m = re.match(r'^[-•*]\s+(.*)$', s)
        if m:
            if para:
                out.append('<p>' + '<br>'.join(esc(x) for x in para) + '</p>')
                para.clear()
            items.append(m.group(1))
        else:
            if items:
                out.append('<ul>' + ''.join('<li>' + esc(x) + '</li>' for x in items) + '</ul>')
                items.clear()
            para.append(s)
    flush()
    return ''.join(out)


def nice_date(s):
    """'2026-10-29' -> '29 October 2026'; anything else is shown as given."""
    try:
        d = dt.date.fromisoformat(str(s)[:10])
        return d.strftime('%d %B %Y').lstrip('0')
    except Exception:
        return str(s or '')


def photo_time(s):
    try:
        return dt.datetime.fromisoformat(str(s)).strftime('%H:%M')
    except Exception:
        return ''


def safe_name(s):
    s = re.sub(r'[\\/:*?"<>|]+', ' ', str(s or '')).strip()
    return re.sub(r'\s+', ' ', s)[:80] or 'report'


def heif_support():
    """iPhone photos (HEIC) open only with pillow-heif installed."""
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
        return True
    except Exception:
        return False


HEIF = ('.heic', '.heif')


def load_image(path, max_side=1600):
    """JPEG bytes for embedding: resized and orientation-corrected when Pillow is there."""
    try:
        from PIL import Image, ImageOps
    except ImportError:
        if path.lower().endswith(HEIF):
            raise ValueError('HEIC photos need Pillow and pillow-heif: pip install pillow pillow-heif')
        with open(path, 'rb') as f:
            data = f.read()
        mime = 'image/png' if path.lower().endswith('.png') else 'image/jpeg'
        return data, mime, None
    if path.lower().endswith(HEIF) and not heif_support():
        raise ValueError('HEIC photo: run pip install pillow-heif, or set the phone camera to save JPEG')
    im = Image.open(path)
    im = ImageOps.exif_transpose(im)
    if im.mode not in ('RGB', 'L'):
        im = im.convert('RGB')
    im.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=82, optimize=True)
    return buf.getvalue(), 'image/jpeg', im.size


# Field CRM's NOTES_CSS (app.js) unchanged, less the parts these documents do not use;
# then photos two to a row with captions, and spacing for the notes' bullet points
CSS = (
    '@page{size:A4;margin:14mm}'
    'html{background:#E9EAEB;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    'body{font-family:Roboto,Arial,"Helvetica Neue",Helvetica,sans-serif;font-size:11pt;color:#222222;margin:12px auto;padding:0;max-width:210mm;background:#FFFFFF;box-shadow:0 1px 6px rgba(0,0,0,.18)}'
    '.pg{padding:0 15mm 15mm}'
    '@media print{html{background:#FFFFFF}body{max-width:none;box-shadow:none;margin:0}.pg{padding:0 0 8mm}.mast{margin:0 0 16px;padding:10px 12px}h1,h2,h3,th{page-break-after:avoid;break-after:avoid}tr,img{page-break-inside:avoid;break-inside:avoid}table{page-break-inside:auto}thead{display:table-header-group}.sep{page-break-after:avoid}p{orphans:3;widows:3}}'
    '.mast{background:#ED1C24;padding:13px 15mm;margin:0 0 22px}'
    '.mast img{height:26px;width:auto;display:block}'
    'h1{font-size:17pt;margin:0 0 2px;color:#222222;letter-spacing:-.015em;font-weight:bold}'
    'h2{font-size:11pt;margin:26px 0 10px;padding:0 0 5px;border-bottom:1px solid #E3E3E3;color:#00708D;letter-spacing:.09em;text-transform:uppercase;font-weight:bold}'
    'h3{font-size:12pt;margin:18px 0 7px;color:#222222;letter-spacing:-.01em}'
    '.sub{color:#77787A;font-size:9.5pt;margin:0 0 16px;line-height:1.5}'
    '.eyebrow{font-size:8.5pt;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;color:#479EBC;margin:0 0 4px}'
    'table{border-collapse:collapse;width:100%;margin:0 0 14px;font-size:10pt;border:1px solid #B9BCBF}'
    'th{background:#E3F0F5;color:#00708D;text-align:left;padding:7px 10px;border:1px solid #B9BCBF;font-size:9pt;font-weight:bold;letter-spacing:.06em;text-transform:uppercase}'
    'td{padding:7px 10px;border:1px solid #D4D6D8;vertical-align:top;line-height:1.4}'
    'td.l{background:#F7F8F8;width:38%;color:#4D4D4F;font-weight:bold;font-size:9.5pt;letter-spacing:0;text-transform:none}'
    'td.v{background:#FFFFFF}th.grp{background:#ACD3E1;color:#222222;font-size:9.5pt;letter-spacing:.09em}'
    '.flag{color:#B2232F;font-weight:bold}'
    '.sent{font-size:9.5pt;color:#77787A;font-style:italic;margin:2px 0 12px}'
    '.blk{page-break-inside:avoid;margin:0 0 22px;border:1px solid #EDEDED;border-left:3px solid #479EBC;border-radius:4px;padding:14px 16px 6px;background:#FFFFFF}'
    '.blk h3{margin:0 0 12px;padding:0 0 8px;border-bottom:2px solid #E3F0F5}.blk table{margin:0 0 6px}'
    '.sep{height:0;border:0;border-top:2px solid #E3F0F5;margin:0 0 22px}'
    '.cmt{margin:10px 0 8px;padding:9px 12px;background:#F7F8F8;border-left:3px solid #479EBC;font-weight:bold;color:#222222;font-size:10pt;line-height:1.45;page-break-inside:avoid}'
    '.cmt b{display:block;font-size:8pt;letter-spacing:.07em;text-transform:uppercase;color:#77787A;margin:0 0 4px}'
    '.cmt p{margin:0 0 6px}.cmt p:last-child{margin-bottom:0}.cmt ul{margin:0 0 6px 18px;padding:0}'
    '.cmt ul:last-child{margin-bottom:0}.cmt li{margin:0 0 2px}.ph{margin:10px 0 16px}'
    '.ph img{max-width:420px;width:auto;height:auto;border:1px solid #E3E3E3;border-radius:3px;margin:0 10px 10px 0}'
    'img{max-width:100%}td,th{word-wrap:break-word;overflow-wrap:break-word}'
    '.ft{background:#363738;color:#FFFFFF;font-size:8pt;letter-spacing:.04em;padding:9px 18px;margin:32px 0 0}'
    '.ph{font-size:0}'
    '.ph figure{display:inline-block;vertical-align:top;width:48.5%;margin:0 3% 12px 0;font-size:11pt}'
    '.ph figure:nth-child(2n){margin-right:0}'
    '.ph figure img{margin:0;display:block;width:100%;max-width:100%;height:auto}'
    '.ph figcaption{font-size:9pt;color:#4D4D4F;margin-top:4px;line-height:1.35}.ph figcaption .t{color:#77787A}'
    '.pg>ul{margin:0 0 10px 18px;padding:0}.pg>ul li{margin:0 0 6px;line-height:1.45}'
    '@media print{.ph figure{page-break-inside:avoid;break-inside:avoid}.pg{padding-bottom:0}.pg>*:last-child{margin-bottom:0}.ft{margin:12px 0 0}}'
)

# ---------------------------------------------------------------- the report data

class Report:
    def __init__(self, data, base):
        self.d = data
        self.base = base
        self.photos = data.get('photos') or {}
        self.used = set()
        self.missing = []
        self.lean = False       # the copy kept in Field CRM: photos named, not embedded (they are on the call)

    def photo(self, pid):
        p = self.photos.get(pid)
        if not p:
            self.missing.append(pid)
            return None
        path = p.get('file', '')
        if not os.path.isabs(path):
            path = os.path.join(self.base, path)
        if not os.path.exists(path):
            self.missing.append(pid + ' (' + p.get('file', '') + ')')
            return None
        self.used.add(pid)
        return dict(p, path=path, id=pid)

    def image(self, p, max_side=1600):
        """The photo ready to embed, or None (and a warning) when it cannot be opened."""
        try:
            return load_image(p['path'], max_side)
        except Exception as ex:
            self.used.discard(p['id'])
            self.missing.append(p['id'] + ' (' + os.path.basename(p['path']) + ': ' + str(ex) + ')')
            return None


# the two documents
DOCS = {
    'internal': {'title': 'Site walk notes', 'details': 'Call details', 'contacts': 'Contacts'},
    'customer': {'title': 'Site walk report', 'details': 'Visit details', 'contacts': 'People'},
}


def doc_title(d, kind):
    return DOCS[kind]['title'] + ' ' + DASH + ' ' + (d.get('customer') or 'Customer not named')


def sub_line(d):
    return [x for x in [d.get('site'), d.get('type') or 'Site walk', nice_date(d.get('date'))] if x]


def details_rows(d, kind):
    """(label, value, flag) rows. The internal copy prints every row, an em dash where
    nothing was given, as Field CRM's call notes do; the customer copy leaves empty rows out."""
    if kind == 'internal':
        rows = [('Date', nice_date(d.get('date'))), ('Call type', d.get('type') or 'Site walk'),
                ('Account manager', d.get('account_manager')), ('Customer', d.get('customer')),
                ('Site or area', d.get('site'))]
        out = [(k, v, False) for k, v in rows]
        if d.get('in_crm') is False:
            out.append(('Account status', 'Not in CRM ' + DASH + ' needs adding to Dynamics', True))
        return out
    rows = [('Date', nice_date(d.get('date'))), ('Customer', d.get('customer')), ('Site or area', d.get('site')),
            ('Intralox contact', d.get('account_manager'))]
    return [(k, v, False) for k, v in rows if v not in (None, '')]


def contact_rows(d, kind):
    people = [c for c in d.get('contacts') or [] if c.get('name')]
    if kind == 'internal':
        head = ['Name', 'Role', 'Email', 'Mobile', 'CRM']
        rows = [[(c.get('name'), False), (c.get('role'), False), (c.get('email'), False), (c.get('mobile'), False),
                 ('Needs adding to Dynamics', True) if c.get('in_crm') is False else ('On file', False)] for c in people]
    else:
        head = ['Name', 'Role']
        rows = [[(c.get('name'), False), (c.get('role'), False)] for c in people]
    return head, rows


# Field CRM's beltSpecGroups (app.js), field for field: (label, key, always printed)
BELT_GROUPS = [
    ('Belt', [('Line / description', 'beltdesc', 0), ('Series', 'series', 1), ('Style / surface', 'style', 1),
              ('Belt material', 'beltmat', 1), ('Colour', 'colour', 0), ('Rod material', 'rodmat', 1),
              ('Belt width (mm)', 'width', 1), ('Belt length (m)', 'beltlen', 0), ('Conveyor length (m)', 'clength', 0),
              ('Inside frame width (mm)', 'frame', 0), ('Retrofit', 'retrofit', 0)]),
    ('Sprockets', [('Description', 'sprocket', 0), ('Part number', 'sprpn', 0), ('Bore', 'sprbore', 0),
                   ('Pitch diameter', 'sprpd', 0), ('Material', 'sprmat', 0), ('Build type or variant', 'sprvar', 0),
                   ('Drive quantity', 'sprdrive', 0), ('Idle quantity', 'spridle', 0)]),
    ('Flights and sideguards', [('Flight type', 'fstyle', 0), ('Flight material', 'flmat', 0), ('Flight height (mm)', 'fheight', 0),
                                ('Every N rows', 'frows', 0), ('Flight spacing (mm)', 'fspacing', 0), ('Indent (mm)', 'findent', 0),
                                ('Centre notch (mm)', 'cnotch', 0), ('Sideguard type', 'sgtype', 0),
                                ('Sideguard material', 'sgmat', 0), ('Sideguard height (mm)', 'sgheight', 0)]),
]


def given(v):
    return v not in (None, '', False) and str(v).strip() not in ('', 'N/A')


def belt_groups(b, kind):
    """The spec table's bands. On the quote request (internal) the required fields print
    even when empty, so customer service sees what was not given; quantity leads, as in
    Field CRM. The customer copy shows only what was given."""
    groups = []
    for name, fields in BELT_GROUPS:
        rows = [(label, b.get(k)) for label, k, req in fields if given(b.get(k)) or (req and kind == 'internal')]
        if name == 'Belt':
            if kind == 'internal' or given(b.get('qty')):
                rows.insert(0, ('Quantity', b.get('qty')))
            if kind == 'internal' and given(b.get('qcontact')):
                rows.append(('Quote contact', b.get('qcontact')))
        if rows:
            groups.append((name, rows))
    extra = [(k, v) for k, v in (b.get('other') or {}).items() if given(v)]
    if extra:
        groups.append(('Other', extra))
    return groups


def belt_name(b):
    # Field CRM's beltName: the asset number, else the line description
    return str(b.get('asset') or '').strip() or str(b.get('beltdesc') or '').strip() or 'No asset no.'


def V(v):
    v = '' if v is None else str(v).strip()
    return DASH if v in ('', 'N/A') else v


# ---------------------------------------------------------------- HTML

def figures_html(r, ids):
    figs = []
    for pid in ids or []:
        p = r.photo(pid)
        if not p:
            continue
        if r.lean:
            t = photo_time(p.get('time'))
            figs.append('<p class="sent">Photo' + (', ' + t if t else '') + ': ' + esc(p.get('caption') or '') + '</p>')
            continue
        img = r.image(p)
        if not img:
            continue
        data, mime, _ = img
        t = photo_time(p.get('time'))
        cap = esc(p.get('caption') or '')
        figs.append('<figure><img src="data:%s;base64,%s" alt="%s"><figcaption>%s%s</figcaption></figure>' % (
            mime, base64.b64encode(data).decode(), cap or 'Photo', ('<span class="t">' + t + '</span> ' if t else ''), cap))
    if r.lean:
        return ''.join(figs)
    return '<div class="ph">' + ''.join(figs) + '</div>' if figs else ''


def build_html(r, kind, lean=False):
    d = r.d
    r.lean = lean
    with open(LOGO, 'rb') as f:
        logo = base64.b64encode(f.read()).decode()
    title = doc_title(d, kind)
    p = ['<!DOCTYPE html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
         '<title>' + esc(title) + '</title><style>' + CSS + '</style></head><body>',
         '<div class="mast"><img src="data:image/png;base64,' + logo + '" alt="Intralox"></div><div class="pg">',
         '<p class="eyebrow">Intralox</p><h1>' + esc(title) + '</h1>',
         '<p class="sub">' + ' &middot; '.join(esc(x) for x in sub_line(d)) + '</p>']

    p.append('<h2>' + DOCS[kind]['details'] + '</h2><table>')
    for k, v, flag in details_rows(d, kind):
        p.append('<tr><td class="l">' + esc(k) + '</td><td>' + ('<span class="flag">' + esc(v) + '</span>' if flag else esc(V(v))) + '</td></tr>')
    p.append('</table>')

    head, rows = contact_rows(d, kind)
    if rows:
        p.append('<h2>' + DOCS[kind]['contacts'] + '</h2><table><tr>' + ''.join('<th>' + h + '</th>' for h in head) + '</tr>')
        for row in rows:
            p.append('<tr>' + ''.join('<td>' + ('<span class="flag">' + esc(v) + '</span>' if flag else esc(V(v))) + '</td>' for v, flag in row) + '</tr>')
        p.append('</table>')

    if d.get('notes'):
        p.append('<h2>Notes</h2>' + text_html(d['notes']))
    if kind == 'internal' and d.get('internal_notes'):
        p.append('<h2>Internal notes</h2>' + text_html(d['internal_notes']) + '<p class="sent">Not in the customer copy.</p>')
    if d.get('other_photos'):
        p.append('<h2>Photos</h2>' + figures_html(r, d['other_photos']))

    belts = d.get('belts') or []
    if belts:
        p.append('<h2>Belts to quote</h2>')
        for i, b in enumerate(belts):
            if i:
                p.append('<hr class="sep">')
            p.append('<div class="blk"><h3>Belt ' + str(i + 1) + ' ' + DASH + ' ' + esc(belt_name(b)) + '</h3><table class="spec">')
            for name, grows in belt_groups(b, kind):
                p.append('<tr><th class="grp" colspan="2">' + esc(name) + '</th></tr>')
                p += ['<tr><td class="l">' + esc(k) + '</td><td class="v">' + esc(V(v)) + '</td></tr>' for k, v in grows]
            p.append('</table>')
            if b.get('comment'):
                p.append('<div class="cmt"><b>General comments</b>' + text_html(b['comment']) + '</div>')
            if kind == 'internal':
                p.append('<p class="sent">Belt ID confirmed with TSG.</p>' if b.get('tsg') else
                         '<p class="sent"><span class="flag">Belt ID not yet confirmed with TSG.</span></p>')
            p.append(figures_html(r, b.get('photos')))
            p.append('</div>')

    p.append('</div><p class="ft">' + esc(' · '.join(x for x in [DOCS[kind]['title'], d.get('customer'), nice_date(d.get('date'))] if x)) +
             ' · Intralox</p></body></html>')
    return ''.join(x for x in p if x)


# ---------------------------------------------------------------- PDF

def find_browser():
    for name in ('chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'chrome', 'msedge', 'microsoft-edge'):
        p = shutil.which(name)
        if p:
            return p
    for p in (r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
              r'C:\Program Files\Google\Chrome\Application\chrome.exe',
              '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
              '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/opt/pw-browsers/chromium'):
        if os.path.isfile(p) and os.access(p, os.X_OK):
            return p
    return None


def pdf_chromium(html_path, pdf_path):
    # Playwright first, when installed: it controls the page size and margins exactly
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            pg = b.new_page()
            pg.goto(pathlib.Path(os.path.abspath(html_path)).as_uri())
            pg.pdf(path=pdf_path, format='A4', print_background=True, prefer_css_page_size=True)
            b.close()
        return True
    except Exception:
        pass
    exe = find_browser()
    if not exe:
        return False
    url = pathlib.Path(os.path.abspath(html_path)).as_uri()
    # a browser run as root (some sandboxes) only starts without its own sandbox
    for extra in ([], ['--no-sandbox']):
        try:
            subprocess.run([exe, '--headless', '--disable-gpu', '--no-pdf-header-footer'] + extra +
                           ['--print-to-pdf=' + os.path.abspath(pdf_path), url],
                           check=True, timeout=120, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 1000:
                return True
        except Exception:
            pass
    return False


def pdf_weasyprint(html_path, pdf_path):
    try:
        from weasyprint import HTML
    except Exception:
        return False
    HTML(filename=html_path).write_pdf(pdf_path)
    return True


def pdf_reportlab(r, kind, pdf_path):
    """The same document drawn natively, for when no browser is available."""
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether)
    except Exception:
        return False
    C = lambda h: colors.HexColor(h)
    INK, INK2, INK3, CYAN, CYANDK, LINE, RED = C('#222222'), C('#4D4D4F'), C('#77787A'), C('#479EBC'), C('#00708D'), C('#B9BCBF'), C('#B2232F')
    F, FB, FI = 'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique'
    st = {
        'eyebrow': ParagraphStyle('e', fontName=FB, fontSize=8.5, textColor=CYAN, leading=11, spaceAfter=2),
        'h1': ParagraphStyle('h1', fontName=FB, fontSize=17, leading=21, textColor=INK, spaceAfter=2),
        'sub': ParagraphStyle('s', fontName=F, fontSize=9.5, leading=13, textColor=INK3, spaceAfter=10),
        'h2': ParagraphStyle('h2', fontName=FB, fontSize=11, leading=14, textColor=CYANDK, spaceBefore=16, spaceAfter=8, keepWithNext=1),
        'h3': ParagraphStyle('h3', fontName=FB, fontSize=12, leading=15, textColor=INK, spaceAfter=6),
        'body': ParagraphStyle('b', fontName=F, fontSize=10, leading=14, textColor=INK, spaceAfter=5),
        'bullet': ParagraphStyle('bl', fontName=F, fontSize=10, leading=14, textColor=INK, spaceAfter=4, leftIndent=12, bulletIndent=2),
        'cmt': ParagraphStyle('cm', fontName=FB, fontSize=10, leading=14, textColor=INK, spaceAfter=3),
        'cmtk': ParagraphStyle('ck', fontName=FB, fontSize=7.5, leading=10, textColor=INK3, spaceAfter=2),
        'sent': ParagraphStyle('se', fontName=FI, fontSize=9.5, leading=13, textColor=INK3, spaceAfter=6),
        'cell': ParagraphStyle('c', fontName=F, fontSize=9.5, leading=12.5, textColor=INK),
        'lbl': ParagraphStyle('l', fontName=FB, fontSize=9, leading=12, textColor=INK2),
        'th': ParagraphStyle('t', fontName=FB, fontSize=8.5, leading=11, textColor=CYANDK),
        'grp': ParagraphStyle('g', fontName=FB, fontSize=8.5, leading=11, textColor=INK),
        'cap': ParagraphStyle('cap', fontName=F, fontSize=8.5, leading=11, textColor=INK2),
    }
    W = A4[0] - 28 * mm
    d = r.d

    def P(t, s='body'):
        return Paragraph(t, st[s])

    def flag(t):
        return '<font color="#B2232F"><b>' + esc(t) + '</b></font>'

    def text_flow(t, s='body'):
        out = []
        for block in re.split(r'\n\s*\n', str(t or '').strip()):
            for x in [x.strip() for x in block.splitlines() if x.strip()]:
                m = re.match(r'^[-•*]\s+(.*)$', x)
                out.append(Paragraph(esc(m.group(1)), st['bullet'], bulletText='•') if m else P(esc(x), s))
        return out

    def figs(ids, width=W):
        cells = []
        for pid in ids or []:
            p = r.photo(pid)
            if not p:
                continue
            img = r.image(p, 1200)
            if not img:
                continue
            data, _, size = img
            iw, ih = size or (4, 3)
            w = min(80 * mm, iw)
            h = w * ih / iw
            if h > 65 * mm:
                h = 65 * mm
                w = h * iw / ih
            t = photo_time(p.get('time'))
            cap = ('<font color="#77787A">' + t + '</font> ' if t else '') + esc(p.get('caption') or '')
            cells.append([Image(io.BytesIO(data), width=w, height=h), P(cap, 'cap')])
        if not cells:
            return []
        rows = [cells[i:i + 2] + [''] * (2 - len(cells[i:i + 2])) for i in range(0, len(cells), 2)]
        tb = Table(rows, colWidths=[width / 2] * 2)
        tb.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 8)]))
        return [Spacer(1, 4), tb]

    def grid(data, widths, head=False, label_col=False, extra=()):
        tb = Table(data, colWidths=widths, repeatRows=1 if head else 0)
        style = [('GRID', (0, 0), (-1, -1), 0.6, C('#D4D6D8')), ('BOX', (0, 0), (-1, -1), 0.8, LINE), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                 ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5)]
        if head:
            style.append(('BACKGROUND', (0, 0), (-1, 0), C('#E3F0F5')))
        if label_col:
            style.append(('BACKGROUND', (0, 0), (0, -1), C('#F7F8F8')))
        tb.setStyle(TableStyle(style + list(extra)))
        return tb

    def h2(t):
        return [P(esc(t.upper()), 'h2')]

    story = []
    with open(LOGO, 'rb') as f:
        logo = f.read()
    mast = Table([[Image(io.BytesIO(logo), width=26 * mm * 321 / 132 * 0.38, height=26 * mm * 0.38)]], colWidths=[W])
    mast.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), C('#ED1C24')), ('LEFTPADDING', (0, 0), (-1, -1), 10),
                              ('TOPPADDING', (0, 0), (-1, -1), 9), ('BOTTOMPADDING', (0, 0), (-1, -1), 9), ('ALIGN', (0, 0), (-1, -1), 'LEFT')]))
    title = doc_title(d, kind)
    story += [mast, Spacer(1, 14), P('INTRALOX', 'eyebrow'), P(esc(title), 'h1'), P(' · '.join(esc(x) for x in sub_line(d)), 'sub')]

    rows = [[P(esc(k), 'lbl'), P(flag(v) if fl else esc(V(v)), 'cell')] for k, v, fl in details_rows(d, kind)]
    story += h2(DOCS[kind]['details']) + [grid(rows, [W * .38, W * .62], label_col=True)]

    head, crow = contact_rows(d, kind)
    if crow:
        widths = [W * x for x in ((.22, .2, .28, .16, .14) if kind == 'internal' else (.5, .5))]
        data = [[P(h.upper(), 'th') for h in head]] + [[P(flag(v) if fl else esc(V(v)), 'cell') for v, fl in row] for row in crow]
        story += h2(DOCS[kind]['contacts']) + [grid(data, widths, head=True)]

    if d.get('notes'):
        story += h2('Notes') + text_flow(d['notes'])
    if kind == 'internal' and d.get('internal_notes'):
        story += h2('Internal notes') + text_flow(d['internal_notes']) + [P('Not in the customer copy.', 'sent')]
    if d.get('other_photos'):
        story += h2('Photos') + figs(d['other_photos'])

    belts = d.get('belts') or []
    if belts:
        story += h2('Belts to quote')
        IW = W - 24
        for i, b in enumerate(belts):
            inner = [P('Belt %d %s %s' % (i + 1, DASH, esc(belt_name(b))), 'h3')]
            data, extra = [], []
            for name, grows in belt_groups(b, kind):
                extra += [('SPAN', (0, len(data)), (1, len(data))), ('BACKGROUND', (0, len(data)), (1, len(data)), C('#ACD3E1'))]
                data.append([P(esc(name).upper(), 'grp'), ''])
                for k, v in grows:
                    extra.append(('BACKGROUND', (0, len(data)), (0, len(data)), C('#F7F8F8')))
                    data.append([P(esc(k), 'lbl'), P(esc(V(v)), 'cell')])
            inner.append(grid(data, [IW * .38, IW * .62], extra=extra))
            if b.get('comment'):
                c = Table([[[P('GENERAL COMMENTS', 'cmtk')] + text_flow(b['comment'], 'cmt')]], colWidths=[IW])
                c.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), C('#F7F8F8')), ('LINEBEFORE', (0, 0), (0, -1), 3, CYAN),
                                       ('LEFTPADDING', (0, 0), (-1, -1), 9), ('TOPPADDING', (0, 0), (-1, -1), 6)]))
                inner += [Spacer(1, 8), c]
            if kind == 'internal':
                inner += [Spacer(1, 6), P(flag('Belt ID not yet confirmed with TSG.') if not b.get('tsg') else 'Belt ID confirmed with TSG.', 'sent')]
            inner += figs(b.get('photos'), IW)
            # the belt block: a cyan stripe down the left, as Field CRM's .blk
            blk = Table([[x] for x in inner], colWidths=[W])
            blk.setStyle(TableStyle([('LINEBEFORE', (0, 0), (0, -1), 3, CYAN), ('BOX', (0, 0), (-1, -1), 0.6, C('#EDEDED')),
                                     ('LEFTPADDING', (0, 0), (-1, -1), 12), ('RIGHTPADDING', (0, 0), (-1, -1), 12),
                                     ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
                                     ('TOPPADDING', (0, 0), (-1, 0), 10)]))
            story += [blk, Spacer(1, 14)]

    foot = ' · '.join(x for x in [DOCS[kind]['title'], d.get('customer'), nice_date(d.get('date'))] if x) + ' · Intralox'

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(C('#363738'))
        canvas.rect(14 * mm, 8 * mm, W, 7 * mm, fill=1, stroke=0)
        canvas.setFillColor(colors.white)
        canvas.setFont(F, 7.5)
        canvas.drawString(17 * mm, 10.4 * mm, foot)
        canvas.drawRightString(14 * mm + W - 3 * mm, 10.4 * mm, 'Page %d' % doc.page)
        canvas.restoreState()

    doc = SimpleDocTemplate(pdf_path, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=14 * mm, bottomMargin=20 * mm,
                            title=title, author='Intralox')
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return True


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description='Draw the site walk notes (internal) and report (customer copy), HTML and PDF, from report.json.')
    ap.add_argument('report', help='path to report.json')
    ap.add_argument('--out', help='folder to save into (default: the folder report.json is in)')
    ap.add_argument('--only', choices=['internal', 'customer'], help='make one of the two documents only')
    ap.add_argument('--html-only', action='store_true', help='make the HTML only')
    ap.add_argument('--pdf-engine', choices=['auto', 'chromium', 'weasyprint', 'reportlab'], default='auto')
    a = ap.parse_args()

    with open(a.report, encoding='utf-8') as f:
        data = json.load(f)
    base = os.path.dirname(os.path.abspath(a.report))
    out = a.out or base
    os.makedirs(out, exist_ok=True)
    made, used, missing = [], set(), set()
    for kind in ([a.only] if a.only else ['internal', 'customer']):
        name = safe_name(' - '.join(x for x in [data.get('customer'), DOCS[kind]['title'], str(data.get('date') or '')[:10]] if x))
        r = Report(data, base)
        html_path = os.path.join(out, name + '.html')
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(build_html(r, kind))
        print(DOCS[kind]['title'] + ' (' + kind + ')')
        print('  HTML: ' + html_path)
        used |= r.used
        missing |= set(r.missing)
        if a.html_only:
            continue
        pdf_path = os.path.join(out, name + '.pdf')
        engines = {'chromium': lambda: pdf_chromium(html_path, pdf_path), 'weasyprint': lambda: pdf_weasyprint(html_path, pdf_path),
                   'reportlab': lambda: pdf_reportlab(Report(data, base), kind, pdf_path)}
        order = ['chromium', 'weasyprint', 'reportlab'] if a.pdf_engine == 'auto' else [a.pdf_engine]
        for e in order:
            try:
                if engines[e]():
                    print('  PDF:  ' + pdf_path + '  (made with ' + e + ')')
                    break
            except Exception as ex:
                print('  note: ' + e + ' could not make the PDF: ' + str(ex))
        else:
            print('  PDF:  not made - no PDF tool is available here. Run "pip install reportlab" and try again, '
                  'or open the HTML in Edge or Chrome, press Ctrl+P, choose "Save as PDF", paper A4, tick "Background graphics".')

    unused = sorted(set(data.get('photos') or {}) - used)
    if unused:
        print('WARNING: photos listed but not placed in the report: ' + ', '.join(unused))
    if missing:
        print('WARNING: photos not found or could not be opened: ' + ', '.join(sorted(missing)))


if __name__ == '__main__':
    main()
