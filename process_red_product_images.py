import hashlib
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen

import cv2
import numpy as np


PROJECT_DIR = Path(__file__).parent
IMAGE_DIR = PROJECT_DIR / "images"
RED_BLUE_HUE = 104
RED_BLUE_SATURATION = 239
RED_BLUE_VALUE = 214


class ProductImageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.image_urls = set()

    def handle_starttag(self, tag, attrs):
        if tag == "img":
            source = dict(attrs).get("src", "")
            if source.startswith(("http://", "https://")):
                self.image_urls.add(source)


def read_image(source):
    request = Request(source, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=30) as response:
        encoded = np.frombuffer(response.read(), dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Could not decode image: {source}")
    return image


def recolor_red(image):
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    hue, saturation, value = cv2.split(hsv)
    red = (
        ((hue <= 12) | (hue >= 170))
        & (saturation > 45)
        & (value > 45)
    ).astype(np.uint8)

    _, labels, stats, _ = cv2.connectedComponentsWithStats(red, connectivity=8)
    keep = stats[:, cv2.CC_STAT_AREA] >= 3
    keep[0] = False
    red_parts = keep[labels]

    hue[red_parts] = RED_BLUE_HUE
    saturation[red_parts] = RED_BLUE_SATURATION
    value[red_parts] = np.minimum(value[red_parts], RED_BLUE_VALUE)
    return cv2.cvtColor(cv2.merge((hue, saturation, value)), cv2.COLOR_HSV2BGR)


def collect_product_image_urls():
    urls = set()
    for filename in ("products.html", "service-rent.html"):
        parser = ProductImageParser()
        parser.feed((PROJECT_DIR / filename).read_text(encoding="utf-8"))
        urls.update(parser.image_urls)

    detail_text = (PROJECT_DIR / "product-detail.html").read_text(encoding="utf-8")
    linked_map = re.search(
        r"const linkedProductImages\s*=\s*\{(.*?)\n\s*\};",
        detail_text,
        re.DOTALL,
    )
    if linked_map:
        urls.update(
            re.findall(r"'[^']+'\s*:\s*'(https?://[^']+)'", linked_map.group(1))
        )

    homepage_text = (PROJECT_DIR / "insitools_edit.html").read_text(encoding="utf-8")
    urls.update(
        re.findall(r"image:\s*'(https?://[^']+)'", homepage_text)
    )
    urls.update(
        re.findall(
            r"https://images\.unsplash\.com/photo-[^\"']+\?q=80&w=800",
            homepage_text,
        )
    )
    return urls


def process_all_products():
    replacements = {}
    for source in sorted(collect_product_image_urls()):
        digest = hashlib.sha256(source.encode("utf-8")).hexdigest()[:12]
        output = IMAGE_DIR / f"product-red-blue-{digest}.jpg"
        try:
            image = recolor_red(read_image(source))
            if not cv2.imwrite(str(output), image, [cv2.IMWRITE_JPEG_QUALITY, 95]):
                raise OSError(f"Could not write image: {output}")
        except Exception as error:
            print(f"Skipped {source}: {error}")
            continue

        local_path = output.relative_to(PROJECT_DIR).as_posix()
        replacements[source] = local_path
        print(f"{source} -> {local_path}")

    for filename in (
        "products.html",
        "product-detail.html",
        "service-rent.html",
        "insitools_edit.html",
    ):
        path = PROJECT_DIR / filename
        content = path.read_bytes()
        for source, target in replacements.items():
            content = content.replace(source.encode("utf-8"), target.encode("utf-8"))
        path.write_bytes(content)

    print(f"Updated {len(replacements)} product image references")


if __name__ == "__main__":
    process_all_products()