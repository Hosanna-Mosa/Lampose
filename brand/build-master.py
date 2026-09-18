"""
Turn the supplied artwork into the square master `apply-logo.py` expects.

The artwork is a landscape badge on a white page. The master is a full-bleed
square: green to every edge, wordmark centred. They are not the same thing, and
the difference is not cosmetic — `apply-logo.py` reads the GROUND from the four
corners and fills every wordmark strip with it. Handed the artwork as-is it
would read white, and every header in the monorepo would become a green pill
floating on a white bar. Square slots would take a 3:1 image and squash it.

So the glyphs are lifted off the badge and re-set on a flat green square at the
same proportions the outgoing master used — 91.7% of the width, optically
centred — which makes the new file a drop-in for the old one.
"""
import sys
from PIL import Image

SRC = 'brand/CLAUDE.jpeg'
OUT = sys.argv[1]

# 1360, not 1600. The wordmark in the artwork is 1256px wide and at 91.7% of
# the square that is 1247 — a hair's downscale. A 1600 square would ask for
# 1472 and upscale the glyphs, which is the one thing apply-logo.py refuses to
# do to an app icon, and it would be silly to do it here instead.
SIDE = 1360
WORDMARK_WIDTH_RATIO = 587 / 640      # what the outgoing master used
WORDMARK_CENTRE_Y = 332 / 640         # its optical centre, below the geometric

src = Image.open(SRC).convert('RGB')

# ── The badge, off the white page ────────────────────────────────────────────
px = src.load()
W, H = src.size
L, T, R, B = W, H, -1, -1
for y in range(H):
    for x in range(W):
        r, g, b = px[x, y]
        if not (r > 235 and g > 235 and b > 235):
            L, R = min(L, x), max(R, x)
            T, B = min(T, y), max(B, y)
badge = src.crop((L, T, R + 1, B + 1))

# The ground, sampled inside the badge and away from the rounded corners.
ground = badge.getpixel((badge.size[0] // 2, 10))

# ── The glyphs, off the badge ────────────────────────────────────────────────
bpx = badge.load()
bw, bh = badge.size
pad = 40                                    # past the rounded corners
gl, gt, gr, gb = bw, bh, -1, -1
for y in range(pad, bh - pad):
    for x in range(pad, bw - pad):
        r, g, b = bpx[x, y]
        if (r > 150 and g > 150 and b > 120) or (r > 190 and g > 140 and b < 130):
            gl, gr = min(gl, x), max(gr, x)
            gt, gb = min(gt, y), max(gb, y)
mark = badge.crop((gl, gt, gr + 1, gb + 1))

# ── The mask ─────────────────────────────────────────────────────────────────
# Composited rather than pasted flat. The artwork is a JPEG, so its "flat"
# green carries compression noise; pasting the rectangle onto a clean canvas
# would leave a faint seam exactly where the crop ended. An alpha built from
# distance-to-ground drops the ground out entirely and keeps the antialiasing
# on the glyph edges, which is what stops the letters looking cut out.
mpx = mark.load()
mask = Image.new('L', mark.size, 0)
kpx = mask.load()
gr_, gg_, gb_ = ground
SOLID = 150     # this far from the ground and it is ink
for y in range(mark.size[1]):
    for x in range(mark.size[0]):
        r, g, b = mpx[x, y]
        d = abs(r - gr_) + abs(g - gg_) + abs(b - gb_)
        kpx[x, y] = 255 if d >= SOLID else int(255 * max(0, d - 25) / (SOLID - 25))

# ── The square ───────────────────────────────────────────────────────────────
canvas = Image.new('RGB', (SIDE, SIDE), ground)
mw = round(SIDE * WORDMARK_WIDTH_RATIO)
mh = max(1, round(mw * mark.size[1] / mark.size[0]))
if mw > mark.size[0]:
    print(f'refusing to upscale the wordmark ({mark.size[0]} -> {mw})')
    sys.exit(1)

resized = mark.resize((mw, mh), Image.LANCZOS)
rmask = mask.resize((mw, mh), Image.LANCZOS)
canvas.paste(resized, ((SIDE - mw) // 2, round(SIDE * WORDMARK_CENTRE_Y) - mh // 2), rmask)

# PNG, and a real one. The outgoing master was JPEG bytes in a .png name, which
# is why apply-logo.py's ground detection needs a tolerance of 60 to see past
# the noise. A lossless master with a genuinely flat ground removes that.
canvas.save(OUT, 'PNG', optimize=True)
print(f'badge    {badge.size[0]}x{badge.size[1]}   ground rgb{ground}')
print(f'wordmark {mark.size[0]}x{mark.size[1]}  ->  {mw}x{mh}')
print(f'master   {SIDE}x{SIDE}  {OUT}')
