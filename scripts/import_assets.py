#!/usr/bin/env python3
"""Convert explicitly supplied game assets to atlases. Optional tool; requires Pillow."""

from __future__ import annotations

import argparse
import json
import math
import shutil
from pathlib import Path

from PIL import Image, PngImagePlugin

PROJECT = Path(__file__).resolve().parent.parent
OUTPUT = PROJECT / "public" / "assets"
MAX_ATLAS_SIZE = 8192
ANIMATIONS = (
    "Peashooter", "SunFlower", "WallNut", "Wallnut_1", "Wallnut_2",
    "Repeater", "IcePeaShooter", "FireTree", "CherryBomb", "PotatoMine",
    "PotatoMine_1", "Mushroom", "Sun", "Zombie", "ZombieAttack",
    "ZombieFlag", "ZombieFlagAttack", "ZombieCone", "ZombieConeAttack",
    "ZombieBucket", "ZombieBucketAttack", "PoleZombie", "PoleZombieWalk",
    "PoleZombieAttack", "PoleZombieJump", "PoleZombieJump2", "NewsWalk_1",
    "NewsAttack_1", "NewsLost", "NewsWalk", "NewsAttack", "Pea", "PeaIce",
    "PeaFire", "Mush", "PeaHit", "Fire", "Boom", "PotatoMine_mashed",
    "BurnDie", "ZombieDie", "NewsDie", "PoleZombieDie",
)
STATIC_FILES = (
    "background1.jpg", "card_CherryBomb.png", "card_FireTree.png",
    "card_IcePeaShooter.png", "card_Mushroom.png", "card_PeaShooter.png",
    "card_PotatoMine.png", "card_Repeater.png", "card_Sunflower.png",
    "card_WallNut.png", "Shovel.png", "mainlogo.png",
)
SOUNDS = (
    "Boom", "Eat", "Fire", "Lose", "Mush", "NewsLost", "NotEnoughSun",
    "Pea", "PeaHit", "Place", "Pole", "Potato", "ShieldHit", "Sun",
)
SHORTEN_LAST_FRAME = {"Boom", "BurnDie", "ZombieDie", "NewsDie", "PoleZombieDie"}
ATTRIBUTION = (
    "Game assets; provenance and rights are recorded in THIRD_PARTY_NOTICES.md. "
    "GIF frames composited to RGBA PNG by scripts/import_assets.py."
)


def save_png(image: Image.Image, destination: Path, comment: str = ATTRIBUTION) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text("Comment", comment)
    image.save(destination, format="PNG", pnginfo=metadata, optimize=True)


def import_animation(source: Path, name: str) -> dict:
    source_path = source / f"{name}.gif"
    original_durations: list[int] = []
    durations: list[int] = []
    with Image.open(source_path) as gif:
        width, height = gif.size
        frame_count = gif.n_frames
        max_columns = MAX_ATLAS_SIZE // width
        max_rows = MAX_ATLAS_SIZE // height
        if not max_columns or not max_rows or frame_count > max_columns * max_rows:
            raise ValueError(f"{name}: frames cannot fit in an {MAX_ATLAS_SIZE}px atlas")
        # Aim for a square texture, using more columns when needed to fit the rows.
        columns = max(
            math.ceil(frame_count / max_rows),
            min(max_columns, math.ceil(math.sqrt(frame_count * height / width))),
        )
        rows = math.ceil(frame_count / columns)
        atlas = Image.new("RGBA", (columns * width, rows * height), (0, 0, 0, 0))
        for index in range(frame_count):
            # Sequential seek makes Pillow apply each local frame and the previous
            # frame's GIF disposal operation before producing the full RGBA canvas.
            gif.seek(index)
            frame = gif.convert("RGBA")
            duration = max(0, int(gif.info.get("duration", 0)))
            original_durations.append(duration)
            duration = duration or 100
            if name in SHORTEN_LAST_FRAME and index == frame_count - 1:
                duration = min(duration, 250)
            durations.append(duration)
            atlas.paste(frame, ((index % columns) * width, (index // columns) * height))
            if index == 0:
                save_png(frame, OUTPUT / "previews" / f"{name}.png")
        save_png(atlas, OUTPUT / "animations" / f"{name}.png")
    return {
        "file": f"animations/{name}.png",
        "preview": f"previews/{name}.png",
        "source": f"{name}.gif",
        "width": width,
        "height": height,
        "columns": columns,
        "rows": rows,
        "frameCount": frame_count,
        "durationsMs": durations,
        "sourceDurationsMs": original_durations,
        "durationMs": sum(durations),
    }


def import_static(source: Path, filename: str) -> dict:
    destination = OUTPUT / "images" / filename
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source / filename, destination)
    with Image.open(source / filename) as image:
        width, height = image.size
    if filename == "background1.jpg" and (width, height) != (1400, 600):
        raise ValueError(f"background1: expected 1400x600, got {width}x{height}")
    return {"file": f"images/{filename}", "width": width, "height": height}


def icon_canvas(logo: Image.Image, size: int) -> Image.Image:
    # Resize premultiplied colors so transparent edges do not acquire dark halos.
    image = logo.convert("RGBA")
    bounds = image.getchannel("A").getbbox()
    if bounds:
        image = image.crop(bounds)
    content_size = max(1, round(size * 0.9))
    ratio = min(content_size / image.width, content_size / image.height)
    dimensions = (max(1, round(image.width * ratio)), max(1, round(image.height * ratio)))
    resized = image.convert("RGBa").resize(dimensions, Image.Resampling.LANCZOS).convert("RGBA")
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return canvas


def import_icons(source: Path) -> None:
    icons = PROJECT / "src-tauri" / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    comment = ATTRIBUTION + " Application icon resized/padded from mainlogo.png."
    with Image.open(source / "mainlogo.png") as logo:
        for filename, size in (("32x32.png", 32), ("128x128.png", 128),
                               ("128x128@2x.png", 256), ("icon.png", 512)):
            save_png(icon_canvas(logo, size), icons / filename, comment)
        save_png(icon_canvas(logo, 64), PROJECT / "public" / "favicon.png", comment)
        icon_canvas(logo, 256).save(
            icons / "icon.ico", format="ICO",
            sizes=[(size, size) for size in (16, 24, 32, 48, 64, 128, 256)],
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source", type=Path, required=True,
        help="Directory containing the original GIF, image and WAV files",
    )
    parser.add_argument(
        "--license", type=Path, dest="license_file",
        help="Optional license file to preserve alongside the imported assets",
    )
    args = parser.parse_args()
    source = args.source.resolve()
    license_source = args.license_file.resolve() if args.license_file else None
    required = [source / f"{name}.gif" for name in ANIMATIONS]
    required += [source / filename for filename in STATIC_FILES]
    required += [source / f"{name}.wav" for name in SOUNDS]
    if license_source is not None:
        required.append(license_source)
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        parser.error("Missing source resources:\n" + "\n".join(missing))
    generated_directories = (OUTPUT, PROJECT / "src-tauri" / "icons")
    if any(source == directory or directory in source.parents for directory in generated_directories):
        parser.error("Source resources must be separate from generated output directories")

    # Only this explicit output list is written. Existing unrelated files and
    # directories are never removed, renamed, or copied over.
    manifest: dict = {
        "version": 1,
        "attribution": ATTRIBUTION,
        "atlasLimit": MAX_ATLAS_SIZE,
        "images": {}, "animations": {}, "sounds": {},
    }
    for filename in STATIC_FILES:
        manifest["images"][Path(filename).stem] = import_static(source, filename)
    for name in ANIMATIONS:
        manifest["animations"][name] = import_animation(source, name)
        print(f"Imported {name}", flush=True)
    audio_directory = OUTPUT / "audio"
    audio_directory.mkdir(parents=True, exist_ok=True)
    for name in SOUNDS:
        shutil.copy2(source / f"{name}.wav", audio_directory / f"{name}.wav")
        manifest["sounds"][name] = {"file": f"audio/{name}.wav"}
    import_icons(source)
    if license_source is not None:
        licenses = PROJECT / "licenses"
        licenses.mkdir(parents=True, exist_ok=True)
        license_destination = licenses / "imported-assets-LICENSE"
        if license_source != license_destination.resolve():
            shutil.copy2(license_source, license_destination)
    (OUTPUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
    )
    print(
        f"Imported {len(ANIMATIONS)} animations, {len(STATIC_FILES)} images, "
        f"{len(SOUNDS)} sounds and application icons into {PROJECT}",
        flush=True,
    )


if __name__ == "__main__":
    main()