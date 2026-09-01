# Sol — apply now (Grok analyst notes)

Branch: `feat/commercial-map-arena-br472-roads` (from `origin/main` `6d2bbb10`). **No PR. No commits on `main`.** Fetch before you edit; push so Fable can pull.

**Do not wait.** Geometry is still the old east pitch + Brasília dogleg. Authoritative numbers: `arena-roads/ANALYSIS.md` §§3 and 7. This file is the mechanical patch list.

**02-map green/red is NOT geometry.** Never extrude, stroke, offset, or PNG-trace those marks. Satellite stills: `arena-roads/03-sat-detail.jpg`, `04-sat-br472.jpg`.

---

## 0. Do not touch

```
officialReference2026.ts
  F                 [4900, 2690, 5385, 3130]
  A5                [5974, 3678]
  RUA-BRASILIA      rectPdf([3940, 2440, 3988, 4210])
  RUA-UBIRETAMA     existing east-edge polygon
  RODOVIA-RS-472    existing strip
  RUA-URUGUAI-LESTE rectPdf([3960, 3438, 4510, 3494])

REPLACED_OFFICIAL_ROAD_IDENTIFIERS = ['RUA-UBIRETAMA', 'RODOVIA-RS-472']  // unchanged
P2 [3964, 3700]  P5 [5987, 2000]  P6 [6190.975433526012, 3021.965317919075]
J  [6266.926335827044, 3234.233541884527]
rearParkingSource.ts stall rows — no deletes
```

---

## 1. Field — first (unblocks terrain tests)

### `data/parkEnvironment.ts`

Replace `footballField` with:

```ts
footballField: {
  sourceBounds: [4560, 2708, 4884, 2948] as SourceBounds,
  turfInset: 0.18,
  markingInset: 0,
  turfColor: '#7f9a5c',
  wornColor: '#98a074',
  markings: false,
},
```

Plaza `sourcePolygon` →

```ts
[
  [4116, 2682],
  [4560, 2682],
  [4560, 2948],
  [4888, 2948],
  [4888, 3096],
  [4498, 3100],
  [4116, 3098],
]
```

Walkway `arena-walkway-arena-field` path:

```
[[4520, 2880], [4560, 2830], [4700, 2828]]   // was [[5395, 3180], [5620, 3190], [5850, 3196]]
```

Last four `treeClusters`:

```
[5920, 3188], [5700, 3184], [5480, 3178], [5230, 3172]   // was y≈3260–3265
```

Notes on feature `arena-front-football-field`: unmarked grass **west** of F. Bump `PARK_ENVIRONMENT_REVISION`.

### `components/canvas/ArenaFrontInfrastructure.tsx`

In `FootballField`: if `!ARENA_FRONT_LAYOUT.footballField.markings`, **do not** build/mount `footballFieldLineGeometry` / `marcacoes-campo-arena`. Keep turf + worn apron. Do **not** use the green rectangle as a mesh.

### `data/arenaTerrain.ts`

`FIELD_BLEND`: `0.8` → `0.45`. `FIELD` follows layout (no extra bounds).

### `data/arenaSectorZoning.ts`

Zone auto-follows layout. Bump `ARENA_SECTOR_ZONING_REVISION`. Inflate `EDGE=14` still clears stairs (`4480` vs field `4560`).

### `data/rearParkEnvironment.ts`

`REAR_STRUCTURE_EXCLUSIONS` campo line:

```
[5410, 2800, 5900, 3120]  →  [4560, 2708, 4884, 2948]
```

### `src/test/commercialMapArenaTerrain.test.ts`

```
expect(field.minX).toBeGreaterThan(arena.maxX);   // DELETE
expect(field.maxX).toBeLessThan(arena.minX);      // west of F
expect(field.minX).toBeGreaterThan(sourceBoundsToLocal(ARENA_FRONT_LAYOUT.stairs.sourceBounds).maxX);
expect(ARENA_FRONT_LAYOUT.footballField.markings).toBe(false);
```

Confirm old east centre `[5655, 2960]` is **not** a field plateau (natural terrain).

---

## 2. Roads — `utils/rearSpatialCalibration.ts`

P3 and P4 are **canonical**, not affine dumps. Change `REAR_ATTACHMENT_5_REFERENCE_POINTS`:

```ts
attachment5Point(3, 'Rua Brasília — T com Uruguai Leste', 'brasilia-axis', [53, 46], {
  canonicalSource: [3964, 3466],
}),
attachment5Point(4, 'Rua Ubiretama × acesso A5', 'brasilia-ubiretama-junction', [55, 15], {
  canonicalSource: [5920, 2780],
}),
```

Leave P1/P2/P5/P6 percents and the 2×2 matrix alone.

**Replace** `REAR_CALIBRATED_AXES` (keep `ruaDasEtniasOfficial` + `brasiliaSouthToPoint2`):

```ts
brasiliaPoint2ToPoint3: [
  [3964, 3700], [3964, 3600], [3964, 3466],
],
// DELETE brasiliaPoint3ToUbiretama entirely

ubiretamaPoint5ToBrasilia: [
  [5987, 2000],
  [5987, 2300],
  [5968, 2550],
  [5920, 2780], // P4_NEW — split the array here in the network (two segments)
  [5885, 3000],
  [5750, 3235],
  [5350, 3252],
  [5000, 3240],
  [4700, 3228],
  [4522, 3218],
  [4488, 3280],
  [4488, 3455],
  [4492, 3466], // STOP. No samples with x < 4492.
],

gate5InternalApproach: [
  [5920, 2780], [6040, 2860], [6120, 2940], [6190.975433526012, 3021.965317919075],
],
a5ExternalAccess: [
  [6190.975433526012, 3021.965317919075],
  [6218, 3105], [6244, 3188], [6260, 3226],
  [6266.926335827044, 3234.233541884527],
],
br472NorthToJunction: [
  [6255, 1100], [6258, 1900], [6262, 2600],
  [6258, 3100], [6262, 3195],
  [6266.926335827044, 3234.233541884527],
],
br472JunctionToSouth: [
  [6266.926335827044, 3234.233541884527],
  [6274, 3380], [6285, 3900], [6305, 4400],
],
```

If you keep one Ubiretama array in `REAR_CALIBRATED_AXES`, split it in `rearParkRoadNetwork.ts` at `[5920, 2780]`. Bump `REAR_SPATIAL_CALIBRATION_REVISION`.

**Half-width 18 pt checks (iterate until collision test is `[]`):**

- no sample with `x∈[4020,4490]` and `y∈[3180,3435]` (C1)
- no sample with `y=3155` and `x>4000` (red-X dogleg)
- `x≥4900` ⇒ `y≥3230` (south of F by ≥100 pt)
- north of EST-EXP-VIS `[4510,3220]–[5350,3260]` by ≥8 pt
- west jog `x≤4488` beside C1/parking
- Quadra B min `y=3495` — stay at `y=3466` on the Uruguai band

---

## 3. `data/rearParkRoadNetwork.ts`

`RoadNodeId` add:

```
'ubiretama-gate-junction'   // [5920, 2780]
'ubiretama-uruguai-join'    // [4492, 3466]
```

`nodeSources`:

```
'brasilia-reference-3'            → [3964, 3466]
'brasilia-ubiretama-junction-4'   → unused OR alias of uruguai-join; prefer drop from graph
'ubiretama-gate-junction'         → [5920, 2780]
'ubiretama-uruguai-join'          → [4492, 3466]
```

**DELETE segment** `brasilia-point-3-ubiretama-4`.

Generated Brasília count **2**: `brasilia-south-point-2`, `brasilia-point-2-point-3`.

Ubiretama generated **2**:

| id | from | to | points |
|---|---|---|---|
| `ubiretama-point-5-gate` | `ubiretama-reference-5` | `ubiretama-gate-junction` | P5 → `[5920, 2780]` |
| `ubiretama-gate-uruguai` | `ubiretama-gate-junction` | `ubiretama-uruguai-join` | `[5920, 2780]` → `[4492, 3466]` |

`gate5-internal-approach`: `from: 'ubiretama-gate-junction'` `to: 'gate-5'`.

**Graph-only T** (no second ribbon on Uruguai Leste):

```ts
segment({
  id: 'ubiretama-uruguai-leste-t',
  roadId: 'RUA-UBIRETAMA',
  from: 'ubiretama-uruguai-join',
  to: 'brasilia-reference-3',
  presentation: 'official-surface',  // excluded from GENERATED_REAR_ROAD_SEGMENTS
  sourceControlPoints: [[4492, 3466], [3964, 3466]],
  officialOwnerIdentifier: 'RUA-UBIRETAMA',
  notes: 'Graph T only. Pavement is cadastral RUA-URUGUAI-LESTE. Do not generate a mesh.',
  ...officialRoadDefaults,
})
```

`OWNER_LABEL_SOURCE_ANCHORS['RUA-BRASILIA']` = `[3972, 3000]`.

Degrees: `ubiretama-gate-junction` = 3; `brasilia-reference-3` = 2 (Brasília N–S generated + graph T). `roadGraphHasPath('ubiretama','brasilia')` true via the official-surface edge. `roadGraphPath('brasilia','A5')` goes P2 → P3_NEW → uruguai-join → gate-junction → gate-5 (**not** old `brasilia-ubiretama-junction-4`).

Bump `REAR_PARK_ROAD_REVISION`.

`RoadInfrastructure.tsx`: no new meshes.

---

## 4. Tests — retarget, do not preserve old ratios

### `src/test/commercialMapRearRoadNetwork.test.ts`

| Today | After |
|---|---|
| P3 ≈ `4975.99, 3200.58` | `[3964, 3466]` |
| P4 ≈ `6133.04, 2723.12` | `[5920, 2780]` |
| `directionChangeDegrees(p2,p3,p4) < 5` | **delete** (encoded the dogleg) |
| P4–P6 / P4–P5 ≈ `0.411` | **delete**; assert access polyline P4_NEW → P6 → J |
| `find('brasilia-point-3-ubiretama-4')` | use `brasilia-point-2-point-3`; owner `RUA-BRASILIA` |
| path contains `brasilia-ubiretama-junction-4` | contains `ubiretama-gate-junction` **and** `brasilia-reference-3` |
| Brasília generated `toHaveLength(3)` | **`2`** |
| `degree('brasilia-ubiretama-junction-4') === 3` | `degree('ubiretama-gate-junction') === 3` |
| `arena-zone:football-field` present | keep id; polygon is the **new** west rect |
| `collisions === []` | must stay empty vs C1, F, EST-EXP-VIS, EST-VIS, D3, lots |

Hit-test on the **new** parking-north Ubiretama (e.g. `[5100, 3240]`) must return `RUA-UBIRETAMA`, **not** Brasília.

### `src/test/commercialMapRearRoadGround.test.ts`

Sample `[5500, 3200]` was old Brasília. Move to `[5100, 3240]` (new Ubiretama). Trees still length 20 and clear of ribbons (after §1 tree nudge).

Grep `commercialMapParkEnvironment.test.ts` / `commercialMapRearRoad*.test.ts` for `5410`, `4975`, `6133`, `3155`, `minX > arena.maxX` and fix.

---

## 5. Sequence

1. Field + plaza + no pitch lines + terrain test (east → west).
2. Axes + nodes + drop Brasília east segment. Run collision test; nudge Ubiretama vertices only inside the §2 half-width rules.
3. Trees + ground-integration sample.
4. Affine/collinearity tests.
5. Visual vs `03-sat-detail.jpg`: Brasília west of dome; unmarked grass west of dome; **no** lined pitch east/south; Ubiretama south of F / north of parking; P6 → flared BR T. If it looks like the green sketch extruded, you did it wrong.

Bump revisions listed above. Fetch/push on this branch only.
