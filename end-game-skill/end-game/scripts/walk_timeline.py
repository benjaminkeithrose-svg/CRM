#!/usr/bin/env python3
"""Line up a site walk: the Plaud transcript, by time, against the photos, by time.

    python3 walk_timeline.py --transcript transcript.txt --start "2026-10-29 09:00:00" --photos photos/
    python3 walk_timeline.py --transcript plaud.json --start "2026-10-29T09:00:00" --photos photos/ --out timeline.json

What it works out:
  - the clock time of every line of the transcript (recording start + its offset);
  - the time each photo was taken (from the photo's own EXIF data; the file's
    date as a fallback, which is less reliable and is said so);
  - where the walk moves to each conveyor ("Now at CV-200", "this is conveyor 3"),
    and to a project discussion ("Now talking about the new packing line project");
  - for each photo: the conveyor being talked about then, what was said in the
    seconds around it, how far the nearest speech was, and a confidence.

It writes timeline.json (for Claude to read when filling in report.json) and
prints a readable summary. It never decides what goes in the report; that is
Claude's job, checked by a person.

Transcript formats it reads:
  - text, one line per remark, starting with a time: "00:01:23 Speaker 1: text",
    "[00:01:23] text", "01:23 text", or a time on its own line with the words
    on the lines below (Plaud's text export);
  - JSON: a list of segments, or an object holding one under "segments",
    "transcript", "items", "data" or "utterances". Each segment needs words
    ("text", "content", "sentence") and a start ("start", "start_time",
    "startTime", "begin", "offset", in seconds; or "start_ms", "startMs" in
    milliseconds).
"""
import argparse
import datetime as dt
import json
import os
import re
import sys

PHOTO_EXT = ('.jpg', '.jpeg', '.png', '.heic', '.heif', '.tif', '.tiff')

# ---------------------------------------------------------------- transcript

TS = r'(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?'


def ts_seconds(m):
    h, mnt, s, frac = m.group(1), m.group(2), m.group(3), m.group(4)
    v = int(h or 0) * 3600 + int(mnt) * 60 + int(s)
    if frac:
        v += int(frac) / (10 ** len(frac))
    return float(v)


def read_text_transcript(t):
    segs, cur = [], None
    for raw in t.splitlines():
        line = raw.strip()
        if not line:
            continue
        m = re.match(r'^\[?' + TS + r'\]?(?:\s*[-–]\s*\[?' + TS + r'\]?)?\s*(.*)$', line)
        if m:
            rest = m.group(9).strip()
            speaker = ''
            sm = re.match(r'^([A-Za-z][\w .\'-]{0,30}?)\s*:\s+(.*)$', rest)
            if sm:
                speaker, rest = sm.group(1), sm.group(2)
            elif rest and len(rest) <= 30 and not re.search(r'[.?!,]', rest):
                speaker, rest = rest, ''          # "00:01:23 Speaker 1" with the words on the next lines
            cur = {'t': ts_seconds(m), 'speaker': speaker, 'text': rest}
            segs.append(cur)
        elif cur is not None:
            cur['text'] = (cur['text'] + ' ' + line).strip()
    return [s for s in segs if s['text']]


def read_json_transcript(d):
    if isinstance(d, dict):
        for k in ('segments', 'transcript', 'items', 'data', 'utterances', 'sentences'):
            if isinstance(d.get(k), list):
                d = d[k]
                break
    if not isinstance(d, list):
        raise ValueError('no list of transcript segments found in the JSON')
    segs = []
    for x in d:
        if not isinstance(x, dict):
            continue
        text = next((x[k] for k in ('text', 'content', 'sentence', 'words') if isinstance(x.get(k), str)), '')
        t = None
        for k in ('start_ms', 'startMs', 'start_time_ms', 'begin_ms'):
            if x.get(k) is not None:
                t = float(x[k]) / 1000
                break
        if t is None:
            for k in ('start', 'start_time', 'startTime', 'begin', 'offset', 't'):
                v = x.get(k)
                if v is None:
                    continue
                if isinstance(v, str):
                    m = re.match('^' + TS + '$', v.strip())
                    t = ts_seconds(m) if m else float(v)
                else:
                    t = float(v)
                break
        if t is None or not text.strip():
            continue
        segs.append({'t': t, 'speaker': str(x.get('speaker') or x.get('speaker_name') or x.get('speakerName') or ''), 'text': text.strip()})
    # milliseconds given as plain numbers: a walk is not 28 hours long
    if segs and max(s['t'] for s in segs) > 100000:
        for s in segs:
            s['t'] /= 1000
    return segs


def read_transcript(path):
    with open(path, encoding='utf-8-sig') as f:
        raw = f.read()
    try:
        segs = read_json_transcript(json.loads(raw))
    except (json.JSONDecodeError, ValueError):
        segs = read_text_transcript(raw)
    segs.sort(key=lambda s: s['t'])
    if not segs:
        sys.exit('No timed lines found in ' + path + '. Each line of the transcript needs its time, e.g. "00:01:23 text".')
    return segs


# conveyor markers: what he says on reaching one
MARK = re.compile(r'\b(?:now (?:at|on)|we\'?re (?:at|on)|moving (?:on )?to|next (?:is|one is|up is)?|this is|at)\s+'
                  r'((?:conveyor|line|belt|cv)\s*[-#]?\s*[A-Za-z]?\d+[A-Za-z]?\b|[A-Z]{1,4}[- ]?\d{1,4}[A-Z]?\b)'
                  r'(?:\s*,?\s*(?:the\s+)?([a-z][a-z \-]{2,40}?))?(?=[.,;!?]|$|\s(?:and|which|where|it|we)\b)', re.I)


# a project discussion: "Now talking about the new packing line project"
PROJECT = re.compile(r'\b(?:now\s+)?(?:talking|discussing|onto|on to)\s+(?:about\s+)?(?:the|their|your|a)?\s*'
                     r'([A-Za-z0-9][\w \'&/-]{1,50}?)\s+project\b', re.I)


def find_markers(segs):
    out = []
    for s in segs:
        m = MARK.search(s['text'])
        p = PROJECT.search(s['text'])
        if p and (not m or p.start() < m.start()):
            out.append({'t': s['t'], 'kind': 'project', 'name': p.group(1).strip(), 'description': '', 'said': s['text']})
        elif m:
            name = re.sub(r'\s+', ' ', m.group(1)).strip()
            name = re.sub(r'^(?i:cv)\s*[- ]?\s*', 'CV-', name) if re.match(r'(?i)cv\s*[- ]?\s*\d', name) else name
            out.append({'t': s['t'], 'kind': 'conveyor', 'name': name, 'description': (m.group(2) or '').strip(), 'said': s['text']})
    return out


# ---------------------------------------------------------------- photos

def exif_time(path):
    try:
        from PIL import Image
    except ImportError:
        return None
    try:
        import pillow_heif                           # iPhone HEIC photos, when installed
        pillow_heif.register_heif_opener()
    except Exception:
        pass
    try:
        im = Image.open(path)
        ex = im.getexif()
        v = None
        try:
            v = ex.get_ifd(0x8769).get(36867)        # DateTimeOriginal
        except Exception:
            pass
        v = v or ex.get(36867) or ex.get(306)       # DateTime
        if v:
            return dt.datetime.strptime(str(v).strip()[:19], '%Y:%m:%d %H:%M:%S')
    except Exception:
        return None
    return None


def exif_place(path):
    """(lat, lon) from the photo's GPS data, or None. Field CRM (v188) writes it into
    photos added to a call; phone photos usually have it."""
    try:
        from PIL import Image
        g = Image.open(path).getexif().get_ifd(0x8825)
        if 2 not in g or 4 not in g:
            return None
        dec = lambda v: sum(float(x) / 60 ** i for i, x in enumerate(v))
        lat = dec(g[2]) * (-1 if g.get(1) == 'S' else 1)
        lon = dec(g[4]) * (-1 if g.get(3) == 'W' else 1)
        return (round(lat, 6), round(lon, 6)) if (lat or lon) else None
    except Exception:
        return None


def read_photos(folder):
    out = []
    for root, _, files in os.walk(folder):
        for fn in sorted(files):
            if not fn.lower().endswith(PHOTO_EXT):
                continue
            p = os.path.join(root, fn)
            t = exif_time(p)
            src = 'photo'
            if t is None:
                t = dt.datetime.fromtimestamp(os.path.getmtime(p))
                src = 'file date (less reliable)'
            out.append({'file': os.path.relpath(p, folder).replace('\\', '/'), 'path': p, 'taken': t, 'time_from': src, 'place': exif_place(p)})
    out.sort(key=lambda x: x['taken'])
    return out


# ---------------------------------------------------------------- matching

def parse_start(s):
    s = s.strip().replace('Z', '+00:00')
    for f in (None, '%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%d/%m/%Y %H:%M:%S', '%d/%m/%Y %H:%M'):
        try:
            d = dt.datetime.fromisoformat(s) if f is None else dt.datetime.strptime(s, f)
            # photos carry local clock time with no zone; compare like with like
            return d.astimezone().replace(tzinfo=None) if d.tzinfo else d
        except ValueError:
            continue
    sys.exit('Could not read the start time "' + s + '". Use e.g. "2026-10-29 09:00:00".')


def build(segs, photos, start, window, shift):
    marks = find_markers(segs)
    end_t = segs[-1]['t'] + 15
    items = []
    for ph in photos:
        taken = ph['taken'] + dt.timedelta(seconds=shift)
        off = (taken - start).total_seconds()
        near = [s for s in segs if abs(s['t'] - off) <= window]
        gap = min((abs(s['t'] - off) for s in segs), default=None)
        mk = [m for m in marks if m['t'] <= off]
        if off < -60 or off > end_t + 60:
            conf, note = 'none', 'taken outside the recording'
        elif gap is not None and gap <= 10:
            conf, note = 'high', ''
        elif gap is not None and gap <= window:
            conf, note = 'medium', ''
        else:
            conf, note = 'low', 'no speech within %ds' % window
        if ph['time_from'] != 'photo':
            note = (note + '; ' if note else '') + 'time from the file date, not the photo'
        items.append({
            'file': ph['file'],
            'taken': taken.isoformat(timespec='seconds'),
            'into_recording': fmt(off),
            'conveyor': mk[-1]['name'] if mk and mk[-1]['kind'] == 'conveyor' else '',
            'project': mk[-1]['name'] if mk and mk[-1]['kind'] == 'project' else '',
            'said_near': ' / '.join(('[' + fmt(s['t']) + '] ' + s['text']) for s in near),
            'nearest_speech_s': None if gap is None else round(gap, 1),
            'confidence': conf,
            'note': note,
            'location': {'lat': ph['place'][0], 'lon': ph['place'][1]} if ph.get('place') else None,
        })
    return {
        'recording_start': start.isoformat(timespec='seconds'),
        'recording_length': fmt(end_t - 15),
        'window_s': window,
        'conveyors': [{'conveyor': m['name'], 'description': m['description'], 'at': fmt(m['t']),
                       'clock': (start + dt.timedelta(seconds=m['t'])).strftime('%H:%M:%S'), 'said': m['said']} for m in marks if m['kind'] == 'conveyor'],
        'projects': [{'project': m['name'], 'at': fmt(m['t']),
                      'clock': (start + dt.timedelta(seconds=m['t'])).strftime('%H:%M:%S'), 'said': m['said']} for m in marks if m['kind'] == 'project'],
        'photos': items,
        'transcript': [{'at': fmt(s['t']), 'clock': (start + dt.timedelta(seconds=s['t'])).strftime('%H:%M:%S'),
                        'speaker': s['speaker'], 'text': s['text']} for s in segs],
    }


def fmt(sec):
    sign = '-' if sec < 0 else ''
    sec = int(round(abs(sec)))
    return '%s%d:%02d:%02d' % (sign, sec // 3600, sec % 3600 // 60, sec % 60)


def main():
    ap = argparse.ArgumentParser(description='Line up a Plaud transcript and photos by time.')
    ap.add_argument('--transcript', required=True, help='the transcript: .txt or .json')
    ap.add_argument('--start', required=True, help='when the recording started, local time, e.g. "2026-10-29 09:00:00"')
    ap.add_argument('--photos', required=True, help='folder with the visit\'s photos')
    ap.add_argument('--out', help='where to write timeline.json (default: next to the photos folder)')
    ap.add_argument('--window', type=int, default=30, help='seconds either side of a photo to take speech from (default 30)')
    ap.add_argument('--photo-shift', type=float, default=0, help='seconds to add to every photo time, if the phone clock was off')
    a = ap.parse_args()

    segs = read_transcript(a.transcript)
    photos = read_photos(a.photos)
    if not photos:
        sys.exit('No photos found in ' + a.photos)
    tl = build(segs, photos, parse_start(a.start), a.window, a.photo_shift)
    out = a.out or os.path.join(os.path.dirname(os.path.abspath(a.photos.rstrip('/\\'))), 'timeline.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(tl, f, indent=2, ensure_ascii=False)

    print('Recording: starts %s, %s long, %d lines' % (tl['recording_start'], tl['recording_length'], len(segs)))
    print('Conveyors named on the walk: ' + (', '.join('%s at %s' % (c['conveyor'], c['at']) for c in tl['conveyors']) or 'none found'))
    if tl['projects']:
        print('Projects talked about: ' + ', '.join('%s at %s' % (x['project'], x['at']) for x in tl['projects']))
    print('Photos: %d' % len(tl['photos']))
    for p in tl['photos']:
        where = p['conveyor'] or (p['project'] and 'project: ' + p['project']) or '-'
        print('  %-28s %s  %-8s %-6s %s' % (p['file'][:28], p['taken'][11:], where, p['confidence'], p['note']))
    print('Written: ' + out)


if __name__ == '__main__':
    main()
