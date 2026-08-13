# FENASOJA executive character profiles

These profiles are the modeling and QA contract for the metrically-scaled assets
in `public/models/executives`. They were derived from the user-supplied official
photographs and the approved front/side/back turnarounds. They intentionally
describe visible traits rather than making claims about biometric identity.

## Fabiano Soltis

1. Defining face: angular oval face, clean jaw transition, straight medium nose,
   close brown eyes, dark eyebrows, restrained smile, and short even stubble.
2. Defining body: 1.78 m authored height, athletic executive build, defined but
   not exaggerated shoulders, narrow waist, upright mature posture.
3. Clothing: fitted navy executive suit, separate jacket shell/front panels,
   lapels, white shirt/collar/cuffs, green tie, navy trousers, brown leather shoes.
4. Accessories: thin silver rectangular glasses.
5. Animation: contained 1 s walk cycle, subtle 4 s breathing idle, right-hand
   3.2 s executive wave. No root translation.
6. Addressed weaknesses: reduced eye size, added curved reference-face surface,
   softened torso/waist volumes, modeled neck/collar transition, increased hair
   clump density and reduced beard volume.
7. Remaining opportunity: a production facial scan and FACS blendshape session
   would exceed what can be recovered from two still images and one generated
   turnaround, especially at extreme close-up.

## Djeison Drey

1. Defining face: broad square-oval structure, blue eyes, clear medium nose,
   light complexion, warm asymmetrical smile, ginger beard and moustache.
2. Defining body: 1.84 m authored height, tall robust build, broader chest and
   waist than Fabiano, cordial upright posture.
3. Clothing: gray executive suit with separate tailoring layers, white shirt,
   green tie, gray trousers and cognac leather shoes.
4. Accessories: large rounded gold-metal glasses; realistic chimarrão assembly
   in the left hand, split into `Chimarrao_Cuia`, `Chimarrao_ErvaMate`, and
   `Chimarrao_Bomba` nodes.
5. Animation: slightly longer stride than Fabiano; restrained left arm to keep
   the cuia stable; independently phased idle; professional right-hand wave.
6. Addressed weaknesses: broader organic torso, reduced eye scale, more compact
   full beard, increased tousled hair clump density, curved reference-face layer,
   modeled finger wrap around the cuia.
7. Remaining opportunity: real-time cloth/hair simulation and high-resolution
   scan displacement are deliberately outside the map performance budget.

## Asset contract and validation

- Units: meters, Y-up after glTF export, origin grounded between the feet.
- Forward: local `+Z` in glTF/Three.js (exportado do `-Y` frontal do Blender).
- Clips: `Idle` (4.0 s loop), `Walk` (1.0 s loop), `Wave` (3.2 s one-shot).
- Root motion: zero; the route controller owns world translation and yaw.
- Modeling: deterministic procedural geometry, layered rigid-weight garments,
  PBR materials, embedded 512 px curved reference-face texture.
- Export: Blender 4.5.10 LTS, followed by glTF-Transform 4.2.1 hierarchy
  flattening and unused-attribute pruning only. No mesh join, simplification,
  geometry compression, or texture recompression.
- The pinned glTF-Transform validation command reports zero errors, warnings,
  infos, and hints for both final assets; reports are CI/build output rather
  than public runtime payload.
