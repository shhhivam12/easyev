#!/usr/bin/env python3
"""
CarWale 360-view downloader (exterior + open-door + interior panorama).
Usage:
    python download_carwale.py "https://www.carwale.com/tata-cars/nexon-ev/360-view/" --id nexon-ev-carwale --name "Tata Nexon EV"
    python download_carwale.py  (interactive prompts)

Accepts base /open/ /interior/ URLs — normalizes to base automatically.
Saves to separate repos per view:
    cars/<id>/exterior/frame-00.jpg ...
    cars/<id>/open/frame-00.jpg ...
    cars/<id>/interior/face-0.jpg ... face-5.jpg (+ previews)
    cars/<id>/config.json  (website-ready, 3 views)
    cars/<id>/meta.json    (source versions for re-download)
No extra packages needed (urllib only).
"""
import os
import re
import json
import argparse
import urllib.request

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
ROOT = os.path.dirname(os.path.abspath(__file__))
CDN = "https://imgd.aeplcdn.com/"
BASE360 = "https://www.carwale.com"


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
    url = re.sub(r"/(open|interior)/?$", "/", url)
    if not url.endswith("/"):
        url += "/"
    return url


def parse_page(html):
    def grab(pat, name):
        m = re.search(pat, html)
        if not m:
            raise SystemExit(f"Could not parse {name} from page")
        return m.group(1)
    url_make = grab(r"urlMakeName:\s*'([^']+)'", "urlMakeName")
    model_id = grab(r"modelId:\s*'([^']+)'", "modelId")
    v_closed = grab(r"closed:\s*'([^']+)'", "xmlVersion.closed")
    v_open = grab(r"open:\s*'([^']+)'", "xmlVersion.open")
    v_int = grab(r"interior:\s*'([^']+)'", "xmlVersion.interior")
    # NOTE: categoryVariantMap must be read from its own block —
    # a naive /closed:'...' search hits xmlVersion first (wrong).
    cmap = re.search(r"categoryVariantMap\s*=\s*\{([^}]+)\}", html)
    if not cmap:
        raise SystemExit("Could not parse categoryVariantMap from page")
    b = cmap.group(1)
    def inmap(key):
        m = re.search(re.escape(key) + r"\s*:\s*'([^']*)'", b)
        return m.group(1) if m else ""
    var_closed, var_open, var_int = inmap("closed"), inmap("open"), inmap("interior")
    col_closed = grab(r'selectedColorForClosedView\s*=\s*"([^"]+)"', "color.closed")
    mo = re.search(r'selectedColorForOpenView\s*=\s*"([^"]+)"', html)
    col_open = mo.group(1) if mo else col_closed
    return {
        "url_make": url_make, "model_id": model_id,
        "v_closed": v_closed, "v_open": v_open, "v_int": v_int,
        "var_closed": var_closed, "var_open": var_open, "var_int": var_int,
        "col_closed": col_closed, "col_open": col_open,
    }


def count_frames(xml_text):
    return xml_text.count("<image src=")


def dl(url, dest):
    data = fetch_bytes(url)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "wb") as f:
        f.write(data)
    return len(data)


def download_carwale(page_url, car_id=None, car_name=None):
    base = norm_base(page_url)
    print(f"[1/5] Fetching: {base}")
    html = fetch_text(base)
    cfg = parse_page(html)
    print(f"      make={cfg['url_make']} model={cfg['model_id']} "
          f"var_closed={cfg['var_closed']} var_open={cfg['var_open']} var_int={cfg['var_int']} "
          f"color={cfg['col_closed']}/{cfg['col_open']}")

    if not car_id:
        m = re.search(r"/([a-z0-9\-]+)/([a-z0-9\-]+)/360-view/", base)
        car_id = f"{m.group(2)}-carwale" if m else f"model-{cfg['model_id']}"
    if not car_name:
        car_name = car_id.replace("-", " ").title()

    car_dir = os.path.join(ROOT, "cars", car_id)
    ext_dir = os.path.join(car_dir, "exterior")
    open_dir = os.path.join(car_dir, "open")
    int_dir = os.path.join(car_dir, "interior")

    # ---- Exterior (WebRotate360 spin, N frames) ----
    ext_xml_url = (f"{BASE360}/api/xml/360/v1/{cfg['model_id']}/{cfg['var_closed']}/closed/"
                   f"?v={cfg['v_closed']}&isMsite=false&getHotspots=true")
    ext_xml = fetch_text(ext_xml_url)
    n_ext = count_frames(ext_xml)
    ext_root = (f"{CDN}1280x720/cw/360/{cfg['url_make']}/{cfg['model_id']}/"
                f"{cfg['var_closed']}/closed-door/{cfg['col_closed']}/")
    print(f"[2/5] Exterior: {n_ext} frames")
    print(f"      root: {ext_root}")
    for i in range(1, n_ext + 1):
        src = f"{ext_root}{i}.jpg?wm=1&q=80&v={cfg['v_closed']}"
        dest = os.path.join(ext_dir, f"frame-{i-1:02d}.jpg")
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            print(f"  ext {i}/{n_ext} skip (exists)")
            continue
        n = dl(src, dest)
        print(f"  ext {i}/{n_ext} OK {n//1024}KB")

    # ---- Open-door (same spin technique, N frames) ----
    open_xml_url = (f"{BASE360}/api/xml/360/v1/{cfg['model_id']}/{cfg['var_open']}/open/"
                    f"?v={cfg['v_open']}&isMsite=false&getHotspots=true")
    open_xml = fetch_text(open_xml_url)
    n_open = count_frames(open_xml)
    open_root = (f"{CDN}1280x720/cw/360/{cfg['url_make']}/{cfg['model_id']}/"
                 f"{cfg['var_open']}/open-door/{cfg['col_open']}/")
    print(f"[3/5] Open-door: {n_open} frames")
    for i in range(1, n_open + 1):
        src = f"{open_root}{i}.jpg?wm=1&q=80&v={cfg['v_open']}"
        dest = os.path.join(open_dir, f"frame-{i-1:02d}.jpg")
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            print(f"  open {i}/{n_open} skip (exists)")
            continue
        n = dl(src, dest)
        print(f"  open {i}/{n_open} OK {n//1024}KB")

    # ---- Interior (Pano2VR cube: 6 faces + 6 previews, NOT a spin) ----
    # Some cars (e.g. Comet EV: var_int=0) have NO interior — skip gracefully.
    has_interior = bool(cfg['var_int']) and cfg['var_int'] != "0"
    if has_interior:
        int_root = (f"{CDN}1875x1875/cw/360/{cfg['url_make']}/{cfg['model_id']}/"
                    f"{cfg['var_int']}/interior/d/")
        print(f"[4/5] Interior panorama cube (6 faces + previews)")
        print(f"      root: {int_root}")
        try:
            for i in range(1, 7):
                for suffix, tag in [("", f"face-{i-1}"), ("_preview", f"face-{i-1}-preview")]:
                    fname = f"{i}{suffix}.jpg"
                    src = f"{int_root}{fname}?v={cfg['v_int']}&ao=1" + ("" if suffix else "&q=75")
                    dest = os.path.join(int_dir, f"{tag}.jpg")
                    if os.path.exists(dest) and os.path.getsize(dest) > 0:
                        print(f"  int {tag} skip (exists)")
                        continue
                    n = dl(src, dest)
                    print(f"  int {tag} OK {n//1024}KB")
        except Exception as e:
            print(f"      Interior not available ({e}) — continuing with exterior+open only")
            has_interior = False
    else:
        print(f"[4/5] Interior: not available for this car (var_int=0) — skipping")

    # ---- Website config ----
    views = {
        "exterior": {"type": "spin", "folder": f"cars/{car_id}/exterior",
                     "pattern": "frame-{nn}.jpg", "frames": n_ext,
                     "label": "Exterior 360° (doors closed)"},
        "open": {"type": "spin", "folder": f"cars/{car_id}/open",
                 "pattern": "frame-{nn}.jpg", "frames": n_open,
                 "label": "Open-door 360°"},
    }
    if has_interior:
        views["interior"] = {"type": "cubemap", "folder": f"cars/{car_id}/interior",
                     "faces": ["face-0.jpg", "face-1.jpg", "face-2.jpg",
                               "face-3.jpg", "face-4.jpg", "face-5.jpg"],
                     "label": "Interior panorama"}
    config = {
        "id": car_id,
        "name": car_name,
        "source": base,
        "views": views,
    }
    with open(os.path.join(car_dir, "config.json"), "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)
    meta = {"page": base, "parsed": cfg,
            "xml": {"closed": ext_xml_url, "open": open_xml_url}}
    with open(os.path.join(car_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    print(f"[5/5] Done -> {car_dir}")
    print(f'Add to cars/cars.js:\n  {{ id: "{car_id}", name: "{car_name} (3 views)", '
          f'configUrl: "cars/{car_id}/config.json", thumb: "cars/{car_id}/exterior/frame-00.jpg" }},')
    return car_dir


def main():
    ap = argparse.ArgumentParser(description="Download CarWale 360 (exterior+open+interior)")
    ap.add_argument("url", nargs="?", help="CarWale 360-view URL")
    ap.add_argument("--id", dest="car_id", default=None)
    ap.add_argument("--name", dest="car_name", default=None)
    a = ap.parse_args()
    url = a.url or input("Paste CarWale 360-view link: ").strip().strip("'\"")
    if not url.startswith("http"):
        raise SystemExit("Paste a full https:// link.")
    if not a.car_id:
        m = re.search(r"/([a-z0-9\-]+)/([a-z0-9\-]+)/360-view/", norm_base(url))
        guess = f"{m.group(2)}-carwale" if m else "new-car"
        ans = input(f"Folder id [{guess}]: ").strip()
        a.car_id = ans or guess
    if not a.car_name:
        ans = input("Car display name (Enter to auto): ").strip()
        a.car_name = ans or None
    download_carwale(url, a.car_id, a.car_name)


if __name__ == "__main__":
    main()
