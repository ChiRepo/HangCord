"""Draws HangCord's placeholder app icon (original artwork): an amber rounded square with a dark,
geometric "H" whose crossbar is a soft cord. Replace with the real logo (MASTER_PLAN §2.1) later;
then run `npx tauri icon apps/desktop/src-tauri/icons/source.png` to regenerate every size."""
import sys
from PIL import Image, ImageDraw

S = 1024
LANTERN = (242, 169, 59, 255)  # --hc-lantern
ON = (26, 18, 5, 255)  # --hc-on-lantern

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
pad = 64
d.rounded_rectangle([pad, pad, S - pad, S - pad], radius=220, fill=LANTERN)

# Two uprights with fully rounded ends.
w, top, bot = 132, 270, 754
for x in (330, 562):
    d.rounded_rectangle([x, top, x + w, bot], radius=w // 2, fill=ON)
# The "cord": a thick rounded bar joining them, slightly below centre.
d.rounded_rectangle([330, 470, 694, 470 + 104], radius=52, fill=ON)

out = sys.argv[1] if len(sys.argv) > 1 else "source.png"
img.save(out)
print("wrote", out)
