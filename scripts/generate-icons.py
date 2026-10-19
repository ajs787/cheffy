"""Generates Cheffy's app icon, splash mark and Android adaptive icon layers.

The mark is a Fraunces "C" with a small sage dot (a plate seen from above,
a bit of garnish). Run from the repo root: python3 scripts/generate-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "images"
FONT = ROOT / "node_modules/@expo-google-fonts/fraunces/600SemiBold/Fraunces_600SemiBold.ttf"

TERRACOTTA = (196, 81, 60)  # accentStrong-ish, reads well as a large field
PAPER = (250, 249, 246)
SAGE = (130, 148, 123)


def draw_mark(img: Image.Image, color, dot_color, scale: float) -> None:
    size = img.width
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(str(FONT), int(size * 0.62 * scale))
    text = "C"
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    w, h = right - left, bottom - top
    x = (size - w) / 2 - left - size * 0.02 * scale
    y = (size - h) / 2 - top
    draw.text((x, y), text, font=font, fill=color)
    r = size * 0.055 * scale
    cx = size / 2 + w * 0.36
    cy = size / 2 - h * 0.02
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=dot_color)


def main() -> None:
    icon = Image.new("RGB", (1024, 1024), TERRACOTTA)
    draw_mark(icon, PAPER, SAGE, 1.0)
    icon.save(OUT / "icon.png")

    splash = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    draw_mark(splash, TERRACOTTA, SAGE, 1.0)
    splash.save(OUT / "splash-icon.png")

    fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    draw_mark(fg, PAPER, SAGE, 0.62)  # adaptive icons crop to the inner ~66%
    fg.save(OUT / "android-icon-foreground.png")
    Image.new("RGB", (1024, 1024), TERRACOTTA).save(OUT / "android-icon-background.png")
    mono = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    draw_mark(mono, (255, 255, 255), (255, 255, 255), 0.62)
    mono.save(OUT / "android-icon-monochrome.png")

    icon.resize((48, 48), Image.LANCZOS).save(OUT / "favicon.png")


if __name__ == "__main__":
    main()
