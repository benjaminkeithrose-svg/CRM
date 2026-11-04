#!/usr/bin/env python3
"""Look up belts and sprockets in the catalogue while a request is being written.

    python3 lookup.py series
    python3 lookup.py styles --series 800
    python3 lookup.py materials --series 800 --style "flat top"
    python3 lookup.py colours --series 800 --style "flat top" --material acetal
    python3 lookup.py belt --series 800 --style "flat top" --material acetal --colour blue --width 600
    python3 lookup.py sprockets --series 800 [--bore ...] [--pd ...] [--material ...]
    python3 lookup.py part <part number>
    python3 lookup.py search <words...>
    python3 lookup.py lists
    python3 lookup.py accessories [--group wearstrip] [--series 800] [words...]

Each takes --settings <folder or file> (or --workbook / --catalogue) and --json.

Names are matched loosely: case, spaces, "Series"/"S" in front of a series and
punctuation do not matter. A name that does not match exactly gives the
nearest names on file instead of a guess. The belt check uses the same width
arithmetic as Field CRM's belt form.

About colours and materials: the workbook's colours (and materials) per spec
are the ones found in plants, not every one Intralox makes. Say "on file", and
treat anything else as a question for customer service, never as wrong.
"""
import argparse
import difflib
import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402


# ---------------------------------------------------------------- matching

def loose(s):
    return re.sub(r'[^a-z0-9.]+', '', str(s or '').lower())


def series_key(s):
    t = re.sub(r'^\s*(series[\s_]*|s(?=\d))', '', str(s or '').strip(), flags=re.I)
    return loose(t)


def uniq_sort(vals):
    vals = sorted({v for v in vals if v not in ('', None)}, key=lambda v: (0, float(v), '') if re.fullmatch(r'-?\d+(\.\d+)?', str(v)) else (1, 0, str(v).lower()))
    return vals


def pick(value, options, key=loose):
    """(the option meant, nearest options). Exact on the loose key, else one option containing it, else none."""
    if value in (None, ''):
        return None, []
    k = key(value)
    by = {}
    for o in options:
        by.setdefault(key(o), o)
    if k in by:
        return by[k], []
    part = [o for kk, o in by.items() if k and (k in kk)]
    if len(part) == 1:
        return part[0], []
    near = difflib.get_close_matches(k, list(by.keys()), n=6, cutoff=0.5)
    return None, part[:8] or [by[n] for n in near]


# ---------------------------------------------------------------- the catalogue

class Cat:
    def __init__(self, c):
        self.c = c
        self.combos = c.get('combos', [])
        self.geom = c.get('geom', [])
        self.spr = c.get('sprockets', [])

    def series(self):
        return uniq_sort({x[0] for x in self.combos} | {x[0] for x in self.spr})

    def ser(self, v):
        return pick(v, self.series(), series_key)

    def styles(self, s):
        return uniq_sort(x[1] for x in self.combos if x[0] == s)

    def materials(self, s, st):
        return uniq_sort(x[2] for x in self.combos if x[0] == s and x[1] == st)

    def colours(self, s, st, m):
        return uniq_sort(x[3] for x in self.combos if x[0] == s and x[1] == st and x[2] == m)

    def pitch(self, s):
        p = self.c.get('pitch', {})
        for k, v in p.items():
            if series_key(k) == series_key(s):
                return v
        return None

    def width(self, s, st, m, w):
        """Field CRM's runWidthCheck: a standard built width, or the nearest either side. None when it cannot tell."""
        g = next((x for x in self.geom if x[0] == s and x[1] == st and x[2] == m), None)
        if not g or not g[3] or not w or w <= 0:
            return None
        link_w, inc, min_l, prot = g[3], g[4] or 1, g[5] or 0, g[6] or 0
        above = (w - 2 * prot - min_l * link_w) / link_w
        lower = (min_l + math.floor(above / inc) * inc) * link_w + 2 * prot
        upper = (min_l + math.ceil(above / inc) * inc) * link_w + 2 * prot
        ok = abs(w - lower) < 0.5 or abs(w - upper) < 0.5
        return {'width': w, 'standard': ok, 'lower': round(lower), 'upper': round(upper),
                'link_width_mm': link_w, 'increment_links': inc}

    def spr_rows(self, s):
        k = series_key(s)
        return [x for x in self.spr if series_key(x[0]) == k]


# ---------------------------------------------------------------- answers

def out(a, data, text):
    if a.json:
        print(json.dumps(data, ensure_ascii=False, indent=1))
    else:
        print(text.rstrip())


def need_series(cat, a):
    s, near = cat.ser(a.series)
    if not s:
        out(a, {'found': False, 'asked': a.series, 'nearest': near},
            'Series "%s" is not on file.%s' % (a.series, (' Nearest: ' + ', '.join(near)) if near else ''))
        sys.exit(2)
    return s


def chain(cat, a, upto):
    """Resolve series > style > material as far as asked; stop with the nearest names at the first miss."""
    s = need_series(cat, a)
    res = {'series': s}
    if upto in ('style', 'material', 'colour'):
        st, near = pick(a.style, cat.styles(s))
        if not st:
            out(a, {'found': False, 'series': s, 'asked_style': a.style, 'nearest': near or cat.styles(s)},
                'Style "%s" is not on file for Series %s.\n%s' % (a.style, s, listing('Styles on file', near or cat.styles(s))))
            sys.exit(2)
        res['style'] = st
    if upto in ('material', 'colour'):
        m, near = pick(a.material, cat.materials(s, res['style']))
        if not m:
            ms = cat.materials(s, res['style'])
            out(a, {'found': False, 'series': s, 'style': res['style'], 'asked_material': a.material, 'nearest': near or ms},
                'Material "%s" is not on file for Series %s %s.\n%s' % (a.material, s, res['style'], listing('Materials on file', near or ms)))
            sys.exit(2)
        res['material'] = m
    return res


def listing(title, vals):
    return title + ' (' + str(len(vals)) + '):\n' + '\n'.join('  ' + str(v) for v in vals) if vals else title + ': none'


def cmd_series(cat, a):
    rows = [{'series': s, 'styles': len(cat.styles(s)), 'pitch_mm': cat.pitch(s), 'sprocket_rows': len(cat.spr_rows(s))} for s in cat.series()]
    out(a, rows, listing('Series on file', ['%s  (%d styles%s, %d sprocket rows)' % (
        r['series'], r['styles'], ', pitch %s mm' % r['pitch_mm'] if r['pitch_mm'] else '', r['sprocket_rows']) for r in rows]))


def cmd_styles(cat, a):
    r = chain(cat, a, 'series')
    vals = cat.styles(r['series'])
    out(a, dict(r, styles=vals), 'Series ' + r['series'] + '\n' + listing('Styles on file', vals))


def cmd_materials(cat, a):
    r = chain(cat, a, 'style')
    vals = cat.materials(r['series'], r['style'])
    out(a, dict(r, materials=vals), 'Series %s %s\n%s' % (r['series'], r['style'], listing('Materials on file', vals)))


def cmd_colours(cat, a):
    r = chain(cat, a, 'material')
    vals = cat.colours(r['series'], r['style'], r['material'])
    out(a, dict(r, colours=vals), 'Series %s %s, %s\n%s\n(Colours found in plants for this spec, not every colour made.)' % (
        r['series'], r['style'], r['material'], listing('Colours on file', vals)))


def cmd_belt(cat, a):
    r = chain(cat, a, 'material' if a.material else 'style' if a.style else 'series')
    lines = ['Series ' + r['series'] + (' ' + r['style'] if r.get('style') else '') + (', ' + r['material'] if r.get('material') else '')]
    checks = []
    p = cat.pitch(r['series'])
    if p:
        r['pitch_mm'] = p
        lines.append('Pitch: %s mm' % p)
    if not r.get('style'):
        lines.append(listing('Styles on file', cat.styles(r['series'])))
    elif not r.get('material'):
        lines.append(listing('Materials on file', cat.materials(r['series'], r['style'])))
    if r.get('material'):
        cols = cat.colours(r['series'], r['style'], r['material'])
        r['colours_on_file'] = cols
        if a.colour:
            c, near = pick(a.colour, cols)
            r['colour'] = c or a.colour
            if c:
                lines.append('Colour: ' + c + ' (on file)')
            else:
                lines.append('Colour: "%s" is not among the colours on file for this spec (%s). Ask customer service to confirm it.' % (
                    a.colour, ', '.join(cols) or 'none'))
                checks.append('Colour %s: not among those on file for this spec; please confirm it can be supplied.' % a.colour)
        else:
            lines.append(listing('Colours on file', cols))
        if a.width:
            w = cat.width(r['series'], r['style'], r['material'], a.width)
            r['width_check'] = w
            if not w:
                lines.append('Width %s mm: no link data on file for this spec, so it cannot be checked.' % fmt(a.width))
                checks.append('Width %s mm: could not be checked against built widths.' % fmt(a.width))
            elif w['standard']:
                lines.append('Width %s mm: a standard built width for this spec.' % fmt(a.width))
            else:
                near = '%d mm' % w['lower'] if w['lower'] == w['upper'] else '%d mm or %d mm' % (w['lower'], w['upper'])
                lines.append('Width %s mm: not a standard increment. Nearest built: %s.' % (fmt(a.width), near))
                checks.append('Width %s mm is not a standard built width for this spec; nearest %s.' % (fmt(a.width), near))
    r['checks'] = checks
    out(a, r, '\n'.join(lines) + ('\n\nFor the request\'s "To confirm" list:\n' + '\n'.join('  - ' + c for c in checks) if checks else ''))


def fmt(n):
    return ('%g' % n) if isinstance(n, (int, float)) else str(n)


SPR_COLS = ['series', 'bore', 'pitch_diameter', 'material', 'description', 'part_number']


def cmd_sprockets(cat, a):
    s = need_series(cat, a)
    rows = cat.spr_rows(s)
    res = {'series': s}
    steps = [('bore', 1, a.bore, 'Bores'), ('pitch_diameter', 2, a.pd, 'Pitch diameters'), ('material', 3, a.material, 'Materials')]
    lines = ['Series ' + s + ' sprockets']
    for name, i, asked, title in steps:
        opts = uniq_sort(x[i] for x in rows)
        if not asked:
            if len(opts) > 1 and len(rows) > 12:
                res['next'] = name
                res['options'] = opts
                lines.append(listing(title + ' on file', opts))
                out(a, dict(res, rows=len(rows)), '\n'.join(lines))
                return
            continue
        v, near = pick(asked, opts)
        if not v:
            res.update({'found': False, 'asked_' + name: asked, 'nearest': near or opts})
            lines.append('%s "%s" is not on file.\n%s' % (title[:-1], asked, listing(title + ' on file', near or opts)))
            out(a, res, '\n'.join(lines))
            sys.exit(2)
        res[name] = v
        rows = [x for x in rows if x[i] == v]
        lines.append('%s: %s' % (title[:-1], v))
    res['rows'] = [dict(zip(SPR_COLS, x)) for x in rows]
    lines.append('%d on file:' % len(rows))
    lines += ['  %s | %s | %s | %s | part %s' % (x[1], x[2], x[3], x[4] or '-', x[5] or '-') for x in rows[:40]]
    if len(rows) > 40:
        lines.append('  ... %d more: narrow with --bore, --pd or --material' % (len(rows) - 40))
    out(a, res, '\n'.join(lines))


def cmd_part(cat, a):
    k = loose(a.number)
    rows = [x for x in cat.spr if k and k in loose(x[5])]
    data = [dict(zip(SPR_COLS, x)) for x in rows[:30]]
    out(a, data, ('%d sprocket row(s) with part number like "%s":\n' % (len(rows), a.number)) +
        '\n'.join('  Series %s | %s | %s | %s | %s | part %s' % tuple(x) for x in rows[:30]) if rows else
        'No sprocket with a part number like "%s" on file.' % a.number)


def cmd_search(cat, a):
    words = [loose(w) for w in a.words if loose(w)]

    def score(fields):
        text = ' '.join(loose(f) for f in fields)
        keys = [series_key(fields[0])] + [loose(f) for f in fields[1:]]
        return sum(2 if w in keys else 1 if w in text else 0 for w in words)

    belts = {}
    for x in cat.combos:
        sc = score(x[:3])
        if sc:
            belts.setdefault(tuple(x[:3]), sc)
    best_b = sorted(belts.items(), key=lambda kv: -kv[1])[:12]
    sprs = sorted(((score(x), x) for x in cat.spr), key=lambda t: -t[0])
    best_s = [x for sc, x in sprs if sc][:12]
    data = {'belts': [{'series': k[0], 'style': k[1], 'material': k[2]} for k, _ in best_b],
            'sprockets': [dict(zip(SPR_COLS, x)) for x in best_s]}
    lines = ['Belts:'] + (['  Series %s %s, %s' % k for k, _ in best_b] or ['  none'])
    lines += ['Sprockets:'] + (['  Series %s | %s | %s | %s | %s | part %s' % tuple(x) for x in best_s] or ['  none'])
    out(a, data, '\n'.join(lines))


def accessory_list(a):
    """Field CRM's accessory list (OneTrack): the "accessories" file in the settings, or --accessories."""
    s = common.settings(a.settings)
    path = a.accessories or s['accessories']
    if not path or not os.path.exists(path):
        sys.exit('No accessory list: set "accessories" in ' + common.SETTINGS_NAME + ' to the OneTrack accessory list (.json), or give --accessories.')
    with open(path, encoding='utf-8') as f:
        d = json.load(f)
    if d.get('kind') != 'field-crm-accessories':
        sys.exit('That file is not an accessory list.')
    return d


def cmd_accessories(cat, a):
    d = accessory_list(a)
    groups = {g['id']: g for g in d.get('groups', [])}
    items = d.get('items', [])
    if a.group:
        g = groups.get(a.group) or next((x for x in groups.values() if loose(x['name']) == loose(a.group)), None)
        if not g:
            sys.exit('No group "%s". Groups: %s' % (a.group, ', '.join(groups)))
        items = [it for it in items if it['group'] == g['id']]
    ser = series_key(a.series) if a.series else ''
    if ser:
        fit = [it for it in items if not it.get('series') or ser in [series_key(x) for x in it['series']]]
        items = fit or items
    words = [loose(w) for w in a.words if loose(w)]
    if words:
        items = [it for it in items if all(w in loose(it['desc'] + ' ' + ' '.join(it.get('opts', {}).values()) + ' ' + it.get('item', '')) for w in words)]
    if not a.group and not words:
        rows = [{'group': g['id'], 'name': g['name'], 'fields': g['fields'], 'items': sum(1 for it in items if it['group'] == g['id']),
                 'defaults': g.get('defaults', {}), 'note': g.get('note', '')} for g in groups.values()]
        out(a, rows, 'Accessory groups (' + d.get('source', '') + '):\n' + '\n'.join('  %s: %s, %d items, chosen by %s%s' % (
            r['group'], r['name'], r['items'], ', '.join(r['fields']),
            ('; usual: ' + ', '.join('%s %s' % kv for kv in r['defaults'].items())) if r['defaults'] else '') for r in rows))
        return
    out(a, items, '%d item(s):\n' % len(items) + '\n'.join('  %s | part %s%s%s' % (
        it['desc'], it.get('item') or 'none', (' | Series ' + ', '.join(it['series'])) if it.get('series') else '',
        (' | ' + it['note']) if it.get('note') else '') for it in items[:60]))


def cmd_lists(cat, a):
    c = cat.c
    data = {k: uniq_sort(c.get(k, [])) for k in ('rods', 'flightTypes', 'sideguardTypes', 'materials', 'colours')}
    data['indentGroups'] = c.get('indentGroups', [])
    names = {'rods': 'Rod materials', 'flightTypes': 'Flight types', 'sideguardTypes': 'Sideguard types',
             'materials': 'Materials', 'colours': 'Colours'}
    text = '\n'.join(listing(names[k], data[k]) for k in names)
    if data['indentGroups']:
        text += '\nIndents:\n' + '\n'.join('  %s: %s' % (g[0], ', '.join(g[1])) for g in data['indentGroups'])
    out(a, data, text)


def main():
    ap = argparse.ArgumentParser(description='Look up belts and sprockets in the catalogue.')
    ap.add_argument('--settings', help='the quote requests folder, or its settings file')
    ap.add_argument('--workbook', help='the plant audit workbook, if not in the settings')
    ap.add_argument('--catalogue', help='a belt-catalogue.json, if not in the settings')
    ap.add_argument('--refresh', action='store_true', help='read the workbook again even if the catalogue is up to date')
    ap.add_argument('--json', action='store_true', help='answer as JSON')
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('series')
    for name in ('styles', 'materials', 'colours', 'belt'):
        p = sub.add_parser(name)
        p.add_argument('--series', required=True)
        if name != 'styles':
            p.add_argument('--style', required=name != 'belt')
        if name in ('colours', 'belt'):
            p.add_argument('--material', required=name == 'colours')
        if name == 'belt':
            p.add_argument('--colour')
            p.add_argument('--width', type=float, help='belt width in mm')
    p = sub.add_parser('sprockets')
    p.add_argument('--series', required=True)
    p.add_argument('--bore')
    p.add_argument('--pd', help='pitch diameter (size description)')
    p.add_argument('--material')
    p = sub.add_parser('part')
    p.add_argument('number')
    p = sub.add_parser('search')
    p.add_argument('words', nargs='+')
    sub.add_parser('lists')
    p = sub.add_parser('accessories', help='the OneTrack accessories in Field CRM\'s accessory list')
    p.add_argument('--group')
    p.add_argument('--series')
    p.add_argument('words', nargs='*')
    ap.add_argument('--accessories', help='the accessory list (.json), if not in the settings')
    # options before or after the command both work
    a = ap.parse_args(move_globals(sys.argv[1:]))
    cat = None if a.cmd == 'accessories' else Cat(common.catalogue(a))
    globals()['cmd_' + a.cmd](cat, a)


def move_globals(argv):
    """Let --settings/--workbook/--catalogue/--json/--refresh come after the command too."""
    flags1, flags0 = {'--settings', '--workbook', '--catalogue', '--accessories'}, {'--json', '--refresh'}
    front, rest, i = [], [], 0
    while i < len(argv):
        t = argv[i]
        if t in flags0:
            front.append(t)
        elif t in flags1 and i + 1 < len(argv):
            front += [t, argv[i + 1]]
            i += 1
        elif any(t.startswith(f + '=') for f in flags1):
            front.append(t)
        else:
            rest.append(t)
        i += 1
    return front + rest


if __name__ == '__main__':
    main()
