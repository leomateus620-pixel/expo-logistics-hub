#!/usr/bin/env python3
"""Reproduce the supplied WebP exports byte-for-byte, or verify the local collection.

No image encoder or external service is required. The supplied, already dimensioned
exports are the canonical conversion; re-encoding would change their codec output.
"""

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
LOCK = Path(__file__).with_name("assets-lock.json")


def webp_dimensions(data: bytes) -> tuple[int, int]:
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise ValueError("not a WebP image")
    offset = 12
    while offset + 8 <= len(data):
        chunk = data[offset:offset + 4]
        length = struct.unpack_from("<I", data, offset + 4)[0]
        body = data[offset + 8:offset + 8 + length]
        if chunk == b"VP8X" and len(body) >= 10:
            return (1 + int.from_bytes(body[4:7], "little"),
                    1 + int.from_bytes(body[7:10], "little"))
        if chunk == b"VP8 " and body[3:6] == b"\x9d\x01\x2a":
            return (int.from_bytes(body[6:8], "little") & 0x3FFF,
                    int.from_bytes(body[8:10], "little") & 0x3FFF)
        if chunk == b"VP8L" and body[:1] == b"\x2f":
            bits = int.from_bytes(body[1:5], "little")
            return (1 + (bits & 0x3FFF), 1 + ((bits >> 14) & 0x3FFF))
        offset += 8 + length + length % 2
    raise ValueError("WebP dimensions missing")


def validate_file(entry: dict, data: bytes) -> None:
    if len(data) != entry["bytes"]:
        raise ValueError(f'{entry["path"]}: unexpected byte count')
    if hashlib.sha256(data).hexdigest() != entry["sha256"]:
        raise ValueError(f'{entry["path"]}: SHA-256 mismatch')
    if entry["kind"] == "runtime":
        if webp_dimensions(data) != (entry["width"], entry["height"]):
            raise ValueError(f'{entry["path"]}: unexpected dimensions')


def prepare(archive: Path, lock: dict) -> None:
    if hashlib.sha256(archive.read_bytes()).hexdigest() != lock["archiveSha256"]:
        raise ValueError("Archive SHA-256 does not match the supplied Fenasoja_Portal_Artes.zip")
    with ZipFile(archive) as package:
        # Validate every entry before changing files; ZIP metadata is not copied.
        prepared = [(entry, package.read(entry["archivePath"])) for entry in lock["files"]]
        for entry, data in prepared:
            validate_file(entry, data)
        for entry, data in prepared:
            target = ROOT / entry["path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)


def verify(lock: dict) -> dict:
    for entry in lock["files"]:
        validate_file(entry, (ROOT / entry["path"]).read_bytes())
    expected = {ROOT / entry["path"] for entry in lock["files"] if entry["kind"] == "runtime"}
    actual = {p for p in (ROOT / "public/portal/history").rglob("*") if p.is_file()}
    if actual != expected:
        raise ValueError("Unexpected files in the production history directory")
    report = {}
    for width in [320, 640]:
        assets = [e for e in lock["files"] if e["kind"] == "runtime" and e["width"] == width]
        mobile = [e for e in assets if e["year"] in [2016, 2024]]
        report[str(width)] = {
            "desktopBytes": sum(e["bytes"] for e in assets),
            "mobileBytes": sum(e["bytes"] for e in mobile),
            "files": [{"year": e["year"], "bytes": e["bytes"]} for e in assets],
        }
    return {"verifiedFiles": len(lock["files"]), "runtime": report}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, help="restore canonical exports and consultation sources from this ZIP")
    args = parser.parse_args()
    lock = json.loads(LOCK.read_text())
    try:
        if args.archive:
            prepare(args.archive, lock)
        print(json.dumps(verify(lock), indent=2))
    except (OSError, ValueError, KeyError) as error:
        print(f"Portal history asset verification failed: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
