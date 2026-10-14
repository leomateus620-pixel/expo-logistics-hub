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


def image_dimensions(data: bytes) -> tuple[int, int]:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack_from(">II", data, 16)
    if data[:2] == b"\xff\xd8":
        offset = 2
        while offset + 4 <= len(data):
            if data[offset] != 0xFF:
                offset += 1
                continue
            marker = data[offset + 1]
            if marker == 0xFF:
                offset += 1
                continue
            if marker in (0xD8, 0xD9):
                offset += 2
                continue
            length = struct.unpack_from(">H", data, offset + 2)[0]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                height, width = struct.unpack_from(">HH", data, offset + 5)
                return width, height
            offset += 2 + length
        raise ValueError("JPEG dimensions missing")
    return webp_dimensions(data)


def validate_file(entry: dict, data: bytes) -> None:
    if len(data) != entry["bytes"]:
        raise ValueError(f'{entry["path"]}: unexpected byte count')
    if hashlib.sha256(data).hexdigest() != entry["sha256"]:
        raise ValueError(f'{entry["path"]}: SHA-256 mismatch')
    if "width" in entry:
        if image_dimensions(data) != (entry["width"], entry["height"]):
            raise ValueError(f'{entry["path"]}: unexpected dimensions')


def prepare(archive: Path, lock: dict) -> None:
    if hashlib.sha256(archive.read_bytes()).hexdigest() != lock["archiveSha256"]:
        raise ValueError(f'Archive SHA-256 does not match the supplied {lock["archiveName"]}')
    with ZipFile(archive) as package:
        # Validate every entry before changing files; ZIP metadata is not copied.
        prepared = [(entry, package.read(entry["archivePath"])) for entry in lock["files"] if entry["archivePath"]]
        for entry, data in prepared:
            validate_file(entry, data)
        for entry, data in prepared:
            target = ROOT / entry["path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)


def verify(lock: dict) -> dict:
    for entry in lock["files"]:
        validate_file(entry, (ROOT / entry["path"]).read_bytes())
        if "canonicalPath" in entry:
            alias = ROOT / entry["path"]
            if not alias.is_symlink() or alias.resolve() != (ROOT / entry["canonicalPath"]).resolve():
                raise ValueError("Legacy reference must resolve to its canonical edition original")
    expected = {ROOT / entry["path"] for entry in lock["files"] if entry["kind"] == "runtime"}
    actual = {p for p in (ROOT / "public/portal/history").rglob("*") if p.is_file()}
    if actual != expected:
        raise ValueError("Unexpected files in the production history directory")
    catalog = json.loads((ROOT / "docs/portal-history/source/catalogo-25-edicoes.json").read_text())
    recovered = [e for e in catalog["editions"] if e["status"] == "recuperada"]
    pending = [e for e in catalog["editions"] if e["status"] == "pendente"]
    if (len(catalog["editions"]), len(recovered), len(pending)) != (25, 12, 13):
        raise ValueError("Unexpected documented/recovered/pending edition counts")
    if any(e["original"] is not None or e["variants"] for e in pending):
        raise ValueError("Pending editions cannot contain invented image files")
    for edition in recovered:
        original = next(e for e in lock["files"] if e["path"].endswith(edition["original"]))
        if (original["sha256"], original["width"], original["height"]) != (edition["sha256"], edition["width"], edition["height"]):
            raise ValueError("Original metadata does not match supplied catalog")
        for variant in edition["variants"]:
            asset = next(e for e in lock["files"] if e["kind"] == "runtime" and Path(e["path"]).name == Path(variant["path"]).name)
            if any(asset[key] != variant[key] for key in ["sha256", "bytes", "width", "height"]):
                raise ValueError("Runtime metadata does not match supplied catalog")
    report = {}
    for width in [256, 512]:
        assets = [e for e in lock["files"] if e["kind"] == "runtime" and e["width"] == width]
        assets.sort(key=lambda e: e["editionNumber"])
        byte_counts = [e["bytes"] for e in assets]
        def sums(count: int) -> list[int]:
            return [sum(byte_counts[(i + offset) % len(assets)] for offset in range(count)) for i in range(len(assets))]
        report[str(width)] = {
            "allRecoveredBytes": sum(byte_counts),
            "consecutiveWindowByteRanges": [
                {"distinctEditions": count, "minBytes": min(sums(count)), "maxBytes": max(sums(count))}
                for count in range(1, len(assets) + 1)
            ],
            "files": [{"year": e["year"], "bytes": e["bytes"]} for e in assets],
        }
    return {
        "verifiedPaths": len(lock["files"]),
        "canonicalOriginals": 12,
        "legacyAliases": sum("canonicalPath" in e for e in lock["files"]),
        "documentedEditions": 25, "recoveredEditions": 12, "pendingEditions": 13,
        "windowModel": {"visibleCount": "ceil(measuredContainerWidth / measuredStep) + 1", "lookAhead": 3,
                        "distinctPreparedCount": "min(recoveredCount, visibleCount + lookAhead)"},
        "runtime": report,
    }


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
