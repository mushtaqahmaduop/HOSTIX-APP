"""THE APP ICON, DRAWN FROM THE LICENCE SCREEN'S TILE (owner, 2026-09-25).

The desktop / taskbar / window icon was a black "H" on transparency, which
vanished on a dark desktop or taskbar. The licence screen already showed the
mark the owner wants everywhere: a white H on a rounded tile, gradient 135deg
#2563eb -> #4f46e5, corner radius 26/96 of the side, the H 46/96 of the side
(renderer/license.html .logo). This script draws exactly that, from the
512px H in assets/icon-mark-512.png, so every size is rendered, not shrunk:

  assets/icon.png                  512px  window icon (main.js) + Linux/fallback
  assets/icon.ico                  16-256 exe, desktop shortcut, taskbar, installer
  renderer/img/brand/app-tile.png  256px  the same tile inside the app

Run:  python scripts/make-brand-icon.py   (needs Pillow)
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
MARK = Image.open(ROOT / 'assets' / 'icon-mark-512.png').convert('RGBA')
MARK = MARK.crop(MARK.getbbox())
A, B = (0x25, 0x63, 0xEB), (0x4F, 0x46, 0xE5)       # license.html .logo gradient


def tile(size, mark_frac=46 / 96, radius_frac=26 / 96, ss=4):
    S = size * ss
    # 135deg gradient: top-left A -> bottom-right B.
    grad = Image.new('RGBA', (S, S))
    px = grad.load()
    for y in range(S):
        for x in range(S):
            t = (x + y) / (2 * (S - 1))
            px[x, y] = tuple(round(A[i] + (B[i] - A[i]) * t) for i in range(3)) + (255,)
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=round(S * radius_frac), fill=255)
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    out.paste(grad, (0, 0), mask)
    # The mark in white, keeping its own antialiased alpha; fit in a box of mark_frac.
    box = S * mark_frac
    k = min(box / MARK.width, box / MARK.height)
    m = MARK.resize((max(1, round(MARK.width * k)), max(1, round(MARK.height * k))), Image.LANCZOS)
    white = Image.new('RGBA', m.size, (255, 255, 255, 255))
    white.putalpha(m.getchannel('A'))
    out.alpha_composite(white, ((S - m.width) // 2, (S - m.height) // 2))
    return out.resize((size, size), Image.LANCZOS)


# Small sizes get a slightly larger H: at 16px a 46% H is seven pixels tall and
# reads as a smudge on a taskbar.
def frac(n):
    return 0.60 if n <= 24 else 0.54 if n <= 48 else 46 / 96


tile(512).save(ROOT / 'assets' / 'icon.png')
tile(256).save(ROOT / 'renderer' / 'img' / 'brand' / 'app-tile.png')
sizes = [256, 128, 64, 48, 32, 24, 16]
imgs = [tile(n, mark_frac=frac(n)) for n in sizes]
imgs[0].save(ROOT / 'assets' / 'icon.ico', format='ICO', sizes=[(n, n) for n in sizes], append_images=imgs[1:])
print('wrote icon.png, icon.ico', sizes, 'app-tile.png')
