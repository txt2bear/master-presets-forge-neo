#!/usr/bin/env python3
"""Build the release ZIP: dist/master-presets-forge-neo-v<version>.zip.

Usage: python make_release.py [version]
Without a version the latest v* git tag is used (falls back to "dev").

The ZIP contains the extension payload only: no master_presets.json (user
data), no .git, no dev docs or build files. Entries use a top-level
master-presets-forge-neo/ folder and forward slashes, so they extract
cleanly on Windows and Linux.
"""
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
NAME = "master-presets-forge-neo"

INCLUDE = [
    "javascript",
    "scripts",
    "style.css",
    "README.md",
    "LICENSE",
]


def latest_version() -> str:
    try:
        tags = subprocess.run(
            ["git", "-C", str(ROOT), "tag", "--list", "v*"],
            capture_output=True, text=True, check=True,
        ).stdout.split()
        if tags:
            return sorted(tags)[-1].lstrip("v")
    except (OSError, subprocess.CalledProcessError):
        pass
    return "dev"


def build(version: str) -> Path:
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    zip_path = dist / f"{NAME}-v{version}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for item in INCLUDE:
            path = ROOT / item
            if path.is_dir():
                for file in sorted(path.rglob("*")):
                    if file.is_file() and "__pycache__" not in file.parts and file.suffix != ".pyc":
                        zf.write(file, f"{NAME}/{file.relative_to(ROOT).as_posix()}")
            elif path.is_file():
                zf.write(path, f"{NAME}/{path.name}")
    return zip_path


def main() -> None:
    version = sys.argv[1] if len(sys.argv) > 1 else latest_version()
    zip_path = build(version)
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
    print(f"Built {zip_path} ({len(names)} files)")
    for n in names:
        print(f"  {n}")


if __name__ == "__main__":
    main()
