#!/usr/bin/env python3
"""RoomLab vision toolkit.

A small, dependency-light image inspector used to audit rendered frames and level
data without a human eye: palette classification, region cropping (for zoomed
review), and inter-class overlap detection ("two things drawn on top of each
other").

Usage:
  vision.py stats   <image...>
  vision.py crop    <image> --box x0,y0,x1,y1 [--scale 3] --out file.png
  vision.py classes <image> [--top 12]
  vision.py overlap <image> [--window 3] [--min-pixels 40]
  vision.py spikes  <project.json>
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import sys

try:
    import numpy as np
    from PIL import Image
except Exception as exc:  # pragma: no cover - environment guard
    sys.stderr.write("PIL/numpy required: %s\n" % exc)
    raise SystemExit(2)


# Palette anchors for this game's pixel art (tuned from the shipped slices).
CLASSES = {
    "spike": [(230, 30, 45), (170, 15, 30), (255, 90, 90)],
    "ice": [(120, 210, 240), (60, 140, 210), (200, 240, 255)],
    "brick": [(90, 105, 125), (60, 70, 90), (120, 140, 165), (40, 48, 64)],
    "gold": [(230, 170, 60), (255, 220, 140), (150, 100, 30)],
    "paper": [(224, 222, 196), (200, 198, 170)],
    "uiTeal": [(51, 184, 184), (120, 220, 220)],
}


def load(path):
    return np.array(Image.open(path).convert("RGB")).astype(np.int16)


def dist_to(pixel, anchors):
    return min(
        abs(pixel[0] - a[0]) + abs(pixel[1] - a[1]) + abs(pixel[2] - a[2])
        for a in anchors
    )


def classify(img, tolerance=90):
    """Return {class: boolean mask} using nearest-anchor within tolerance."""
    h, w, _ = img.shape
    masks = {name: np.zeros((h, w), dtype=bool) for name in CLASSES}
    best = np.full((h, w), 10 ** 6, dtype=np.int32)
    for name, anchors in CLASSES.items():
        d = np.full((h, w), 10 ** 6, dtype=np.int32)
        for a in anchors:
            delta = np.abs(img - np.array(a, dtype=np.int16)).sum(axis=2)
            d = np.minimum(d, delta)
        masks[name] = d <= tolerance
        best = np.minimum(best, d)
    return masks


def cmd_stats(args):
    for path in args.images:
        img = load(path)
        h, w, _ = img.shape
        flat = img.reshape(-1, 3)
        colors = collections.Counter(map(tuple, flat))
        black = int((flat.max(axis=1) <= 4).sum())
        print("%s: %dx%d distinct=%d pureBlack=%.2f%% top=%s"
              % (os.path.basename(path), w, h, len(colors), 100.0 * black / len(flat),
                 colors.most_common(3)))


def cmd_classes(args):
    img = load(args.image)
    masks = classify(img)
    h, w, _ = img.shape
    total = h * w
    rows = sorted(((int(m.sum()), name) for name, m in masks.items()), reverse=True)
    print("%s %dx%d" % (os.path.basename(args.image), w, h))
    for count, name in rows[: args.top]:
        print("  %-8s %8d px  %5.2f%%" % (name, count, 100.0 * count / total))


def cmd_crop(args):
    img = Image.open(args.image)
    x0, y0, x1, y1 = [int(v) for v in args.box.split(",")]
    crop = img.crop((x0, y0, x1, y1))
    if args.scale != 1:
        crop = crop.resize((crop.width * args.scale, crop.height * args.scale), Image.NEAREST)
    crop.save(args.out)
    print("wrote %s (%dx%d from %d,%d-%d,%d x%d)"
          % (args.out, crop.width, crop.height, x0, y0, x1, y1, args.scale))


def _components(mask, min_pixels):
    """Cheap 4-connected labelling via repeated flood fill on a boolean grid."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    idx = np.argwhere(mask)
    for y0, x0 in idx:
        if seen[y0, x0]:
            continue
        stack = [(int(y0), int(x0))]
        seen[y0, x0] = True
        pixels = []
        while stack:
            y, x = stack.pop()
            pixels.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if len(pixels) >= min_pixels:
            ys = [p[0] for p in pixels]
            xs = [p[1] for p in pixels]
            out.append((len(pixels), min(xs), min(ys), max(xs), max(ys)))
    return sorted(out, reverse=True)


def cmd_overlap(args):
    """Report places where pixels of two different classes sit within `window` px."""
    img = load(args.image)
    masks = classify(img)
    names = [n for n in masks if masks[n].any()]
    h, w, _ = img.shape
    print("%s %dx%d classes present: %s" % (os.path.basename(args.image), w, h, ", ".join(names)))
    win = args.window
    kernel = np.ones((2 * win + 1, 2 * win + 1), dtype=bool)

    def dilate(mask):
        pad = np.pad(mask, win, mode="constant")
        out = np.zeros_like(mask)
        for dy in range(2 * win + 1):
            for dx in range(2 * win + 1):
                out |= pad[dy:dy + h, dx:dx + w]
        return out

    pairs = [(a, b) for i, a in enumerate(names) for b in names[i + 1:]]
    for a, b in pairs:
        near = dilate(masks[a]) & masks[b]
        # a pixel counts as "touching" only when both classes are locally dense
        if near.sum() < args.min_pixels:
            continue
        comps = _components(near, args.min_pixels)
        print("  %s<->%s touching px=%d regions=%d" % (a, b, int(near.sum()), len(comps)))
        for count, x0, y0, x1, y1 in comps[: args.top]:
            print("      region %4d px  x%d..%d y%d..%d" % (count, x0, x1, y0, y1))


def cmd_spikes(args):
    """Data audit: spikes that share a cell with terrain, or that sit inside walls."""
    data = json.load(open(args.project, encoding="utf-8"))
    rooms = [r for c in data.get("courses", []) for r in c.get("rooms", [])]
    problems = 0
    for room in rooms:
        tiles = {(t["x"], t["y"]) for t in room.get("tiles", [])}
        spikes = [o for o in room.get("objects", []) if o.get("type") == "common.spike"]
        for s in spikes:
            x, y, w, h = s.get("x"), s.get("y"), s.get("w", 1), s.get("h", 1)
            cells = [(x + dx, y + dy) for dx in range(w) for dy in range(h)]
            inside = [c for c in cells if c in tiles]
            # A spike drawn in the same cell as a solid tile is what players see as
            # "spike inside the floor". Spikes are normally placed in empty cells that
            # sit directly on top of a tile row.
            below = (x, y + h) in tiles
            if inside:
                problems += 1
                print("OVERLAP room=%s spike=%s at (%d,%d) size %dx%d direction=%s sharesTile=%s below=%s"
                      % (room.get("name"), s.get("id"), x, y, w, h,
                         (s.get("params") or {}).get("direction"), inside, below))
        # spikes floating with nothing under them (usually a data slip)
        for s in spikes:
            x, y, w, h = s.get("x"), s.get("y"), s.get("w", 1), s.get("h", 1)
            if (x, y + h) not in tiles and not any((x + dx, y + h) in tiles for dx in range(w)):
                print("FLOATING room=%s spike=%s at (%d,%d) direction=%s"
                      % (room.get("name"), s.get("id"), x, y, (s.get("params") or {}).get("direction")))
    print("spike/terrain overlaps: %d" % problems)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("stats"); p.add_argument("images", nargs="+"); p.set_defaults(func=cmd_stats)
    p = sub.add_parser("classes"); p.add_argument("image"); p.add_argument("--top", type=int, default=12); p.set_defaults(func=cmd_classes)
    p = sub.add_parser("crop"); p.add_argument("image"); p.add_argument("--box", required=True)
    p.add_argument("--scale", type=int, default=3); p.add_argument("--out", required=True); p.set_defaults(func=cmd_crop)
    p = sub.add_parser("overlap"); p.add_argument("image"); p.add_argument("--window", type=int, default=3)
    p.add_argument("--min-pixels", type=int, default=40); p.add_argument("--top", type=int, default=10); p.set_defaults(func=cmd_overlap)
    p = sub.add_parser("spikes"); p.add_argument("project"); p.set_defaults(func=cmd_spikes)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
