"""
The User App's animated splash ("light trail") needs the 2026 logo in three
layers, and the native launch screen needs the lamp on its own.

    python brand/build-splash-layers.py

Writes, from `User App/assets/images/logo-2026.png` (made by apply-logo.py):

  User App/assets/images/logo-letters.png   the wordmark
  User App/assets/images/logo-swoosh.png    the swoosh, up to the lamp
  User App/assets/images/logo-glow.png      the lamp and its glow, cropped
  User App/assets/images/splash-logo.png    the lamp alone, centred: the
  android/.../drawable-*/splashscreen_logo   picture the OS shows on cold start

Each pixel goes to exactly one layer — the one whose shape it is nearest — so
the three laid back on top of each other are the logo again, pixel for pixel.

The native splash shows ONLY the lamp, at LAMP_DP in Android's 288dp splash
box, because the animation starts from a spark in the middle of the screen at
that size (`SPARK_START_DP` in components/auth/SplashSequence.tsx). Keep the
two equal, or the hand-over from the OS to the app jumps.

These files are NOT in apply-logo.py's list on purpose: re-running that script
would put the whole logo back on the native splash.
"""
import os
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(REPO, 'User App')
RES = os.path.join(APP, 'android/app/src/main/res')
SRC = os.path.join(APP, 'assets/images/logo-2026.png')

LAMP_DP = 64            # the lamp's glow, edge to edge, on the native splash
SPLASH_BOX_DP = 288     # Android's splash icon canvas
GLOW_RADIUS = 110       # px of artwork around the lamp that belong to its glow


def split(a):
    A = a[..., 3] / 255
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    lab, n = ndimage.label(A > 0.35)
    sizes = ndimage.sum(np.ones_like(A), lab, range(1, n + 1))
    objs = ndimage.find_objects(lab)
    widest = max(range(1, n + 1),
                 key=lambda i: (objs[i - 1][1].stop - objs[i - 1][1].start) if sizes[i - 1] > 1000 else 0)
    yellow = (R - B > 35) & (R > 180) & (A > 0.02)
    swoosh = (lab == widest) & ~yellow
    letters = np.isin(lab, [i for i in range(1, n + 1) if sizes[i - 1] > 1000 and i != widest]) & ~yellow
    dists = [ndimage.distance_transform_edt(~core) for core in (letters, swoosh, yellow)]
    return np.argmin(np.stack(dists), axis=0)


def layer(a, mask):
    b = a.copy()
    b[..., 3] = np.where(mask, a[..., 3], 0)
    return Image.fromarray(b.round().astype(np.uint8), 'RGBA')


def main():
    a = np.asarray(Image.open(SRC).convert('RGBA')).astype(np.float64)
    owner = split(a)
    # The glow is only what lies around the lamp: a faint pixel elsewhere that
    # happened to sit nearest the yellow is antialiasing, not light.
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    lamp_y, lamp_x = np.unravel_index(
        ((a[..., 0] + a[..., 1] - 2 * a[..., 2]) * (a[..., 3] / 255)).argmax(), a.shape[:2])
    near_lamp = (xx - lamp_x) ** 2 + (yy - lamp_y) ** 2 <= GLOW_RADIUS ** 2
    owner = np.where((owner == 2) & ~near_lamp, 1, owner)
    letters, swoosh, glow = (layer(a, owner == k) for k in range(3))
    print(f'lamp centre  ({lamp_x}, {lamp_y})')

    letters.save(os.path.join(APP, 'assets/images/logo-letters.png'), optimize=True)
    swoosh.save(os.path.join(APP, 'assets/images/logo-swoosh.png'), optimize=True)

    # The glow, cropped square around the lamp, so it can fly on its own.
    gbox = glow.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    cx, cy = (gbox[0] + gbox[2]) / 2, (gbox[1] + gbox[3]) / 2
    side = max(gbox[2] - gbox[0], gbox[3] - gbox[1])
    crop_box = (round(cx - side / 2), round(cy - side / 2), round(cx + side / 2), round(cy + side / 2))
    lamp = glow.crop(crop_box)
    lamp.save(os.path.join(APP, 'assets/images/logo-glow.png'), optimize=True)

    art_w, art_h = Image.open(SRC).size
    print(f'artwork      {art_w}x{art_h}')
    print(f'glow crop    {crop_box}  ({side}px square)')
    print(f'  -> GLOW = {{ x: {crop_box[0]}, y: {crop_box[1]}, size: {side} }} in SplashSequence.tsx')

    # The native splash: the lamp alone, LAMP_DP wide in a 288dp box.
    def native(px):
        canvas = Image.new('RGBA', (px, px), (0, 0, 0, 0))
        s = round(px * LAMP_DP / SPLASH_BOX_DP)
        canvas.alpha_composite(lamp.resize((s, s), Image.LANCZOS), ((px - s) // 2, (px - s) // 2))
        return canvas

    native(1152).save(os.path.join(APP, 'assets/images/splash-logo.png'), optimize=True)
    for dens, k in (('mdpi', 1), ('hdpi', 1.5), ('xhdpi', 2), ('xxhdpi', 3), ('xxxhdpi', 4)):
        px = round(SPLASH_BOX_DP * k)
        native(px).save(os.path.join(RES, f'drawable-{dens}/splashscreen_logo.png'), optimize=True)
    print(f'native splash: lamp {LAMP_DP}dp in a {SPLASH_BOX_DP}dp box, 5 densities + splash-logo.png')
    return 0


if __name__ == '__main__':
    sys.exit(main())
