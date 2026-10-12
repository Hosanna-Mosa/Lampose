#!/usr/bin/env python3
"""
Put the master logo into every slot in the monorepo, at each slot's own size.

    python3 brand/apply-logo.py brand/lampose-logo-master.png --out /tmp/preview
    python3 brand/apply-logo.py brand/lampose-logo-master.png --apply

    --tol N   how far from the ground a pixel must be to count as artwork
              (default 60, for JPEG masters). The 2026 cream master is
              lossless and has a glow that fades out: use --tol 3, or the
              wordmark crop cuts the glow off with a hard edge.

Why this is a script and not 29 hand-made exports: the assets are the same
mark at nine different sizes across four aspect ratios, and the last time they
drifted apart two apps ended up shipping a different logo entirely (a black L
on grey) while a third shipped a "STAY PARTNER" badge. One master, one command,
and they cannot disagree again.

SQUARE slots take the master square, downscaled.
STRIP slots (headers, wordmark bars) take the wordmark CROPPED out of the
square and centred on the brand ground — otherwise a header renders as a small
wordmark marooned between two green bars.

NOTHING IS UPSCALED. A slot bigger than the master is skipped and named, because
a soft app icon sits on the home screen next to every other app a person owns
and is worse than a stale one. Pass --upscale to override that on purpose.
"""
import sys, os
from PIL import Image, ImageDraw

# How wide the artwork sits in an `fg` square: Android's 66dp safe zone of
# a 108dp adaptive icon, matching the splash and icons this replaces.
FG_RATIO = 0.61

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (path, kind, width, height). Kinds:
#   sq   the master square, opaque cream — app icons, favicons
#   st   the wordmark centred on an opaque cream strip
#   tst  the wordmark on TRANSPARENCY — for logos drawn on a light screen,
#        where an opaque strip would show as a cream box on a grey ground
#   fg   the artwork on transparency at 61% of a square — Android's adaptive
#        icon safe zone, and the native splash icon (which is masked the same)
#   rd   the master square cut to a circle — the pre-Android-8 round launcher
#   art  the artwork alone on transparency, cropped tight, at its own size
#
# Rewritten for the 2026 logo (12 Oct 2026). The User App rows had drifted:
# five named files that no longer exist, and the files the app actually
# ships (app-icon, splash-logo, the native android/ splash and launcher) were
# not here at all — which is how it kept a different logo from everything
# else.
TARGETS = [
    ('Food-Partner/assets/images/icon.png',             'sq', 1024, 1024),
    ('Food-Partner/assets/images/adaptive-icon.png',    'sq', 1024, 1024),
    ('Food-Partner/assets/images/splash-icon.png',      'fg', 1024, 1024),
    ('Food-Partner/assets/images/favicon.png',          'sq',   48,   48),
    ('driver/assets/images/icon.png',                   'sq', 1024, 1024),
    ('driver/assets/images/adaptive-icon.png',          'sq', 1024, 1024),
    ('driver/assets/images/splash-icon.png',            'fg', 1024, 1024),
    ('driver/assets/images/favicon.png',                'sq',   48,   48),
    ('Stay Partner/assets/images/icon.png',             'sq', 1024, 1024),
    ('Stay Partner/assets/images/adaptive-icon.png',    'sq', 1024, 1024),
    ('Stay Partner/assets/images/icon.jpeg',            'sq', 1024, 1024),
    ('Stay Partner/assets/images/adaptive-icon.jpeg',   'sq', 1024, 1024),
    ('Stay Partner/assets/images/lampose-logo.png',     'tst', 557,  180),
    ('Stay Partner/assets/images/lampose-logo-badge.png', 'tst', 762, 216),
    ('User App/assets/images/app-icon.png',             'sq', 1024, 1024),
    ('User App/assets/images/adaptive-icon-foreground.png', 'fg', 1024, 1024),
    # User App/assets/images/splash-logo.png and android drawable-*/splashscreen_logo
    # are the LAMP ALONE now, made by brand/build-splash-layers.py — not here.
    ('User App/assets/images/lampose-logo-mark.png',    'tst', 1057, 343),
    ('User App/assets/images/logo-2026.png',            'art',   0,    0),
    ('User App/android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.webp', 'fg', 108, 108),
    ('User App/android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.webp', 'fg', 162, 162),
    ('User App/android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.webp', 'fg', 216, 216),
    ('User App/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.webp', 'fg', 324, 324),
    ('User App/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.webp', 'fg', 432, 432),
    ('User App/android/app/src/main/res/mipmap-mdpi/ic_launcher.webp', 'sq', 48, 48),
    ('User App/android/app/src/main/res/mipmap-mdpi/ic_launcher_round.webp', 'rd', 48, 48),
    ('User App/android/app/src/main/res/mipmap-hdpi/ic_launcher.webp', 'sq', 72, 72),
    ('User App/android/app/src/main/res/mipmap-hdpi/ic_launcher_round.webp', 'rd', 72, 72),
    ('User App/android/app/src/main/res/mipmap-xhdpi/ic_launcher.webp', 'sq', 96, 96),
    ('User App/android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.webp', 'rd', 96, 96),
    ('User App/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.webp', 'sq', 144, 144),
    ('User App/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.webp', 'rd', 144, 144),
    ('User App/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.webp', 'sq', 192, 192),
    ('User App/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.webp', 'rd', 192, 192),
    ('Onboard/public/lampose-logo.png',                 'sq',  640,  640),
    ('Onboard/public/lampose-logo.jpg',                 'sq',  640,  640),
    ('Frontend/src/assets/logo.png',                    'sq',  640,  640),
    # Favicons for the three Vite sites. Square, because a browser tab is.
    ('Admin/public/favicon.png',                        'sq',  256,  256),
    ('Leads/public/favicon.png',                        'sq',  256,  256),
    ('Frontend/public/favicon.png',                     'sq',  256,  256),
    # Opaque strips: shared links, cards and placeholder photos, where the
    # logo needs its own ground.
    ('Frontend/public/images/logo.png',                 'st', 1024,  444),
    ('Onboard/public/lampose-logo-card.png',            'st',  729,  316),
    ('Onboard/public/favicon.png',                      'st',  283,   96),
    ('Onboard/public/apple-touch-icon.png',             'st',  283,   96),
    ('Onboard/public/lampose-logo-splash.png',          'st',  283,   96),
]

# Not a logo slot. An Android notification icon is a WHITE SILHOUETTE on
# transparency — the system recolours it — so a full-colour square renders
# there as a featureless grey blob. Needs a one-glyph mark drawn for it, which
# is a design decision rather than a resize.
SKIPPED_BY_DESIGN = [
    'Food-Partner/assets/images/notification-icon.png',
    'driver/assets/images/notification-icon.png',
]


def to_alpha(img, bg):
    """
    The ground taken OUT of the picture rather than masked off it — GIMP's
    colour-to-alpha. Every pixel becomes the colour that, laid over the
    ground at its new alpha, gives back the original; so the soft edge of
    the lamp's glow survives as soft transparency instead of a cream halo.
    """
    import numpy as np
    a = np.asarray(img.convert('RGB'), dtype=np.float64)
    b = np.array(bg[:3], dtype=np.float64)
    hi = np.where(a > b, (a - b) / np.maximum(255 - b, 1), 0)
    lo = np.where(a < b, (b - a) / np.maximum(b, 1), 0)
    alpha = np.clip(np.max(np.maximum(hi, lo), axis=2), 0, 1)
    # The source's 'flat' cream is a pixel or two off in places; below 2%
    # that is noise, not artwork, and it speckles on any darker ground.
    alpha = np.where(alpha < 0.02, 0, alpha)
    safe = np.where(alpha > 0, alpha, 1)[..., None]
    rgb = np.clip((a - b) / safe + b, 0, 255)
    out = np.dstack([rgb, alpha[..., None] * 255]).round().astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def background(img):
    """The brand ground, read from the corners rather than assumed."""
    w, h = img.size
    corners = [img.getpixel(p) for p in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
    return max(set(corners), key=corners.count)


def wordmark_box(img, bg, tol=60):
    """
    Tightest box holding everything that is not the background.

    `tol` is generous because a master may be a JPEG: a "flat" green ground
    saved that way actually carries thousands of compression-noise colours,
    and a tight threshold picks that noise up as artwork and returns the whole
    canvas. The current master is a lossless PNG built by `build-master.py`
    and does not need the slack, but an artwork dropped in by hand might.
    """
    rgb = img.convert('RGB')
    w, h = rgb.size
    px = rgb.load()
    br, bgc, bb = bg[:3]
    left, top, right, bottom = w, h, 0, 0
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            if abs(r - br) + abs(g - bgc) + abs(b - bb) > tol:
                left, right = min(left, x), max(right, x)
                top, bottom = min(top, y), max(bottom, y)
    if right <= left or bottom <= top:
        return (0, 0, w, h)
    return (max(0, left - 2), max(0, top - 2), min(w, right + 3), min(h, bottom + 3))


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 2
    src_path = args[0]
    apply = '--apply' in args
    upscale = '--upscale' in args
    out_dir = args[args.index('--out') + 1] if '--out' in args else None
    tol = int(args[args.index('--tol') + 1]) if '--tol' in args else 60
    if not apply and not out_dir:
        print('Give --out DIR for a preview, or --apply to write into the repo.')
        return 2

    src = Image.open(src_path).convert('RGB')
    bg = background(src)
    box = wordmark_box(src, bg, tol)
    mark = src.crop(box)
    clear_mark = to_alpha(mark, bg)
    print(f'source   {src_path}  {src.size[0]}x{src.size[1]}  ({Image.open(src_path).format})')
    print(f'ground   rgb{bg}')
    print(f'wordmark {box}  ->  {mark.size[0]}x{mark.size[1]}\n')

    written, skipped = 0, []
    for rel, kind, w, h in TARGETS:
        if kind == 'art':
            w, h = clear_mark.size
        if kind in ('sq', 'rd'):
            need, have = w, src.size[0]
        elif kind == 'fg':
            need, have = int(w * FG_RATIO), mark.size[0]
        elif kind == 'art':
            need, have = 0, 1
        else:
            need, have = int(w * 0.88), mark.size[0]
        if need > have and not upscale:
            skipped.append(f'{rel}  (needs {need}px, master gives {have}px)')
            continue

        if kind == 'sq':
            canvas = src.resize((w, h), Image.LANCZOS)
        elif kind == 'rd':
            canvas = src.resize((w, h), Image.LANCZOS).convert('RGBA')
            circle = Image.new('L', (w * 4, h * 4), 0)
            ImageDraw.Draw(circle).ellipse((0, 0, w * 4 - 1, h * 4 - 1), fill=255)
            canvas.putalpha(circle.resize((w, h), Image.LANCZOS))
        elif kind == 'art':
            canvas = clear_mark
        elif kind == 'fg':
            canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
            mw = round(w * FG_RATIO)
            mh = max(1, round(clear_mark.size[1] * mw / clear_mark.size[0]))
            canvas.alpha_composite(clear_mark.resize((mw, mh), Image.LANCZOS), ((w - mw) // 2, (h - mh) // 2))
        else:
            # 88% of the width, 72% of the height: big enough to read in a
            # header, not so big it is flush against the edge.
            scale = min(w * 0.88 / mark.size[0], h * 0.72 / mark.size[1])
            mw, mh = max(1, round(mark.size[0] * scale)), max(1, round(mark.size[1] * scale))
            pos = ((w - mw) // 2, (h - mh) // 2)
            if kind == 'tst':
                canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
                canvas.alpha_composite(clear_mark.resize((mw, mh), Image.LANCZOS), pos)
            else:
                canvas = Image.new('RGB', (w, h), bg)
                canvas.paste(mark.resize((mw, mh), Image.LANCZOS), pos)

        dest = os.path.join(REPO if apply else out_dir, rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        if dest.lower().endswith(('.jpg', '.jpeg')):
            canvas.convert('RGB').save(dest, 'JPEG', quality=95)
        elif dest.lower().endswith('.webp'):
            canvas.save(dest, 'WEBP', lossless=True)
        else:
            canvas.save(dest, 'PNG', optimize=True)
        print(f'  {kind:<3} {w:>5}x{h:<5}  {rel}')
        written += 1

    print(f'\n  {written} written, {len(skipped)} skipped')
    for line in skipped:
        print(f'  !!  would upscale  {line}')
    for rel in SKIPPED_BY_DESIGN:
        print(f'  --  by design     {rel}  (Android white silhouette)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
