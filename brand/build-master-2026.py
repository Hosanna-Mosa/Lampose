"""
The 2026 logo (green-gradient wordmark, swoosh and lamp glow on cream) turned
into the square master `apply-logo.py` expects.

    python brand/build-master-2026.py brand/lampose-logo-master.png

Simpler than `build-master.py`, which had to lift white glyphs off a green
badge: this artwork already sits on a flat ground, so the artwork's box is cut
out whole — glow and all — and centred on a square of that same cream. No
alpha mask, because there is no seam to hide: the ground is one colour.

The box is found with a tolerance of 3, not apply-logo's old 60. The glow
fades into the cream over ~40px, and a loose threshold cuts it off with a hard
edge that reads as a rendering bug at app-icon size.
"""
import sys
from PIL import Image

SRC = 'brand/lampose-logo-2026-source.png'
OUT = sys.argv[1]

WORDMARK_WIDTH_RATIO = 587 / 640      # same proportions as every master before
WORDMARK_CENTRE_Y = 332 / 640         # optical centre, a little below geometric
TOL = 3
MARGIN = 12                           # past the last visible pixel of the glow

src = Image.open(SRC).convert('RGB')
w, h = src.size
px = src.load()
ground = px[0, 0]

L, T, R, B = w, h, -1, -1
for y in range(h):
    for x in range(w):
        r, g, b = px[x, y]
        if abs(r - ground[0]) + abs(g - ground[1]) + abs(b - ground[2]) > TOL:
            L, R = min(L, x), max(R, x)
            T, B = min(T, y), max(B, y)
art = src.crop((max(0, L - MARGIN), max(0, T - MARGIN), min(w, R + 1 + MARGIN), min(h, B + 1 + MARGIN)))

# The square is sized FROM the artwork so the wordmark is never upscaled.
side = int(art.size[0] / WORDMARK_WIDTH_RATIO)
canvas = Image.new('RGB', (side, side), ground)
canvas.paste(art, ((side - art.size[0]) // 2, round(side * WORDMARK_CENTRE_Y) - art.size[1] // 2))
canvas.save(OUT, 'PNG', optimize=True)

print(f'ground   rgb{ground}  #{ground[0]:02X}{ground[1]:02X}{ground[2]:02X}')
print(f'artwork  {art.size[0]}x{art.size[1]}')
print(f'master   {side}x{side}  {OUT}')
