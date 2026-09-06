# Alvorada: colheita de soja

Asset created with the built-in ImageGen tool on 2026-09-05. Original output:
`exec-fb28dc6d-acb9-4bae-b3f1-c9aba6aba517.png` (1672 × 941).
This is an authored illustration of southern Brazilian agriculture, not a
documentary photograph of Santa Rosa. The official Fenasoja symbol is a separate,
unchanged asset and was not generated.

## Generation prompt

Use case: photorealistic-natural. Asset type: cinematic website background, landscape 16:9. Create a richly detailed photographic soybean harvest at sunrise in rolling agricultural countryside of southern Brazil. Recognizable mature golden soybean plants and low cut crop rows in foreground, one realistic combine harvester with wide header in right lower third, gentle rolling fields across lower 40 percent, distant tree silhouettes. Horizon low at 63 percent height. Strong elegant dark navy predawn sky across upper 60 percent left clean and uncluttered for official branding to be overlaid later, thin warm orange gold horizon glowing from sun just right of center, credible directional rim light on crops, machine and tiny contained plume of harvesting dust. Deep cinematic blue and restrained amber, realistic textures and depth, no washed haze, no exaggerated bloom, no wheat, no mountains, no city. No text, no logos, no letters, no watermark. This is an illustrative scene, not a documentary location photograph. High quality nuanced photographic realism.

## Runtime variants

- `public/alvorada/soy-harvest-dawn.webp`: 1672 × 941, 153,952 bytes.
- `public/alvorada/soy-harvest-dawn-mobile.webp`: 529 × 941, 46,822 bytes; crop retains the combine and sunrise.
- `scripts/prepare-harvest.mjs` performs only crop/format/size conversion with Sharp.
  It does not alter the generated scene. Set `SHARP_PATH` if using an external
  runtime, then pass the original PNG as the argument.

The image loads after the first orbital frame, decodes asynchronously, blends
through the atmospheric approach and is removed at organizational readiness.
The short camera drift is a bounded CSS transform over the raster image; the
landscape is not a navigable 3D reconstruction.
