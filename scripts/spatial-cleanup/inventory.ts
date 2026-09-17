import { writeFileSync } from 'node:fs';
import { TERRITORY_BUILDINGS, TERRITORY_PATCHES, TERRITORY_TREES } from '../../src/features/commercial-map/data/territorialEnvironment';
import { TERRITORY_ROADS } from '../../src/features/commercial-map/data/territorialRoads';
import { OFFICIAL_REFERENCE_DATA } from '../../src/features/commercial-map/data/officialReference2026';
import { REAR_PARKING_BOUNDS } from '../../src/features/commercial-map/data/rearParking';
import { LATERAL_DISTRICT_WORLD_BOUNDS } from '../../src/features/commercial-map/data/lateralResidentialDistrict';
const points = OFFICIAL_REFERENCE_DATA.entities.flatMap(e => e.geometry.coordinates.flat());
const report = { buildings: TERRITORY_BUILDINGS, trees: TERRITORY_TREES, patches: TERRITORY_PATCHES, roads: TERRITORY_ROADS,
  parkBounds: { minX: Math.min(...points.map(p => p[0])), maxX: Math.max(...points.map(p => p[0])), minZ: Math.min(...points.map(p => p[1])), maxZ: Math.max(...points.map(p => p[1])) },
  parking: REAR_PARKING_BOUNDS, district: LATERAL_DISTRICT_WORLD_BOUNDS };
const phase = process.argv[2] || 'before';
writeFileSync(`docs/validation/spatial-cleanup/${phase}-inventory.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ buildings: report.buildings.length, trees: report.trees.length, patches: report.patches.length, roads: report.roads.length, parkBounds: report.parkBounds, parking: report.parking, district: report.district }));
