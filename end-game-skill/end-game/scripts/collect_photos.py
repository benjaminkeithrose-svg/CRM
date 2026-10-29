#!/usr/bin/env python3
"""Copy the photos taken during a visit from the camera roll into the visit's folder.

    python3 collect_photos.py --from "<OneDrive>/Pictures/Camera Roll" --start "2026-10-29 09:00" --minutes 10 --to "<visit folder>/photos"
    python3 collect_photos.py --from "<camera roll>" --start "2026-10-29 09:00" --end "2026-10-29 09:12" --to "<visit>/photos" --dry-run

It reads each photo's own time (EXIF), so it works on photos synced by OneDrive
camera upload. It takes every photo from --margin seconds before the start to
--margin seconds after the end (default 10 minutes either side: the note pages
are usually photographed just after the walk), copies them unchanged (never
moves or deletes anything), and says which it took. A photo with no time of
its own is left out and named, because its place in the walk cannot be known.
"""
import argparse
import datetime as dt
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from walk_timeline import PHOTO_EXT, exif_time, parse_start  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description='Copy a visit\'s photos from the camera roll by their time.')
    ap.add_argument('--from', dest='src', required=True, help='the camera roll folder (subfolders included)')
    ap.add_argument('--start', required=True, help='when the visit (recording) started, local time')
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--end', help='when it ended, local time')
    g.add_argument('--minutes', type=float, help='or how long it lasted')
    ap.add_argument('--to', required=True, help='the visit\'s photos folder')
    ap.add_argument('--margin', type=int, default=600, help='seconds either side to include (default 600)')
    ap.add_argument('--dry-run', action='store_true', help='only say what would be copied')
    a = ap.parse_args()

    start = parse_start(a.start)
    end = parse_start(a.end) if a.end else start + dt.timedelta(minutes=a.minutes)
    lo, hi = start - dt.timedelta(seconds=a.margin), end + dt.timedelta(seconds=a.margin)
    took, untimed = [], []
    for root, _, files in os.walk(a.src):
        for fn in sorted(files):
            if not fn.lower().endswith(PHOTO_EXT):
                continue
            p = os.path.join(root, fn)
            t = exif_time(p)
            if t is None:
                # only worth naming if the file date says it may be from the visit
                m = dt.datetime.fromtimestamp(os.path.getmtime(p))
                if lo <= m <= hi:
                    untimed.append(fn)
                continue
            if lo <= t <= hi:
                took.append((t, p, fn))
    took.sort()
    if not a.dry_run and took:
        os.makedirs(a.to, exist_ok=True)
    for t, p, fn in took:
        dest = os.path.join(a.to, fn)
        if not a.dry_run and not os.path.exists(dest):
            shutil.copy2(p, dest)
        print('  %s  %s' % (t.strftime('%H:%M:%S'), fn))
    print('%s %d photo%s taken %s to %s%s' % ('Would copy' if a.dry_run else 'Copied', len(took), '' if len(took) == 1 else 's',
                                             lo.strftime('%Y-%m-%d %H:%M'), hi.strftime('%H:%M'), '' if a.dry_run else ' into ' + a.to))
    if untimed:
        print('Left out, no time of their own (check by eye): ' + ', '.join(untimed))


if __name__ == '__main__':
    main()
