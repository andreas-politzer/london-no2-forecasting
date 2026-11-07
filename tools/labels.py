"""Beschriftungen fuer die Londoner Karte: Parks, Themse, Stadtteile, Wahrzeichen.
Nur Schrift und kleine Punkte, keine Zeichnungen. Namen der Parks kommen aus den OpenStreetMap-Daten."""
from __future__ import annotations

import math
from html import escape

# (Name, Breite, Laenge). Positionen gerundet; die Karte zeigt sie an der passenden Stelle.
DISTRICTS = [
    ("ACTON", 51.5090, -0.2740), ("SHEPHERD'S BUSH", 51.5046, -0.2188), ("HAMMERSMITH", 51.4927, -0.2230),
    ("NOTTING HILL", 51.5095, -0.2000), ("PADDINGTON", 51.5154, -0.1755), ("KENSINGTON", 51.4985, -0.1930),
    ("CHELSEA", 51.4875, -0.1687), ("FULHAM", 51.4802, -0.1950), ("SOHO", 51.5136, -0.1365),
    ("CAMDEN", 51.5390, -0.1426), ("WESTMINSTER", 51.4960, -0.1300), ("LAMBETH", 51.4930, -0.1180),
]
LANDMARKS = [
    ("Big Ben", 51.5007, -0.1246), ("London Eye", 51.5033, -0.1196), ("Buckingham Palace", 51.5014, -0.1419),
    ("Royal Albert Hall", 51.5010, -0.1774), ("Kensington Palace", 51.5058, -0.1877),
    ("Battersea Power Station", 51.4818, -0.1445), ("Lord's", 51.5299, -0.1727),
]
PARK_KEYS = ("park", "common", "garden", "nature_reserve")
SERIF = "Georgia, 'Times New Roman', serif"
SANS = "Helvetica, Arial, sans-serif"
HALO = 'paint-order="stroke" stroke="#f7f0df" stroke-linejoin="round"'


def _area_centroid(pts):
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
        c = x0 * y1 - x1 * y0
        a += c
        cx += (x0 + x1) * c
        cy += (y0 + y1) * c
    if abs(a) < 1e-6:
        return 0.0, sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
    return abs(a) / 2, cx / (3 * a), cy / (3 * a)


def _chains(ways):
    """Setzt offene Wegstuecke zu moeglichst langen Linien zusammen."""
    ways = [list(w) for w in ways if len(w) > 1]
    done = []
    while ways:
        c = ways.pop(0)
        grown = True
        while grown:
            grown = False
            for i, w in enumerate(ways):
                if w[0] == c[-1]:
                    c += w[1:]
                elif w[-1] == c[-1]:
                    c += w[-2::-1]
                elif w[-1] == c[0]:
                    c = w[:-1] + c
                elif w[0] == c[0]:
                    c = w[:0:-1] + c
                else:
                    continue
                ways.pop(i)
                grown = True
                break
        done.append(c)
    return done


def labels_svg(green, water, proj, rings_of, way_pts, stations_px, width, height) -> str:
    placed = [(x - 45, y - 45, x + 45, y + 45) for x, y in stations_px.values()]

    def free(x, y, w, h):
        r = (x - w / 2, y - h / 2, x + w / 2, y + h / 2)
        if r[0] < 8 or r[2] > width - 8 or r[1] < 8 or r[3] > height - 8:
            return False
        return all(r[2] < p[0] or r[0] > p[2] or r[3] < p[1] or r[1] > p[3] for p in placed)

    def take(x, y, w, h):
        if free(x, y, w, h):
            placed.append((x - w / 2, y - h / 2, x + w / 2, y + h / 2))
            return True
        return False

    out = ['<g id="beschriftung">']

    # --- Themse: Text entlang des Flusses, an moeglichst geraden Stellen
    thames = [[proj(a, b) for a, b in way_pts(e)] for e in water["elements"]
              if e["type"] == "way" and e.get("tags", {}).get("waterway") == "river" and "Thames" in e.get("tags", {}).get("name", "")]
    labels_t, k = [], 0
    for chain in _chains(thames):
        if chain[0][0] > chain[-1][0]:
            chain.reverse()  # immer von West nach Ost, damit der Text nicht auf dem Kopf steht
        step, win = 20.0, 9
        pts = [chain[0]]  # gleichmaessig im Abstand 'step' neu abtasten
        carry = 0.0
        for (x0, y0), (x1, y1) in zip(chain, chain[1:]):
            seg = math.hypot(x1 - x0, y1 - y0)
            d = step - carry
            while d <= seg:
                pts.append((x0 + (x1 - x0) * d / seg, y0 + (y1 - y0) * d / seg))
                d += step
            carry = seg - (d - step)
        cands = []
        for i in range(win, len(pts) - win):
            seg = pts[i - win:i + win + 1]
            path = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(seg, seg[1:]))
            chord = math.hypot(seg[-1][0] - seg[0][0], seg[-1][1] - seg[0][1])
            if path and chord / path > 0.975 and 160 < pts[i][0] < width - 160 and 100 < pts[i][1] < height - 100:
                cands.append((chord / path, i))
        used = []
        for _, i in sorted(cands, reverse=True):
            if all(math.hypot(pts[i][0] - u[0], pts[i][1] - u[1]) > 700 for u in used) and len(used) < 2 and k < 2:
                used.append(pts[i]); k += 1
                seg = pts[i - win:i + win + 1]
                d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in seg)
                labels_t.append((f"thames-pfad-{k}", d))
    for pid, d in labels_t:
        out.append(f'<path id="{pid}" d="{d}" fill="none" stroke="none"/>')
        out.append(f'<text font-family="{SERIF}" font-style="italic" font-size="34" letter-spacing="9" fill="#f2f7ff" class="lab major">'
                   f'<textPath href="#{pid}" startOffset="50%" text-anchor="middle">River Thames</textPath></text>')

    # --- Parks (Name aus OSM), groesste zuerst
    parks = {}
    for el in green["elements"]:
        t = el.get("tags", {})
        name = t.get("name")
        if not name or t.get("leisure") not in PARK_KEYS:
            continue
        for ring in rings_of(el):
            area, cx, cy = _area_centroid([proj(a, b) for a, b in ring])
            if name not in parks or area > parks[name][0]:
                parks[name] = (area, cx, cy)
    for name, (area, cx, cy) in sorted(parks.items(), key=lambda kv: -kv[1][0])[:30]:
        side = math.sqrt(area)
        fs = max(18.0, min(38.0, 0.1 * side))
        while fs > 18 and 0.56 * fs * len(name) > 1.7 * side:
            fs -= 1
        w, h = 0.56 * fs * len(name), fs * 1.2
        if w > 1.7 * side or not take(cx, cy, w, h):
            continue
        cls = "major" if fs >= 26 else "minor"
        out.append(f'<text x="{cx:.1f}" y="{cy + fs * 0.3:.1f}" text-anchor="middle" font-family="{SERIF}" font-style="italic" '
                   f'font-size="{fs:.0f}" fill="#2c5a22" stroke-width="{max(3, fs / 6):.1f}" {HALO} class="lab {cls}">{escape(name)}</text>')

    # --- Wahrzeichen: kleiner Punkt plus Name
    for name, lat, lon in LANDMARKS:
        x, y = proj(lat, lon)
        w, h = 0.5 * 22 * len(name) + 26, 30
        if take(x + w / 2 - 8, y, w, h):
            out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="8" fill="#f7f0df" stroke="#7a1f16" stroke-width="4" class="lab minor"/>')
            out.append(f'<text x="{x + 15:.1f}" y="{y + 8:.1f}" font-family="{SERIF}" font-style="italic" font-size="22" fill="#2a1a14" '
                       f'stroke-width="4" {HALO} class="lab minor">{escape(name)}</text>')

    # --- Stadtteile in Grossbuchstaben
    for name, lat, lon in DISTRICTS:
        x, y = proj(lat, lon)
        fs = 24
        w, h = (0.68 * fs + 4) * len(name), fs * 1.3
        if take(x, y, w, h):
            out.append(f'<text x="{x:.1f}" y="{y + 6:.1f}" text-anchor="middle" font-family="{SANS}" font-weight="700" font-size="{fs}" '
                       f'letter-spacing="4" fill="#4a2018" fill-opacity="0.85" stroke-width="5" {HALO} class="lab minor">{escape(name)}</text>')

    # --- benannte Seen / Teiche
    for el in water["elements"]:
        t = el.get("tags", {})
        name = t.get("name")
        if not name or t.get("waterway") in ("river", "canal") or "Thames" in name:
            continue
        for ring in rings_of(el):
            area, cx, cy = _area_centroid([proj(a, b) for a, b in ring])
            w, h = 0.5 * 18 * len(name), 22
            if area > 3000 and take(cx, cy, w, h):
                out.append(f'<text x="{cx:.1f}" y="{cy + 6:.1f}" text-anchor="middle" font-family="{SERIF}" font-style="italic" font-size="18" '
                           f'fill="#eef5ff" class="lab minor">{escape(name)}</text>')
    out.append("</g>")
    return "\n".join(out)