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
5. Animation: 4 s sofa-compatible `SeatedIdle` with restrained breathing and
   hands at rest. Compatibility clips `Idle`, `Walk`, and `Wave` remain in the
   GLB but are not consumed by the Commercial Map. No root translation.
6. Addressed weaknesses: removed duplicate portrait/procedural facial features,
   replaced the bubble torso and segmented head with continuous anatomical
   lofts, softened the face-texture edge, modeled knee/elbow tailoring covers,
   and refined the swept hair and close beard silhouette.
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
5. Animation: 4 s `SeatedIdle`, independently phased from Fabiano, with the
   left arm restrained to preserve the natural cuia grip. Compatibility clips
   `Idle`, `Walk`, and `Wave` remain in the GLB but are not consumed by the map.
6. Addressed weaknesses: broader continuous torso, removed doubled eyes/lips,
   replaced detached beard volumes with a curved lower-face shell, refined the
   ginger hair silhouette, added joint tailoring covers, and preserved the
   modeled finger wrap around the cuia.
7. Remaining opportunity: real-time cloth/hair simulation and high-resolution
   scan displacement are deliberately outside the map performance budget.

## Asset contract and validation

- Units: meters, Y-up after glTF export, origin grounded between the feet.
- Forward: local `+Z` in glTF/Three.js (exportado do `-Y` frontal do Blender).
- Runtime clip: `SeatedIdle` (4.0 s loop). Compatibility-only clips retained in
  each asset: `Idle` (4.0 s loop), `Walk` (1.0 s loop), and `Wave` (3.2 s
  one-shot).
- Root motion: zero; the B12 interior scene owns each seated root placement and
  yaw.
- Seated contract: each rig keeps its individual floor origin. At frame 30 the
  Hips land near glTF `Y=0.50 m`, `Z=-0.43 m` (Fabiano) / `Z=-0.44 m`
  (Djeison), with shoes contacting the original floor plane. The host scene
  places each character root; the clip itself does not encode sofa position.
- Modeling: deterministic procedural geometry, layered rigid-weight garments,
  PBR materials, embedded 512 px curved reference-face texture with corrected
  full-face crop, orientation and exposure.
- Export: Blender 4.5.10 LTS, followed by glTF-Transform 4.2.1 hierarchy
  flattening and unused-attribute pruning only. No mesh join, simplification,
  geometry compression, or texture recompression.
- The pinned glTF-Transform validation command reports zero errors, warnings,
  infos, and hints for both final assets; reports are CI/build output rather
  than public runtime payload.

The official photographs are the identity authority. The turnaround images are
used for multi-angle modeling and the two `*-seated-reference.png` sheets are
pose, garment-fold and silhouette guidance only. These assets remain lightweight
procedural likenesses, not biometric scans; extreme facial close-ups still need
photogrammetry/FACS capture for truly photographic fidelity. The delivered QA is
therefore suitable for the map camera and a draft integration, not a claim of
scan-grade or cinematic close-up realism.
