#!/usr/bin/env python3
"""
CarDekho 360-view image downloader.
Usage:
    python download_car.py
    python download_car.py "https://www.cardekho.com/tata-punch-ev-360-view.htm"
    python download_car.py "https://www.cardekho.com/citroen/c3#gallery" --id citroen-c3
    python download_car.py "https://www.cardekho.com/citroen/c3" --id citroen-c3 --name "Citroen C3"

Accepts BOTH link types:
  1) ...-360-view.htm        (direct 360 page)
  2) /brand/model / /brand/model#gallery  (model/gallery page -> auto-finds 360 page)

It auto-finds the hidden Exterior.html -> XML -> images/img_0_0_X.jpg
and saves to: cars/<id>/images/frame-00.jpg ... + cars/<id>/config.json
No extra packages needed (urllib only).
"""
import os
import re
import sys
import json
import argparse
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
ROOT = os.path.dirname(os.path.abspath(__file__))


def fetch_text(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
        # try utf-8, ignore errors (page has mixed encoding)
        return raw.decode("utf-8", errors="ignore")


def fetch_bytes(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def slug_from_url(page_url):
    # e.g. https://www.cardekho.com/tata-punch-ev-360-view.htm -> tata-punch-ev
    m = re.search(r"/([^/]+?)(?:-360-view\.htm)", page_url)
    if m:
        return m.group(1)
    # e.g. https://www.cardekho.com/citroen/c3 -> citroen-c3
    m = re.search(r"cardekho\.com/([a-z0-9\-]+)/([a-z0-9\-]+)", page_url)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    return "new-car"


def resolve_360_page(page_url, html):
    """Return (360_page_url, 360_page_html). Handles direct + model/gallery URLs."""
    # Strip #gallery fragment for fetching
    page_url = page_url.split("#")[0]
    # Case 1: already a 360 page
    if "-360-view.htm" in page_url:
        return page_url, html
    # Case 2: model/gallery page -> find first *-360-view.htm link inside
    m = re.search(r'/(citroen-c3-360-view\.htm|[a-z0-9\-]+-360-view\.htm)', html)
    if m:
        found = "https://www.cardekho.com/" + m.group(1)
        print(f"      Model/gallery page detected, following 360 link: {found}")
        return found, fetch_text(found)
    raise SystemExit(
        "No 360 view found on this page. This model may not have a 360 view, "
        "or paste the direct ...-360-view.htm link instead."
    )


def find_exterior_html(page_html):
    # Primary: JSON blob has "category":"exterior360View","url":"https://.../Exterior.html"
    m = re.search(
        r'"category"\s*:\s*"exterior360View"\s*,\s*"url"\s*:\s*"(https://[^"]+?Exterior\.html)"',
        page_html,
    )
    if m:
        return m.group(1).replace("\\/", "/")

    # Fallback: any feelthecar360view ... Exterior.html link
    m = re.search(r"(https://stimg\.cardekho\.com[^\"'\\\s]+?Exterior\.html)", page_html)
    if m:
        return m.group(1).replace("\\/", "/")

    raise SystemExit(
        "Could not find 360 Exterior URL in page. "
        "Make sure the link is a ...-360-view.htm page that has a 360 exterior view."
    )


def find_xml_url(exterior_html_url):
    base = exterior_html_url.rsplit("/", 1)[0] + "/"
    # CarDekho uses "360 View_out.xml" (with a space)
    for name in ["360%20View_out.xml", "360 View_out.xml"]:
        url = base + name
        try:
            txt = fetch_text(url)
            if "<vrobject" in txt or "<input" in txt:
                return url, txt
        except Exception:
            continue
    raise SystemExit(f"Could not fetch 360 XML from {base}")


def parse_xml(xml_text):
    root = ET.fromstring(xml_text)
    inp = root.find("input")
    cols = int(inp.get("columns", "24"))
    rows = int(inp.get("rows", "1"))
    states = int(inp.get("states", "1"))
    path = inp.get("imagepath", "images")
    ext = inp.get("fileextension", "jpg")
    width = int(inp.get("width", "930"))
    height = int(inp.get("height", "620"))
    return cols, rows, states, path, ext, width, height


def download_car(page_url, car_id=None, car_name=None):
    page_url = page_url.strip().strip("'\"").split("#")[0]
    print(f"[1/4] Fetching page: {page_url}")
    html = fetch_text(page_url)

    # Support both direct 360 URLs and model/gallery URLs
    page_url, html = resolve_360_page(page_url, html)
    print(f"      Using 360 page: {page_url}")

    print("[2/4] Finding hidden 360 Exterior.html ...")
    ext_url = find_exterior_html(html)
    print(f"      Found: {ext_url}")

    print("[3/4] Reading 360 config XML ...")
    xml_url, xml_text = find_xml_url(ext_url)
    print(f"      XML: {xml_url}")
    cols, rows, states, img_path, ext, w, h = parse_xml(xml_text)
    total = cols * rows * states
    print(f"      frames={total} (cols={cols} rows={rows} states={states}) path={img_path} ext={ext} size={w}x{h}")

    if not car_id:
        car_id = slug_from_url(page_url)
    if not car_name:
        # pretty name from slug: tata-punch-ev -> Tata Punch Ev
        car_name = car_id.replace("-", " ").title()

    base_img = ext_url.rsplit("/", 1)[0] + "/" + img_path.strip("/") + "/"
    out_dir = os.path.join(ROOT, "cars", car_id, "images")
    os.makedirs(out_dir, exist_ok=True)

    print(f"[4/4] Downloading {total} images -> {out_dir}")
    # Object2VR pattern: img_{state}_{row}_{col}.jpg
    # CarDekho uses state=0 row=0, col=0..cols-1
    n = 0
    for col in range(cols):
        src = f"{base_img}img_0_0_{col}.{ext}"
        dest = os.path.join(out_dir, f"frame-{n:02d}.jpg")
        try:
            data = fetch_bytes(src)
            with open(dest, "wb") as f:
                f.write(data)
            print(f"  {n+1}/{total} OK {len(data)//1024}KB <- {src}")
        except Exception as e:
            print(f"  {n+1}/{total} FAIL {src} -> {e}")
            raise SystemExit("Stopped: download failed.")
        n += 1

    # Auto-create config.json in same format as punch-ev
    cfg = {
        "id": car_id,
        "name": car_name,
        "tagline": "Exterior 360° — drag to spin",
        "folder": f"cars/{car_id}/images",
        "pattern": "frame-{nn}.jpg",
        "frames": total,
        "width": w,
        "height": h,
        "sensitivity": 10,
        "autoRotate": True,
        "autoRotateSpeed": 0.6,
        "autoRotateDelay": 3000,
    }
    cfg_path = os.path.join(ROOT, "cars", car_id, "config.json")
    with open(cfg_path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
    print(f"\nDone! Saved config -> {cfg_path}")
    print(f'\nNext: add one line to cars/cars.js:')
    print(f'  {{ id: "{car_id}", name: "{car_name}", configUrl: "cars/{car_id}/config.json", thumb: "cars/{car_id}/images/frame-00.jpg" }},')
    return out_dir


def main():
    ap = argparse.ArgumentParser(description="Download CarDekho 360 images from a 360-view page link")
    ap.add_argument("url", nargs="?", help="CarDekho 360-view page link, e.g. https://www.cardekho.com/tata-punch-ev-360-view.htm")
    ap.add_argument("--id", dest="car_id", default=None, help="Folder id, e.g. punch-ev (default: from URL)")
    ap.add_argument("--name", dest="car_name", default=None, help='Display name, e.g. "Tata Punch EV"')
    args = ap.parse_args()

    url = args.url or input("Paste CarDekho 360-view link: ").strip().strip("'\"")
    if not url.startswith("http"):
        raise SystemExit("Please paste a full https:// link.")
    if not args.car_id:
        guess = slug_from_url(url)
        ans = input(f"Folder id [{guess}]: ").strip()
        args.car_id = ans or guess
    if not args.car_name:
        ans = input("Car display name (Enter to auto): ").strip()
        args.car_name = ans or None

    download_car(url, args.car_id, args.car_name)


if __name__ == "__main__":
    main()
