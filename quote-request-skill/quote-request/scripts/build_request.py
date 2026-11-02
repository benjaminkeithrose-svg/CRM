#!/usr/bin/env python3
"""Draw a request to customer service from request.json and a template.

    python3 build_request.py request.json [--settings FOLDER] [--out FOLDER]
    python3 build_request.py --list-templates [--settings FOLDER]
    python3 build_request.py --show-template belt-quote [--settings FOLDER]

Writes, in the output folder (the quote requests folder by default):

  <Customer> - <label> - <date>.html        the request, to attach: Field CRM's
                                            stylesheet, logo and photos inside it
  <Customer> - <label> - <date> - email.html  the same for the body of an email:
                                            every style written on its element, no
                                            pictures (Outlook drops stylesheets and
                                            blocks pictures held in an email)
  <Customer> - <label> - <date> - email.txt   the same as plain text

The template (request.json's "template", e.g. "belt-quote") says what the
request holds: its sections, rows, field bands and which fields are required.
A copy in the person's own templates folder wins over the built-in one, so a
lasting change never touches this skill's folder. A change for one request
goes in request.json's "changes". DOCUMENTATION.md describes both.

Claude fills request.json; this script draws it, so every request looks the
same and nothing is written by hand.
"""
import argparse
import base64
import copy
import datetime as dt
import html
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402

LOGO = os.path.join(common.ROOT, 'assets', 'intralox-logo.png')
BUILT_IN = os.path.join(common.ROOT, 'templates')
DASH = '—'

# Field CRM's NOTES_CSS, as the end-game skill carries it
CSS = (
    '@page{size:A4;margin:14mm}'
    'html{background:#E9EAEB;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    'body{font-family:Roboto,Arial,"Helvetica Neue",Helvetica,sans-serif;font-size:11pt;color:#222222;margin:12px auto;padding:0;max-width:210mm;background:#FFFFFF;box-shadow:0 1px 6px rgba(0,0,0,.18)}'
    '.pg{padding:0 15mm 15mm}'
    '@media print{html{background:#FFFFFF}body{max-width:none;box-shadow:none;margin:0}.pg{padding:0 0 8mm}.mast{margin:0 0 16px;padding:10px 12px}h1,h2,h3,th{page-break-after:avoid;break-after:avoid}tr,img{page-break-inside:avoid;break-inside:avoid}table{page-break-inside:auto}.sep{page-break-after:avoid}p{orphans:3;widows:3}}'
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
    'td.l{background:#F7F8F8;width:38%;color:#4D4D4F;font-weight:bold;font-size:9.5pt}'
    'td.v{background:#FFFFFF}th.grp{background:#ACD3E1;color:#222222;font-size:9.5pt;letter-spacing:.09em}'
    '.flag{color:#B2232F;font-weight:bold}'
    '.sent{font-size:9.5pt;color:#77787A;font-style:italic;margin:2px 0 12px}'
    '.blk{page-break-inside:avoid;margin:0 0 22px;border:1px solid #EDEDED;border-left:3px solid #479EBC;border-radius:4px;padding:14px 16px 6px;background:#FFFFFF}'
    '.blk h3{margin:0 0 12px;padding:0 0 8px;border-bottom:2px solid #E3F0F5}.blk table{margin:0 0 6px}'
    '.cmt{margin:10px 0 8px;padding:9px 12px;background:#F7F8F8;border-left:3px solid #479EBC;font-weight:bold;color:#222222;font-size:10pt;line-height:1.45;page-break-inside:avoid}'
    '.cmt b{display:block;font-size:8pt;letter-spacing:.07em;text-transform:uppercase;color:#77787A;margin:0 0 4px}'
    '.cmt p{margin:0 0 6px}.cmt p:last-child{margin-bottom:0}.cmt ul{margin:0 0 6px 18px;padding:0}'
    '.chk{margin:0 0 14px 18px;padding:0}.chk li{margin:0 0 4px;color:#B2232F;font-weight:bold}'
    'td p{margin:0 0 6px}td p:last-child{margin-bottom:0}td ul{margin:0 0 6px 18px;padding:0}'
    'img{max-width:100%}td,th{word-wrap:break-word;overflow-wrap:break-word}'
    '.ft{background:#363738;color:#FFFFFF;font-size:8pt;letter-spacing:.04em;padding:9px 18px;margin:32px 0 0}'
    '.ph{font-size:0;margin:10px 0 16px}'
    '.ph figure{display:inline-block;vertical-align:top;width:48.5%;margin:0 3% 12px 0;font-size:11pt}'
    '.ph figure:nth-child(2n){margin-right:0}'
    '.ph figure img{margin:0;display:block;width:100%;max-width:100%;height:auto;border:1px solid #E3E3E3;border-radius:3px}'
    '.ph figcaption{font-size:9pt;color:#4D4D4F;margin-top:4px;line-height:1.35}'
    '@media print{.ph figure{page-break-inside:avoid;break-inside:avoid}.ft{margin:12px 0 0}}'
)

# the same look written on each element, for the email body (Outlook keeps only inline styles)
FONT = 'font-family:Arial,Helvetica,sans-serif;'
INLINE = {
    'wrap': FONT + 'font-size:11pt;color:#222222;max-width:720px',
    'eyebrow': FONT + 'font-size:8.5pt;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#479EBC;margin:0 0 4px',
    'h1': FONT + 'font-size:17pt;font-weight:bold;color:#222222;margin:0 0 2px',
    'sub': FONT + 'font-size:9.5pt;color:#77787A;margin:0 0 16px',
    'h2': FONT + 'font-size:11pt;font-weight:bold;color:#00708D;letter-spacing:1px;text-transform:uppercase;margin:22px 0 10px;padding:0 0 5px;border-bottom:1px solid #E3E3E3',
    'h3': FONT + 'font-size:12pt;font-weight:bold;color:#222222;margin:16px 0 7px',
    'table': FONT + 'border-collapse:collapse;width:100%;font-size:10pt;border:1px solid #B9BCBF;margin:0 0 12px',
    'th': FONT + 'background:#E3F0F5;color:#00708D;text-align:left;padding:6px 9px;border:1px solid #B9BCBF;font-size:9pt;font-weight:bold;text-transform:uppercase',
    'grp': FONT + 'background:#ACD3E1;color:#222222;text-align:left;padding:6px 9px;border:1px solid #B9BCBF;font-size:9.5pt;font-weight:bold;text-transform:uppercase',
    'td': FONT + 'padding:6px 9px;border:1px solid #D4D6D8;vertical-align:top',
    'l': FONT + 'padding:6px 9px;border:1px solid #D4D6D8;vertical-align:top;background:#F7F8F8;width:38%;color:#4D4D4F;font-weight:bold;font-size:9.5pt',
    'flag': 'color:#B2232F;font-weight:bold',
    'sent': FONT + 'font-size:9.5pt;color:#77787A;font-style:italic;margin:2px 0 12px',
    'cmt': FONT + 'margin:8px 0;padding:8px 11px;background:#F7F8F8;border-left:3px solid #479EBC;font-weight:bold;font-size:10pt',
    'cmtb': FONT + 'display:block;font-size:8pt;text-transform:uppercase;color:#77787A;margin:0 0 4px',
    'chk': FONT + 'margin:0 0 12px 18px;padding:0;color:#B2232F;font-weight:bold',
    'p': FONT + 'margin:0 0 6px',
    'ft': FONT + 'background:#363738;color:#FFFFFF;font-size:8pt;padding:8px 14px;margin:24px 0 0',
}


# ---------------------------------------------------------------- helpers

def esc(v):
    return html.escape('' if v is None else str(v), quote=True)


def given(v):
    return v not in (None, '', False, [], {}) and str(v).strip() not in ('', 'N/A')


def nice_date(s):
    """'2026-11-02' -> '2 November 2026'; anything else as given."""
    try:
        return dt.date.fromisoformat(str(s)[:10]).strftime('%d %B %Y').lstrip('0')
    except Exception:
        return '' if s is None else str(s)


def show(v, fmt=None):
    if fmt == 'date':
        v = nice_date(v)
    elif fmt == 'yes':
        if v is True or str(v).strip().lower() in ('yes', 'y', 'true'):
            v = 'Yes'
        elif isinstance(v, (int, float)) and not isinstance(v, bool):
            v = 'Yes ' + chr(215) + ' ' + ('%g' % v)
    elif isinstance(v, float):
        v = '%g' % v
    elif isinstance(v, list):
        v = ', '.join(str(x) for x in v)
    return v


def V(v):
    v = '' if v is None else str(v).strip()
    return DASH if v in ('', 'N/A') else v


def safe_name(s):
    s = re.sub(r'[\\/:*?"<>|]+', ' ', str(s or '')).strip()
    return re.sub(r'\s+', ' ', s)[:80] or 'request'


def text_paras(t):
    """Free text: a blank line starts a paragraph; lines starting with - or • are a list. [(kind, lines)]"""
    blocks, para, items = [], [], []

    def flush():
        if para:
            blocks.append(('p', para[:]))
            para.clear()
        if items:
            blocks.append(('ul', items[:]))
            items.clear()
    for line in ('' if t is None else str(t)).strip().splitlines():
        s = line.strip()
        m = re.match(r'^[-•*]\s+(.*)$', s)
        if not s:
            flush()
        elif m:
            if para:
                blocks.append(('p', para[:]))
                para.clear()
            items.append(m.group(1))
        else:
            if items:
                blocks.append(('ul', items[:]))
                items.clear()
            para.append(s)
    flush()
    return blocks


def key_of(s):
    return re.sub(r'\s+', ' ', str(s or '')).strip().lower()


# ---------------------------------------------------------------- templates and changes

def template_dirs(s):
    return [d for d in [s.get('templates'), BUILT_IN] if d]


def load_template(name, s):
    if name and os.path.isfile(name):
        with open(name, encoding='utf-8') as f:
            return json.load(f), name
    for d in template_dirs(s):
        p = os.path.join(d, (name or 'belt-quote') + '.json')
        if os.path.exists(p):
            with open(p, encoding='utf-8') as f:
                return json.load(f), p
    sys.exit('No template called "%s". Run with --list-templates to see them.' % name)


def apply_changes(t, ch, warn):
    """One request's changes to its template: title, footer, hide, rename, require, optional, add_rows, add_fields, sections."""
    t = copy.deepcopy(t)
    if not ch:
        return t
    if ch.get('title'):
        t['title'] = ch['title']
    if 'footer' in ch:
        t['footer'] = ch['footer']
    used = set()

    def hits(name, sec=None, grp=None, fld=None):
        """Does a hide/require/rename name point at this section, band or field?"""
        k = key_of(name)
        if fld is None and grp is None:
            return k == key_of(sec.get('heading'))
        if fld is None:
            return k == key_of(grp['name'])
        return k in (key_of(fld['label']), key_of(fld.get('key')), key_of(grp['name'] + ': ' + fld['label']))

    def each(names, fn):
        for name in names or []:
            found = False
            for sec in t['sections']:
                if hits(name, sec):
                    fn(sec, None, None)
                    found = True
                for grp in sec.get('groups', []):
                    if hits(name, sec, grp):
                        fn(sec, grp, None)
                        found = True
                    for fld in grp['fields']:
                        if hits(name, sec, grp, fld):
                            fn(sec, grp, fld)
                            found = True
                for row in sec.get('rows', []):
                    if isinstance(row, dict) and key_of(name) in (key_of(row.get('label')), key_of(row.get('key'))):
                        fn(sec, None, row)
                        found = True
            if not found:
                warn.append('change names "%s", which is not in the template' % name)

    def hide(sec, grp, fld):
        (fld or grp or sec)['hidden'] = True
    each(ch.get('hide'), hide)
    each(ch.get('require'), lambda s, g, f: f is not None and f.update(required=True))
    each(ch.get('optional'), lambda s, g, f: f is not None and f.update(required=False))
    for old, new in (ch.get('rename') or {}).items():
        def ren(sec, grp, fld, new=new):
            if fld is not None:
                fld['label'] = new
            elif grp is not None:
                grp['name'] = new
            else:
                sec['heading'] = new
        each([old], ren)

    for r in ch.get('add_rows') or []:
        sec = next((x for x in t['sections'] if x['type'] == 'details' and key_of(x['heading']) == key_of(r.get('section') or x['heading'])), None)
        if not sec:
            warn.append('add_rows: no details section "%s"' % r.get('section'))
            continue
        row = {'label': r['label'], 'value': r.get('value'), 'key': r.get('key'), 'required': r.get('required', False)}
        insert_after(sec['rows'], row, r.get('after'), lambda x: x.get('label'))
    for f in ch.get('add_fields') or []:
        grp = next((g for s in t['sections'] for g in s.get('groups', [])
                    if key_of(g['name']) == key_of(f.get('group'))
                    and (not f.get('section') or key_of(s['heading']) == key_of(f['section']))), None)
        if not grp:
            warn.append('add_fields: no band "%s"' % f.get('group'))
            continue
        fld = {'label': f['label'], 'key': f.get('key') or key_of(f['label']), 'required': f.get('required', False)}
        insert_after(grp['fields'], fld, f.get('after'), lambda x: x['label'])
    for s in ch.get('sections') or []:
        sec = {'type': 'extra', 'heading': s.get('heading', ''), 'rows': s.get('rows') or [], 'text': s.get('text')}
        heads = [key_of(x.get('heading')) for x in t['sections']]
        after = key_of(s.get('after'))
        if after in heads:
            i = heads.index(after) + 1
        else:   # before the notes and photos, else at the end
            i = next((n for n, x in enumerate(t['sections']) if x['type'] in ('notes', 'photos')), len(t['sections']))
        t['sections'].insert(i, sec)
    return t


def insert_after(lst, item, after, label):
    if after:
        for i, x in enumerate(lst):
            if key_of(label(x)) == key_of(after):
                lst.insert(i + 1, item)
                return
    lst.append(item)


# ---------------------------------------------------------------- photos

def load_image(path, max_side=1600):
    """(bytes, mime): made smaller with Pillow when it is there, else as the file is."""
    ext = os.path.splitext(path)[1].lower()
    try:
        from PIL import Image, ImageOps
        if ext in ('.heic', '.heif'):
            try:
                import pillow_heif
                pillow_heif.register_heif_opener()
            except ImportError:
                raise ValueError('HEIC photo: run pip install pillow-heif')
        im = ImageOps.exif_transpose(Image.open(path))
        im.thumbnail((max_side, max_side))
        if im.mode not in ('RGB', 'L'):
            im = im.convert('RGB')
        b = io.BytesIO()
        im.save(b, 'JPEG', quality=82)
        return b.getvalue(), 'image/jpeg'
    except ImportError:
        mime = {'.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp'}.get(ext, 'image/jpeg')
        with open(path, 'rb') as f:
            return f.read(), mime


# ---------------------------------------------------------------- the document

class Doc:
    """Builds one request as markup: with classes (the file) or with styles on every element (the email)."""

    def __init__(self, req, tpl, base, email=False):
        self.r, self.t, self.base, self.email = req, tpl, base, email
        self.p, self.txt, self.warn, self.photo_count = [], [], [], 0

    def a(self, cls, tag=None):
        if self.email:
            st = INLINE.get(cls) or INLINE.get(tag or '')
            return ' style="%s"' % st if st else ''
        return ' class="%s"' % cls if cls and cls not in ('h1', 'h2', 'h3', 'table', 'th', 'td', 'p') else ''

    def flag(self, text):
        return '<span%s>%s</span>' % (self.a('flag'), esc(text))

    def h2(self, text):
        self.p.append('<h2%s>%s</h2>' % (self.a('h2'), esc(text)))
        self.txt += ['', text.upper()]

    def table(self, rows, head=None):
        """rows: [[(html, plain), ...]] or label/value pairs when head is None."""
        out = ['<table%s%s>' % (self.a('table'), ' width="100%" cellpadding="0" cellspacing="0"' if self.email else '')]
        if head:
            out.append('<tr>' + ''.join('<th%s>%s</th>' % (self.a('th'), esc(h)) for h in head) + '</tr>')
            self.txt.append(' | '.join(head))
            for r in rows:
                out.append('<tr>' + ''.join('<td%s>%s</td>' % (self.a('td'), h) for h, _ in r) + '</tr>')
                self.txt.append(' | '.join(t for _, t in r))
        else:
            for label, (h, t) in rows:
                out.append('<tr><td%s>%s</td><td%s>%s</td></tr>' % (self.a('l'), esc(label), self.a('v', 'td'), h))
                self.txt.append('%s: %s' % (label, t))
        out.append('</table>')
        self.p.append(''.join(out))

    def text_block(self, t, record=True):
        out = []
        for kind, lines in text_paras(t):
            if kind == 'p':
                out.append('<p%s>%s</p>' % (self.a('p'), '<br>'.join(esc(x) for x in lines)))
                if record:
                    self.txt += lines
            else:
                out.append('<ul%s>%s</ul>' % (' style="margin:0 0 6px 18px;padding:0"' if self.email else '',
                                              ''.join('<li>%s</li>' % esc(x) for x in lines)))
                if record:
                    self.txt += ['- ' + x for x in lines]
        return ''.join(out)

    def value(self, v, fmt=None):
        v = show(v, fmt)
        return esc(V(v)), V(v)

    # sections
    def details(self, sec):
        rows = []
        for row in sec['rows']:
            if row.get('hidden'):
                continue
            v = row['value'] if 'value' in row and row.get('value') is not None else self.r.get(row.get('key') or '')
            if not given(v) and not row.get('required'):
                continue
            rows.append((row['label'], self.value(v, row.get('format'))))
        if self.r.get('in_crm') is False:
            rows.append(('Account status', (self.flag('Not in CRM ' + DASH + ' needs adding to Dynamics'),
                                            'Not in CRM - needs adding to Dynamics')))
        if rows:
            self.h2(sec['heading'])
            self.table(rows)

    def contacts(self, sec):
        people = [c for c in self.r.get('contacts') or [] if c.get('name')]
        if not people:
            return
        self.h2(sec['heading'])
        rows = []
        for c in people:
            crm = c.get('in_crm')
            last = (self.flag('Needs adding to Dynamics'), 'Needs adding to Dynamics') if crm is False else \
                ('On file', 'On file') if crm else (DASH, DASH)
            rows.append([self.value(c.get('name')), self.value(c.get('role')), self.value(c.get('email')),
                         self.value(c.get('mobile')), last])
        self.table(rows, ['Name', 'Role', 'Email', 'Mobile', 'CRM'])

    def checks(self, sec):
        items = [c for c in self.r.get('checks') or [] if given(c)]
        if not items:
            return
        self.h2(sec['heading'])
        if self.email:
            self.p.append('<ul%s>%s</ul>' % (self.a('chk'), ''.join('<li>%s</li>' % esc(c) for c in items)))
        else:
            self.p.append('<ul class="chk">%s</ul>' % ''.join('<li>%s</li>' % esc(c) for c in items))
        self.txt += ['- ' + c for c in items]

    def item_name(self, sec, it):
        for k in sec.get('name_from') or []:
            if given(it.get(k)):
                return str(it[k]).strip()
        return sec.get('unnamed') or sec.get('item_label') or 'Item'

    def items(self, sec):
        its = self.r.get(sec['items']) or []
        if not its:
            if sec.get('empty'):
                self.h2(sec['heading'])
                self.p.append('<p%s>%s</p>' % (self.a('sub'), esc(sec['empty'])))
                self.txt.append(sec['empty'])
            return
        self.h2(sec['heading'])
        for n, it in enumerate(its, 1):
            title = '%s %d %s %s' % (sec.get('item_label', 'Item'), n, DASH, self.item_name(sec, it))
            self.p.append('<div%s>' % ('' if self.email else ' class="blk"'))
            self.p.append('<h3%s>%s</h3>' % (self.a('h3'), esc(title)))
            self.txt += ['', title]
            out = ['<table%s%s>' % (self.a('table'), ' width="100%" cellpadding="0" cellspacing="0"' if self.email else ' class="spec"')]
            groups = [g for g in sec.get('groups', []) if not g.get('hidden')]
            other = [(k, v) for k, v in (it.get('other') or {}).items() if given(v)]
            if other:
                groups = groups + [{'name': 'Other', 'fields': [{'label': k, 'value': v} for k, v in other]}]
            for g in groups:
                rows = []
                for f in g['fields']:
                    if f.get('hidden'):
                        continue
                    v = f['value'] if 'value' in f else it.get(f.get('key'))
                    if f.get('key') == 'sprhdret' and given(v) and given(it.get('sprhdretqty')):
                        v = it.get('sprhdretqty')
                    if given(v) or f.get('required'):
                        rows.append((f['label'], self.value(v, f.get('format'))))
                if not rows:
                    continue
                out.append('<tr><th%s colspan="2">%s</th></tr>' % (self.a('grp', 'th'), esc(g['name'])))
                self.txt.append('[' + g['name'] + ']')
                for label, (h, t) in rows:
                    out.append('<tr><td%s>%s</td><td%s>%s</td></tr>' % (self.a('l'), esc(label), self.a('v', 'td'), h))
                    self.txt.append('  %s: %s' % (label, t))
            out.append('</table>')
            self.p.append(''.join(out))
            if given(it.get('comment')):
                lab = sec.get('comment_label') or 'Comments'
                self.txt.append(lab + ':')
                body = self.text_block(it['comment'])
                self.p.append('<div%s><b%s>%s</b>%s</div>' % (self.a('cmt'), ' style="%s"' % INLINE['cmtb'] if self.email else '', esc(lab), body))
            if sec.get('tsg'):
                if it.get('tsg'):
                    self.p.append('<p%s>Belt ID confirmed with TSG.</p>' % self.a('sent'))
                    self.txt.append('Belt ID confirmed with TSG.')
                else:
                    self.p.append('<p%s>%s</p>' % (self.a('sent'), self.flag('Belt ID not yet confirmed with TSG.')))
                    self.txt.append('Belt ID not yet confirmed with TSG.')
            if sec.get('photos'):
                self.photos(it.get('photos'))
            self.p.append('</div>')

    def notes(self, sec):
        notes = self.r.get('notes')
        if isinstance(notes, str):
            notes = [{'text': notes}] if notes.strip() else []
        notes = [n for n in notes or [] if given(n.get('text'))]
        if not notes:
            return
        self.h2(sec['heading'])
        if any(given(n.get('topic')) for n in notes):
            self.table([[self.value(n.get('topic')), (self.text_block(n.get('text'), False) or DASH, ' '.join(str(n.get('text')).split()))]
                        for n in notes], ['Topic', 'Note'])
        else:
            for n in notes:
                self.p.append(self.text_block(n['text']))

    def photos_section(self, sec):
        ids = self.r.get('customer_photos') or []
        if ids:
            self.h2(sec['heading'])
            self.photos(ids)

    def extra(self, sec):
        if sec.get('heading'):
            self.h2(sec['heading'])
        if sec.get('rows'):
            self.table([(str(r[0]), self.value(r[1] if len(r) > 1 else '')) for r in sec['rows']])
        if given(sec.get('text')):
            self.p.append(self.text_block(sec['text']))

    def photos(self, ids):
        ids = [i for i in ids or [] if i]
        if not ids:
            return
        lib = self.r.get('photos') or {}
        figs, found = [], 0
        for pid in ids:
            p = lib.get(pid)
            if not p:
                self.warn.append('photo "%s" is not in "photos"' % pid)
                continue
            path = p.get('file', '')
            if not os.path.isabs(path):
                path = os.path.join(self.base, path)
            if not os.path.exists(path):
                self.warn.append('photo file not found: ' + p.get('file', ''))
                continue
            self.photo_count += 1
            found += 1
            if self.email:
                continue
            try:
                data, mime = load_image(path)
            except Exception as ex:
                self.warn.append('photo %s could not be opened: %s' % (p.get('file'), ex))
                continue
            cap = esc(p.get('caption') or '')
            figs.append('<figure><img src="data:%s;base64,%s" alt="%s"><figcaption>%s</figcaption></figure>' % (
                mime, base64.b64encode(data).decode(), cap or 'Photo', cap))
        if self.email:
            if found:
                msg = '1 photo is in the attached request file.' if found == 1 else '%d photos are in the attached request file.' % found
                self.p.append('<p%s>%s</p>' % (self.a('sent'), esc(msg)))
                self.txt.append(msg)
        elif figs:
            self.p.append('<div class="ph">' + ''.join(figs) + '</div>')

    def build(self):
        t, r = self.t, self.r
        title = t.get('title') or 'Request for quote'
        cust = r.get('customer') or 'Customer not named'
        sub = [x for x in [r.get('site'), nice_date(r.get('date'))] if x]
        self.p.append('<p%s>Intralox</p>' % self.a('eyebrow'))
        self.p.append('<h1%s>%s %s %s</h1>' % (self.a('h1'), esc(title), DASH, esc(cust)))
        if sub:
            self.p.append('<p%s>%s</p>' % (self.a('sub'), ' &middot; '.join(esc(x) for x in sub)))
        self.txt += ['%s - %s' % (title, cust), ' - '.join(sub)]
        for sec in t['sections']:
            if sec.get('hidden'):
                continue
            {'details': self.details, 'contacts': self.contacts, 'checks': self.checks, 'items': self.items,
             'notes': self.notes, 'photos': self.photos_section, 'extra': self.extra}.get(
                sec['type'], lambda s: self.warn.append('unknown section type ' + s['type']))(sec)
        foot = t.get('footer')
        if self.email:
            body = ''.join(self.p) + ('<p%s>%s</p>' % (self.a('ft'), esc(foot)) if foot else '')
            if foot:
                self.txt += ['', foot]
            return ('<!DOCTYPE html><html><head><meta charset="utf-8"><title>%s</title></head><body>'
                    '<div style="%s">%s</div></body></html>') % (esc(title + ' - ' + cust), INLINE['wrap'], body)
        with open(LOGO, 'rb') as f:
            logo = base64.b64encode(f.read()).decode()
        return ('<!DOCTYPE html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
                '<title>%s</title><style>%s</style></head><body><div class="mast"><img src="data:image/png;base64,%s" alt="Intralox"></div>'
                '<div class="pg">%s</div>%s</body></html>') % (
            esc(title + ' ' + DASH + ' ' + cust), CSS, logo, ''.join(self.p),
            '<p class="ft">%s</p>' % esc(foot) if foot else '')


def required_missing(req, tpl):
    """Required fields not given: for the review list, so they can be asked for before sending."""
    miss = []
    for sec in tpl['sections']:
        if sec.get('hidden'):
            continue
        if sec['type'] == 'details':
            for row in sec['rows']:
                if row.get('required') and not row.get('hidden') and not given(row.get('value') if row.get('value') is not None else req.get(row.get('key') or '')):
                    miss.append(row['label'])
        if sec['type'] == 'items':
            for n, it in enumerate(req.get(sec['items']) or [], 1):
                for g in sec.get('groups', []):
                    if g.get('hidden'):
                        continue
                    for f in g['fields']:
                        if f.get('required') and not f.get('hidden') and not given(it.get(f.get('key'))):
                            miss.append('%s %d: %s' % (sec.get('item_label', 'Item'), n, f['label']))
    return miss


def build(req_path, s, out_dir=None):
    with open(req_path, encoding='utf-8') as f:
        req = json.load(f)
    base = os.path.dirname(os.path.abspath(req_path))
    tpl, tpl_path = load_template(req.get('template') or 'belt-quote', s)
    warn = []
    tpl = apply_changes(tpl, req.get('changes'), warn)
    out_dir = out_dir or s.get('out') or base
    os.makedirs(out_dir, exist_ok=True)
    stem = safe_name(' - '.join(x for x in [req.get('customer') or 'Customer', tpl.get('file_label') or tpl.get('title'),
                                           str(req.get('date') or dt.date.today().isoformat())[:10]] if x))
    doc = Doc(req, tpl, base)
    page = doc.build()
    mail = Doc(req, tpl, base, email=True)
    body = mail.build()
    files = {'file': os.path.join(out_dir, stem + '.html'),
             'email': os.path.join(out_dir, stem + ' - email.html'),
             'text': os.path.join(out_dir, stem + ' - email.txt')}
    with open(files['file'], 'w', encoding='utf-8') as f:
        f.write(page)
    with open(files['email'], 'w', encoding='utf-8') as f:
        f.write(body)
    with open(files['text'], 'w', encoding='utf-8') as f:
        f.write('\n'.join(mail.txt).strip() + '\n')
    return {'files': files, 'template': tpl_path, 'warnings': warn + doc.warn,
            'missing': required_missing(req, tpl), 'photos': doc.photo_count}


def main():
    ap = argparse.ArgumentParser(description='Draw a request to customer service from request.json.')
    ap.add_argument('request', nargs='?', help='request.json')
    ap.add_argument('--settings', help='the quote requests folder, or its settings file')
    ap.add_argument('--out', help='folder for the files (default: the settings\' "out", else beside request.json)')
    ap.add_argument('--list-templates', action='store_true')
    ap.add_argument('--show-template', metavar='NAME')
    a = ap.parse_args()
    s = common.settings(a.settings)
    if a.list_templates:
        seen = set()
        for d in template_dirs(s):
            if not os.path.isdir(d):
                continue
            for fn in sorted(os.listdir(d)):
                if fn.endswith('.json') and fn not in seen:
                    seen.add(fn)
                    with open(os.path.join(d, fn), encoding='utf-8') as f:
                        t = json.load(f)
                    own = '' if d == BUILT_IN else '  (your own copy)'
                    print('%s: %s%s\n  %s' % (fn[:-5], t.get('title'), own, t.get('about', '')))
        return
    if a.show_template:
        t, p = load_template(a.show_template, s)
        print('# ' + p)
        print(json.dumps(t, indent=2, ensure_ascii=False))
        return
    if not a.request:
        ap.error('give request.json')
    res = build(a.request, s, a.out)
    print('Template: ' + res['template'])
    print('Request (to attach):   ' + res['files']['file'])
    print('Email body (to paste): ' + res['files']['email'])
    print('Plain text:            ' + res['files']['text'])
    if res['missing']:
        print('\nRequired but not given (printed as a dash, so customer service sees it):')
        print('\n'.join('  - ' + m for m in res['missing']))
    if res['warnings']:
        print('\nWarnings:')
        print('\n'.join('  - ' + w for w in res['warnings']))


if __name__ == '__main__':
    main()
