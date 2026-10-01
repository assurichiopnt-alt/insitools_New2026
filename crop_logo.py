from PIL import Image
from pathlib import Path

path = Path('logo.png')
with Image.open(path).convert('RGBA') as im:
    pix = im.load()
    w, h = im.size
    red_pixels = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = pix[x, y]
            if a > 128 and r > 180 and g < 120 and b < 120:
                red_pixels.append((x, y))
    print('red pixels count', len(red_pixels))
    if red_pixels:
        xs = [x for x, y in red_pixels]
        ys = [y for x, y in red_pixels]
        bbox = (max(min(xs)-30, 0), max(min(ys)-30, 0), min(max(xs)+30, w), min(max(ys)+30, h))
        print('bbox', bbox)
        crop = im.crop(bbox)
        crop.save('logo.png')
        print('saved', crop.size)
    else:
        print('no red pixels found')
