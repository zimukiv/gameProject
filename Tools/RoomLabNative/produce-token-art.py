# Regenerates the two token slices with a clear size/shape difference (bug: big and small looked alike).
# Default palette matches the rest of PhysicsPixel art: hard edges, no antialiasing, 32 PPU.
from PIL import Image
import os

OUT = r"G:\project null\gameProject-roomlab255\Assets\RoomLabNative\Resources\PhysicsPixel"
OUTLINE = (18, 24, 38, 255)
BODY = (34, 56, 78, 255)
GOLD = (232, 168, 64, 255)
GOLD_HI = (255, 226, 140, 255)
GOLD_LO = (150, 96, 32, 255)
CYAN = (64, 224, 224, 255)
CYAN_HI = (208, 255, 255, 255)
CYAN_LO = (24, 132, 150, 255)
CLEAR = (0, 0, 0, 0)


def small_token():
    """12x12 cyan shard: same diamond motif as the big cell, one third the footprint."""
    img = Image.new("RGBA", (12, 12), CLEAR)
    px = img.load()
    c = 5.5
    for y in range(12):
        for x in range(12):
            d = abs(x - c) + abs(y - c)
            if d <= 2.5:
                px[x, y] = CYAN
            elif d <= 3.5:
                px[x, y] = CYAN_LO
            elif d <= 4.5:
                px[x, y] = OUTLINE
    px[5, 3] = CYAN_HI
    px[4, 4] = CYAN_HI
    return img


def big_token():
    """28x28 gold-rimmed power cell: twice the footprint plus a bright frame, obviously the "big" one."""
    img = Image.new("RGBA", (28, 28), CLEAR)
    px = img.load()
    c = 13.5
    for y in range(28):
        for x in range(28):
            dx, dy = abs(x - c), abs(y - c)
            d = max(dx, dy)
            if d <= 9.0:
                px[x, y] = BODY
            elif d <= 11.0:
                px[x, y] = GOLD
            elif d <= 12.0:
                px[x, y] = OUTLINE
            elif d <= 13.0:
                px[x, y] = GOLD_LO
    # cyan diamond core
    for y in range(28):
        for x in range(28):
            if abs(x - c) + abs(y - c) <= 6.5:
                px[x, y] = CYAN
            if abs(x - c) + abs(y - c) <= 3.0:
                px[x, y] = CYAN_HI
    # gold corner studs and inner ticks
    for ox in (6, 21):
        for oy in (6, 21):
            for dy in range(-1, 2):
                for dx in range(-1, 2):
                    px[ox + dx, oy + dy] = GOLD_HI
    for i in range(6, 22):
        px[i, 13] = GOLD_HI if i in (9, 10, 17, 18) else px[i, 13]
    img.save(os.path.join(OUT, "campus_interactables-tokenBig.png"))
    return img


def save(img, name):
    img.save(os.path.join(OUT, name), optimize=True)
    print(name, img.size)


save(small_token(), "campus_interactables-tokenSmall.png")
big = big_token()
save(big, "campus_interactables-tokenBig.png")
