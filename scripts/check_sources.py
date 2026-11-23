"""Validate every colour library listed in sources.json. Run by GitHub Actions on each push."""
import json, re, sys
from collections import Counter

HEX = re.compile(r'#[0-9a-fA-F]{6}')
errors, used_ids, summary = [], {}, []

def cmyk_ok(v):
    return isinstance(v, list) and len(v) == 4 and all(isinstance(x, (int, float)) and 0 <= x <= 100 for x in v)

sources = json.load(open('sources.json'))
for k, n in Counter(s['id'] for s in sources).items():
    if n > 1:
        errors.append(f"sources.json: id {k} is listed {n} times")

for s in sources:
    sid, base = s['id'], int(s.get('idBase', 0))
    for f in ('name', 'short', 'file', 'format'):
        if not s.get(f):
            errors.append(f"{sid}: missing {f}")
    data = json.load(open(s['file']))
    if s['format'] == 'wada':
        colours = [{'name': c['name'], 'hex': c['hex'], 'cmyk': c['cmyk']} for c in data]
        for c in data:
            if not 0 <= c['swatch'] <= 5:
                errors.append(f"{sid} / {c['name']}: hue family must be 0-5, got {c['swatch']}")
        members = Counter(i for c in data for i in c['combinations'])
        palettes = {i: n for i, n in members.items()}
    elif s['format'] == 'palettes':
        colours = data.get('colours', [])
        names = {c['name'] for c in colours}
        palettes = {}
        for n, p in enumerate(data.get('palettes', []), 1):
            pid = p.get('id', n)
            missing = [m for m in p['colours'] if m not in names]
            if missing:
                errors.append(f"{sid} palette {pid}: unknown colours {missing}")
            palettes[pid] = len(set(p['colours']))
    else:
        errors.append(f"{sid}: unknown format {s['format']!r} (use 'wada' or 'palettes')")
        continue
    for c in colours:
        if not HEX.fullmatch(c.get('hex', '')):
            errors.append(f"{sid} / {c.get('name')}: bad hex {c.get('hex')}")
        if c.get('cmyk') is not None and not cmyk_ok(c['cmyk']):
            errors.append(f"{sid} / {c['name']}: CMYK must be four values from 0 to 100, got {c['cmyk']}")
    for k, n in Counter(c['name'] for c in colours).items():
        if n > 1:
            errors.append(f"{sid}: duplicate colour name {k}")
    for pid, n in palettes.items():
        if n < 2:
            errors.append(f"{sid} palette {pid}: has {n} colour; needs at least 2")
        gid = base + int(pid)
        if gid in used_ids:
            errors.append(f"{sid} palette {pid}: id {gid} clashes with {used_ids[gid]}; raise idBase")
        used_ids[gid] = sid
    summary.append(f"{sid}: {len(colours)} colours, {len(palettes)} palettes")

if errors:
    print('\n'.join(errors)); sys.exit(1)
print('OK\n' + '\n'.join(summary))
