#!/usr/bin/env python3
"""
TVS 3-wheeler 360 downloader (e.g. King Kargo EV HD).
Usage:
    python download_tvs.py "https://www.tvsmotor.com/three-wheelers/king-kargo-ev-hd" --id king-kargo-ev-hd --name "TVS King Kargo EV HD"
    python download_tvs.py  (interactive)

TVS embeds ALL frames directly in the product page HTML (below, in the 360 section):
  2 colors  x 4 variants x 12 frames = 96 webp files, e.g.
  .../cargoevhd360/360-fold-images-white-color/Fixed-Side-Deck/N603_WhiteFSD_TurnTable_01.webp
  .../cargoevhd360/360-fold-webp-images-blue/Container/N603_BlueContainer_TurnTable_12.webp

Saves as SEPARATE 3-wheeler category:
    three-wheelers/<id>/<color>/<variant>/frame-00.webp ...
    three-wheelers/<id>/config.json  (colors + variants matrix)
    three-wheelers/<id>/meta.json
No extra packages needed (urllib only).
"""
import os
import re
import json
import argparse
import urllib.request
import urllib.parse

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
ROOT = os.path.dirname(os.path.abspath(__file__))

# color folder on site -> our short id + display name
COLORS = {
    "360-fold-images-white-color": ("white", "Pristine White"),
    "360-fold-webp-images-blue": ("blue", "Neptune Blue"),
}
# variant folder on site -> our short id + display name + filename token
VARIANTS = {
    "Fixed-Side-Deck": ("fixed-side-deck", "Fixed Side Deck", "FSD"),
    "Platform": ("platform", "PF Platform", "PF"),
    "Cab-Chassis": ("cab-chassis", "Chassis", "CBC"),
    "Container": ("container", "Container", "Container"),
}
FRAMES = list(range(1, 13))  # TurnTable_01..12


def fetch_text(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="ignore")


def fetch_bytes(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def norm_base(url):
    url = url.strip().strip("'\"").split("#")[0].split("?")[0]
    return url.rstrip("/") + ""


def discover_urls(html, page_url):
    """Pull every cargoevhd360 image URL straight from the page HTML."""
    found = sorted(set(re.findall(
        r"/three-wheelers/-/media/Feature/tvs-three-wheeler/cargoevhd360/[^\"'()\s]+?\.webp", html)))
    abs_urls = [urllib.parse.urljoin(page_url, u.split("?")[0]) for u in found]
    return sorted(set(abs_urls))


def build_matrix(page_url, html_urls):
    """Organize discovered URLs into color/variant/frame matrix; fill gaps by pattern."""
    mat = {}
    for u in html_urls:
        m = re.search(r"cargoevhd360/([^/]+)/([^/]+)/([^/]+)_TurnTable_(\d+)\.webp", u)
        if not m:
            continue
        mat.setdefault((m.group(1), m.group(2)), {})[int(m.group(4))] = u
    return mat


def download_tvs(page_url, veh_id=None, veh_name=None):
    page_url = norm_base(page_url)
    print(f"[1/3] Fetching page: {page_url}")
    html = fetch_text(page_url)
    discovered = discover_urls(html, page_url)
    print(f"      found {len(discovered)} embedded 360 URLs in HTML")
    if not discovered:
        raise SystemExit("No cargoevhd360 URLs found — page structure may have changed.")

    if not veh_id:
        m = re.search(r"/three-wheelers/([a-z0-9\-]+)", page_url)
        veh_id = m.group(1) if m else "tvs-3wheeler"
    if not veh_name:
        veh_name = veh_id.replace("-", " ").title()

    base_dir = os.path.join(ROOT, "three-wheelers", veh_id)
    total_ok, total_fail, missing = 0, 0, []

    print(f"[2/3] Downloading 2 colors x 4 variants x 12 frames -> {base_dir}")
    views = {}
    for site_color, (cid, cname) in COLORS.items():
        for site_var, (vid, vname, token) in VARIANTS.items():
            # color token in filename: White / Blue
            ftoken = "White" if cid == "white" else "Blue"
            out_dir = os.path.join(base_dir, cid, vid)
            os.makedirs(out_dir, exist_ok=True)
            ok = 0
            for n in FRAMES:
                # prefer exact discovered URL, else construct pattern
                cand = [u for u in discovered
                        if site_color in u and f"/{site_var}/" in u and f"TurnTable_{n:02d}.webp" in u]
                if cand:
                    src = cand[0]
                else:
                    src = (f"https://www.tvsmotor.com/three-wheelers/-/media/Feature/"
                           f"tvs-three-wheeler/cargoevhd360/{site_color}/{site_var}/"
                           f"N603_{ftoken}{token}_TurnTable_{n:02d}.webp")
                dest = os.path.join(out_dir, f"frame-{n-1:02d}.webp")
                if os.path.exists(dest) and os.path.getsize(dest) > 0:
                    ok += 1
                    total_ok += 1
                    continue
                try:
                    data = fetch_bytes(src)
                    with open(dest, "wb") as f:
                        f.write(data)
                    ok += 1
                    total_ok += 1
                    print(f"  {cid}/{vid} {n}/12 OK {len(data)//1024}KB")
                except Exception as e:
                    total_fail += 1
                    missing.append(f"{cid}/{vid}/{n:02d} <- {src} ({e})")
                    print(f"  {cid}/{vid} {n}/12 FAIL ({e})")
            views.setdefault(cid, {})[vid] = {
                "type": "spin", "folder": f"three-wheelers/{veh_id}/{cid}/{vid}",
                "pattern": "frame-{nn}.webp", "frames": 12,
                "label": f"{vname} — {cname}",
            }

    config = {"id": veh_id, "name": veh_name, "category": "three-wheeler",
              "source": page_url,
              "colors": {cid: cname for _, (cid, cname) in COLORS.items()},
              "variants": {vid: vname for _, (vid, vname, _) in VARIANTS.items()},
              "views": views}
    with open(os.path.join(base_dir, "config.json"), "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)
    with open(os.path.join(base_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump({"page": page_url, "discovered": len(discovered),
                   "downloaded": total_ok, "failed": total_fail, "missing": missing}, f, indent=2)
    print(f"[3/3] Done: {total_ok} ok, {total_fail} failed -> {base_dir}")
    if missing:
        print("Missing:")
        for m in missing:
            print("  ", m)
    print("Add to three-wheelers/three-wheelers.js:")
    print(f'  {{ id: "{veh_id}", name: "{veh_name}", configUrl: "three-wheelers/{veh_id}/config.json", '
          f'thumb: "three-wheelers/{veh_id}/white/fixed-side-deck/frame-00.webp" }},')
    return base_dir


def main():
    ap = argparse.ArgumentParser(description="Download TVS 3-wheeler 360 (all colors x variants)")
    ap.add_argument("url", nargs="?")
    ap.add_argument("--id", dest="veh_id", default=None)
    ap.add_argument("--name", dest="veh_name", default=None)
    a = ap.parse_args()
    url = a.url or input("Paste TVS 3-wheeler page link: ").strip().strip("'\"")
    if not url.startswith("http"):
        raise SystemExit("Paste a full https:// link.")
    if not a.veh_id:
        m = re.search(r"/three-wheelers/([a-z0-9\-]+)", url)
        guess = m.group(1) if m else "tvs-3wheeler"
        ans = input(f"Folder id [{guess}]: ").strip()
        a.veh_id = ans or guess
    if not a.veh_name:
        ans = input("Display name (Enter to auto): ").strip()
        a.veh_name = ans or None
    download_tvs(url, a.veh_id, a.veh_name)


if __name__ == "__main__":
    main()
