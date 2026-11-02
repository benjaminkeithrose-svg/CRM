#!/usr/bin/env python3
"""Write a made-up plant audit workbook, laid out like the real one, for testing.

    python3 example_workbook.py <folder>

Every series, style, part number and dimension in it is invented (Series 100
and 200, part numbers EX-...). It exists so the skill can be tested without
Intralox's catalogue, which never goes into this skill's folder. It is made
when needed, never kept: spreadsheets are not kept in the repository.
"""
import os
import sys

NAME = 'Example audit template.xlsx'


def build(folder):
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Belt Audit Data'
    ws.append(['Made-up example data for testing the quote request skill'])
    ws.append(['Series_Ind', 'Belt_Style_Ind', 'Material_Ind', 'COLOR_IND', None,
               'Series_Ind', 'Belt_Style_Ind', 'Material_Ind', 'Current_Lnk_Wth_Mm',
               'Belt_Link_Increment', 'Minimum_Width_In_L', 'Protrusion_Thk_Mm'])
    combos = [(100, 'FLAT TOP', 'POLYPROPYLENE', c) for c in ('WHITE', 'BLUE', 'NATURAL')]
    combos += [(100, 'FLAT TOP', 'ACETAL', c) for c in ('WHITE', 'BLUE')]
    combos += [(100, 'FLUSH GRID', 'POLYPROPYLENE', c) for c in ('WHITE', 'NATURAL')]
    combos += [(200, 'RAISED RIB', 'POLYETHYLENE', c) for c in ('WHITE', 'BLUE')]
    combos += [(200, 'FRICTION TOP', 'POLYPROPYLENE', 'GREY')]
    geom = [(100, 'FLAT TOP', 'POLYPROPYLENE', 50.8, 1, 2, 0), (100, 'FLAT TOP', 'ACETAL', 50.8, 1, 2, 0),
            (100, 'FLUSH GRID', 'POLYPROPYLENE', 76.2, 1, 2, 0), (200, 'RAISED RIB', 'POLYETHYLENE', 101.6, 2, 2, 3)]
    for i in range(max(len(combos), len(geom))):
        c = list(combos[i]) if i < len(combos) else [None] * 4
        g = list(geom[i]) if i < len(geom) else [None] * 7
        ws.append(c + [None] + g)

    sp = wb.create_sheet('SPROCKET SPILL DATA')
    sp.append(['Belt Series', 'Bore Description', 'Size Description', 'Material', 'Description', 'Part Number'])
    n = 1
    for bore in ('1.0 IN SQ', '40 MM SQ'):
        for pd in ('3.9 IN 12T', '5.1 IN 16T'):
            for mat in ('ACETAL', 'POLYURETHANE'):
                for var in ('SPLIT', 'SOLID'):
                    sp.append([100, bore, pd, mat, var + ' SPROCKET', 'EX-100-%04d' % n])
                    n += 1
    for pd in ('6.4 IN 10T', '8.0 IN 12T'):
        sp.append([200, '60 MM SQ', pd, 'ACETAL', 'SPLIT SPROCKET', 'EX-200-%04d' % n])
        n += 1

    bd = wb.create_sheet('BELT DATA')
    bd.append(['Series', 'Pitch', 'Material', 'Colour', 'Rod Material', 'Flight Style', 'Sideguard Style', 'Indent'])
    rows = [('Series_100', 25.4, 'POLYPROPYLENE', 'WHITE', 'POLYPROPYLENE', 'STRAIGHT', 'STANDARD', '-- FLAT TOP --'),
            ('Series_200', 50.8, 'ACETAL', 'BLUE', 'ACETAL', 'SCOOP', 'OVERLAPPING', '25'),
            (None, None, 'POLYETHYLENE', 'NATURAL', 'NYLON', None, None, '38'),
            (None, None, None, 'GREY', None, None, None, '-- FRICTION TOP --'),
            (None, None, None, None, None, None, None, '50')]
    for r in rows:
        bd.append(list(r))
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, NAME)
    wb.save(path)
    return path


if __name__ == '__main__':
    print(build(sys.argv[1] if len(sys.argv) > 1 else '.'))
