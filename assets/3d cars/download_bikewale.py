#!/usr/bin/env python3
"""
BikeWale 360-view downloader (single exterior spin, e.g. Ather Rizta).
Usage:
    python download_bikewale.py "https://www.bikewale.com/ather-bikes/rizta/360-view/" --id ather-rizta --name "Ather Rizta"
    python download_bikewale.py  (interactive)

Saves as SEPARATE bike category (not cars/):
    bikes/<id>/exterior/frame-00.jpg ...
    bikes/<id>/config.json   (classic spin format, same as CarDekho cars)
    bikes/<id>/meta.json
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
    if not url.endswith("/"):
        url += "/"
    return url


def api_base(page_url):
    # XML API lives on the same domain as the page (bikewale.com)
    m = re.search(r"(https://[^/]+)", page_url)
    return m.group(1) if m else "https://www.bikewale.com"


def parse_page(html):
    def grab(pat, name):
        m = re.search(pat, html)
        if not m:
            raise SystemExit(f"Could not parse {name} from page")
        return m.group(1)
    return {
        "url_make": grab(r"urlMakeName:\s*'([^']+)'", "urlMakeName"),
        "model_id": grab(r"modelId:\s*'([^']+)'", "modelId"),
        "v_closed": grab(r"closed:\s*'([^']+)'", "xmlVersion.closed"),
        "env": (re.search(r"threeSixtyImageEnvPath\s*=\s*'([^']*)'", html).group(1)
                if re.search(r"threeSixtyImageEnvPath\s*=\s*'([^']*)'", html) else "/"),
    }


def download_bike(page_url, bike_id=None, bike_name=None):
    base = norm_base(page_url)
    domain = api_base(base)
    print(f"[1/3] Fetching: {base}")
    html = fetch_text(base)
    cfg = parse_page(html)
    print(f"      make={cfg['url_make']} model={cfg['model_id']} v={cfg['v_closed']}")

    if not bike_id:
        m = re.search(r"/([a-z0-9\-]+)/360-view/", base)
        bike_id = f"{m.group(1)}" if m else f"bike-{cfg['model_id']}"
    if not bike_name:
        bike_name = bike_id.replace("-", " ").title()

    # v2 XML lists exact frames (bikes sample odd files: 1,3,5...71)
    xml_url = (f"{domain}/api/xml/360/v2/{cfg['model_id']}/closed/2/"
               f"?isMsite=true&qualityFactor=75&imageCount=36&v={cfg['v_closed']}")
    print(f"[2/3] Reading XML: {xml_url}")
    xml = fetch_text(xml_url)
    files = re.findall(r'<image src="([^"]+)"', xml)
    # keep just the N.jpg filename part
    nums = [re.search(r"(\d+)\.jpg", f).group(1) for f in files if re.search(r"(\d+)\.jpg", f)]
    print(f"      frames={len(nums)}: {nums[:5]} ... {nums[-3:]}")
    if not nums:
        raise SystemExit("No frames found in XML")

    env = cfg["env"] if cfg["env"].startswith("/") else "/" + cfg["env"]
    root = f"{CDN}1280x720{env}bw/360/{cfg['url_make'].lower()}/{cfg['model_id']}/closed-door/"
    out_dir = os.path.join(ROOT, "bikes", bike_id, "exterior")
    os.makedirs(out_dir, exist_ok=True)
    print(f"[3/3] Downloading {len(nums)} frames -> {out_dir}")
    print(f"      root: {root}")
    for idx, num in enumerate(nums):
        src = f"{root}{num}.jpg?wm=3&q=75&v={cfg['v_closed']}"
        dest = os.path.join(out_dir, f"frame-{idx:02d}.jpg")
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            print(f"  {idx+1}/{len(nums)} skip (exists)")
            continue
        try:
            data = fetch_bytes(src)
        except Exception:
            # fallback without query params
            data = fetch_bytes(f"{root}{num}.jpg")
        with open(dest, "wb") as f:
            f.write(data)
        print(f"  {idx+1}/{len(nums)} OK {len(data)//1024}KB (src {num}.jpg)")

    bike_dir = os.path.join(ROOT, "bikes", bike_id)
    config = {
        "id": bike_id,
        "name": bike_name,
        "category": "bike",
        "source": base,
        "folder": f"bikes/{bike_id}/exterior",
        "pattern": "frame-{nn}.jpg",
        "frames": len(nums),
        "width": 1280,
        "height": 720,
        "sensitivity": 10,
        "autoRotate": True,
        "autoRotateSpeed": 0.6,
        "autoRotateDelay": 3000,
    }
    with open(os.path.join(bike_dir, "config.json"), "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)
    with open(os.path.join(bike_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump({"page": base, "parsed": cfg, "xml": xml_url, "files": nums}, f, indent=2)
    print(f"\nDone -> {bike_dir}")
    print('Add to bikes/bikes.js:')
    print(f'  {{ id: "{bike_id}", name: "{bike_name}", configUrl: "bikes/{bike_id}/config.json", thumb: "bikes/{bike_id}/exterior/frame-00.jpg" }},')
    return bike_dir


def main():
    ap = argparse.ArgumentParser(description="Download BikeWale 360 (EV bikes, separate category)")
    ap.add_argument("url", nargs="?")
    ap.add_argument("--id", dest="bike_id", default=None)
    ap.add_argument("--name", dest="bike_name", default=None)
    a = ap.parse_args()
    url = a.url or input("Paste BikeWale 360-view link: ").strip().strip("'\"")
    if not url.startswith("http"):
        raise SystemExit("Paste a full https:// link.")
    if not a.bike_id:
        m = re.search(r"/([a-z0-9\-]+)/360-view/", norm_base(url))
        guess = m.group(1) if m else "new-bike"
        ans = input(f"Folder id [{guess}]: ").strip()
        a.bike_id = ans or guess
    if not a.bike_name:
        ans = input("Bike display name (Enter to auto): ").strip()
        a.bike_name = ans or None
    download_bike(url, a.bike_id, a.bike_name)


if __name__ == "__main__":
    main()
