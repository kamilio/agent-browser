import hashlib
import json
import pathlib
import sys

import PIL
from PIL import Image, features


root = pathlib.Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=True)
manifest = []
for width, height in [(1, 1), (7, 9), (17, 13), (31, 23)]:
    for mode in ["L", "RGB", "stored-rgb"]:
        image = Image.new("RGB" if mode == "stored-rgb" else mode, (width, height))
        values = []
        for row in range(height):
            for column in range(width):
                channels = tuple((column * 37 + row * 53 + channel * 71 + column * row * 13) % 256 for channel in range(3))
                values.append(channels[0] if mode == "L" else channels)
        image.putdata(values)
        for quality in [25, 80, 95]:
            for subsampling in ([0, 1, 2] if mode == "RGB" else [0]):
                for progressive in [False, True]:
                    for restart in [0, 2]:
                        name = f"{mode}-{width}x{height}-q{quality}-s{subsampling}-p{int(progressive)}-r{restart}"
                        path = root / f"{name}.jpg"
                        image.save(path, quality=quality, subsampling=subsampling, progressive=progressive, optimize=quality == 80, keep_rgb=mode == "stored-rgb", restart_marker_blocks=restart)
                        with Image.open(path) as decoded:
                            decoded.load()
                            pixels = decoded.convert("RGBA").tobytes()
                            (root / f"{name}.rgba").write_bytes(pixels)
                        manifest.append({"file": path.name, "pixels": f"{name}.rgba", "width": width, "height": height, "mode": mode, "quality": quality, "subsampling": subsampling, "progressive": progressive, "restart": restart, "sha256": hashlib.sha256(pixels).hexdigest()})
for mode in ["L", "RGB"]:
    for value in [0, 128, 255]:
        for restart in [0, 3]:
            name = f"constant-{mode}-{value}-r{restart}"
            image = Image.new(mode, (129, 65), value if mode == "L" else (value, value, value))
            path = root / f"{name}.jpg"
            image.save(path, quality=80, progressive=True, restart_marker_blocks=restart)
            with Image.open(path) as decoded:
                pixels = decoded.convert("RGBA").tobytes()
                (root / f"{name}.rgba").write_bytes(pixels)
            manifest.append({"file": path.name, "pixels": f"{name}.rgba", "width": 129, "height": 65, "mode": mode, "quality": 80, "subsampling": 2 if mode == "RGB" else 0, "progressive": True, "restart": restart, "sha256": hashlib.sha256(pixels).hexdigest()})
benchmark = Image.new("RGB", (1024, 1024))
benchmark.putdata([((column * 3 + row) % 256, (column + row * 5) % 256, (column * 7 + row * 11) % 256) for row in range(1024) for column in range(1024)])
benchmark.save(root / "benchmark.jpg", quality=80, progressive=True)
(root / "manifest.json").write_text(json.dumps(manifest))
reference = {"pillowVersion": PIL.__version__, "jpegVersion": features.version_codec("jpg"), "fixtures": len(manifest), "root": str(root)}
(root / "reference.json").write_text(json.dumps(reference))
print(json.dumps(reference))
