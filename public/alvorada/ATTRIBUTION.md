# Alvorada asset attribution

These files support the real-time WebGL experience and were retrieved from official upstream sources on 2026-08-10.

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

`santa-rosa-roads.json` contains a compact, locally projected subset of the mapped street network around central Santa Rosa. It was retrieved through the Overpass API on 2026-08-11 and is used only to anchor the real-time road mesh and procedural building placement to the city's actual urban structure.

Data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the [Open Data Commons Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/).

## User-supplied references

The images attached by the user were not copied into this directory or redistributed. They were used only as visual references for geography, composition, lighting, atmosphere, and the approved FENASOJA 2028 identity direction.
