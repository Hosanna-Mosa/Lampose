#!/usr/bin/env python3
"""
Put the master logo into every slot in the monorepo, at each slot's own size.

    python3 brand/apply-logo.py brand/lampose-logo-master.png --out /tmp/preview
    python3 brand/apply-logo.py brand/lampose-logo-master.png --apply

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
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (path, kind, width, height) — kind: 'sq' square, 'st' wordmark strip
TARGETS = [
    ('Food-Partner/assets/images/icon.png',             'sq', 1024, 1024),
    ('Food-Partner/assets/images/adaptive-icon.png',    'sq', 1024, 1024),
    ('Food-Partner/assets/images/splash-icon.png',      'sq', 1024, 1024),
    ('Food-Partner/assets/images/favicon.png',          'sq',   48,   48),
    ('driver/assets/images/icon.png',                   'sq', 1024, 1024),
    ('driver/assets/images/adaptive-icon.png',          'sq', 1024, 1024),
    ('driver/assets/images/splash-icon.png',            'sq', 1024, 1024),
    ('driver/assets/images/favicon.png',                'sq',   48,   48),
    # 1024, like the other two Expo apps and like Expo's own guidance — these
    # four were 1600 only because an older master happened to be that big.
    # Nothing asks for it: `Stay Partner/app.config.js` just points at the
    # files. Left at 1600 they were the four slots no master could fill, so
    # they sat on whatever logo shipped last while the rest of the monorepo
    # moved on — which is the drift this script exists to stop.
    ('Stay Partner/assets/images/icon.png',             'sq', 1024, 1024),
    ('Stay Partner/assets/images/adaptive-icon.png',    'sq', 1024, 1024),
    ('Stay Partner/assets/images/icon.jpeg',            'sq', 1024, 1024),
    ('Stay Partner/assets/images/adaptive-icon.jpeg',   'sq', 1024, 1024),
    ('User App/assets/images/icon.png',                 'sq',  640,  640),
    ('User App/assets/images/adaptive-icon.png',        'sq',  640,  640),
    ('User App/assets/images/icon.jpeg',                'sq',  640,  640),
    ('User App/assets/images/adaptive-icon.jpeg',       'sq',  640,  640),
    ('Onboard/public/lampose-logo.png',                 'sq',  640,  640),
    ('Onboard/public/lampose-logo.jpg',                 'sq',  640,  640),
    ('Frontend/src/assets/logo.png',                    'sq',  640,  640),
    # Favicons for the three Vite sites that had none, a broken one, or a
    # leftover default. Square, because a browser tab is square.
    ('Admin/public/favicon.png',                        'sq',  256,  256),
    ('Leads/public/favicon.png',                        'sq',  256,  256),
    ('Frontend/public/favicon.png',                     'sq',  256,  256),
    # Wordmark strips.
    ('Frontend/public/images/logo.png',                 'st', 1024,  444),
    ('User App/assets/images/lampose-logo-badge.png',   'st',  762,  216),
    ('User App/assets/images/lampose-logo-badge@2x.png','st',  762,  216),
    ('User App/assets/images/lampose-logo.png',         'st',  557,  180),
    ('Stay Partner/assets/images/lampose-logo.png',     'st',  557,  180),
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
    if not apply and not out_dir:
        print('Give --out DIR for a preview, or --apply to write into the repo.')
        return 2

    src = Image.open(src_path).convert('RGB')
    bg = background(src)
    box = wordmark_box(src, bg)
    mark = src.crop(box)
    print(f'source   {src_path}  {src.size[0]}x{src.size[1]}  ({Image.open(src_path).format})')
    print(f'ground   rgb{bg}')
    print(f'wordmark {box}  ->  {mark.size[0]}x{mark.size[1]}\n')

    written, skipped = 0, []
    for rel, kind, w, h in TARGETS:
        need = w if kind == 'sq' else int(w * 0.88)
        have = src.size[0] if kind == 'sq' else mark.size[0]
        if need > have and not upscale:
            skipped.append(f'{rel}  (needs {need}px, master gives {have}px)')
            continue

        if kind == 'sq':
            canvas = src.resize((w, h), Image.LANCZOS)
        else:
            canvas = Image.new('RGB', (w, h), bg)
            # 88% of the width, 72% of the height: big enough to read in a
            # header, not so big it is flush against the edge.
            scale = min(w * 0.88 / mark.size[0], h * 0.72 / mark.size[1])
            mw, mh = max(1, round(mark.size[0] * scale)), max(1, round(mark.size[1] * scale))
            canvas.paste(mark.resize((mw, mh), Image.LANCZOS), ((w - mw) // 2, (h - mh) // 2))

        dest = os.path.join(REPO if apply else out_dir, rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        if dest.lower().endswith(('.jpg', '.jpeg')):
            canvas.save(dest, 'JPEG', quality=95)
        else:
            canvas.save(dest, 'PNG', optimize=True)
        print(f'  {kind}  {w:>5}x{h:<5}  {rel}')
        written += 1

    print(f'\n  {written} written, {len(skipped)} skipped')
    for line in skipped:
        print(f'  !!  would upscale  {line}')
    for rel in SKIPPED_BY_DESIGN:
        print(f'  --  by design     {rel}  (Android white silhouette)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
