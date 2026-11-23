"""Bake the linear soil-cover mask. Run at repository root with Pillow and NumPy."""
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# Same positive X/Z orientation and 128-unit domain as the ground shader.
SIZE = 256
SPAN = 128
source = """
import { COMMERCIAL_MAP_TREES as trees } from './src/features/commercial-map/data/commercialTrees';
import { TERRITORY_PATCHES } from './src/features/commercial-map/data/territorialEnvironment';
import { TERRITORY_ROADS } from './src/features/commercial-map/data/territorialRoads';
import { OFFICIAL_REFERENCE_DATA } from './src/features/commercial-map/data/officialReference2026';
import { QUADRAS_AB_SPATIAL_REFERENCE as ab } from './src/features/commercial-map/data/quadrasABEnvironment';
import { quadraGroundWeights } from './src/features/commercial-map/components/canvas/interiorGroundReference';
import { PARK_ACCESS_SPATIAL_PLAN as plan } from './src/features/commercial-map/data/parkAccessSpatialPlan';
console.log(JSON.stringify({
  fields: TERRITORY_PATCHES.filter(p => p.kind === 'field').map(p => p.ring),
  roads: TERRITORY_ROADS.map(r => ({points: r.points, width: r.width + 2 * r.shoulder})),
  anchors: trees.map(({position, canopyRadius}) => [...position, canopyRadius]),
  grove: plan.woodlandMass.polygon,
  memorial: OFFICIAL_REFERENCE_DATA.entities.find(e => e.publicIdentifier === 'G').geometry.coordinates[0],
  path: plan.woodlandPath.surfacePolygon,
  quadras: [ab.quadraA, ab.quadraB].map((q, i) => {
    const x = q.polygon.map(p => p[0]), z = q.polygon.map(p => p[1]);
    const bounds = [Math.min(...x), Math.min(...z), Math.max(...x), Math.max(...z)];
    const samples = Array.from({length: 64 * 64}, (_, k) => {
      const w = quadraGroundWeights(i === 0 ? 'A' : 'B', (k % 64 + .5) / 64, (Math.floor(k / 64) + .5) / 64);
      return [w.shade, w.soil, w.dry];
    });
    return {bounds, samples};
  }),
}));
"""
data = json.loads(subprocess.check_output(["node_modules/.bin/tsx", "-e", source]))
coords = ((np.arange(SIZE) + .5) / SIZE - .5) * SPAN
x, z = np.meshgrid(coords, -coords)
rng = np.random.default_rng(20261122)


def noise(size):
    pixels = rng.integers(0, 256, (size, size), dtype=np.uint8)
    return np.asarray(Image.fromarray(pixels).resize((SIZE, SIZE), Image.Resampling.BICUBIC)) / 255.


def polygon(points, radius=1.6):
    mask = Image.new("L", (SIZE, SIZE))
    uv = [((a / SPAN + .5) * SIZE, (.5 - b / SPAN) * SIZE) for a, b in points]
    ImageDraw.Draw(mask).polygon(uv, fill=255)
    return np.asarray(mask.filter(ImageFilter.GaussianBlur(radius))) / 255.


# Smooth accumulated crown influence follows the registered locations. Warp the
# sample positions and vary the axes to merge overlapping crowns irregularly.
xx = x + (noise(65) - .5) * .96
zz = z + (noise(60) - .5) * .87
density = np.zeros((SIZE, SIZE))
for cx, cz, radius in data["anchors"]:
    stretch = rng.uniform(.75, 1.25)
    dx = (xx - cx) / (radius * stretch)
    dz = (zz - cz) * stretch / radius
    density += np.exp(-.58 * (dx * dx + dz * dz)) * rng.uniform(.46, .8)
wood = polygon(data["grove"]) * (.56 + noise(31) * .40)
# Leave litter to the verge of the path. Its own mesh draws the compacted center.
weight = np.maximum(wood, 1 - np.exp(-density)) * (1 - polygon(data["path"], .42))
# The registered Lunar monument (photo i18) has an open, maintained lawn.
weight *= 1 - polygon(data["memorial"], .85)
soil = np.zeros_like(weight)
dry = np.zeros_like(weight)
for q in data["quadras"]:
    x0, z0, x1, z1 = q["bounds"]
    u, v = (x - x0) / (x1 - x0), (z - z0) / (z1 - z0)
    mask = (u >= 0) & (u <= 1) & (v >= 0) & (v <= 1)
    ix, iy = np.clip((u * 64).astype(int), 0, 63), np.clip((v * 64).astype(int), 0, 63)
    shade, bare, faded = np.array(q["samples"]).reshape(64, 64, 3)[iy, ix].transpose(2, 0, 1)
    weight = np.maximum(weight, shade * mask)
    soil = np.maximum(soil, bare * mask)
    dry = np.maximum(dry, faded * mask)
# Carry worn grass out along the two actual fields and registered road shoulders.
# The crop meshes and carriageways themselves retain their original materials.
roads = Image.new("L", (SIZE, SIZE))
brush = ImageDraw.Draw(roads)
for r in data["roads"]:
    line = [((a / SPAN + .5) * SIZE, (.5 - b / SPAN) * SIZE) for a, b in r["points"]]
    brush.line(line, fill=255, width=max(1, round((r["width"] + .45) * SIZE / SPAN)))
verges = np.asarray(roads.filter(ImageFilter.GaussianBlur(1.5))) / 255.
field_margins = np.maximum.reduce([polygon(ring, 4) for ring in data["fields"]])
interior = np.clip((SPAN / 2 - np.maximum(np.abs(x), np.abs(z))) / 2, 0, 1)
dry = np.maximum(dry, np.maximum(verges * .7, field_margins * .85) * interior)
# R = canopy/litter, G = bare soil, B = drier grass. No shadow.
cover = np.stack((weight, soil, dry), axis=-1)
path = Path("public/maps/materials/woodland-cover-v1.png")
path.parent.mkdir(exist_ok=True, parents=True)
Image.fromarray(np.rint(cover.clip(0, 1) * 255).astype("uint8")).save(path, optimize=True)
