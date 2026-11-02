#!/usr/bin/env python3
"""Read the belt and sprocket catalogue out of the plant audit workbook.

    python3 catalogue.py "C:/path/Plant_Audit_Template_1.xlsm" [--out belt-catalogue.json]

The same reading as Field CRM's belt reference import (importRef in app.js),
sheet for sheet and column for column, so Claude and the app offer the same
choices:

  Belt Audit Data      Series_Ind / Belt_Style_Ind / Material_Ind / COLOR_IND
                       -> every Series > Style > Material > Colour found
                       Series_Ind / Belt_Style_Ind / Material_Ind / Current_Lnk_Wth_Mm /
                       Belt_Link_Increment / Minimum_Width_In_L / Protrusion_Thk_Mm
                       -> link geometry, for the width check
  SPROCKET SPILL DATA  Belt Series / Bore Description / Size Description / Material /
                       Description / Part Number
  BELT DATA            Series + Pitch, and the master lists (materials, colours, rod
                       materials, flight styles, sideguard styles, indents)

Both blocks on Belt Audit Data repeat the same three header names, so each
column is found next to an anchor that appears once, never by a bare name.

The result is kept as JSON beside the settings (belt-catalogue.json) and read
again only when the workbook is newer. It is Intralox's own catalogue: it stays
on the PC and never goes into this skill's folder or anywhere public.
"""
import argparse
import json
import os
import re
import sys
import time

REF_SHEETS = ['Belt Audit Data', 'SPROCKET SPILL DATA', 'BELT DATA']
KIND = 'quote-request-belt-catalogue'
VERSION = 1


def norm(s):
    return re.sub(r'\s+', ' ', '' if s is None else str(s)).strip().lower()


def cell(v):
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def num(v):
    try:
        n = float(v)
        return 0 if n != n else n
    except (TypeError, ValueError):
        return 0


def find_sheet(wb, want):
    if want in wb.sheetnames:
        return wb[want]
    for n in wb.sheetnames:
        if norm(n) == norm(want):
            return wb[n]
    raise ValueError('sheet "%s" is not in that workbook' % want)


def grid(ws):
    return [list(r) for r in ws.iter_rows(values_only=True)]


def header_row(rows, anchor):
    for i in range(min(len(rows), 8)):
        if any(norm(v) == anchor for v in rows[i] or []):
            return i
    raise ValueError('could not find the "%s" column' % anchor)


def col_at(H, name, anchor, step):
    t = norm(name)
    rng = range(anchor - 1, -1, -1) if step < 0 else range(anchor + 1, len(H))
    for i in rng:
        if H[i] == t:
            return i
    raise ValueError('could not find the "%s" column' % name)


def col_of(H, name):
    try:
        return H.index(norm(name))
    except ValueError:
        raise ValueError('could not find the "%s" column' % name)


def at(r, i):
    return r[i] if i < len(r) else None


def read_workbook(path):
    try:
        import openpyxl
    except ImportError:
        sys.exit('Reading the workbook needs openpyxl: pip install openpyxl')
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True, keep_links=False)

    bad = grid(find_sheet(wb, 'Belt Audit Data'))
    bh = header_row(bad, 'color_ind')
    BH = [norm(v) for v in bad[bh]]
    c_col = col_of(BH, 'COLOR_IND')
    c_ser, c_sty, c_mat = (col_at(BH, n, c_col, -1) for n in ('Series_Ind', 'Belt_Style_Ind', 'Material_Ind'))
    g_lw = col_of(BH, 'Current_Lnk_Wth_Mm')
    g_ser, g_sty, g_mat = (col_at(BH, n, g_lw, -1) for n in ('Series_Ind', 'Belt_Style_Ind', 'Material_Ind'))
    g_inc, g_min, g_pro = (col_at(BH, n, g_lw, 1) for n in ('Belt_Link_Increment', 'Minimum_Width_In_L', 'Protrusion_Thk_Mm'))
    if g_ser == c_ser:
        raise ValueError('the geometry block on "Belt Audit Data" is missing')

    combos, geom = [], []
    for r in bad[bh + 1:]:
        r = r or []
        if cell(at(r, c_ser)):
            combos.append([cell(at(r, c_ser)), cell(at(r, c_sty)), cell(at(r, c_mat)), cell(at(r, c_col))])
        if cell(at(r, g_ser)):
            geom.append([cell(at(r, g_ser)), cell(at(r, g_sty)), cell(at(r, g_mat)),
                         num(at(r, g_lw)), num(at(r, g_inc)) or 1, num(at(r, g_min)), num(at(r, g_pro))])

    spl = grid(find_sheet(wb, 'SPROCKET SPILL DATA'))
    sh = header_row(spl, 'belt series')
    SH = [norm(v) for v in spl[sh]]
    s_ser = col_of(SH, 'Belt Series')
    s_bor, s_pd, s_mat, s_dsc, s_pn = (col_at(SH, n, s_ser, 1) for n in
                                       ('Bore Description', 'Size Description', 'Material', 'Description', 'Part Number'))
    sprockets = []
    for r in spl[sh + 1:]:
        r = r or []
        if not cell(at(r, s_ser)):
            continue
        sprockets.append([cell(at(r, s_ser)), cell(at(r, s_bor)), cell(at(r, s_pd)), cell(at(r, s_mat)),
                          cell(at(r, s_dsc)), cell(at(r, s_pn))])

    bd = grid(find_sheet(wb, 'BELT DATA'))
    dh = header_row(bd, 'rod material')
    DH = [norm(v) for v in bd[dh]]
    d = {k: col_of(DH, k) for k in ('Series', 'Pitch', 'Material', 'Colour', 'Rod Material',
                                    'Flight Style', 'Sideguard Style', 'Indent')}
    pitch, lists, indent_groups = {}, {k: [] for k in ('materials', 'colours', 'rods', 'flightTypes', 'sideguardTypes')}, []
    for r in bd[dh + 1:]:
        r = r or []
        s = cell(at(r, d['Series']))
        if re.match(r'^series[_ ]', s, re.I):
            p = num(at(r, d['Pitch']))
            if p > 0:
                pitch[re.sub(r'^series[_ ]', '', s, flags=re.I)] = p
        for key, col in (('materials', 'Material'), ('colours', 'Colour'), ('rods', 'Rod Material'),
                         ('flightTypes', 'Flight Style'), ('sideguardTypes', 'Sideguard Style')):
            v = cell(at(r, d[col]))
            if v:
                lists[key].append(v)
        iv = cell(at(r, d['Indent']))
        if iv:
            head = re.match(r'^-{2,}\s*(.+?)\s*-{2,}$', iv)
            if head:
                indent_groups.append([head.group(1), []])
            elif indent_groups:
                indent_groups[-1][1].append(iv)
    wb.close()

    if not combos:
        raise ValueError('no belt combinations found - check the workbook is the right one')
    if not sprockets:
        raise ValueError('no sprocket rows found on "SPROCKET SPILL DATA"')
    out = {'kind': KIND, 'version': VERSION, 'source': os.path.basename(path),
           'source_modified': os.path.getmtime(path), 'read_at': time.strftime('%Y-%m-%dT%H:%M:%S'),
           'combos': combos, 'geom': geom, 'sprockets': sprockets, 'pitch': pitch, 'indentGroups': indent_groups}
    out.update(lists)
    out['counts'] = {'combos': len(combos), 'geom': len(geom), 'sprockets': len(sprockets),
                     'series': len({c[0] for c in combos})}
    return out


def load(workbook=None, cache=None, refresh=False):
    """The catalogue: from the cache when it is as new as the workbook, else read again and cached."""
    if cache and os.path.exists(cache) and not refresh:
        try:
            with open(cache, encoding='utf-8') as f:
                c = json.load(f)
            if c.get('kind') == KIND and c.get('version') == VERSION and (
                    not workbook or not os.path.exists(workbook) or os.path.getmtime(workbook) <= c.get('source_modified', 0)):
                return c
        except (OSError, ValueError):
            pass
    if not workbook:
        raise ValueError('no workbook given and no catalogue cached yet')
    if not os.path.exists(workbook):
        raise ValueError('the workbook is not there: ' + workbook)
    c = read_workbook(workbook)
    if cache:
        os.makedirs(os.path.dirname(os.path.abspath(cache)), exist_ok=True)
        with open(cache, 'w', encoding='utf-8') as f:
            json.dump(c, f, ensure_ascii=False)
    return c


def main():
    ap = argparse.ArgumentParser(description='Read the belt and sprocket catalogue from the plant audit workbook.')
    ap.add_argument('workbook', help='Plant_Audit_Template_1.xlsm (or a copy)')
    ap.add_argument('--out', help='where to keep the catalogue as JSON (default: belt-catalogue.json beside the workbook)')
    a = ap.parse_args()
    out = a.out or os.path.join(os.path.dirname(os.path.abspath(a.workbook)), 'belt-catalogue.json')
    try:
        c = load(a.workbook, out, refresh=True)
    except ValueError as ex:
        sys.exit('Could not read the catalogue: ' + str(ex))
    n = c['counts']
    print('Read %d belt combinations in %d series, %d sizes for the width check and %d sprocket rows.' % (
        n['combos'], n['series'], n['geom'], n['sprockets']))
    print('Kept in ' + out)


if __name__ == '__main__':
    main()
