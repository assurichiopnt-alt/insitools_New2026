from PIL import Image
from pathlib import Path

p = Path('logo.png')
with Image.open(p).convert('RGBA') as im:
    pix = im.load()
    w, h = im.size
    changed = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = pix[x, y]
            if a > 10 and r >= 230 and g >= 230 and b >= 230:
                pix[x, y] = (255, 255, 255, 0)
                changed += 1
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    out_path = p
    im.save(out_path)
    print('saved', out_path, 'size', im.size, 'changed_white_pixels', changed, 'bbox', bbox)
