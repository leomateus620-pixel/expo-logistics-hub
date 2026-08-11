# Alvorada asset attribution

These files support the real-time WebGL experience. This document separates
project-authored assets, requester-approved brand artwork and third-party data
retrieved from official upstream sources.

## Project-authored Santa Rosa environment

`santa-rosa-horizon.webp` and `santa-rosa-horizon-portrait.webp` are runtime
variants prepared from an original environmental panorama generated for this
project with OpenAI ImageGen. The source panorama was created from an authored
prompt and a Santa Rosa photograph used only as a compositional reference. The
reference photograph was not copied into the runtime asset, embedded in the
generated output or redistributed by this repository.

The two WebP files are environmental texture layers composed with the live
Three.js terrain, buildings, vegetation, atmosphere and camera. They are not a
pre-rendered animation, video or replacement for the real-time WebGL sequence.

## Requester-approved official FENASOJA symbol

`fenasoja-symbol-official.png` was prepared from the official FENASOJA symbol
supplied and approved by the requester for this implementation. The packaging
step only removed near-transparent stray pixels, cropped the transparent
bounds and centered the unchanged artwork on a 512 x 512 transparent canvas.
It did not redraw, trace, recolor or replace any part of the symbol.

The FENASOJA name and symbol remain protected brand artwork; no open-license
grant or authorization for reuse outside this project is asserted here.

## Authored-asset manifest

`reference-assets.json` is the versioned provenance manifest for the authored
environment and approved symbol. It records the SHA-256 of each supplied source
and the runtime filenames produced by `scripts/build_alvorada_reference_assets.py`.

| Source role | Source SHA-256 | Runtime asset |
| --- | --- | --- |
| ImageGen Santa Rosa environmental panorama | `89c25b44bc3afaf9b49e688b3214c13f9da613de4371e3145915e822b4808ecd` | `santa-rosa-horizon.webp`, `santa-rosa-horizon-portrait.webp` |
| Requester-approved official FENASOJA symbol | `cafa3155fc8f7e7d060dafc2ab5ff619e4c953565bc57821133b39a011b23811` | `fenasoja-symbol-official.png` |

## Three.js r170

The following assets were downloaded from the official [`mrdoob/three.js`](https://github.com/mrdoob/three.js) repository at the immutable `r170` tag. Three.js is distributed under the [MIT License](./THREE-LICENSE.txt).

| Local file | Official source |
| --- | --- |
| `earth-day-2048.jpg` | [`earth_atmos_2048.jpg`](https://github.com/mrdoob/three.js/blob/r170/examples/textures/planets/earth_atmos_2048.jpg) |
| `earth-night-lights-2048.png` | [`earth_lights_2048.png`](https://github.com/mrdoob/three.js/blob/r170/examples/textures/planets/earth_lights_2048.png) |
| `earth-normal-2048.jpg` | [`earth_normal_2048.jpg`](https://github.com/mrdoob/three.js/blob/r170/examples/textures/planets/earth_normal_2048.jpg) |
| `earth-clouds-1024.png` | [`earth_clouds_1024.png`](https://github.com/mrdoob/three.js/blob/r170/examples/textures/planets/earth_clouds_1024.png) |
| `helvetiker-bold.typeface.json` | [`helvetiker_bold.typeface.json`](https://github.com/mrdoob/three.js/blob/r170/examples/fonts/helvetiker_bold.typeface.json) |

## IBGE geographic meshes

The GeoJSON boundaries were downloaded from the official [IBGE Malhas API](https://servicodados.ibge.gov.br/api/docs/malhas?versao=3), requesting `application/vnd.geo+json` with `qualidade=minima`.

| Local file | Territory | IBGE source |
| --- | --- | --- |
| `brazil-min.geojson` | Brazil (`BR`) | [`/api/v3/malhas/paises/BR`](https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application%2Fvnd.geo%2Bjson&qualidade=minima) |
| `rio-grande-do-sul-min.geojson` | Rio Grande do Sul (`43`) | [`/api/v3/malhas/estados/43`](https://servicodados.ibge.gov.br/api/v3/malhas/estados/43?formato=application%2Fvnd.geo%2Bjson&qualidade=minima) |
| `santa-rosa-min.geojson` | Santa Rosa (`4317202`) | [`/api/v3/malhas/municipios/4317202`](https://servicodados.ibge.gov.br/api/v3/malhas/municipios/4317202?formato=application%2Fvnd.geo%2Bjson&qualidade=minima) |

## OpenStreetMap urban network

`santa-rosa-roads.json` contains a compact, locally projected subset of the mapped street network around central Santa Rosa. It was retrieved through the Overpass API on 2026-08-11 and is used to anchor the real-time road mesh to the city's actual urban structure.

Data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the [Open Data Commons Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/).

## Santa Rosa building footprints

`santa-rosa-city-v2.json` contains a locally projected, spatially stratified subset of real building footprints from the [Microsoft Global ML Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints) dataset (Brazil partition dated 2026-02-03). The compact runtime asset retains the exact source URL, SHA-256, confidence threshold, candidate count and selected count. It does not contain source imagery. Procedural height and architectural class values are explicitly authored metadata because the source partition does not provide local building heights.

The building data is made available under the [Community Data License Agreement - Permissive, Version 2.0](https://cdla.dev/permissive-2-0/).

## Santa Rosa elevation

The 129 x 129 signed heightfield embedded in `santa-rosa-city-v2.json` was sampled from [Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) in Terrarium encoding and clipped to a 9.4 x 9.4 km area around Santa Rosa. The generated asset records every source tile URL and its SHA-256 checksum. Mapzen Terrain Tiles are available under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); elevation sources and attribution are documented by the [Tilezen/joerd project](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).

## Reproducible local build

`scripts/build_alvorada_geodata.py` reproduces the compact city asset from the immutable source partition and elevation tiles. Runtime clients never call Microsoft, Mapzen or Overpass services; all network extraction, validation, clipping and packing happens offline.

## User-supplied references

The geographic and photographic references attached by the requester were not
copied into this directory or redistributed. They were used only as visual
guidance for geography, composition, lighting and atmosphere. The two explicit
runtime assets documented above are different in provenance: the panorama is
an original ImageGen output, and the official symbol is requester-approved
brand artwork packaged without visual redesign.
