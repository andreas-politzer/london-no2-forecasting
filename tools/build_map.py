"""Zeichnet London (Ealing bis Holborn, Barnes bis Regent's Park) im Brettspiel-Stil als SVG.

Daten: OpenStreetMap (c) OpenStreetMap contributors, Lizenz ODbL.
Start:  python tools/build_map.py
Der erste Lauf laedt die Daten (Cache: data/raw/osm/), danach wird nur noch gezeichnet.
"""
from __future__ import annotations

import json
import math
import random
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from labels import labels_svg  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "raw" / "osm"
OUT = ROOT / "assets" / "london_map.svg"

# Ausschnitt (3:2): Ealing im Westen bis Holborn im Osten, Barnes im Sueden bis nördlich Regent's Park
SOUTH, WEST, NORTH, EAST = 51.4616, -0.3104, 51.5456, -0.1078
WIDTH = 3000
KX = math.cos(math.radians((SOUTH + NORTH) / 2))
SPAN_X = (EAST - WEST) * KX
SPAN_Y = NORTH - SOUTH
HEIGHT = round(WIDTH * SPAN_Y / SPAN_X)

# Stationen (Koordinaten wie in results/station_metadata.csv)
STATIONS = {
    "EA6": (51.5309, -0.2925),
    "KC1": (51.5210, -0.2135),
    "MY1": (51.5225, -0.1546),
    "BL0": (51.5223, -0.1258),
    "RI2": (51.4762, -0.2304),
}

# Palette (Anlehnung an die Optik von Brettspielen der 80er)
PAPER, BRICK_LINE = "#f0e4c4", "#8e4636"
STREET, STREET_EDGE, STREET_EDGE_MINOR = "#f7f0df", "#c23b2e", "#9b5242"
WATER, WATER_EDGE = "#3b79c3", "#1f4f8d"
PARK, PARK_EDGE = "#86b552", "#5b8a3a"

# Strassenbreiten in Pixel (bewusst uebertrieben, wie auf einem Faltplan)
ROADS = {
    "residential": 3.4, "unclassified": 3.4, "living_street": 3.0, "pedestrian": 3.0,
    "tertiary_link": 3.6, "secondary_link": 4.4, "tertiary": 5.0, "primary_link": 5.0,
    "trunk_link": 5.0, "motorway_link": 5.0, "secondary": 6.6, "primary": 8.4,
    "trunk": 9.2, "motorway": 9.2,
}
ROAD_ORDER = sorted(ROADS, key=lambda k: ROADS[k])

BB = f"({SOUTH},{WEST},{NORTH},{EAST})"
QUERIES = {
    "streets": "[out:json][timeout:240];\nway[\"highway\"~\"^(" + "|".join(ROADS) + ")$\"]" + BB + ";\nout geom;",
    "water": ("[out:json][timeout:240];\n(\n"
              f"way[\"natural\"=\"water\"]{BB};\nway[\"waterway\"=\"riverbank\"]{BB};\n"
              f"way[\"waterway\"~\"^(river|canal)$\"]{BB};\n"
              f"relation[\"natural\"=\"water\"]{BB};\nrelation[\"waterway\"=\"riverbank\"]{BB};\n);\nout geom;"),
    "green": ("[out:json][timeout:240];\n(\n"
              f"way[\"leisure\"~\"^(park|garden|common|nature_reserve|golf_course|pitch)$\"]{BB};\n"
              f"way[\"landuse\"~\"^(grass|forest|recreation_ground|village_green|cemetery|meadow|allotments)$\"]{BB};\n"
              f"way[\"natural\"~\"^(wood|grassland|scrub)$\"]{BB};\n"
              f"relation[\"leisure\"~\"^(park|common|nature_reserve|garden)$\"]{BB};\n"
              f"relation[\"landuse\"~\"^(forest|recreation_ground|cemetery|grass)$\"]{BB};\n);\nout geom;"),
}
MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]


def fetch(name: str) -> dict:
    path = CACHE / f"{name}.json"
    if path.exists():
        return json.loads(path.read_text())
    CACHE.mkdir(parents=True, exist_ok=True)
    body = urllib.parse.urlencode({"data": QUERIES[name]}).encode()
    last = None
    for attempt in range(6):
        url = MIRRORS[attempt % len(MIRRORS)]
        try:
            print(f"Lade '{name}' von {url} ...", flush=True)
            req = urllib.request.Request(url, data=body, headers={"User-Agent": "london-no2-forecasting/0.1 (student project)"})
            with urllib.request.urlopen(req, timeout=300) as r:
                raw = r.read()
            data = json.loads(raw)
            if "runtime error" in str(data.get("remark", "")):
                raise RuntimeError(data["remark"])
            path.write_bytes(raw)
            print(f"  ok: {len(data.get('elements', []))} Objekte, {len(raw) / 1e6:.1f} MB", flush=True)
            return data
        except Exception as e:  # noqa: BLE001
            last = e
            print(f"  Fehler: {e} - neuer Versuch in 20 s", flush=True)
            time.sleep(20)
    sys.exit(f"Download von '{name}' fehlgeschlagen: {last}")


# ------------------------------------------------------------------ Geometrie
def proj(lat: float, lon: float) -> tuple[float, float]:
    return (lon - WEST) * KX / SPAN_X * WIDTH, (NORTH - lat) / SPAN_Y * HEIGHT


def way_pts(el: dict) -> list[tuple[float, float]]:
    return [(g["lat"], g["lon"]) for g in el.get("geometry", []) if g]


def stitch(segs: list[list]) -> list[list]:
    """Fuegt Wegstuecke zu geschlossenen Ringen zusammen; offene Ketten werden verworfen."""
    segs = [list(s) for s in segs if len(s) > 1]
    rings = []
    while segs:
        ring = segs.pop(0)
        progress = True
        while ring[0] != ring[-1] and progress:
            progress = False
            for i, s in enumerate(segs):
                if s[0] == ring[-1]:
                    ring += s[1:]
                elif s[-1] == ring[-1]:
                    ring += s[-2::-1]
                elif s[-1] == ring[0]:
                    ring = s[:-1] + ring
                elif s[0] == ring[0]:
                    ring = s[:0:-1] + ring
                else:
                    continue
                segs.pop(i)
                progress = True
                break
        if ring[0] == ring[-1] and len(ring) > 3:
            rings.append(ring)
    return rings


def rings_of(el: dict) -> list[list]:
    if el["type"] == "way":
        p = way_pts(el)
        return [p] if len(p) > 3 and p[0] == p[-1] else []
    segs = [way_pts(m) for m in el.get("members", []) if m.get("type") == "way" and m.get("role") != "inner"]
    return stitch(segs)


def d_line(pts) -> str:
    return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in (proj(a, b) for a, b in pts))


def d_ring(pts) -> str:
    return d_line(pts) + "Z"


# ------------------------------------------------------------------ Texturen
def pattern_bricks(seed=7, tile=240, cell=12) -> str:
    rnd = random.Random(seed)
    tones = ["#b9654b", "#c4785a", "#ad5a42", "#cf8a68", "#b06a52", "#c06f55", "#a35340", "#d39673"]
    out = [f'<pattern id="bricks" width="{tile}" height="{tile}" patternUnits="userSpaceOnUse">',
           f'<rect width="{tile}" height="{tile}" fill="{BRICK_LINE}"/>']
    for gy in range(tile // cell):
        for gx in range(tile // cell):
            w, h = cell - rnd.uniform(1.4, 3.2), cell - rnd.uniform(1.4, 3.2)
            out.append(f'<rect x="{gx * cell + rnd.uniform(0.3, 1.2):.1f}" y="{gy * cell + rnd.uniform(0.3, 1.2):.1f}" '
                       f'width="{w:.1f}" height="{h:.1f}" fill="{rnd.choice(tones)}"/>')
    out.append("</pattern>")
    return "".join(out)


def pattern_trees(seed=11, tile=140) -> str:
    rnd = random.Random(seed)
    out = [f'<pattern id="trees" width="{tile}" height="{tile}" patternUnits="userSpaceOnUse">',
           f'<rect width="{tile}" height="{tile}" fill="{PARK}"/>']
    for _ in range(46):
        r = rnd.uniform(3.2, 6.5)
        x, y = rnd.uniform(0, tile), rnd.uniform(0, tile)
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{rnd.choice(["#4f8a3b", "#5e9a43", "#3f7a33", "#6aa84c"])}"/>')
    out.append("</pattern>")
    return "".join(out)


# ------------------------------------------------------------------ Zeichnen
def build() -> str:
    streets, water, green = fetch("streets"), fetch("water"), fetch("green")

    # Strassen je Klasse
    by_class: dict[str, list[str]] = {k: [] for k in ROADS}
    for el in streets["elements"]:
        t = el.get("tags", {})
        if el["type"] != "way" or t.get("highway") not in ROADS:
            continue
        if t.get("tunnel") not in (None, "no") or t.get("area") == "yes":
            continue
        p = way_pts(el)
        if len(p) > 1:
            by_class[t["highway"]].append(d_line(p))

    parks = [d_ring(r) for el in green["elements"] for r in rings_of(el)]
    lakes, thames, canals = [], [], []
    for el in water["elements"]:
        t = el.get("tags", {})
        if t.get("waterway") == "river" and el["type"] == "way":
            if "Thames" in t.get("name", ""):
                thames.append(d_line(way_pts(el)))
        elif t.get("waterway") == "canal" and el["type"] == "way":
            canals.append(d_line(way_pts(el)))
        else:
            lakes += [d_ring(r) for r in rings_of(el)]

    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" width="{WIDTH}" height="{HEIGHT}">',
         "<title>London - Illustration, nicht massstaeblich fuer Strassen. Daten: (c) OpenStreetMap contributors (ODbL)</title>",
         "<defs>", pattern_bricks(), pattern_trees(),
         '<filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3"/>'
         '<feColorMatrix values="0 0 0 0 0.36  0 0 0 0 0.28  0 0 0 0 0.18  0.55 0 0 0 0"/></filter>',
         f'<clipPath id="clip"><rect width="{WIDTH}" height="{HEIGHT}"/></clipPath>', "</defs>",
         '<g clip-path="url(#clip)">',
         f'<rect width="{WIDTH}" height="{HEIGHT}" fill="url(#bricks)"/>',
         f'<g id="gruen" fill="url(#trees)" stroke="{PARK_EDGE}" stroke-width="2" stroke-linejoin="round">']
    o += [f'<path d="{d}"/>' for d in parks]
    o.append("</g>")
    o.append(f'<g id="wasser" fill="{WATER}" stroke="{WATER_EDGE}" stroke-width="2" stroke-linejoin="round">')
    o += [f'<path d="{d}" fill="none" stroke="{WATER}" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>' for d in thames]
    o += [f'<path d="{d}" fill="none" stroke="{WATER}" stroke-width="5" stroke-linecap="round"/>' for d in canals]
    o += [f'<path d="{d}"/>' for d in lakes]
    o.append("</g>")
    o.append('<g id="strassen-rand" fill="none" stroke-linecap="round" stroke-linejoin="round">')
    for k in ROAD_ORDER:
        if by_class[k]:
            w = ROADS[k]
            if w >= 5:
                o.append(f'<path d="{" ".join(by_class[k])}" stroke="{STREET_EDGE}" stroke-width="{w + 2.8}" stroke-dasharray="4 3"/>')
            else:
                o.append(f'<path d="{" ".join(by_class[k])}" stroke="{STREET_EDGE_MINOR}" stroke-width="{w + 1.4}"/>')
    o.append("</g>")
    o.append(f'<g id="strassen" fill="none" stroke="{STREET}" stroke-linecap="round" stroke-linejoin="round">')
    for k in ROAD_ORDER:
        if by_class[k]:
            o.append(f'<path d="{" ".join(by_class[k])}" stroke-width="{ROADS[k]}"/>')
    o.append("</g>")
    o.append(f'<rect width="{WIDTH}" height="{HEIGHT}" filter="url(#paper)" opacity="0.55" style="mix-blend-mode:multiply"/>')
    o.append(labels_svg(green, water, proj, rings_of, way_pts,
                        {c: proj(*ll) for c, ll in STATIONS.items()}, WIDTH, HEIGHT))
    o.append('<g id="stationen" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="22" text-anchor="middle">')
    for code, (lat, lon) in STATIONS.items():
        x, y = proj(lat, lon)
        o.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="27" fill="#1d2a4a" stroke="#f7f0df" stroke-width="5"/>'
                 f'<text x="{x:.1f}" y="{y + 8:.1f}" fill="#f7f0df">{code}</text>')
    o.append("</g></g></svg>")
    print(f"Strassen: {sum(len(v) for v in by_class.values())}, Gruen: {len(parks)}, Wasser: {len(lakes)} Flaechen, "
          f"Themse-Wege: {len(thames)}, Kanaele: {len(canals)}")
    return "\n".join(o)


if __name__ == "__main__":
    svg = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(svg, encoding="utf-8")
    print(f"Fertig: {OUT} ({len(svg) / 1e6:.1f} MB)")