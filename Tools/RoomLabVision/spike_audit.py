#!/usr/bin/env python3
"""Classify every common.spike in a RoomLab project against the room's terrain.

Categories
  floor     spike cell empty, solid tile directly below      -> normal spike strip on a floor
  ceiling   spike cell empty, solid tile directly above      -> hangs from a ceiling
  air       spike cell empty, no adjacent tile at all        -> floating hazard
  onTile    spike cell IS a solid tile, the cell above is open
            -> drawn on top of a floor block: "spike and floor tile overlap" (visual)
  buried    spike cell IS a solid tile and the cell above is also solid
            -> invisible lethal hazard inside a wall (worst case)

Usage: spike_audit.py <project.json> [--json out.json]
"""
import argparse
import collections
import json
import sys


def audit(path):
    data = json.load(open(path, encoding="utf-8"))
    rooms = [r for c in data.get("courses", []) for r in c.get("rooms", [])]
    result = []
    counts = collections.Counter()
    for room in rooms:
        tiles = {(t["x"], t["y"]) for t in room.get("tiles", [])}
        for o in room.get("objects", []):
            if o.get("type") != "common.spike":
                continue
            x, y = o["x"], o["y"]
            w, h = o.get("w", 1), o.get("h", 1)
            cells = [(x + dx, y + dy) for dx in range(w) for dy in range(h)]
            in_tile = [c for c in cells if c in tiles]
            direction = (o.get("params") or {}).get("direction", "up")
            above = (x, y - 1) in tiles
            below = any((x + dx, y + h) in tiles for dx in range(w))
            if in_tile:
                kind = "buried" if above else "onTile"
            elif below:
                kind = "floor"
            elif above:
                kind = "ceiling"
            else:
                kind = "air"
            counts[kind] += 1
            entry = {"room": room.get("name"), "roomId": room.get("id"), "id": o.get("id"),
                     "x": x, "y": y, "w": w, "h": h, "direction": direction, "kind": kind,
                     "sharesTiles": in_tile, "tileAbove": above, "tileBelow": below}
            if kind in ("onTile", "buried"):
                result.append(entry)
    return counts, result, len(rooms)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project")
    ap.add_argument("--json")
    args = ap.parse_args()
    counts, problems, rooms = audit(args.project)
    print("rooms=%d" % rooms)
    for kind in ("floor", "ceiling", "air", "onTile", "buried"):
        print("  %-8s %4d" % (kind, counts[kind]))
    print("overlap spikes (onTile + buried) = %d" % len(problems))
    by_room = collections.Counter(p["room"] for p in problems)
    for room, n in by_room.most_common():
        print("  %-14s %4d" % (room, n))
    for p in problems:
        print("  %-6s room=%-10s id=%s at (%d,%d) dir=%s" % (p["kind"], p["room"], p["id"], p["x"], p["y"], p["direction"]))
    if args.json:
        json.dump({"counts": counts, "problems": problems}, open(args.json, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=2)
        print("wrote %s" % args.json)
    return 0


if __name__ == "__main__":
    sys.exit(main())
