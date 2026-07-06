#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, IcnsImagePlugin  # noqa: F401

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "yow-logo.png"
OUT = ROOT / "src-tauri" / "icons"
BG = (13, 40, 46, 255)  # public/marketing.css --bg

PNG_SIZES = {
    "32x32.png": 32,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "icon.png": 512,
    "Square30x30Logo.png": 30,
    "Square44x44Logo.png": 44,
    "Square71x71Logo.png": 71,
    "Square89x89Logo.png": 89,
    "Square107x107Logo.png": 107,
    "Square142x142Logo.png": 142,
    "Square150x150Logo.png": 150,
    "Square284x284Logo.png": 284,
    "Square310x310Logo.png": 310,
    "StoreLogo.png": 50,
}

def extract_mark():
    src = Image.open(SOURCE).convert("RGBA")
    px = src.load()
    alpha = Image.new("L", src.size, 0)
    apx = alpha.load()

    for y in range(src.height):
        for x in range(src.width):
            r, g, b, a = px[x, y]
            lightness = max(r, g, b)
            saturation = max(r, g, b) - min(r, g, b)
            if a and lightness > 140 and saturation < 90:
                apx[x, y] = min(255, max(0, int((lightness - 120) * 2.4)))

    alpha = alpha.filter(ImageFilter.GaussianBlur(0.7))
    bbox = alpha.getbbox()
    if not bbox:
        raise RuntimeError("Could not isolate logo mark from source image.")

    cream = Image.new("RGBA", src.size, (238, 216, 184, 255))
    mark = Image.new("RGBA", src.size, (0, 0, 0, 0))
    mark.alpha_composite(cream)
    mark.putalpha(alpha)
    return mark.crop(bbox)


def make_icon(size, mark):
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    radius = max(4, round(size * 0.22))
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)

    bg = Image.new("RGBA", (size, size), BG)
    canvas.alpha_composite(bg)
    canvas.putalpha(mask)

    safe = round(size * 0.14)
    max_w = size - safe * 2
    max_h = size - safe * 2
    scale = min(max_w / mark.width, max_h / mark.height)
    logo_size = (max(1, round(mark.width * scale)), max(1, round(mark.height * scale)))
    logo = mark.resize(logo_size, Image.Resampling.LANCZOS)
    x = (size - logo.width) // 2
    y = (size - logo.height) // 2
    canvas.alpha_composite(logo, (x, y))
    return canvas


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    mark = extract_mark()

    for filename, size in PNG_SIZES.items():
        make_icon(size, mark).save(OUT / filename)

    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    ico_images = [make_icon(size, mark) for size in ico_sizes]
    ico_images[-1].save(OUT / "icon.ico", sizes=[(size, size) for size in ico_sizes])

    icns_sizes = [16, 32, 64, 128, 256, 512, 1024]
    icns_images = [make_icon(size, mark) for size in icns_sizes]
    icns_images[-1].save(OUT / "icon.icns", sizes=[(size, size) for size in icns_sizes])


if __name__ == "__main__":
    main()
