import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import brandUrl from './assets/fenasoja-vehicle-brand.png';

/** The authored vehicle dimensions are metres; the commercial map uses 0.15 units/metre. */
export const VISIT_VEHICLE_METRE = 0.15;
export const VISIT_CART_DIMENSIONS = Object.freeze({
  length: 3.35 * VISIT_VEHICLE_METRE,
  width: 1.58 * VISIT_VEHICLE_METRE,
  height: 2.08 * VISIT_VEHICLE_METRE,
  wheelRadius: 0.34 * VISIT_VEHICLE_METRE,
});
export const VISIT_HELICOPTER_DIMENSIONS = Object.freeze({
  length: 7.05 * VISIT_VEHICLE_METRE,
  bodyRadius: 1.17 * VISIT_VEHICLE_METRE,
  rotorRadius: 3.72 * VISIT_VEHICLE_METRE,
  skidWidth: 2.0 * VISIT_VEHICLE_METRE,
  skidLength: 3.35 * VISIT_VEHICLE_METRE,
  height: 2.96 * VISIT_VEHICLE_METRE,
});

/** Exclude vehicle presentation meshes from the canonical map's pointer picking. */
export const visitVehicleNoPick = () => undefined;

type MaterialName = 'green' | 'darkGreen' | 'blue' | 'yellow' | 'lime' | 'black' | 'rubber' | 'chrome' | 'brown' | 'seatDark' | 'glass' | 'light' | 'brand';
export type VisitVehicleMaterials = Record<MaterialName, MeshStandardMaterial>;
let cachedMaterials: VisitVehicleMaterials | undefined;

/** Shared, bounded material set. The logo is a single 1024×256 atlas for both vehicles. */
export function getVisitVehicleMaterials(): VisitVehicleMaterials {
  if (cachedMaterials) return cachedMaterials;
  const brand = new TextureLoader().load(brandUrl);
  brand.colorSpace = SRGBColorSpace;
  brand.anisotropy = 4;
  cachedMaterials = {
    green: new MeshStandardMaterial({ color: '#006b59', metalness: .16, roughness: .31 }),
    darkGreen: new MeshStandardMaterial({ color: '#004d49', metalness: .12, roughness: .4 }),
    blue: new MeshStandardMaterial({ color: '#1392cd', metalness: .12, roughness: .37 }),
    yellow: new MeshStandardMaterial({ color: '#f8b726', metalness: .08, roughness: .4 }),
    lime: new MeshStandardMaterial({ color: '#2ab35b', metalness: .07, roughness: .43 }),
    black: new MeshStandardMaterial({ color: '#151a1d', metalness: .24, roughness: .57 }),
    rubber: new MeshStandardMaterial({ color: '#17191b', metalness: .01, roughness: .95 }),
    chrome: new MeshStandardMaterial({ color: '#c7d1d2', metalness: .7, roughness: .3 }),
    brown: new MeshStandardMaterial({ color: '#704633', metalness: .03, roughness: .78 }),
    seatDark: new MeshStandardMaterial({ color: '#352b29', metalness: .02, roughness: .83 }),
    glass: new MeshStandardMaterial({ color: '#6e9eaf', metalness: .14, roughness: .12, transparent: true, opacity: .44, depthWrite: false, side: DoubleSide }),
    light: new MeshStandardMaterial({ color: '#e8f3f0', emissive: '#88aaa8', emissiveIntensity: .12, metalness: .04, roughness: .32 }),
    brand: new MeshStandardMaterial({ map: brand, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, roughness: .7, metalness: 0 }),
  };
  return cachedMaterials;
}

export type GeometryParts = Partial<Record<MaterialName, BufferGeometry[]>>;
export function addPart(parts: GeometryParts, material: MaterialName, geometry: BufferGeometry, position: [number, number, number], rotation: [number, number, number] = [0, 0, 0]) {
  if (rotation[0]) geometry.rotateX(rotation[0]);
  if (rotation[1]) geometry.rotateY(rotation[1]);
  if (rotation[2]) geometry.rotateZ(rotation[2]);
  geometry.translate(...position);
  (parts[material] ??= []).push(geometry);
}
export function addBox(parts: GeometryParts, material: MaterialName, position: [number, number, number], size: [number, number, number], radius = 0, rotation: [number, number, number] = [0, 0, 0]) {
  const geometry = radius > 0 ? new RoundedBoxGeometry(...size, 2, radius) : new BoxGeometry(...size);
  addPart(parts, material, geometry, position, rotation);
}
export function addCylinder(parts: GeometryParts, material: MaterialName, position: [number, number, number], radiusTop: number, radiusBottom: number, height: number, radialSegments = 10, rotation: [number, number, number] = [0, 0, 0]) {
  addPart(parts, material, new CylinderGeometry(radiusTop, radiusBottom, height, radialSegments), position, rotation);
}
export function addSphere(parts: GeometryParts, material: MaterialName, position: [number, number, number], size: [number, number, number], widthSegments = 12, heightSegments = 8) {
  const geometry = new SphereGeometry(1, widthSegments, heightSegments);
  geometry.scale(...size);
  addPart(parts, material, geometry, position);
}
export function addTube(parts: GeometryParts, material: MaterialName, points: readonly [number, number, number][], radius: number, segments = 12) {
  const curve = new CatmullRomCurve3(points.map(point => new Vector3(...point)));
  addPart(parts, material, new TubeGeometry(curve, segments, radius, 5, false), [0, 0, 0]);
}
export function addTorus(parts: GeometryParts, material: MaterialName, position: [number, number, number], major: number, minor: number, rotation: [number, number, number] = [0, 0, 0]) {
  addPart(parts, material, new TorusGeometry(major, minor, 5, 14), position, rotation);
}
export function addPlane(parts: GeometryParts, material: MaterialName, position: [number, number, number], size: [number, number], rotation: [number, number, number] = [0, 0, 0]) {
  addPart(parts, material, new PlaneGeometry(...size), position, rotation);
}
export function finishParts(parts: GeometryParts): Partial<Record<MaterialName, BufferGeometry>> {
  const result: Partial<Record<MaterialName, BufferGeometry>> = {};
  for (const [name, geometries] of Object.entries(parts) as [MaterialName, BufferGeometry[]][]) {
    if (geometries.length === 0) continue;
    // RoundedBoxGeometry is non-indexed while most Three primitives are indexed.
    // Normalize once at construction; never silently drop a livery/structure part.
    const normalized = geometries.map(geometry => geometry.index ? geometry.toNonIndexed() : geometry);
    result[name] = normalized.length === 1 ? normalized[0] : mergeGeometries(normalized, false) ?? undefined;
    geometries.forEach((geometry, index) => { if (geometry !== result[name]) geometry.dispose(); if (normalized[index] !== result[name] && normalized[index] !== geometry) normalized[index].dispose(); });
    if (!result[name]) throw new Error(`Falha ao mesclar geometria do veículo: ${name}`);
  }
  return result;
}
