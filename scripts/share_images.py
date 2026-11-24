"""Build non-cropped 1200x630 social images and static per-story metadata."""
import concurrent.futures
import html
import io
import json
import re
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, quote, unquote
from urllib.request import Request, urlopen
from PIL import Image, ImageOps

ROOT = Path("site")
OUT = ROOT / "assets" / "share-news"
OUT.mkdir(parents=True, exist_ok=True)
NEWS = json.loads(Path("data/news.json").read_text(encoding="utf-8"))
Image.MAX_IMAGE_PIXELS = 30_000_000

def load(raw):
    if not raw:
        raise ValueError("missing image")
    if re.fullmatch(r"assets/(?:uploads|branding)/[a-zA-Z0-9_.-]+\.(?:jpg|jpeg|png|webp)", raw, re.I):
        return Image.open(ROOT / raw)
    u = urlsplit(raw)
    if u.scheme != "https" or u.hostname != "dharashivlive.com" or not u.path.startswith("/wp-content/uploads/"):
        raise ValueError("unapproved image source")
    url = urlunsplit((u.scheme,u.netloc,quote(unquote(u.path),safe="/"),u.query,""))
    req = Request(url, headers={"User-Agent":"Mozilla/5.0 (compatible; DharashivTodayPreview/1.0)", "Accept":"image/*"})
    with urlopen(req, timeout=15) as response:
        if urlsplit(response.geturl()).hostname != "dharashivlive.com":
            raise ValueError("unexpected redirect")
        data = response.read(12_000_001)
    if len(data)>12_000_000:
        raise ValueError("image too large")
    return Image.open(io.BytesIO(data))

def update_meta(page, key, value, attr="property"):
    pattern = r'<meta ' + attr + r'="' + re.escape(key) + r'" content="[^"]*">'
    tag = '<meta ' + attr + '="' + key + '" content="' + html.escape(str(value), quote=True) + '">'
    if re.search(pattern,page):
        return re.sub(pattern,lambda _:tag,page)
    return page.replace("</head>",tag+"</head>",1)

def generate(p):
    slug = str(p.get("slug",""))
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{2,115}",slug):
        return False
    pagefile = ROOT / "batmi" / slug / "index.html"
    if not pagefile.exists():
        return False
    page = pagefile.read_text(encoding="utf-8")
    match = re.search(r'<meta property="og:url" content="([^"]+)">',page)
    if not match:
        return False
    base = html.unescape(match.group(1)).rsplit("batmi/",1)[0]
    source = None
    for raw in (p.get("image"),p.get("thumbImage")):
        try:
            with load(raw) as im:
                source = ImageOps.exif_transpose(im).convert("RGBA")
            break
        except Exception as e:
            print(f"{slug}: {type(e).__name__}: {e}")
    if source is None:
        print(f"{slug}: retain original metadata; image download failed")
        return False
    # Fit the full original photo into the standard preview without cropping.
    fg = ImageOps.contain(source,(1200,630),Image.Resampling.LANCZOS)
    canvas = Image.new("RGB",(1200,630),(245,246,248))
    canvas.paste(fg,((1200-fg.width)//2,(630-fg.height)//2),fg)
    dest = OUT / (slug+".jpg")
    canvas.save(dest,"JPEG",quality=87,optimize=True,progressive=False)
    url = base+"assets/share-news/"+slug+".jpg"
    for key,value in {"og:image":url,"og:image:secure_url":url,"og:image:type":"image/jpeg","og:image:width":"1200","og:image:height":"630","og:image:alt":p.get("title","")}.items():
        page = update_meta(page,key,value)
    page = update_meta(page,"twitter:image",url,"name")
    pagefile.write_text(page,encoding="utf-8")
    return True

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(generate, [p for p in NEWS if p.get("published") is not False and p.get("status")!="draft"]))
print(f"Generated {sum(results)} of {len(results)} news share images")
