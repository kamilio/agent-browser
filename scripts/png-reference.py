import hashlib
import json
import pathlib
import sys

import PIL
from PIL import Image


root = pathlib.Path(sys.argv[1])
manifest = json.loads((root / "manifest.json").read_text())
verified = []
for fixture in manifest:
    with Image.open(root / fixture["file"]) as image:
        image.load()
        pixels = image.convert("RGBA").tobytes()
        verified.append({
            "file": fixture["file"],
            "width": image.width,
            "height": image.height,
            "sha256": hashlib.sha256(pixels).hexdigest(),
        })

generated = []
for mode in ["1", "L", "LA", "RGB", "RGBA", "P"]:
    width, height = 31, 23
    image = Image.new(mode, (width, height))
    channels = len(image.getbands())
    values = []
    for index in range(width * height):
        sample = tuple((index * 37 + channel * 71) % 256 for channel in range(channels))
        values.append((255 if index % 3 else 0) if mode == "1" else sample[0] if channels == 1 else sample)
    image.putdata(values)
    if mode == "P":
        image.putpalette([(index * 43) % 256 for index in range(768)])
        image.info["transparency"] = bytes(range(256))
    filename = "pillow-" + mode + ".png"
    image.save(root / filename, optimize=True)
    generated.append({
        "file": filename,
        "width": width,
        "height": height,
        "sha256": hashlib.sha256(image.convert("RGBA").tobytes()).hexdigest(),
    })

print(json.dumps({"pillowVersion": PIL.__version__, "verified": verified, "generated": generated}))
