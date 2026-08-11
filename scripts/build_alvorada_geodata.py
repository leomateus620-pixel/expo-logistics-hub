"""Build the compact, versioned Santa Rosa dataset used by Alvorada.

The runtime never calls third-party geospatial APIs. This script downloads a
fixed Microsoft Global ML Building Footprints partition and Mapzen Terrain
Tiles, clips both to the authored area of interest and emits one deterministic
JSON asset for the WebGL scene.
"""

from __future__ import annotations

import base64
import gzip
import hashlib
import json
import math
import struct
import tempfile
import urllib.request
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "alvorada" / "santa-rosa-city-v2.json"
CACHE = Path(tempfile.gettempdir()) / "fenasoja-alvorada-geodata"

CENTER_LAT = -27.8707
CENTER_LON = -54.4817
CITY_HALF_EXTENT_METERS = 3400.0
TERRAIN_HALF_EXTENT_METERS = 4700.0
METERS_PER_WORLD_UNIT = 50.0
MAX_BUILDINGS = 9000
TERRAIN_RESOLUTION = 129
TERRAIN_ZOOM = 12

MICROSOFT_BUILDINGS_URL = (
    "https://minedbuildings.z5.web.core.windows.net/global-buildings/2026-02-03/"
    "global-buildings.geojsonl/RegionName=Brazil/quadkey=210312012/"
    "part-00012-4feead82-d499-422b-94cb-c036c212127a.c000.csv.gz"
)
TERRAIN_TILE_URL = (
    "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
)

METERS_PER_DEGREE_LAT = 111_320.0
METERS_PER_DEGREE_LON = METERS_PER_DEGREE_LAT * math.cos(math.radians(CENTER_LAT))


@dataclass(frozen=True)
class Footprint:
    points: tuple[tuple[float, float], ...]
    centroid_x: float
    centroid_z: float
    area: float
    confidence: float
    score: float


def download(url: str, filename: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    target = CACHE / filename
    if target.exists() and target.stat().st_size > 0:
        return target

    request = urllib.request.Request(
        url,
        headers={"User-Agent": "expo-logistics-hub-alvorada/2.0"},
    )
    with urllib.request.urlopen(request, timeout=240) as response:
        target.write_bytes(response.read())
    return target


def stable_random(value: str) -> float:
    digest = hashlib.blake2b(value.encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, "little") / float(2**64 - 1)


def project(longitude: float, latitude: float) -> tuple[float, float]:
    x = (longitude - CENTER_LON) * METERS_PER_DEGREE_LON
    z = -(latitude - CENTER_LAT) * METERS_PER_DEGREE_LAT
    return x, z


def signed_area(points: tuple[tuple[float, float], ...]) -> float:
    total = 0.0
    for index, current in enumerate(points):
        following = points[(index + 1) % len(points)]
        total += current[0] * following[1] - following[0] * current[1]
    return total * 0.5


def polygon_centroid(
    points: tuple[tuple[float, float], ...],
) -> tuple[float, float]:
    area = signed_area(points)
    if abs(area) < 1e-6:
        return (
            sum(point[0] for point in points) / len(points),
            sum(point[1] for point in points) / len(points),
        )

    x_total = 0.0
    z_total = 0.0
    for index, current in enumerate(points):
        following = points[(index + 1) % len(points)]
        cross = current[0] * following[1] - following[0] * current[1]
        x_total += (current[0] + following[0]) * cross
        z_total += (current[1] + following[1]) * cross
    divisor = 6.0 * area
    return x_total / divisor, z_total / divisor


def simplify_ring(
    points: tuple[tuple[float, float], ...],
    minimum_distance: float = 0.55,
) -> tuple[tuple[float, float], ...]:
    simplified: list[tuple[float, float]] = []
    for point in points:
        if not simplified or math.dist(point, simplified[-1]) >= minimum_distance:
            simplified.append(point)
    if len(simplified) > 3 and math.dist(simplified[0], simplified[-1]) < minimum_distance:
        simplified.pop()
    return tuple(simplified)


def load_footprints(source: Path) -> list[Footprint]:
    candidates: list[Footprint] = []
    with gzip.open(source, "rt", encoding="utf-8") as stream:
        for line in stream:
            feature = json.loads(line)
            geometry = feature.get("geometry", {})
            if geometry.get("type") != "Polygon":
                continue
            coordinates = geometry.get("coordinates", [])
            if not coordinates or len(coordinates[0]) < 4:
                continue

            confidence = float(feature.get("properties", {}).get("confidence", 0))
            if confidence < 0.78:
                continue

            geographic_ring = coordinates[0]
            if geographic_ring[0] == geographic_ring[-1]:
                geographic_ring = geographic_ring[:-1]
            points = simplify_ring(tuple(project(lon, lat) for lon, lat in geographic_ring))
            if len(points) < 3:
                continue

            centroid_x, centroid_z = polygon_centroid(points)
            if (
                abs(centroid_x) > CITY_HALF_EXTENT_METERS
                or abs(centroid_z) > CITY_HALF_EXTENT_METERS
            ):
                continue

            area = abs(signed_area(points))
            if area < 18.0 or area > 3600.0:
                continue

            identity = f"{centroid_x:.2f}:{centroid_z:.2f}:{area:.1f}"
            score = (
                confidence * 0.42
                + min(area, 520.0) / 520.0 * 0.24
                + stable_random(identity) * 0.34
            )
            candidates.append(
                Footprint(
                    points=points,
                    centroid_x=centroid_x,
                    centroid_z=centroid_z,
                    area=area,
                    confidence=confidence,
                    score=score,
                )
            )
    return candidates


def stratified_selection(
    candidates: list[Footprint],
    limit: int,
) -> list[Footprint]:
    cells: dict[tuple[int, int], list[Footprint]] = defaultdict(list)
    cell_size = 115.0
    for candidate in candidates:
        key = (
            math.floor(candidate.centroid_x / cell_size),
            math.floor(candidate.centroid_z / cell_size),
        )
        cells[key].append(candidate)

    for values in cells.values():
        values.sort(key=lambda item: item.score, reverse=True)

    selected: list[Footprint] = []
    ordered_cells = sorted(
        cells,
        key=lambda key: (key[0] * 73856093) ^ (key[1] * 19349663),
    )
    depth = 0
    while len(selected) < limit:
        appended = False
        for key in ordered_cells:
            values = cells[key]
            if depth < len(values):
                selected.append(values[depth])
                appended = True
                if len(selected) >= limit:
                    break
        if not appended:
            break
        depth += 1
    return selected


def oriented_dimensions(footprint: Footprint) -> tuple[float, float, float]:
    longest = max(
        (
            math.dist(point, footprint.points[(index + 1) % len(footprint.points)]),
            point,
            footprint.points[(index + 1) % len(footprint.points)],
        )
        for index, point in enumerate(footprint.points)
    )
    angle = math.atan2(longest[2][1] - longest[1][1], longest[2][0] - longest[1][0])
    cosine = math.cos(angle)
    sine = math.sin(angle)
    projected_x = [point[0] * cosine + point[1] * sine for point in footprint.points]
    projected_z = [-point[0] * sine + point[1] * cosine for point in footprint.points]
    width = max(projected_x) - min(projected_x)
    depth = max(projected_z) - min(projected_z)
    return angle, width, depth


def classify_building(footprint: Footprint) -> tuple[int, float, int, int]:
    distance = math.hypot(footprint.centroid_x, footprint.centroid_z)
    random_value = stable_random(
        f"class:{footprint.centroid_x:.1f}:{footprint.centroid_z:.1f}"
    )
    angle, width, depth = oriented_dimensions(footprint)
    aspect = max(width, depth) / max(1.0, min(width, depth))
    core = max(0.0, 1.0 - distance / 1750.0)

    if footprint.area > 950.0 or aspect > 4.6:
        building_class = 5  # industrial
        height = 6.5 + random_value * 5.5
        roof = 0
    elif footprint.area > 520.0 and random_value > 0.7:
        building_class = 6  # institutional
        height = 9.0 + random_value * 10.0
        roof = 0 if random_value > 0.48 else 2
    elif random_value < 0.012 + core * core * 0.026:
        building_class = 4  # tower
        height = 34.0 + core * 22.0 + random_value * 18.0
        roof = 0
    elif random_value < 0.065 + core * 0.15:
        building_class = 3  # mid-rise residential
        height = 15.0 + core * 13.0 + random_value * 9.0
        roof = 0
    elif distance < 1450.0 and random_value < 0.42:
        building_class = 2  # commercial
        height = 7.0 + core * 7.0 + random_value * 4.0
        roof = 0
    elif footprint.area < 330.0:
        building_class = 0  # low residential
        height = 4.8 + random_value * 5.8
        roof = 1 if random_value < 0.68 else 2 if random_value < 0.9 else 0
    else:
        building_class = 1  # general residential
        height = 7.0 + random_value * 7.5
        roof = 2 if random_value < 0.46 else 0

    variant = int(stable_random(f"variant:{angle:.4f}:{distance:.1f}") * 8) % 8
    return building_class, height, roof, variant


def lon_to_tile_x(longitude: float, zoom: int) -> float:
    return (longitude + 180.0) / 360.0 * (2**zoom)


def lat_to_tile_y(latitude: float, zoom: int) -> float:
    latitude_radians = math.radians(latitude)
    return (
        1.0 - math.asinh(math.tan(latitude_radians)) / math.pi
    ) / 2.0 * (2**zoom)


def load_terrain_tile(x: int, y: int) -> Image.Image:
    source = download(
        TERRAIN_TILE_URL.format(z=TERRAIN_ZOOM, x=x, y=y),
        f"terrain-{TERRAIN_ZOOM}-{x}-{y}.png",
    )
    return Image.open(source).convert("RGB")


def terrarium_height(pixel: tuple[int, int, int]) -> float:
    red, green, blue = pixel
    return red * 256.0 + green + blue / 256.0 - 32768.0


def sample_terrain(longitude: float, latitude: float, cache: dict[tuple[int, int], Image.Image]) -> float:
    tile_x = lon_to_tile_x(longitude, TERRAIN_ZOOM)
    tile_y = lat_to_tile_y(latitude, TERRAIN_ZOOM)
    integer_x = math.floor(tile_x)
    integer_y = math.floor(tile_y)
    key = (integer_x, integer_y)
    image = cache.setdefault(key, load_terrain_tile(integer_x, integer_y))
    pixel_x = min(255, max(0, round((tile_x - integer_x) * 255)))
    pixel_y = min(255, max(0, round((tile_y - integer_y) * 255)))
    return terrarium_height(image.getpixel((pixel_x, pixel_y)))


def terrain_payload() -> dict[str, object]:
    tile_cache: dict[tuple[int, int], Image.Image] = {}
    elevations: list[float] = []
    extent = TERRAIN_HALF_EXTENT_METERS
    for row in range(TERRAIN_RESOLUTION):
        z = -extent + row / (TERRAIN_RESOLUTION - 1) * extent * 2
        latitude = CENTER_LAT - z / METERS_PER_DEGREE_LAT
        for column in range(TERRAIN_RESOLUTION):
            x = -extent + column / (TERRAIN_RESOLUTION - 1) * extent * 2
            longitude = CENTER_LON + x / METERS_PER_DEGREE_LON
            elevations.append(sample_terrain(longitude, latitude, tile_cache))

    for image in tile_cache.values():
        image.close()

    base_elevation = round(sum(elevations) / len(elevations), 1)
    quantized = [
        max(-32768, min(32767, round((height - base_elevation) * 10.0)))
        for height in elevations
    ]
    packed = struct.pack(f"<{len(quantized)}h", *quantized)
    return {
        "resolution": TERRAIN_RESOLUTION,
        "sizeMeters": TERRAIN_HALF_EXTENT_METERS * 2,
        "baseElevation": base_elevation,
        "heightScale": 0.1,
        "minimumElevation": round(min(elevations), 1),
        "maximumElevation": round(max(elevations), 1),
        "heights": base64.b64encode(packed).decode("ascii"),
    }


def build() -> None:
    building_archive = download(MICROSOFT_BUILDINGS_URL, "microsoft-210312012.csv.gz")
    candidates = load_footprints(building_archive)
    selected = stratified_selection(candidates, MAX_BUILDINGS)

    buildings: list[dict[str, object]] = []
    for footprint in selected:
        building_class, height, roof, variant = classify_building(footprint)
        angle, width, depth = oriented_dimensions(footprint)
        buildings.append(
            {
                "p": [
                    round(coordinate / METERS_PER_WORLD_UNIT, 4)
                    for point in footprint.points
                    for coordinate in point
                ],
                "h": round(height / METERS_PER_WORLD_UNIT, 4),
                "c": building_class,
                "r": roof,
                "v": variant,
                "o": [
                    round(angle, 5),
                    round(width / METERS_PER_WORLD_UNIT, 4),
                    round(depth / METERS_PER_WORLD_UNIT, 4),
                ],
                "q": round(footprint.confidence, 4),
            }
        )

    source_hash = hashlib.sha256(building_archive.read_bytes()).hexdigest()
    payload = {
        "version": 2,
        "generated": date.today().isoformat(),
        "center": [CENTER_LAT, CENTER_LON],
        "metersPerUnit": METERS_PER_WORLD_UNIT,
        "aoiMeters": {
            "city": CITY_HALF_EXTENT_METERS * 2,
            "terrain": TERRAIN_HALF_EXTENT_METERS * 2,
        },
        "sources": {
            "buildings": {
                "name": "Microsoft Global ML Building Footprints",
                "license": "CDLA-Permissive-2.0",
                "url": MICROSOFT_BUILDINGS_URL,
                "sha256": source_hash,
                "candidateCount": len(candidates),
                "selectedCount": len(buildings),
            },
            "terrain": {
                "name": "Mapzen Terrain Tiles on AWS",
                "license": "CC-BY-4.0",
                "url": "https://registry.opendata.aws/terrain-tiles/",
                "format": "Terrarium",
                "zoom": TERRAIN_ZOOM,
            },
        },
        "terrain": terrain_payload(),
        "buildings": buildings,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "output": str(OUTPUT),
                "bytes": OUTPUT.stat().st_size,
                "candidates": len(candidates),
                "buildings": len(buildings),
                "terrain": {
                    "minimum": payload["terrain"]["minimumElevation"],
                    "maximum": payload["terrain"]["maximumElevation"],
                },
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    build()
