"""Generates Cheffy's app icon, splash wordmark and Android adaptive layers.

From the identity guide: the monogram is a lowercase display-serif "c" with a single
full stop — oxblood on ivory with an espresso stop. The splash is the
"cheffy." wordmark. Run from the repo root: python3 scripts/generate-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "images"
FONT = ROOT / "node_modules/@expo-google-fonts/dm-serif-display/400Regular/DMSerifDisplay_400Regular.ttf"

OXBLOOD = (0x6B, 0x27, 0x37)
IVORY = (0xF7, 0xF1, 0xE8)
ESPRESSO = (0x3B, 0x2A, 0x22)


def draw_monogram(img: Image.Image, letter, stop, scale: float) -> None:
    """Centered lowercase "c." — the visual centre includes the stop."""
    size = img.width
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(str(FONT), int(size * 0.80 * scale))
    c_box = draw.textbbox((0, 0), "c", font=font)
    c_w, c_h = c_box[2] - c_box[0], c_box[3] - c_box[1]
    r = size * 0.052 * scale
    gap = size * 0.03 * scale
    total_w = c_w + gap + 2 * r
    x0 = (size - total_w) / 2
    y0 = (size - c_h) / 2
    draw.text((x0 - c_box[0], y0 - c_box[1]), "c", font=font, fill=letter)
    cx = x0 + c_w + gap + r
    cy = y0 + c_h - r
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=stop)


def draw_wordmark(img: Image.Image, color, stop) -> None:
    size = img.width
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(str(FONT), int(size * 0.30))
    box = draw.textbbox((0, 0), "cheffy.", font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    x = (size - w) / 2 - box[0]
    y = (size - h) / 2 - box[1]
    draw.text((x, y), "cheffy", font=font, fill=color)
    dot_x = x + draw.textlength("cheffy", font=font)
    draw.text((dot_x, y), ".", font=font, fill=stop)


def main() -> None:
    icon = Image.new("RGB", (1024, 1024), IVORY)
    draw_monogram(icon, OXBLOOD, ESPRESSO, 1.0)
    icon.save(OUT / "icon.png")

    splash = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    draw_wordmark(splash, OXBLOOD, ESPRESSO)
    splash.save(OUT / "splash-icon.png")

    fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    draw_monogram(fg, OXBLOOD, ESPRESSO, 0.62)  # adaptive icons crop to the inner ~66%
    fg.save(OUT / "android-icon-foreground.png")
    Image.new("RGB", (1024, 1024), IVORY).save(OUT / "android-icon-background.png")
    mono = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    draw_monogram(mono, (255, 255, 255), (255, 255, 255), 0.62)
    mono.save(OUT / "android-icon-monochrome.png")

    icon.resize((48, 48), Image.LANCZOS).save(OUT / "favicon.png")


if __name__ == "__main__":
    main()
