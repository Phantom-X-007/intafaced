# -*- coding: utf-8 -*-
"""
Replacement art for the vendored shell.

Every image written here replaces an upstream asset that carried either the
vendor's wordmark, Chinese text baked into pixels, or a money figure painted
into artwork. Nothing here paints a number or a promise -- the pages overlay
their own live text, and these are backgrounds only.

Palette: black surfaces + INTAFACED orange, per the owner's standing direction.
"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.environ["ART_OUT"]

BLACK = (10, 10, 10)
NEAR = (18, 18, 20)
ORANGE = (255, 107, 0)
ORANGE_L = (255, 133, 52)
ORANGE_D = (204, 85, 0)
WHITE = (255, 255, 255)
GREY = (138, 138, 138)

FONTS = "C:/Windows/Fonts/"


def font(name, size):
    for cand in (name, "arialbd.ttf", "arial.ttf", "segoeui.ttf"):
        p = os.path.join(FONTS, cand)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def bold(size):
    return font("arialbd.ttf", size)


def reg(size):
    return font("arial.ttf", size)


def vgrad(w, h, top, btm):
    """Vertical gradient base."""
    img = Image.new("RGB", (w, h), top)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line(
            [(0, y), (w, y)],
            fill=tuple(int(top[i] + (btm[i] - top[i]) * t) for i in range(3)),
        )
    return img


def mark(d, x, y, size, fill=ORANGE):
    """The INTAFACED mark: rounded square, three bars forming an I counterform.
    Same geometry as src/assets/images/logo.svg so the raster art and the SVG
    lockup read as one identity."""
    r = size * 0.22
    d.rounded_rectangle([x, y, x + size, y + size], radius=r, fill=fill)
    bw = size * 0.14
    cx = x + size / 2
    d.rectangle([cx - size * 0.30, y + size * 0.26, cx - size * 0.30 + bw, y + size * 0.74], fill=BLACK)
    d.rectangle([cx - bw / 2, y + size * 0.18, cx + bw / 2, y + size * 0.82], fill=BLACK)
    d.rectangle([cx + size * 0.30 - bw, y + size * 0.26, cx + size * 0.30, y + size * 0.74], fill=BLACK)


def centre(d, text, y, f, fill):
    w = d.textbbox((0, 0), text, font=f)[2]
    d.text(((d.im.size[0] - w) / 2, y), text, font=f, fill=fill)


def lockup(d, width, y, size=44, gap=14, tracking=6):
    """Mark + wordmark, centred."""
    f = bold(size)
    letters = "INTAFACED"
    tw = sum(d.textbbox((0, 0), c, font=f)[2] for c in letters) + tracking * (len(letters) - 1)
    total = size + gap + tw
    x = (width - total) / 2
    mark(d, x, y, size)
    x += size + gap
    for c in letters:
        d.text((x, y + size * 0.10), c, font=f, fill=WHITE)
        x += d.textbbox((0, 0), c, font=f)[2] + tracking


def dotfield(d, w, h, step, colour, alpha_rows=None):
    for yy in range(0, h, step):
        for xx in range(0, w, step):
            d.point((xx, yy), fill=colour)


# ---------------------------------------------------------------------------
# 1. promotion/promotionbg1.jpg  (500x750)
#    Upstream: BIZZAN.COM wordmark x2, "0.001 BTC" painted into the pixels,
#    Chinese redemption instructions, and the vendor's terms-of-activity line.
#    Rendered at 318px wide with the live code overlaid at y=210 and a caption
#    at y=250 (318-space) -> keep 320..440 of the 500-space clear.
# ---------------------------------------------------------------------------
img = vgrad(500, 750, (14, 12, 10), (6, 6, 7))
d = ImageDraw.Draw(img)
for i, x in enumerate(range(-160, 660, 90)):
    d.polygon([(x, 750), (x + 46, 750), (x + 206, 0), (x + 160, 0)], fill=(20, 17, 14))
d.rectangle([0, 0, 500, 6], fill=ORANGE)
lockup(d, 500, 54, size=40)
centre(d, "PARTNER PROMOTION", 132, bold(19), ORANGE)
d.line([(150, 168), (350, 168)], fill=(52, 40, 28), width=1)
centre(d, "REDEMPTION CODE", 296, reg(15), GREY)
d.rounded_rectangle([90, 322, 410, 442], radius=10, outline=(48, 38, 30), width=1)
d.line([(0, 744), (500, 744)], fill=ORANGE_D, width=6)
img.save(os.path.join(OUT, "promotion", "promotionbg1.jpg"), "JPEG", quality=92)

# ---------------------------------------------------------------------------
# 2. promotion/invitebg1.jpg  (500x821)
#    Upstream: the vendor's logo and "BIZZAN.COM" headline, Chinese marketing
#    copy, and a painted "up to 85% lifetime rebate" claim. Live QR is overlaid
#    at (105,260) 100x100 and captions at y=375/395 in 318-space
#    -> keep roughly 400..660 of the 500-space clear.
# ---------------------------------------------------------------------------
img = vgrad(500, 821, (16, 13, 10), (6, 6, 7))
d = ImageDraw.Draw(img)
for i, x in enumerate(range(-160, 660, 90)):
    d.polygon([(x, 821), (x + 46, 821), (x + 226, 0), (x + 180, 0)], fill=(22, 18, 14))
d.rectangle([0, 0, 500, 6], fill=ORANGE)
lockup(d, 500, 60, size=42)
centre(d, "SOVEREIGN EXCHANGE", 142, bold(18), ORANGE)
d.line([(140, 180), (360, 180)], fill=(52, 40, 28), width=1)
centre(d, "SCAN TO JOIN", 300, reg(16), GREY)
d.rounded_rectangle([150, 396, 350, 596], radius=10, outline=(48, 38, 30), width=1)
d.line([(0, 815), (500, 815)], fill=ORANGE_D, width=6)
img.save(os.path.join(OUT, "promotion", "invitebg1.jpg"), "JPEG", quality=92)

# ---------------------------------------------------------------------------
# 3. bannerbg.png (1920x491) -- upstream is a WHITE sheet with a pale world map,
#    which rendered as a bright slab across a black page. Hero text sits at
#    y=70 (white, 40px) and y=130 (grey, 20px), so the top third stays quiet.
# ---------------------------------------------------------------------------
img = vgrad(1920, 491, (12, 11, 10), (5, 5, 6))
d = ImageDraw.Draw(img)
for x in range(0, 1920, 8):
    for y in range(0, 491, 8):
        t = 1.0 - (y / 491.0)
        if (x // 8 + y // 8) % 3 == 0:
            v = int(26 * t) + 8
            d.point((x, y), fill=(v + 6, v, v - 2 if v > 2 else 0))
d.rectangle([0, 0, 1920, 3], fill=ORANGE_D)
d.rectangle([0, 488, 1920, 491], fill=(20, 18, 16))
img.save(os.path.join(OUT, "bannerbg.png"), "PNG")

# ---------------------------------------------------------------------------
# 4. activity-bg.jpg (1920x282) -- upstream is a magenta/orange gradient with a
#    CNY yuan coin. Same band, our palette, no currency mark.
# ---------------------------------------------------------------------------
img = vgrad(1920, 282, (24, 16, 8), (8, 7, 7))
d = ImageDraw.Draw(img)
for x in range(-300, 2200, 120):
    d.polygon([(x, 282), (x + 60, 282), (x + 200, 0), (x + 140, 0)], fill=(32, 22, 12))
d.rectangle([0, 0, 1920, 4], fill=ORANGE)
img.save(os.path.join(OUT, "activity-bg.jpg"), "JPEG", quality=92)

# 4b. activity_mobile.jpg (600x276) -- mobile variant of the same band.
img = vgrad(600, 276, (24, 16, 8), (8, 7, 7))
d = ImageDraw.Draw(img)
for x in range(-100, 800, 90):
    d.polygon([(x, 276), (x + 44, 276), (x + 150, 0), (x + 106, 0)], fill=(32, 22, 12))
d.rectangle([0, 0, 600, 4], fill=ORANGE)
img.save(os.path.join(OUT, "activity_mobile.jpg"), "JPEG", quality=92)

# ---------------------------------------------------------------------------
# 5. icon-top.png (176x80) -- upstream reads 置顶 ("pinned"). English pill.
# ---------------------------------------------------------------------------
img = Image.new("RGBA", (176, 80), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([2, 12, 174, 68], radius=28, fill=ORANGE)
d.ellipse([10, 30, 32, 52], fill=(255, 255, 255, 235))
f = bold(30)
w = d.textbbox((0, 0), "PINNED", font=f)[2]
d.text(((176 - w) / 2 + 12, 24), "PINNED", font=f, fill=(20, 10, 0))
img.save(os.path.join(OUT, "icon-top.png"), "PNG")

# ---------------------------------------------------------------------------
# 6. img/renzheng.png (97x23) -- upstream reads 认证商家 ("certified merchant").
# ---------------------------------------------------------------------------
img = Image.new("RGBA", (97, 23), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, 96, 22], radius=11, fill=(38, 24, 10), outline=ORANGE_D, width=1)
d.ellipse([4, 6, 15, 17], fill=ORANGE)
f = bold(12)
d.text((20, 5), "VERIFIED", font=f, fill=ORANGE_L)
img.save(os.path.join(os.path.dirname(OUT), "img", "renzheng.png"), "PNG")

print("wrote replacement art")
