# Arena Sicredi / Rua Brasília / Ubiretama / BR-472 — implementation plan

Status: analyst deliverable only. **Do not treat the green/red strokes on `02-map-annotated.jpg` as geometry.** They are draft hints. Green = where a real cadastral/generated centerline should sit after the edit. Red X = current wrong mesh to delete or move. Never extrude, stroke, or re-digitize those sketch marks.

Reference stills (same folder): `01-current-3d.png`, `02-map-annotated.jpg`, `03-sat-detail.jpg`, `04-sat-br472.jpg`.

---

## 0. Hard constraints for the implementer

1. Official search/selection identities stay `RUA-BRASILIA`, `RUA-UBIRETAMA`, `A5`, `RODOVIA-RS-472`. Do not invent `PORTAO-5` entities.
2. Keep official `RUA-BRASILIA` **visible** on the internal N–S axis (Quadra E → D3/Mirante → Q-R-02). It is intentionally **not** in `REPLACED_OFFICIAL_ROAD_IDENTIFIERS`. The rear-road layer only complements it beyond that axis.
3. Keep official `RUA-UBIRETAMA` **hidden** (it remains in `REPLACED_OFFICIAL_ROAD_IDENTIFIERS`); the generated ribbon is the presentation.
4. Do not move Arena `F`, plaza stairs, D3, D1, C1, EST-EXP-VIS, EST-VIS, or lot polygons except the plaza clip in §3.3 required to host the new west field.
5. Road width stays 37 PDF pt for Brasília generated ribbons and 36 PDF pt for Ubiretama (`rearRoadSourceToLocalLength(37|36)`).

---

## 1. Coordinate-system explainer

### 1.1 PDF / source space

All cadastral numbers in this plan are **PDF points** of the official 2026 Illustrator crop used by `officialReference2026.ts`.

```ts
// officialReference2026.ts — OFFICIAL_2026_SOURCE_MANIFEST.parkCropPdf
CROP = { x: 600, y: 900, width: 5500, height: 4150 }
```

- PDF **+x** = east (toward RS-472 / Portão 5).
- PDF **+y** = south (toward Av. dos Imigrantes / Portão 3).
- PDF **−x** = west (Via das Nações, D1, official Rua Brasília).
- PDF **−y** = north (Exporural, Portões 8/9/11).

`rectPdf([x1, y1, x2, y2])` builds an axis-aligned ring `(x1,y1) → (x2,y1) → (x2,y2) → (x1,y2)` with **no y-flip**.

### 1.2 PDF → local 3D (X, Z)

```113:117:src/features/commercial-map/data/officialReference2026.ts
export function officialPdfPointToLocal([x, y]: readonly [number, number]): Coordinate {
  return [
    ((x - CROP.x) / CROP.width) * MAP_REFERENCE_WIDTH - MAP_REFERENCE_WIDTH / 2,
    ((y - CROP.y) / CROP.height) * MAP_REFERENCE_HEIGHT - MAP_REFERENCE_HEIGHT / 2,
  ];
}
```

`MAP_REFERENCE_WIDTH = 120`, `MAP_REFERENCE_HEIGHT = 90.545455` (`constants.ts`). The crop aspect is isotropic:

| Quantity | Value |
|---|---|
| PDF pt / local unit | `5500/120 = 45.8333…` (`SOURCE_POINTS_PER_LOCAL_UNIT`) |
| local units / meter | `0.15` (`EXPORURAL_MAP_UNITS_PER_METER`) |
| PDF pt / meter | `≈ 305.56` |
| 1 local unit | `≈ 6.667 m` |

`sourceBoundsToLocal` in `parkEnvironment.ts` converts a PDF AABB `[x1,y1,x2,y2]` by mapping both corners through `officialPdfPointToLocal` and taking min/max. Returned `minX/maxX` are Three.js **X** (east), `minZ/maxZ` are Three.js **Z** (south). Elevation is a separate Y.

Local X increases with PDF x. Local Z increases with PDF y. There is **no 90° park rotation** in this conversion. The 3D camera in `01-current-3d.png` is an oblique view from the **east** (high X), which is why the pitch-lined field (PDF-east of the dome) appears in the foreground “below” the Arena, and why annotators on `02-map-annotated.jpg` labelled that direction “south”. Trust PDF axes, not the screenshot’s colloquial N/S.

### 1.3 Cadastral anchors (PDF)

| Anchor | PDF | Local (X, Z) | Notes |
|---|---|---|---|
| Arena F | `[4900, 2690, 5385, 3130]` | X 33.82…44.40, Z −6.22…3.38 | ~70.5 m × 64 m |
| Official RUA-BRASILIA | `rectPdf([3940, 2440, 3988, 4210])` | X 12.87…13.92, Z −11.67…26.95 | 48 pt (~7 m) wide N–S strip **west** of the Arena |
| A5 (cadastre) | `[5974, 3678]` | (57.25, 15.34) | diamond gate; **not** the physical vehicle gap |
| P2 Brasília | `[3964, 3700]` | (13.40, 15.82) | still on the official strip |
| P3 (current, **wrong**) | `[4975.99, 3200.58]` | (35.48, 4.92) | south face of Arena — red X |
| P4 Ubiretama T | `[6133.04, 2723.12]` | (60.72, −5.50) | generated Brasília/Ubiretama junction |
| P5 Ubiretama | `[5987, 2000]` | (57.53, −21.27) | official east-edge Ubiretama |
| P6 vehicle A5 | `[6190.98, 3021.97]` | (61.98, 1.02) | physical gate; cadastre A5 stays `[5974, 3678]` |
| BR-472 junction | `[6266.93, 3234.23]` | (63.64, 5.66) | current T, not a trevo |

### 1.4 Neighbours that constrain the corridor

```
PDF x → east
PDF y ↓ south

y≈2440  D3 Mirante [3990,2440,4100,2830] sits immediately east of Brasília
y≈2480  courts [4525–4765, 2480–2640] north-west of Arena
y≈2682  plaza [4116–4888] west of Arena (stage faces west)
y≈2690  Arena west wall x=4900
y≈2800  CURRENT football field [5410,2800,5900,3120] **east** of Arena  ← DELETE
y≈2840  access canopy [4005,2840,4110,3068] between Brasília and stairs
y≈3106  RUA-BRASIL [1640,3106,4510,3181] E–W, ends at x=4510
y≈3130  Arena south wall
y≈3155  CURRENT generated Brasília dogleg (red X) — 25 pt (~3.6 m) south of Arena
y≈3180  C1 Centro de Eventos [4020,3180,4490,3435] blocks any E–W path west of x=4020
y≈3220  EST-EXP-VIS north-west [4510,3220] → [5350,3260]
y≈3400  EST-VIS north [5350,3400]
y≈3678  cadastre A5
y≈4165  Av. dos Imigrantes / Portão 3 (A3 [3935,4219])
x≈6012  RS-472 N–S strip
```

The only E–W gap from the Brasília strip toward Portão 5 that does **not** hit C1 is the ~90 pt band between Arena south (`y=3130`) and C1 north / parking north (`y≈3180–3220`), east of Rua Brasil’s end (`x>4510`). The current ribbon sits on the **arena** side of that band (`y=3155`). The satellite wants it on the **parking** side (`y≈3220–3255`) and wants the N–S Brasília identity to remain west of the Arena (`x≈3940–4000`).

---

## 2. Current state (line-referenced)

### 2.1 Official Rua Brasília — keep

```417:417:src/features/commercial-map/data/officialReference2026.ts
  ['RUA-BRASILIA', 'Rua Brasília', rectPdf([3940, 2440, 3988, 4210])],
```

Rendered by `RoadInfrastructure.tsx` via `isRoadInfrastructureEntity`. `CommercialMapCanvas` circulation filter **retains** this entity (comment at ~4195: internal axis Quadra E → Q-R-02). Tests in `commercialMapRoadInfrastructure.test.ts` require local **x = 13.4** covered at Mirante, Quadra E, Via Expressa, Q-R-02. **Do not replace this rect with the annotated green stroke.**

A slight east bend of the *generated* rear ribbon (a few metres) is allowed south of the Arena; the cadastral rect itself should stay the 48 pt N–S strip so those tests keep passing.

### 2.2 Official Rua Ubiretama — keep polygon, keep replaced

```405:409:src/features/commercial-map/data/officialReference2026.ts
  ['RUA-UBIRETAMA', 'Rua Ubiretama', [
    [5966, 1265], [6008, 1265], [6008, 2080], [5960, 2320],
    [5880, 2570], [5832, 2640], [5800, 2618], [5842, 2550],
    [5920, 2310], [5966, 2070],
  ]],
```

East-edge N–S road of Exporural, ending ~`y=2640`. Presentation is the generated ribbon (`REPLACED_OFFICIAL_ROAD_IDENTIFIERS` includes `RUA-UBIRETAMA`).

### 2.3 Generated rear Brasília — this is the wrong alignment

`utils/rearSpatialCalibration.ts` `REAR_CALIBRATED_AXES`:

**`brasiliaSouthToPoint2`** (OK — stays on official strip):

```
[3964, 3950], [3964, 3800], P2 [3964, 3700]
```

**`brasiliaPoint2ToPoint3`** (RED X — delete the eastward run):

```
P2 [3964, 3700]
[3964, 3500]
[3977, 3350]
[3977, 3155]          ← leaves strip and aims at Arena south
[4400, 3155]          ← RED X, on Rua Brasil y-band, south of plaza
[4800, 3155]          ← RED X, under Arena south wall (Arena y max 3130)
[4860, 3190]
P3 [4975.99, 3200.58] ← RED X, south-centre of Arena
```

**`brasiliaPoint3ToUbiretama`** (RED X where it grazes the pitch):

```
P3 [4975.99, 3200.58]
[5500, 3200]          ← RED X, 80 pt south of current field (field y max 3120)
[5900, 3200]
[6030, 3180]
[6090, 3000]
P4 [6133.04, 2723.12]
```

Wired in `rearParkRoadNetwork.ts` as segments `brasilia-south-point-2`, `brasilia-point-2-point-3`, `brasilia-point-3-ubiretama-4` (`presentation: 'generated-surface'`, `officialOwnerIdentifier: 'RUA-BRASILIA'`).

### 2.4 Generated Ubiretama — does not T into Brasília

**`ubiretamaPoint5ToBrasilia`**:

```
P5 [5987, 2000], [5987, 2100], [5987, 2300], [6010, 2450], [6070, 2600], P4 [6133, 2723]
```

Stays on the east perimeter and dies at P4. It never forms the E–W road south of the Arena that satellite 03 shows teeing into Brasília. The E–W run that *looks* like Ubiretama in the 3D view is currently **labelled Brasília**.

**`gate5InternalApproach`** (P4 → P6) and **`a5ExternalAccess`** (P6 → BR junction) are the Portão 5 bits. Red X marks on `02-map-annotated.jpg` near Portão 5 are the extra kinks where Brasília, Ubiretama and the A5 access currently tangle instead of a clean T plus a short gate approach.

### 2.5 Football field — wrong place, pitch lines, terrain plateau

```150:156:src/features/commercial-map/data/parkEnvironment.ts
  footballField: {
    sourceBounds: [5410, 2800, 5900, 3120] as SourceBounds,
    turfInset: 0.18,
    markingInset: 0.34,
    turfColor: '#7f9a5c',
    wornColor: '#98a074',
  },
```

- PDF-east of Arena F (field min x 5410 > Arena max x 5385). ~71 m × 47 m.
- `arenaTerrain.ts` bakes a **FIELD plateau** (`FIELD_BLEND = 0.8` local ≈ 5.3 m) into `arenaTerrainElevation`. Exported as `ARENA_FOOTBALL_FIELD_BOUNDS` / `ARENA_FIELD_PLATEAU_ELEVATION`.
- `ArenaFrontInfrastructure.tsx` `FootballField` draws apron + turf + **`footballFieldLineGeometry`** (`marcacoes-campo-arena`: touchlines, halfway, centre circle, penalty boxes). No separate goal meshes; the white lines *are* the “marcações” the annotation calls out.
- `arenaSectorZoning.ts` zone `football-field` (`SPORTS_FIELD`) punches this rect out of the natural terrain mesh.
- `rearParkEnvironment.ts` `REAR_STRUCTURE_EXCLUSIONS` duplicates `[5410, 2800, 5900, 3120]`.
- Walkway `arena-walkway-arena-field`: `[[5395, 3180], [5620, 3190], [5850, 3196]]`.
- Test `commercialMapArenaTerrain.test.ts` currently **requires** `field.minX > arena.maxX` (east of the dome). That assertion must reverse.

Satellite 03: there is **no** lined pitch east/south of the dome. South of the dome is dirt/grass. The real grass patch is **west** of the dome, between the building and Rua Brasília, unmarked.

### 2.6 How roads render (two layers)

| Layer | Component | Source | Brasília | Ubiretama | RS-472 |
|---|---|---|---|---|---|
| Cadastral extrusions | `RoadInfrastructure.tsx` | `OFFICIAL_REFERENCE_DATA` polygons | **shown** | hidden via `REPLACED_OFFICIAL_ROAD_IDENTIFIERS` | hidden |
| Generated ribbons | `RearParkRoadNetwork.tsx` | `REAR_CALIBRATED_AXES` polylines | 3 segments | 1 segment | 2 segments + 2 A5 access |

Hit-testing of ribbons maps back to official owners (`resolveRearRoadOwnerAtLocalPoint`).

---

## 3. Proposed geometry (PDF), implement exactly these numbers

Do **not** digitise the green outline. The numbers below are the cadastral/generated paths the green hint was pointing at.

### 3.1 Rua Brasília — stay west of Arena; do not own the east dogleg

**Cadastral (unchanged):**

```ts
['RUA-BRASILIA', 'Rua Brasília', rectPdf([3940, 2440, 3988, 4210])]
```

Keep P2 `[3964, 3700]`. Official Brasília already sits **west** of Arena F, D3, the plaza and EST-EXP-VIS — that *is* the satellite N–S alignment. The green sketch on `02-map-annotated.jpg` is a hint to **keep this strip**, not a second polygon to extrude.

**Why a “slight left bend then to Portão 5” cannot stay labelled Brasília east of x≈4000.** C1 `[4020, 3180, 4490, 3435]` blocks every E–W path from the Brasília strip toward A5 at Arena latitude. The current generated ribbon cheats by sliding along `y=3155` (25 pt / ~3.6 m south of the dome) — that is the red X. The satellite E–W road south of the Arena is **Ubiretama** (§3.2). Brasília’s generated identity stops at the T with that road.

**Delete these PDF vertices** (red X):

```
[3977, 3155], [4400, 3155], [4800, 3155], [4860, 3190]
[5500, 3200], [5900, 3200]
P3_OLD [4975.99, 3200.58]
P4_OLD [6133.04, 2723.12] as a Brasília node
```

**Authoritative generated Brasília polylines** (also in §7):

```ts
brasiliaSouthToPoint2: [
  [3964, 3950], [3964, 3800], [3964, 3700], // P2
],
brasiliaPoint2ToPoint3: [
  [3964, 3700], [3964, 3600], [3964, 3466], // P3_NEW, T with RUA-URUGUAI-LESTE / Ubiretama
],
// DELETE array brasiliaPoint3ToUbiretama and segment brasilia-point-3-ubiretama-4
```

Generated Brasília segment count: **2** (tests today expect 3). Label anchor `OWNER_LABEL_SOURCE_ANCHORS['RUA-BRASILIA']`: **`[3972, 3000]`** (west of Arena, on the live strip).

Topology at P3_NEW `[3964, 3466]`:

- North = official + generated Brasília toward Exporural / D3.
- South = official Brasília to Av. Imigrantes / A3 (cadastral rect already reaches `y=4210`).
- East = Ubiretama via official Rua Uruguai Leste, then the generated east ribbon (§3.2). Do not generate a second ribbon on top of Uruguai Leste (`x=3964–4492`).

### 3.2 Rua Ubiretama — E–W south of Arena, T into Brasília, no Portão 5 spaghetti

**Cadastral polygon: unchanged** (Exporural east edge). Generated ribbon replaces it.

C1 `[4020, 3180, 4490, 3435]` forbids any E–W ribbon at Arena latitude between Brasília and the parking. Do **not** continue west from the parking NW corner through C1 or along `y=3155` (red X). Jog **south of C1**, then hand off to official **Rua Uruguai Leste** (`rectPdf([3960, 3438, 4510, 3494])`) which already T’s into official Brasília. Generated Ubiretama therefore **ends at `[4492, 3466]`**, not at `x=3964`.

Parking north edge (do not enter): `[4510, 3220] → [5350, 3260]`. Parking west edge: `x=4510`. Stay ≥ 18 pt outside.

**Authoritative generated Ubiretama polyline:**

```ts
ubiretamaPoint5ToBrasilia: [
  [5987, 2000], // P5
  [5987, 2300],
  [5968, 2550],
  [5920, 2780], // P4_NEW, fork to A5
  [5885, 3000],
  [5750, 3235], // south of Arena (3130) by ≥ 100 pt once east of x=4900
  [5350, 3252], // north of parking NE [5350, 3260]
  [5000, 3240],
  [4700, 3228],
  [4522, 3218], // parking NW, north of [4510, 3220]
  [4488, 3280], // west of parking (x=4510) and west of C1 max (x=4490)
  [4488, 3455], // south of C1 (y=3435)
  [4492, 3466], // join official RUA-URUGUAI-LESTE; STOP. Do not ribbon x<4492.
],
```

Graph node for the Brasília T (`brasilia-reference-3`) sits at P3_NEW `[3964, 3466]` on official geometry. Generated Ubiretama mesh stops at `[4492, 3466]`.

Half-width 18 pt checks:

- `x ≤ 4488` along the C1/parking west jog.
- north of `[4510, 3220]–[5350, 3260]` by ≥ 8 pt.
- `y ≥ 3230` for `x ≥ 4900` (≈ 14.5 m south of Arena; was 3.6 m).
- Quadra B min `y=3495` — west jog at `y=3466` is 29 pt north; OK.

Insert node `ubiretama-gate-junction` at P4_NEW `[5920, 2780]` (degree 3: Ubiretama both ways + A5 access). P3_NEW `[3964, 3466]` is the Brasília T (official streets). `roadGraphHasPath('ubiretama', 'brasilia')` stays true via that node coincidence or a logical graph edge without a second mesh.

**Portão 5 connectors**

P4_NEW `[5920, 2780]` is on the Ubiretama centerline (not the old affine dump at `[6133, 2723]`). Gate access branches there:

```ts
gate5InternalApproach: [
  [5920, 2780], // P4_NEW
  [6040, 2860],
  [6120, 2940],
  [6190.98, 3021.97], // P6 unchanged
],
a5ExternalAccess: [
  [6190.98, 3021.97], // P6
  [6218, 3105],
  [6244, 3188],
  [6260, 3226],
  [6266.93, 3234.23], // existing BR junction
],
```

**Delete** the old P4→P6 kinks `[6142, 2800], [6160, 2920]` if they are unused. Do not add extra dangling connectors at the green-circled trevo; two access segments remain (`ACESSO-A5-BR472` count stays 2).

**BR-472 trevo (cloverleaf-ish, light)**

Keep the two highway segments. Shape the junction as a shallow trevo by inserting curve samples on `a5ExternalAccess` (above) and a matching flare on `br472NorthToJunction` / `br472JunctionToSouth`:

```ts
br472NorthToJunction: [
  [6255, 1100], [6258, 1900], [6262, 2600],
  [6258, 3100], [6262, 3195],
  [6266.93, 3234.23],
],
br472JunctionToSouth: [
  [6266.93, 3234.23],
  [6274, 3380], [6285, 3900], [6305, 4400],
],
```

Do **not** add a third highway identity. Full loop ramps would violate the existing “2 highway + 2 access” tests and the BR/internal footprint separation test; a flared T is enough to read as a trevo at map scale.

### 3.3 Unmarked west grass field — add; lined east field — remove

**Remove** `sourceBounds: [5410, 2800, 5900, 3120]` and every consumer listed in §4.

**Add** a small unmarked pitch **west of the dome**, between Arena west wall (`x=4900`) and the stairs/plaza civic strip. Stairs end `x=4480`. Plaza currently covers this whole west face; clip it.

**Field rect (authoritative):**

```ts
footballField: {
  sourceBounds: [4560, 2708, 4884, 2948] as SourceBounds,
  turfInset: 0.18,
  markingInset: 0,          // unused if lines are not built
  turfColor: '#7f9a5c',
  wornColor: '#98a074',
  markings: false,          // new flag; FootballField must not call footballFieldLineGeometry
}
```

| | PDF | Local | Metres |
|---|---|---|---|
| bounds | `[4560, 2708, 4884, 2948]` | X 26.40…33.47, Z −5.83…−0.59 | **47.1 × 34.9** |
| centre | | (29.93, −3.21) | west of Arena centre x=39.11 |

Clearances:

- Arena west `x=4900` − field max `x=4884` = 16 pt (~3.5 m) grass margin.
- Stairs east `x=4480` − field min `x=4560` = 80 pt (~17.5 m) still plaza/stairs.
- D3 / canopy / Brasília / D1: no overlap.
- Courts: north of plaza, no overlap.
- New field is **west** of Arena (`maxX < arena.minX`), matching satellite 03 and the green rectangle on `02-map-annotated.jpg`.

**Plaza clip** (`ARENA_FRONT_LAYOUT.plaza.sourcePolygon` currently):

```
[4116, 2682], [4888, 2682], [4888, 3096], [4498, 3100], [4116, 3098]
```

Replace with a ring that yields the west civic square and the south apron, cutting out the field:

```
[4116, 2682],
[4560, 2682],
[4560, 2948],
[4888, 2948],
[4888, 3096],
[4498, 3100],
[4116, 3098]
```

Update `PARK_ENVIRONMENT_FEATURES` entry `arena-front-public-plaza` `sourceBounds` AABB to `[4116, 2682, 4888, 3100]` (unchanged envelope) — the hole is the polygon, not the AABB.

**Render rules for the new field:**

- Keep turf + worn apron meshes.
- **Do not** create `lineSegments` / `footballFieldLineGeometry`.
- **Do not** add goals, nets, or corner flags.
- Rename group `campo-futebol-arena` → keep id `arena-front-football-field` so userData/classification stay `SPORTS_FIELD`.

**Walkway:** replace `arena-walkway-arena-field` with a short path from plaza/stairs to the new field:

```
[[4520, 2880], [4560, 2830], [4700, 2828]]
```

Delete the old `[[5395, 3180], [5620, 3190], [5850, 3196]]`.

### 3.4 Terrain plateau cleanup (`arenaTerrain.ts`)

Today:

```ts
const FIELD = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.footballField.sourceBounds);
const FIELD_BLEND = 0.8;
export const ARENA_FIELD_PLATEAU_ELEVATION = …slope at FIELD centre…
export function arenaTerrainElevation(x, z) {
  // blends natural slope toward ARENA_FIELD_PLATEAU_ELEVATION within FIELD_BLEND of FIELD
}
```

After the move:

1. `FIELD` automatically follows the new `sourceBounds` via `ARENA_FRONT_LAYOUT`.
2. Cut `FIELD_BLEND` to **0.45** local (~3 m). The west pocket sits next to the stair slope; a 0.8 blend would flatten the civic apron.
3. Keep `ARENA_FOOTBALL_FIELD_BOUNDS = FIELD` (tests + `FootballField` position).
4. Confirm `arenaTerrainPlateauElevation` for the courts still ≈ `ARENA_TERRAIN_BASE_ELEVATION` (courts stay east of the stairs, away from the new field).
5. Natural terrain must **grow back** over `[5410, 2800, 5900, 3120]` once the zoning hole is gone — that is the dirt/grass south-east of the dome on satellite 03.

`createTerrainGeometry` already drops triangles whose centroid is `isArenaTerrainExcluded`. Moving the `football-field` zone is sufficient; no extra shader work.

### 3.5 Trees on the old Brasília shoulder

`ARENA_FRONT_LAYOUT.treeClusters` last four (comment: “shifted to the grass shoulder of corrected Rua Brasília”):

```
[5920, 3265], [5700, 3265], [5480, 3260], [5230, 3260]
```

The new Ubiretama runs ~`y=3228–3252` here. `commercialMapRearRoadGround.test.ts` requires every canopy `distanceToPath > halfWidth + scale*0.3`. Nudge **north** onto the freed Arena-south grass (old field gone):

```
[5920, 3188], [5700, 3184], [5480, 3178], [5230, 3172]
```

Keep count = 20. Do not plant in EST-EXP-VIS.

### 3.6 Rear environment exclusion

`rearParkEnvironment.ts` `REAR_STRUCTURE_EXCLUSIONS` line “campo de futebol”:

```
[5410, 2800, 5900, 3120]  →  [4560, 2708, 4884, 2948]
```

---

## 4. Per-file edit list

### 4.1 Must change (geometry)

| File | Symbol | Change |
|---|---|---|
| `data/parkEnvironment.ts` | `ARENA_FRONT_LAYOUT.footballField` | bounds `[4560, 2708, 4884, 2948]`; `markingInset: 0`; add `markings: false`; rewrite comment (west of F, unmarked). |
| `data/parkEnvironment.ts` | `plaza.sourcePolygon` | clip per §3.3. |
| `data/parkEnvironment.ts` | `walkways` `arena-walkway-arena-field` | new path §3.3. |
| `data/parkEnvironment.ts` | `treeClusters` last 4 | §3.5. |
| `data/parkEnvironment.ts` | `PARK_ENVIRONMENT_FEATURES` `arena-front-football-field` | notes: unmarked, west of Arena; `sourceBounds` follows layout. |
| `data/arenaTerrain.ts` | `FIELD_BLEND` | `0.8` → `0.45`. Plateau follows new `FIELD`. No other formula change. |
| `data/arenaSectorZoning.ts` | zone `football-field` | auto-follows layout; bump `ARENA_SECTOR_ZONING_REVISION`. Confirm inflate (`EDGE=14`) does not eat the stairs (`x=4480` vs field `x=4560`; 80 pt > 14). |
| `utils/rearSpatialCalibration.ts` | `REAR_ATTACHMENT_5_REFERENCE_POINTS` P3, P4 | P3 → `[3964, 3466]` (`canonicalSource`, like P1). P4 → `[5920, 2780]`. **P2, P5, P6 percents/affine stay.** Drop the “P2–P3–P4 collinear < 5°” test — it encoded the Arena-hugging bug. |
| `utils/rearSpatialCalibration.ts` | `REAR_CALIBRATED_AXES` | rewrite `brasiliaPoint2ToPoint3`, **remove** `brasiliaPoint3ToUbiretama` (or leave unused and stop referencing it). Rewrite `ubiretamaPoint5ToBrasilia`, `gate5InternalApproach`, light trevo samples on `a5ExternalAccess` / BR arrays (§3.2). Bump `REAR_SPATIAL_CALIBRATION_REVISION`. |
| `data/rearParkRoadNetwork.ts` | `REAR_PARK_ROAD_NETWORK` | Drop segment `brasilia-point-3-ubiretama-4`. Keep two Brasília generated segments. Ubiretama `from: 'ubiretama-reference-5'` `to: 'brasilia-ubiretama-junction-4'` now ends at P3_NEW/P4_NEW as wired. `gate5-internal-approach` `from` stays the junction node that sits on Ubiretama near `[5920, 2780]`. Bump `REAR_PARK_ROAD_REVISION`. Update `OWNER_LABEL_SOURCE_ANCHORS['RUA-BRASILIA']` to `[3972, 3000]`. |
| `data/rearParkRoadNetwork.ts` | node sources | `brasilia-ubiretama-junction-4` must use P4_NEW; `brasilia-reference-3` uses P3_NEW. Graph: Ubiretama degree at the Brasília T is 1 (terminus). Degree at P4_NEW (Ubiretama × A5 access) is 3 (Ubiretama both ways + gate approach) **or** 2 if Ubiretama is one segment P5→P3_NEW and gate branches at a new node. Prefer **inserting a node `ubiretama-gate-junction` at `[5920, 2780]`** so P3_NEW is a 2-degree T (Brasília N–S + Ubiretama east) and the gate node is the 3-degree fork. That matches satellite better than overloading one id. |
| `data/rearParkEnvironment.ts` | `REAR_STRUCTURE_EXCLUSIONS` | field rect §3.6. |
| `components/canvas/ArenaFrontInfrastructure.tsx` | `footballFieldLineGeometry`, `FootballField` | skip line mesh when `!ARENA_FRONT_LAYOUT.footballField.markings`. Keep turf/apron. |

### 4.2 Official cadastral — do **not** change unless visual QA demands it

| File | Symbol | Guidance |
|---|---|---|
| `data/officialReference2026.ts` | `RUA-BRASILIA` | **Keep** `rectPdf([3940, 2440, 3988, 4210])`. |
| `data/officialReference2026.ts` | `RUA-UBIRETAMA` | **Keep** existing polygon. Generated ribbon is the extension. |
| `data/officialReference2026.ts` | `A5` | **Keep** `[5974, 3678]`. Physical gap stays P6. |
| `data/officialReference2026.ts` | `RODOVIA-RS-472` | **Keep**. Generated highway is the presentation. |

### 4.3 Tests that will fail and how to retarget

| File | Today | After |
|---|---|---|
| `src/test/commercialMapArenaTerrain.test.ts` | `field.minX > arena.maxX`; plateau samples on east field | `field.maxX < arena.minX`; `field.minX > stairs.maxX`; still no overlap with courts; plateau samples on **new** bounds; `markings === false` or no line geometry. |
| `src/test/commercialMapRearRoadNetwork.test.ts` | P3 ≈ `[4975.99, 3200.58]`; P4 ≈ `[6133.04, 2723.12]`; `directionChangeDegrees(p2,p3,p4) < 5`; Brasília generated `toHaveLength(3)`; path `brasilia-reference-2 → 3 → junction-4 → gate-5`; `arena-zone:football-field` still present | P3 = `[3964, 3466]`; P4 = `[5920, 2780]`; P2–P3 collinear on `x=3964`; Brasília generated length **2**; `gate-5` reachable via Ubiretama + access, **not** a Brasília east dogleg; football-field zone id **remains** (new polygon). Collision test must stay `collisions === []` against C1, F, EST-EXP-VIS, EST-VIS, D3, lots. |
| `src/test/commercialMapRearRoadGround.test.ts` | ray sample `[5500, 3200]` on **old** Brasília; 20 trees clear of ribbons | move sample to a point on the **new** Ubiretama, e.g. `[5100, 3240]`; trees §3.5 still 20 and clear. |
| `src/test/commercialMapRoadInfrastructure.test.ts` | official Brasília covers x=13.4 | unchanged if cadastral rect kept. |
| `src/test/commercialMapParkEnvironment.test.ts` | stairs/courts vs F, Rua Brasil, D3 | new field must not overlap F, D3, D1, C1, RUA-BRASILIA, RUA-BRASIL, courts, stairs. Add an assertion `footballField[2] < 4900`. |
| `src/test/commercialMapRearRoadNetwork.test.ts` (affine block) | P6 / satellite direction change / P4–P6 vs P4–P5 ratio `≈ 0.411` | recompute after P4 move; **do not** preserve the 0.411 ratio — it encoded the old affine dump. Replace with distances to P6 along the new access polyline. |

### 4.4 Touchpoints that only need a sanity read (likely no code)

- `components/canvas/RoadInfrastructure.tsx` — still draws official Brasília.
- `components/canvas/CommercialMapCanvas.tsx` — `REPLACED_OFFICIAL_ROAD_IDENTIFIERS` list unchanged (`RUA-UBIRETAMA`, `RODOVIA-RS-472` only).
- `data/rearParkingSource.ts` / `data/rearParking.ts` — do not move stalls; new Ubiretama must miss `rear-parking-row:*` exclusions.
- `data/quadrasABEnvironment.ts` — Quadras A/B `[4020, 3495–4165]` sit **south** of the new T `y=3476` by ~20 pt; keep the ribbon north of Quadra B (`y≤3476` vs Quadra B min 3495). Half-width 18 pt is OK.
- `utils/landmarks.ts` / `commercialMapStrategicLandmarks.test.ts` — Brasília vs B11/B12 relations use official rect; unchanged.
- `openGroundTextures.ts` `pitchTurf` — still used for unmarked turf; OK.
- Draw-call budget `ARENA_FRONT_PRIMARY_DRAW_CALL_BUDGET = 18` — removing line segments **helps**.

Grep confirmation (all `src/` consumers of the old field / names):

- `ARENA_FOOTBALL_FIELD_BOUNDS` — `arenaTerrain.ts`, `ArenaFrontInfrastructure.tsx`, `commercialMapArenaTerrain.test.ts`
- `footballField` — `parkEnvironment.ts`, `arenaTerrain.ts`, `arenaSectorZoning.ts`, `ArenaFrontInfrastructure.tsx`
- `RUA-BRASILIA` / `RUA-UBIRETAMA` — official reference, rear road network/environment, quadras AB, exporural identifiers, several tests
- `A5` / Portão 5 — `officialReference2026.ts` line 508, `rearSpatialCalibration.ts`, `rearParkRoadNetwork.ts`, presentation tests (`resolveGateAccessMode`)

---

## 5. Risks

1. **Terrain blend vs stairs/plaza.** New field is upslope of the Arena apron. `FIELD_BLEND = 0.45` and the plaza clip must keep the stair treads on `arenaStairTreadElevation`. Re-run `commercialMapArenaTerrain.test.ts` monotonic stair test.
2. **C1 / EST-EXP-VIS / Quadra B.** Any E–W shortcut at `y≈3155–3230` and `x∈[4020,4510]` hits C1. The south-of-C1 jog is mandatory. Parking north edge is sloped; stay ≥ 8 pt outside the EST-EXP-VIS ring.
3. **Double pavement.** Official Brasília remains extruded at `x=3940–3988`. Generated Brasília on the same strip will overlap (already true today south of P2). Do not also generate a ribbon on Rua Brasil or Rua Uruguai Leste — the Ubiretama jog uses `y=3476` which is **Rua Uruguai Leste’s band** (`[3960, 3438, 4510, 3494]`). That official street is **not** replaced. Overlap with Uruguai Leste from `x=3964–4510` at `y=3476` will double-pave ~36 pt of width inside a 56 pt official street. **Mitigation:** snap Ubiretama’s west jog onto Uruguai Leste’s centreline `y=3466` and **omit** generated samples between `x=3964` and `x=4492`, letting the cadastral street be the T. Generated Ubiretama then **ends at `[4492, 3466]`**, T-visual via Uruguai Leste → Brasília. Update P3_NEW to `[3964, 3466]` only as a **graph node** coincident with official geometry, without a generated Brasília/Ubiretama segment on top of Uruguai Leste.
4. **Football-field consumers.** If any overlay still assumes east-of-Arena (`minX > arena.maxX`), it will fail. Grep again after edits.
5. **Attachment-5 affine story.** P3/P4 today are dumps of `projectRearAttachment5InteriorPercentToOfficialSource`. Moving them means they are no longer interior-affine. Set `canonicalSource` (as P1 already does) and document the satellite/cadastral override in `REAR_SPATIAL_CALIBRATION_REVISION`. Do not retune the 2×2 matrix just to force P3 onto the Arena south face — that matrix is what created the bug.
6. **Tree / ribbon test.** Four shoulder trees plus rear-park procedural trees (`buildRearTreeInstances`) must miss the new Ubiretama. Rear filter already ignores official Brasília/Ubiretama/RS-472 polygons; it still respects generated corridors.
7. **Green sketch.** If a debug overlay or “trace PNG” helper is added during implementation, it must not ship. Final meshes come only from the PDF numbers in §3.
8. **Label “Rua Brasília” on the east dogleg.** After dropping `brasilia-point-3-ubiretama-4`, `resolveRearRoadOwnerAtLocalPoint` along the parking-north ribbon must return `RUA-UBIRETAMA`, not Brasília.

---

## 6. Suggested implementer sequence

1. Move `footballField.sourceBounds`, clip plaza, kill pitch lines, retarget terrain test (east → west). Confirm old plateau vanishes at `[5655, 2960]` (centre of old field).
2. Rewrite `REAR_CALIBRATED_AXES` + nodes; drop Brasília east segment; run rear-road **collision** test and iterate vertices until `collisions === []`.
3. Shift four trees; fix ground-integration sample point.
4. Relax/rewrite affine/collinearity tests; keep P2/P5/P6/A5 cadastre stable.
5. Visual check vs `03-sat-detail.jpg` / `04-sat-br472.jpg`: Brasília west of dome; small unmarked grass west of dome; no lined pitch east; Ubiretama T at Brasília/Uruguai; clean P6 → BR flare.

---

## 7. Authoritative numbers (copy-paste)

```ts
// Official (do not edit)
RUA_BRASILIA_RECT = [3940, 2440, 3988, 4210]
ARENA_F          = [4900, 2690, 5385, 3130]
A5_CADASTRE      = [5974, 3678]
P2               = [3964, 3700]
P5               = [5987, 2000]
P6               = [6190.975433526012, 3021.965317919075]
BR472_JUNCTION   = [6266.926335827044, 3234.233541884527]

// Delete (red X)
P3_OLD = [4975.9927745664745, 3200.5780346820807]
P4_OLD = [6133.044315992293, 2723.121387283237]
BRASILIA_DOGLEG = [[3977, 3155], [4400, 3155], [4800, 3155], [4860, 3190], [5500, 3200], [5900, 3200]]
OLD_FIELD       = [5410, 2800, 5900, 3120]

// Add / move
P3_NEW = [3964, 3466]          // graph T with official RUA-BRASILIA × RUA-URUGUAI-LESTE
P4_NEW = [5920, 2780]          // Ubiretama × A5 access
NEW_FIELD = [4560, 2708, 4884, 2948]
PLAZA_CLIP_EXTRA_VERTEX_PAIR = [[4560, 2682], [4560, 2948], [4888, 2948]] // see §3.3 ring
```
