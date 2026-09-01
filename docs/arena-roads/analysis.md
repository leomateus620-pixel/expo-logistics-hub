# Arena BR-472 — geometry analysis (do not implement from the sketch)

Branch: `feat/commercial-map-arena-br472-roads`
Analyst revision: `2026.9-arena-br472-analyst.1`
Base commit at analysis: `6d2bbb10` (`main`)
Coordinate space: official 2026 PDF points (`officialPdfPointToLocal`), crop `{ x: 600, y: 900, width: 5500, height: 4150 }`.

This file records deletions and satellite diagnosis. **Copy-paste polylines, P3/P4, plaza clip and field bounds for the implementer are in `arena-roads/ANALYSIS.md` §§3 and 7** (same branch). Where this file and that file disagree, **`arena-roads/ANALYSIS.md` wins**, except the sketch rule in §0 here still applies.

Withdrawn after reconciliation (do not implement from this file):

- Ubiretama as a straight `[3964, 3700] → [5974, 3678]` through EST-EXP-VIS — hits C1 / parking worse than the south-of-C1 jog onto `RUA-URUGUAI-LESTE` in ANALYSIS.md §3.2.
- Moving P6 / `br472Junction` to A5 latitude `[…, 3678]` — keep P6 `[6190.98, 3021.97]` and J `[6266.93, 3234.23]`; only flare the trevo.
- Field `[4708, 2772, 4880, 3048]` — use ANALYSIS.md `[4560, 2708, 4884, 2948]` unless visual QA vs `03-sat-detail.jpg` needs a smaller wall-hugging rect (then shrink toward 4708–4880 without crossing stairs `x=4480` or F `x=4900`).

Agreed deletions (both docs): east marked pitch `[5410, 2800, 5900, 3120]`; Brasília dogleg from `[4400, 3155]` through old P3/P4; pitch-line meshes; walkway `arena-walkway-arena-field` old path. Cadastral `F`, `A5`, `RUA-BRASILIA` rect stay.

## 0. Critical: green / red markings are not geometry

`docs/arena-roads/02-map-annotated.jpg` (and the live 3D screenshot `02-map-screenshot.png`) contain **draft sketch annotations only**.

| Marking | Meaning | Implementer rule |
| --- | --- | --- |
| **GREEN** lines / box | Hint of where the correct asphalt / grass should *sit* | **NEVER** digitise, extrude, offset, or add as a mesh |
| **RED X** | Sketch of current *wrong* geometry to move or remove | Delete or reroute the **code** arrays named below — do not draw the X |

Real asphalt, parking and grass must match the **satellite** photos:

- `docs/arena-roads/01-sat-overview.jpg` — Portão 5 / BR-472 trevo, Rua Brasília N–S west of the arena, Campo west of the arena
- `docs/arena-roads/03-sat-detail.jpg` — high-res: Brasília west of F, Ubiretama E–W south, dirt (no pitch) south of F, small grass west of F

The 02-map sketch is a position hint in screen space. If sketch and satellite disagree, **satellite wins**.

## 1. Cadastral anchors — do not move

Keep these official entities. Search, selection, persistence and IDs stay as they are.

| Entity | Source | PDF |
| --- | --- | --- |
| Arena Sicredi `F` | `officialReference2026.ts` `namedStructures` | `[4900, 2690, 5385, 3130]` |
| Portão 5 `A5` | `officialReference2026.ts` `['A5', …, [5974, 3678]]` | `[5974, 3678]` (entity centre) |
| `RUA-BRASILIA` | `roadInputs` `rectPdf([3940, 2440, 3988, 4210])` | N–S strip, **west of F** |

PDF convention used throughout this document (matches `officialPdfPointToLocal` and the comments in `parkEnvironment.ts`):

- **+X = east**, **−X = west**
- **+Y = south**, **−Y = north**
- Local scene: `localX = ((pdfX - 600) / 5500) * 120 - 60`, `localZ = ((pdfY - 900) / 4150) * 90.545455 - 45.2727275`
- Scale: `EXPORURAL_SOURCE_UNITS_PER_METER = 6.875` (1 m ≈ 6.875 PDF)

`F` in local: centre `[39.1091, -1.4182]`, west wall `x = 33.8182`, east wall `x = 44.4000`, north `z = -6.2182`, south `z = 3.3818`.

`A5` local: `[57.2509, 15.3382]`.

`RUA-BRASILIA` local strip: `x ∈ [12.8727, 13.9200]`, `z ∈ [-11.6727, 26.9455]`.

## 2. What the satellites show (required result)

North-up reading of `03-sat-detail.jpg` + `01-sat-overview.jpg`:

1. **Rua Brasília** is a N–S asphalt road **west of Arena F**. It runs through / along the paved apron north of the arena, passes the west side of the small grass field, continues south, and meets an E–W street, then the BR-472 trevo / Portão 5.
2. **Slight curve:** as Brasília passes the northern paved extension it bows **slightly west** (away from F), then straightens. That is the satellite “slight left” — **not** an eastward 90° turn under the arena.
3. **Rua Ubiretama** is E–W **south of F**, with a dirt/gravel buffer between the south wall and the asphalt. It four-way-intersects Brasília west-south of F and continues east.
4. **South of F:** dirt / worn grass. **No soccer pitch, no penalty box, no centre circle.**
5. **West of F:** a **small rectangular grass field**. Satellite shows faint lines; the required 3D field is **unmarked** (no pitch lines, no `pitchTurf` markings).
6. **Portão 5 / BR-472 trevo:** south of the Brasília × Ubiretama four-way, where Brasília / the access meets the highway ramps (`01-sat-overview.jpg` green circle). Cadastral `A5` stays at `[5974, 3678]`; only the **vehicle-access presentation** may move, as the current P6 split already does.

## 3. What the code draws today (mismatch)

### 3.1 Marked soccer pitch — DELETE (this is the red-X field)

`ARENA_FRONT_LAYOUT.footballField.sourceBounds = [5410, 2800, 5900, 3120]`

| | PDF | Local | Metres (6.875 PDF/m) |
| --- | --- | --- | --- |
| Bounds | `[5410, 2800, 5900, 3120]` | `x [44.9455, 55.6364]`, `z [-3.8182, 3.1636]` | 71.3 × 46.5 m |
| Centre | `[5655, 2960]` | `[50.2909, -0.3273]` | |

This rectangle sits **immediately east of F** (F east edge `5385`; field west edge `5410`). Tests currently **require** that (`commercialMapArenaTerrain.test.ts`: `field.minX > arena.maxX`).

In `02-map-annotated.jpg` / `02-map-screenshot.png` the marked pitch reads as “behind / south” of the vault because `SicrediArena` aligns the barrel vault to the **wider PDF-X** side and the open front faces **+Z (PDF south)**. Typical cameras look from the south-east, so the east pitch sits beside the vault and is captioned “south”. **There is no second pitch south of F.** Do not add one. Satellite `03-sat-detail.jpg` has dirt south of F and grass **west** of F.

Drawn by `FootballField` in `ArenaFrontInfrastructure.tsx`:

- group `campo-futebol-arena`
- meshes `borda-desgastada-campo-arena`, `gramado-campo-arena`
- **`lineSegments` `marcacoes-campo-arena`** ← white pitch lines (must not exist on the replacement)
- texture profile `'pitchTurf'`

Also wired to:

- `parkEnvironment.ts` feature `arena-front-football-field`
- `arenaTerrain.ts` `FIELD` / `ARENA_FOOTBALL_FIELD_BOUNDS` / plateau blend
- `arenaSectorZoning.ts` zone `'football-field'`
- `rearParkEnvironment.ts` `REAR_STRUCTURE_EXCLUSIONS` `[5410, 2800, 5900, 3120]`
- walkway `arena-walkway-arena-field` `[[5395, 3180], [5620, 3190], [5850, 3196]]`
- tree-cluster comment “moldura do campo” at `[5440, 2660]` … `[5930, 3050]`
- exclusion id `arena-zone:football-field` (`commercialMapRearRoadNetwork.test.ts`)

### 3.2 Wrong Brasília — DELETE these control points (red-X road)

Official `RUA-BRASILIA` `rectPdf([3940, 2440, 3988, 4210])` is **already** the correct N–S corridor west of F. `REPLACED_OFFICIAL_ROAD_IDENTIFIERS` does **not** hide it, so `RoadInfrastructure.tsx` still extrudes that rectangle.

The red-X asphalt in the 3D view is the **generated overlay** that **leaves** that corridor.

`REAR_CALIBRATED_AXES.brasiliaPoint2ToPoint3` in `rearSpatialCalibration.ts`:

```text
P2 [3964, 3700]          ← still on cadastral Brasília (keep)
[3964, 3500]             ← still on cadastral Brasília (keep)
[3977, 3350]             ← still near cadastral Brasília
[3977, 3155]             ← last on-corridor point
[4400, 3155]             ← DELETE  east dogleg, south of F / north of C1
[4800, 3155]             ← DELETE
[4860, 3190]             ← DELETE
P3 [4975.9928, 3200.578] ← DELETE  south-east corner of F
```

Local of the dogleg: `[4400, 3155] → [22.9091, 3.9273]`, `[4800, 3155] → [31.6364, 3.9273]`. That is a ~7 m gap between F south wall `y = 3130` and C1 north `y = 3180`. It is the road that runs **along the south face of the arena** in `02-map-annotated.jpg`.

Then `brasiliaPoint3ToUbiretama` **continues east as Brasília** (it must not):

```text
P3 [4975.9928, 3200.578]
[5500, 3200]   ← DELETE  (local [46.9091, 4.9091]) — south of the marked pitch
[5900, 3200]   ← DELETE  (local [55.6364, 4.9091])
[6030, 3180]   ← DELETE
[6090, 3000]   ← DELETE
P4 [6133.0443, 2723.1214]  ← DELETE as Brasília/Ubiretama junction
```

P4 local `[60.7210, -5.4955]` is **east of F and at F’s north latitude**. Satellite Portão 5 / Brasília × Ubiretama is **west-south** of F, not here.

Segments in `rearParkRoadNetwork.ts` that consume those arrays:

| Segment id | Action |
| --- | --- |
| `brasilia-south-point-2` | Keep (P2 is on cadastral Brasília at `[3964, 3700]`) |
| `brasilia-point-2-point-3` | Rewrite control points — N–S only, west of F |
| `brasilia-point-3-ubiretama-4` | **Delete as Brasília.** Do not keep an east–west Brasília |

`rearParkRoadNetwork.ts` still labels P3 as the Brasília contextual-label anchor (`OWNER_LABEL_SOURCE_ANCHORS['RUA-BRASILIA']`). After the rewrite, point the label at a west-of-F point (proposed P3′ below).

### 3.3 Wrong Ubiretama — DELETE / replace

Generated `ubiretamaPoint5ToBrasilia`:

```text
P5 [5987, 2000]          ← official east-side Ubiretama latitude (north of F)
[5987, 2100]
[5987, 2300]
[6010, 2450]
[6070, 2600]
P4 [6133.0443, 2723.1214] ← fake junction east of F
```

This is **not** the satellite E–W street south of F. It is also the overlay that **hides** official `RUA-UBIRETAMA` (`REPLACED_OFFICIAL_ROAD_IDENTIFIERS`).

Official `RUA-UBIRETAMA` polygon (`officialReference2026.ts` `roadInputs`) is N–S on the **east** park edge, `x ≈ 5800–6008`, `y = 1265–2640` (along Quadra R / Gustavo Bessel). That cadastral stretch is a different physical street from Google’s E–W Ubiretama south of the arena. Restore the official polygon (stop replacing it) **and** add a **new generated E–W** presentation for the satellite south street, owned by `RUA-UBIRETAMA` only if product naming requires one identity; otherwise keep the official east N–S as `RUA-UBIRETAMA` and attach the south E–W as generated continuation / A5 access. Implementer choice, but **do not** leave P5→P4 as the only Ubiretama.

Red-X “bottom E–W from Portão 5” in `02-map-annotated.jpg` is this generated east-side ribbon plus `gate5InternalApproach` P4→P6, **not** a new sketch polyline to extrude.

### 3.4 Gate / BR-472 junction is on the wrong latitude

| Point | PDF today | Local today | Problem |
| --- | --- | --- | --- |
| P6 `gate5VehicleAccess` | `[6190.9754, 3021.9653]` | `[61.9849, 1.0247]` | East of F, mid-arena Y — not the trevo |
| `br472Junction` J | `[6266.9263, 3234.2335]` | `[63.6420, 5.6560]` | ~444 PDF **north** of cadastral A5 Y |
| Cadastral A5 | `[5974, 3678]` | `[57.2509, 15.3382]` | Keep entity; move **access** to this latitude |

`gate5InternalApproach` and `a5ExternalAccess` are built from P4 and P6. After P4 is deleted, rebuild them from the new Brasília × Ubiretama node and A5.

BR-472 generated spine (`br472NorthToJunction` / `br472JunctionToSouth`) is a single N–S polyline at `x ≈ 6255–6305`. Satellite `01-sat-overview.jpg` shows **ramps** at Portão 5. Add ramp centre-lines around the **A5 latitude**, still as generated `RODOVIA-RS-472` / `ACESSO-A5-BR472` — **not** by tracing the green highway highlighter on 01-sat-overview (that highlighter is also a sketch).

## 4. Required edits (exact)

### 4.1 Delete / stop drawing the marked pitch

**`src/features/commercial-map/data/parkEnvironment.ts`**

- Replace `ARENA_FRONT_LAYOUT.footballField` bounds. Do not keep `[5410, 2800, 5900, 3120]`.
- Rename conceptually to an unmarked grass field (keep the object key or rename — if renamed, update every call site). Set `markingInset` unused; **no pitch lines**.
- New bounds (PDF), small field **west of F**, against the west wall, **not** overlapping stairs `[4120, 2720, 4480, 3070]`, D3, or cadastral Brasília:

```text
unmarkedGrassField.sourceBounds = [4708, 2772, 4880, 3048]
```

| | PDF | Local | Metres |
| --- | --- | --- | --- |
| Bounds | `[4708, 2772, 4880, 3048]` | `x [29.6291, 33.3818]`, `z [-4.4291, 1.5927]` | 25.0 × 40.1 m |
| Centre | `[4794, 2910]` | `[31.5055, -1.4182]` | same Y as F centre |

Tolerance: ±20 PDF on each edge after visual check against `03-sat-detail.jpg`. Do **not** grow it to a full-size pitch. Do **not** place it east or south of F.

- Delete walkway `arena-walkway-arena-field` (the three points `5395/5620/5850` at `y ≈ 3180`).
- Update feature `arena-front-football-field` name/notes to “campo de grama sem marcações, oeste da Arena”. Bump `PARK_ENVIRONMENT_REVISION`.

**Plaza recut** (required or the concrete plaza at east edge `4888` will bury the new field; plaza priority 80 > field 40 in `arenaSectorZoning.ts`):

Current `ARENA_FRONT_LAYOUT.plaza.sourcePolygon`:

```text
[4116, 2682], [4888, 2682], [4888, 3096], [4498, 3100], [4116, 3098]
```

Replacement (notch the field; keep north and south apron strips to the west wall):

```text
[4116, 2682],
[4888, 2682],
[4888, 2772],
[4708, 2772],
[4708, 3048],
[4888, 3048],
[4888, 3096],
[4498, 3100],
[4116, 3098]
```

Do not move stairs, canopy, or the two courts.

**`src/features/commercial-map/components/canvas/ArenaFrontInfrastructure.tsx`**

- Keep a grass rectangle for the new bounds.
- **Delete** `footballFieldLineGeometry` and `<lineSegments name="marcacoes-campo-arena">`.
- Do **not** use `'pitchTurf'` for this surface. Use `'grass'` (or worn grass without painted lines).
- Rename group from `campo-futebol-arena` if that helps tests; keep `userData` non-commercial.

**`src/features/commercial-map/data/arenaTerrain.ts`**

- Point `FIELD` at the new west bounds.
- Plateau blend may stay; it must not flatten the east-of-F dirt.

**`src/features/commercial-map/data/arenaSectorZoning.ts`**

- Zone `'football-field'` must use the new bounds (or be renamed `'grass-field'`).
- After plaza recut, `resolveArenaSurfaceOwner` at the field centre must be `SPORTS_FIELD`, not `CONCRETE_ACCESS`.

**`src/features/commercial-map/data/rearParkEnvironment.ts`**

- Replace exclusion `[5410, 2800, 5900, 3120]` with `[4708, 2772, 4880, 3048]`.

**`src/test/commercialMapArenaTerrain.test.ts`**

- Invert `field.minX > arena.maxX` → **`field.maxX < arena.minX`** (west of F).
- Stop requiring `field.width > field.depth` if the west field is N–S (40 m along the wall, 25 m wide).

### 4.2 Rua Brasília — stay on the cadastral N–S strip

Do **not** replace `officialReference2026.ts` `rectPdf([3940, 2440, 3988, 4210])`. `RoadInfrastructure.tsx` should keep extruding that official polygon.

Rewrite generated overlay in `rearSpatialCalibration.ts` `REAR_CALIBRATED_AXES`.

**Keep** `brasiliaSouthToPoint2`:

```text
[3964, 3950], [3964, 3800], [3964, 3700]
```

**Replace** `brasiliaPoint2ToPoint3` with a N–S centre-line west of F, slight **west** bow at the north apron (satellite, not the green sketch):

```text
[3964, 3700],   // P2 — Brasília × Ubiretama four-way (local [13.3964, 15.8182])
[3964, 3500],
[3964, 3350],
[3952, 3180],   // west of F south wall; do not turn east
[3948, 2910],   // P3′ west of F centre (local [13.0473, -1.4182])
[3948, 2750],   // slight west at northern paved extension
[3964, 2600],
[3964, 2445]    // rejoin official Brasília north (Pastor Albert / D3 west)
```

Carriageway half-width stays `rearRoadSourceToLocalLength(37)` (~5.4 m). The slight west bow (`3948` vs cadastral centre `3964`) is 16 PDF ≈ 2.3 m — inside the official 48-PDF-wide rectangle so official + generated can coexist. If double-asphalt z-fights, clip the generated ribbon to the **rear** sector (`y ≥ 3140`) only and let the official rect cover `y < 3140`.

**Delete** `brasiliaPoint3ToUbiretama` (the whole array and segment `brasilia-point-3-ubiretama-4`).

New Brasília label anchor: `P3′ [3948, 2910]`, not P3 `[4975.99, 3200.58]`.

### 4.3 Rua Ubiretama — E–W south of F, join Brasília at P2, run to A5

P2 `[3964, 3700]` is already at A5’s latitude (`3678`) on cadastral Brasília. That is the four-way. **Do not** use P4 `[6133, 2723]`.

**Replace** `ubiretamaPoint5ToBrasilia` with:

```text
[3964, 3700],   // four-way with Brasília (P2)
[4200, 3694],   // south of C1 (C1 south = 3435) — must clear C1 [4020, 3180, 4490, 3435]
[4510, 3688],   // west edge of EST-EXP-VIS — asphalt may enter parking
[5000, 3684],   // through EST-EXP-VIS (this is “through the parking lots” at A5 latitude)
[5350, 3680],   // EST-EXP-VIS / EST-VIS seam
[5700, 3679],
[5974, 3678]    // cadastral A5 — do not move the entity
```

Width: keep `rearRoadSourceToLocalLength(36)`.

Why `y ≈ 3678` and not `y ≈ 3155`: `y = 3155` is the red-X Brasília dogleg (blocked by C1 / F). Satellite Ubiretama is south of the dirt pad; C1 occupies `[4020–4490, 3180–3435]`. The first clear E–W band that also hits cadastral A5 is **south of C1**, through `EST-EXP-VIS`. If a later satellite overlay shows the E–W street closer to F than 80 m, shift the whole line north **only until it still misses C1** (`y > 3435 + halfWidth`). Never reuse `[4400, 3155]…[5900, 3200]`.

**Restore official east N–S Ubiretama:** remove `'RUA-UBIRETAMA'` from `REPLACED_OFFICIAL_ROAD_IDENTIFIERS` unless the new E–W polyline is merged into one replaced polygon that **includes** the official east vertices. Do not leave a gap that erases the Quadra R lateral.

P5 `[5987, 2000]` may remain a label point on the official east stretch. It is **not** the south four-way.

### 4.4 Portão 5 access and BR-472 ramps

Keep `REAR_OFFICIAL_ANCHORS.gate5Entity = [5974, 3678]`.

**Replace** `gate5VehicleAccess` / P6. Recommended physical passage, 8–12 m east of the A5 centre toward the highway, same Y:

```text
gate5VehicleAccess = [6108, 3678]   // local ≈ [60.1745, 15.3382]
```

**Replace** `br472Junction` J so it sits on the generated highway spine at A5 latitude (not 3234):

```text
br472Junction = [6264, 3678]        // local ≈ [63.5782, 15.3382]
```

**Replace** `gate5InternalApproach`:

```text
[5974, 3678], [6108, 3678]
```

**Replace** `a5ExternalAccess`:

```text
[6108, 3678], [6180, 3678], [6264, 3678]
```

**Update** highway spine so it still passes J:

```text
br472NorthToJunction:
  [6255, 1100], [6258, 1900], [6260, 2800], [6264, 3678]

br472JunctionToSouth:
  [6264, 3678], [6285, 3900], [6305, 4400]
```

**Ramps (centre-lines, PDF, interpretation of `01-sat-overview.jpg` Portão 5 — not the green overlay):**

Keep them as `ACESSO-A5-BR472` or `RODOVIA-RS-472` generated segments. Approximate loops, ±30 PDF, to be tightened against the satellite crop — **do not** digitise the green highlighter:

```text
ramp-north-entry:
  [6108, 3678], [6160, 3600], [6220, 3540], [6264, 3520]

ramp-south-entry:
  [6108, 3678], [6160, 3760], [6220, 3820], [6268, 3840]
```

Highway width stays `rearRoadSourceToLocalLength(70)` with shoulders 12. Access width 36 + shoulders 5.

`REAR_GATE_5_PRESENTATION.rotation` must be recomputed from the new access→J vector (almost due east, not the old P6→J heading).

### 4.5 Parking (`rearParkingSource.ts` / `EST-EXP-VIS`)

`rearParkingSource.ts` is Annex 5 **west** parking (Pavilhão 09 / 2187 stalls), transform `PDF = [6760, 5290] - 1.35 * sourcePixel` with `rotation = π`. It is **not** the grid immediately behind F. Do not invent Brasília through those A/B/C stall rows.

The parking Brasília / Ubiretama actually cross is cadastral:

- `EST-EXP-VIS` `[[4510, 3220], [5350, 3260], [5270, 4140], [4510, 4140]]`
- `EST-VIS` `[[5350, 3400], [5980, 3480], [5900, 4250], [5350, 4140]]`

`rearRoadExclusions.ts` currently forbids generated ribbons from touching those polygons (`allowRoadContact` only for `A5`). After Ubiretama runs at `y = 3678` through EST-EXP-VIS:

- Either set `allowRoadContact` for those two parking entities along a **cut corridor**, or
- Subtract a 36-PDF-wide channel from the parking presentation (`rearParking.ts` is the wrong layer; this is official parking extruded by `RoadInfrastructure` / structural meshes).

Do **not** delete stall symbols in `REAR_PARKING_SOURCE_ROWS` to “make room” for Brasília.

### 4.6 `RoadInfrastructure.tsx`

No new polylines here. It extrudes official `ROAD` polygons. Required behaviour after the overlay rewrite:

- Keep drawing `RUA-BRASILIA` `rectPdf([3940, 2440, 3988, 4210])`.
- Draw official `RUA-UBIRETAMA` again if it is removed from `REPLACED_OFFICIAL_ROAD_IDENTIFIERS`.
- Keep **not** drawing `RODOVIA-RS-472` while the generated highway exists (`CommercialMapCanvas.tsx` filter around the `REPLACED_OFFICIAL_ROAD_IDENTIFIERS` include).
- **Never** add a THREE mesh that traces green/red pixels from `02-map-annotated.jpg`.

### 4.7 Graph / tests that will go red (expected)

`src/test/commercialMapRearRoadNetwork.test.ts` currently locks the **wrong** affine P3/P4/P6:

- P3 `4975.9927745664745, 3200.5780346820807` — retire
- P4 `6133.044315992293, 2723.121387283237` — retire
- P6 `6190.975433526012, 3021.965317919075` — retire
- `directionChangeDegrees(p2, p3, p4) < 5` — that test **encodes the east dogleg**; delete it
- `degree('brasilia-ubiretama-junction-4') === 3` — junction node should become P2 / a new id at `[3964, 3700]`
- `REAR_PARK_ROAD_NETWORK.filter(roadId === 'RUA-BRASILIA')` length 3 — becomes 2 after deleting `brasilia-point-3-ubiretama-4`
- `arena-zone:football-field` must follow the new west bounds

Update `REAR_ATTACHMENT_5_REFERENCE_POINTS` only if the implementer keeps that affine. **Recommended:** stop using attachment-5 percentages as the authority for P3/P4/P6. The affine (`REAR_ATTACHMENT_5_INTERIOR_TRANSFORM`) was built to a rotated annex and is what placed P4 east of F. Satellite + cadastral `F` / `A5` / `RUA-BRASILIA` replace it for those three points. P1 `[5510, 4200]` (Etnias terminus) and P2 `[3964, 3700]` can stay.

Bump `REAR_SPATIAL_CALIBRATION_REVISION`, `REAR_PARK_ROAD_REVISION`, `REAR_PARK_ENVIRONMENT_REVISION`.

## 5. What not to do

- Do not extrude green parallel lines from `02-map-annotated.jpg` as a dual carriageway.
- Do not draw red X marks, green boxes, or the handwritten “campo pequeno” as meshes or decals.
- Do not move `F`, cadastral `A5`, or `RUA-BRASILIA` `rectPdf`.
- Do not add a marked pitch west of F “to match satellite lines”; the required field is unmarked.
- Do not keep a residual east pitch under a grass overlay (delete the mesh and the bounds).
- Do not route Brasília through `x > 4100` south of F (that is the red dogleg).
- Do not identify Av. Imigrantes `[3940, 4165, 5510, 4235]` as Ubiretama.

## 6. File checklist

| File | Change |
| --- | --- |
| `src/features/commercial-map/data/officialReference2026.ts` | No vertex change to F / A5 / Brasília rect. Optional comment only. |
| `src/features/commercial-map/utils/rearSpatialCalibration.ts` | **Primary polyline rewrite** (`REAR_CALIBRATED_AXES`, P3/P4/P6, J). |
| `src/features/commercial-map/data/rearParkRoadNetwork.ts` | Drop `brasilia-point-3-ubiretama-4`; retarget nodes; `REPLACED_OFFICIAL_ROAD_IDENTIFIERS`; label anchors. |
| `src/features/commercial-map/components/canvas/RoadInfrastructure.tsx` | No new geometry; confirm official Brasília still draws. |
| `src/features/commercial-map/components/canvas/ArenaFrontInfrastructure.tsx` | Move field west; delete pitch lines / `pitchTurf`. |
| `src/features/commercial-map/data/parkEnvironment.ts` | New field bounds; plaza notch; delete field walkway. |
| `src/features/commercial-map/data/arenaTerrain.ts` | `FIELD` follows new bounds. |
| `src/features/commercial-map/data/arenaSectorZoning.ts` | Zone follows new bounds. |
| `src/features/commercial-map/data/rearParkEnvironment.ts` | Exclusion rect. |
| `src/features/commercial-map/data/rearParkingSource.ts` | No stall edits; comment that Annex 5 ≠ EST-EXP-VIS. |
| `src/features/commercial-map/data/rearRoadExclusions.ts` | Allow a cut through EST-EXP-VIS / EST-VIS for Ubiretama. |
| `src/features/commercial-map/components/canvas/RearParkRoadNetwork.tsx` | No sketch meshes; consumes rewritten axes. |
| `src/test/commercialMapRearRoadNetwork.test.ts` | Unlock old P3/P4/P6; assert west-of-F Brasília and four-way at `[3964, 3700]`. |
| `src/test/commercialMapArenaTerrain.test.ts` | Field west of F; unmarked. |

## 7. Quick numeric summary for the implementer

```text
KEEP
  F                 [4900, 2690, 5385, 3130]
  A5 entity         [5974, 3678]
  RUA-BRASILIA rect [3940, 2440, 3988, 4210]
  P1 Etnias         [5510, 4200]
  P2                [3964, 3700]     // becomes Brasília × Ubiretama four-way

DELETE (generated)
  brasiliaPoint2ToPoint3 from [4400, 3155] through P3
  entire brasiliaPoint3ToUbiretama
  entire ubiretamaPoint5ToBrasilia (P5→P4)
  P3 [4975.9928, 3200.5780]
  P4 [6133.0443, 2723.1214]
  P6 [6190.9754, 3021.9653]
  J  [6266.9263, 3234.2335]
  footballField [5410, 2800, 5900, 3120]
  walkway arena-walkway-arena-field
  footballFieldLineGeometry / marcacoes-campo-arena / pitchTurf on this field

ADD / REPLACE
  unmarked field    [4708, 2772, 4880, 3048]
  plaza notch       (polygon in §4.1)
  Brasília N–S      P2 → [3948, 2910] → [3964, 2445]  (§4.2)
  Ubiretama E–W     [3964, 3700] → [5974, 3678]       (§4.3)
  A5 access         [5974, 3678] → [6108, 3678] → [6264, 3678]
  BR-472 J          [6264, 3678]
  ramps             (§4.4) from satellite 01, not from 02-map green
```
