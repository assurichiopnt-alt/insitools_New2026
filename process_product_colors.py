from pathlib import Path

import cv2
import numpy as np


IMAGE_DIR = Path(__file__).parent / "images"
TARGET_HSV = np.array([104, 239, 214], dtype=np.uint8)
LOGO_REGIONS = {
    "joysung-lmd1000.jpg": [((181, 279, 226, 294), "plate")],
    "joysung-lmd3000.jpg": [
        ((239, 108, 288, 138), "blue"),
        ((46, 190, 105, 223), "ink"),
        ((451, 346, 490, 374), "ink"),
    ],
}

for source_path in sorted(IMAGE_DIR.glob("joysung-lmd[0-9]*.jpg")):
    if source_path.stem.endswith("-blue"):
        continue

    image = cv2.imread(str(source_path))
    if image is None:
        raise FileNotFoundError(source_path)

    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    hue, saturation, value = cv2.split(hsv)
    colored = (
        ((hue <= 12) | (hue >= 170))
        & (saturation > 45)
        & (value > 45)
    ).astype(np.uint8)

    count, labels, stats, _ = cv2.connectedComponentsWithStats(
        colored, connectivity=8
    )
    keep = stats[:, cv2.CC_STAT_AREA] >= 6
    keep[0] = False
    recolor_mask = keep[labels]

    hue[recolor_mask] = TARGET_HSV[0]
    saturation[recolor_mask] = TARGET_HSV[1]
    value[recolor_mask] = np.minimum(value[recolor_mask], TARGET_HSV[2])
    output = cv2.cvtColor(cv2.merge((hue, saturation, value)), cv2.COLOR_HSV2BGR)

    logo_mask = np.zeros(output.shape[:2], dtype=np.uint8)
    output_hsv = cv2.cvtColor(output, cv2.COLOR_BGR2HSV)
    output_gray = cv2.cvtColor(output, cv2.COLOR_BGR2GRAY)
    for (left, top, right, bottom), mode in LOGO_REGIONS.get(source_path.name, []):
        region_hue = output_hsv[top:bottom, left:right, 0]
        region_saturation = output_hsv[top:bottom, left:right, 1]
        region_gray = output_gray[top:bottom, left:right]
        blue_ink = (region_hue >= 95) & (region_hue <= 112) & (region_saturation > 90)
        if mode == "plate":
            plate = output[top:bottom, left:right].astype(np.float32)
            fill = ((plate[0:1] + plate[-1:]) / 2).astype(np.uint8)
            output[top + 1 : bottom - 1, left + 1 : right - 1] = np.broadcast_to(
                fill[:, 1:-1], (bottom - top - 2, right - left - 2, 3)
            )
        else:
            dark_ink = (region_gray < 155) if mode == "ink" else False
            logo_mask[top:bottom, left:right] = (blue_ink | dark_ink).astype(np.uint8) * 255

    if np.any(logo_mask):
        logo_mask = cv2.dilate(logo_mask, np.ones((3, 3), dtype=np.uint8))
        output = cv2.inpaint(output, logo_mask, 3, cv2.INPAINT_TELEA)

    output_path = source_path.with_name(f"{source_path.stem}-blue.jpg")
    if not cv2.imwrite(str(output_path), output, [cv2.IMWRITE_JPEG_QUALITY, 96]):
        raise OSError(f"Could not write {output_path}")
    print(f"{output_path.name}: recolored {np.count_nonzero(recolor_mask)} pixels")