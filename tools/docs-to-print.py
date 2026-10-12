# Makes docs/field-crm-documentation.html, one printable A4 page, from the
# Markdown files in docs/. Run from the repo root: python3 tools/docs-to-print.py
# Needs nothing beyond Python 3: it reads only the Markdown these documents use
# (headings, paragraphs, lists, tables, code, links, bold, italic). Diagrams
# are drawn by mermaid from jsDelivr when the page opens, so they need signal;
# without it they show as their text.
import re, html, os

ORDER = ['README.md', '01-overview.md', '02-database.md', '03-sync-and-security.md',
         '04-ai.md', '05-data-in-and-out.md', '06-running-it.md', '07-developer.md',
         '08-your-data.md', 'glossary.md']
OUT = 'field-crm-documentation.html'
MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js'
used = set()

def slug(t, unique=True):
    s = re.sub(r'[^\w\- ]', '', t.lower()).strip().replace(' ', '-')
    if not unique: return s
    base, n = s, 1
    while s in used: s = f'{base}-{n}'; n += 1
    used.add(s); return s

def doc_id(f): return 'doc-' + f[:-3].lower()

def link(m):
    text, url = m.group(1), m.group(2)
    if re.match(r'https?:', url): return f'<a href="{url}">{text}</a>'
    f, _, anchor = url.partition('#')
    if f in ORDER: return f'<a href="#{anchor or doc_id(f)}">{text}</a>'
    if f == OUT: return text
    return f'<a href="#{anchor}">{text}</a>' if not f else text

def inline(t):
    codes = []
    def keep(m): codes.append('<code>' + html.escape(m.group(1)) + '</code>'); return f'\x00{len(codes)-1}\x00'
    t = re.sub(r'`([^`]+)`', keep, t)
    t = html.escape(t, quote=False)
    t = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', link, t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<i>\1</i>', t)
    return re.sub(r'\x00(\d+)\x00', lambda m: codes[int(m.group(1))], t)

def cells(row): return [c.strip() for c in row.strip().strip('|').split('|')]

def convert(md, f):
    out, lines, i = [], md.split('\n'), 0
    while i < len(lines):
        ln = lines[i]
        if not ln.strip(): i += 1; continue
        if ln.startswith('```'):
            lang, body = ln[3:].strip(), []
            i += 1
            while i < len(lines) and not lines[i].startswith('```'): body.append(lines[i]); i += 1
            i += 1
            code = html.escape('\n'.join(body), quote=False)
            out.append(f'<pre class="mermaid">{code}</pre>' if lang == 'mermaid' else f'<pre><code>{code}</code></pre>')
            continue
        m = re.match(r'(#{1,4}) (.*)', ln)
        if m:
            lvl, text = len(m.group(1)), m.group(2)
            hid = doc_id(f) if lvl == 1 else slug(text)
            if lvl == 1: slug(text)          # keeps GitHub's numbering of later duplicates
            out.append(f'<h{lvl} id="{hid}">{inline(text)}</h{lvl}>'); i += 1; continue
        if ln.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].startswith('|'): rows.append(lines[i]); i += 1
            head, body = cells(rows[0]), [cells(r) for r in rows[2:]]
            t = '<table><thead><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in head) + '</tr></thead><tbody>'
            t += ''.join('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in body)
            out.append(t + '</tbody></table>'); continue
        m = re.match(r'(- |\d+\. )', ln)
        if m:
            tag = 'ul' if m.group(1) == '- ' else 'ol'
            items = []
            while i < len(lines) and lines[i].strip():
                l = lines[i]
                mm = re.match(r'(- |\d+\. )(.*)', l)
                if mm: items.append(mm.group(2))
                else: items[-1] += ' ' + l.strip()
                i += 1
            out.append(f'<{tag}>' + ''.join(f'<li>{inline(x)}</li>' for x in items) + f'</{tag}>'); continue
        para = []
        while i < len(lines) and lines[i].strip() and not re.match(r'(#{1,4} |\||```|- |\d+\. )', lines[i]):
            para.append(lines[i].strip()); i += 1
        out.append('<p>' + inline(' '.join(para)) + '</p>')
    return '\n'.join(out)

CSS = '''
@page{size:A4;margin:14mm}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#2b2b2b;font:10.5pt/1.45 "Helvetica Neue",Roboto,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
main{max-width:180mm;margin:0 auto;padding:12mm 0}
h1{font-size:20pt;color:#00287B;margin:0 0 4mm;padding-bottom:2mm;border-bottom:2px solid #00A3E0}
h2{font-size:14pt;color:#2b2b2b;margin:7mm 0 2mm}
h3{font-size:11.5pt;color:#2b2b2b;margin:5mm 0 1.5mm}
h4{font-size:10.5pt;margin:4mm 0 1mm}
section.doc{break-before:page}
section.doc:first-of-type{break-before:auto}
p,ul,ol{margin:0 0 2.5mm}
li{margin:0 0 1mm}
table{border-collapse:collapse;width:100%;margin:0 0 4mm;font-size:9pt;break-inside:auto}
tr{break-inside:avoid}
th,td{border:1px solid #c8cdd2;padding:1.4mm 2mm;text-align:left;vertical-align:top}
th{background:#e8f6fc;color:#2b2b2b}
code{font-family:inherit;background:#f1f3f5;padding:0 1mm;border-radius:2px}
pre{background:#f7f8f9;border:1px solid #e1e4e8;padding:3mm;white-space:pre-wrap;font-family:inherit;font-size:9pt;break-inside:avoid}
pre code{background:none;padding:0}
pre.mermaid{background:#fff;text-align:center}
a{color:#00287B}
nav.toc ol{columns:2}
.made{color:#6b7178;font-size:9pt}
'''

def main():
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs')
    build = re.search(r'name="build" content="(v\d+)"',
                      open(os.path.join(root, '..', 'index.html')).read()).group(1)
    parts, toc = [], []
    for f in ORDER:
        md = open(os.path.join(root, f), encoding='utf-8').read()
        if f == 'README.md':      # the printable copy does not point at itself
            md = '\n\n'.join(p for p in md.split('\n\n') if OUT not in p)
        else:
            toc.append(f'<li><a href="#{doc_id(f)}">{inline(md.split(chr(10), 1)[0][2:])}</a></li>')
        parts.append(f'<section class="doc">\n{convert(md, f)}\n</section>')
    parts.insert(1, '<nav class="toc"><h2>Contents</h2><ol>' + ''.join(toc) + '</ol></nav>')
    page = f'''<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Field CRM documentation</title>
<style>{CSS}</style></head>
<body><main>
<p class="made">Field CRM {build}. Made from docs/ by tools/docs-to-print.py. Print it, or save it as PDF from the print screen.</p>
{chr(10).join(parts)}
</main>
<script src="{MERMAID}"></script>
<script>if(window.mermaid) mermaid.initialize({{startOnLoad:true,theme:'neutral',securityLevel:'strict'}});</script>
</body></html>
'''
    open(os.path.join(root, OUT), 'w', encoding='utf-8').write(page)
    print('wrote docs/' + OUT)

main()
