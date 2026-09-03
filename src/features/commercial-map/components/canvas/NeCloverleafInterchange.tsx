import { memo, useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  NE_CLOVERLEAF_COLORS,
  NE_CLOVERLEAF_REVISION,
} from '../../data/neCloverleafBr344Br472';
import {
  buildNeCloverleafGeometries,
  disposeNeCloverleafGeometries,
} from '../../utils/neCloverleafGeometry';
import {
  openGroundTextureBundleForEntity,
  type OpenGroundSurfaceProfile,
} from './openGroundTextures';

interface NeCloverleafInterchangeProps {
  reducedGraphics?: boolean;
  visible?: boolean;
  opacity?: number;
}

const NO_RAYCAST = () => undefined;

const HIGHWAY_PROFILE = Object.freeze({
  surface: 'highwayAsphalt',
  tileWorldSize: 1,
  baseColor: NE_CLOVERLEAF_COLORS.highway,
  roughness: 0.96,
} satisfies OpenGroundSurfaceProfile);

const SHOULDER_PROFILE = Object.freeze({
  surface: 'roadShoulder',
  tileWorldSize: 1,
  baseColor: NE_CLOVERLEAF_COLORS.shoulder,
  roughness: 0.99,
} satisfies OpenGroundSurfaceProfile);

const ISLAND_PROFILE = Object.freeze({
  surface: 'landscapeGrass',
  tileWorldSize: 2.4,
  baseColor: NE_CLOVERLEAF_COLORS.island,
  roughness: 0.98,
} satisfies OpenGroundSurfaceProfile);

const ASPHALT_NORMAL_SCALE = new THREE.Vector2(0.16, 0.16);
const SHOULDER_NORMAL_SCALE = new THREE.Vector2(0.22, 0.22);

function createTintedSurfaceTexture(
  seed: number,
  rgb: readonly [number, number, number],
  amplitude: number,
) {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let value = (x * 374761393 + y * 668265263 + seed * 1442695041) >>> 0;
      value = Math.imul(value ^ (value >>> 13), 1274126177) >>> 0;
      const grain = (((value ^ (value >>> 16)) & 0xffff) / 0xffff - 0.5) * amplitude;
      const offset = (y * size + x) * 4;
      data[offset] = THREE.MathUtils.clamp(Math.round(rgb[0] + grain), 0, 255);
      data[offset + 1] = THREE.MathUtils.clamp(Math.round(rgb[1] + grain), 0, 255);
      data[offset + 2] = THREE.MathUtils.clamp(Math.round(rgb[2] + grain), 0, 255);
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.55, 0.55);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const YELLOW_ROUNDABOUT_TEXTURE = createTintedSurfaceTexture(344_472, [236, 196, 28], 18);

const FEATURE_USER_DATA = Object.freeze({
  featureSet: 'ne-cloverleaf-br344-br472',
  spatialRevision: NE_CLOVERLEAF_REVISION,
  classification: 'NON_COMMERCIAL_INFRASTRUCTURE',
  isSellable: false,
  contributesToCommercialMetrics: false,
  protectedCommercialGeometry: true,
});

/**
 * Isolated 3D for the far NE cloverleaf. Presentation only: no hit-test
 * ownership, so park selection, Brasília, Ubiretama and Portão 5 stay intact.
 * Mount from the canvas/environment with reducedGraphics from the map scene.
 */
export const NeCloverleafInterchange = memo(function NeCloverleafInterchange({
  reducedGraphics = false,
  visible = true,
  opacity = 1,
}: NeCloverleafInterchangeProps) {
  const maximumAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  const invalidate = useThree((state) => state.invalidate);
  const network = useMemo(
    () => buildNeCloverleafGeometries({ reducedGraphics }),
    [reducedGraphics],
  );

  useEffect(() => () => disposeNeCloverleafGeometries(network), [network]);

  const textures = useMemo(() => Object.freeze({
    highway: openGroundTextureBundleForEntity(HIGHWAY_PROFILE, maximumAnisotropy),
    shoulder: openGroundTextureBundleForEntity(SHOULDER_PROFILE, maximumAnisotropy),
    island: openGroundTextureBundleForEntity(ISLAND_PROFILE, maximumAnisotropy),
  }), [maximumAnisotropy]);

  useEffect(() => () => {
    textures.highway?.dispose();
    textures.shoulder?.dispose();
    textures.island?.dispose();
  }, [textures]);

  useEffect(() => {
    invalidate();
  }, [invalidate, network, visible, opacity]);

  const presentedOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
  const transparent = presentedOpacity < 0.995;
  if (!visible || presentedOpacity <= 0.015) return null;

  return (
    <group
      name="ne-cloverleaf-br344-br472"
      userData={FEATURE_USER_DATA}
      renderOrder={1}
    >
      {network.highway && (
        <mesh
          geometry={network.highway}
          receiveShadow={!reducedGraphics}
          dispose={null}
          raycast={NO_RAYCAST}
        >
          <meshStandardMaterial
            map={textures.highway?.map}
            normalMap={textures.highway?.normalMap}
            normalScale={textures.highway ? ASPHALT_NORMAL_SCALE : undefined}
            roughnessMap={textures.highway?.roughnessMap}
            color={NE_CLOVERLEAF_COLORS.highway}
            roughness={HIGHWAY_PROFILE.roughness}
            metalness={0}
            side={THREE.FrontSide}
            transparent={transparent}
            opacity={presentedOpacity}
            depthWrite={presentedOpacity > 0.42}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      )}
      {network.shoulders && (
        <mesh geometry={network.shoulders} raycast={NO_RAYCAST} dispose={null}>
          <meshStandardMaterial
            map={textures.shoulder?.map}
            normalMap={textures.shoulder?.normalMap}
            normalScale={textures.shoulder ? SHOULDER_NORMAL_SCALE : undefined}
            roughnessMap={textures.shoulder?.roughnessMap}
            color={NE_CLOVERLEAF_COLORS.shoulder}
            roughness={SHOULDER_PROFILE.roughness}
            metalness={0}
            side={THREE.FrontSide}
            transparent={transparent}
            opacity={presentedOpacity}
            depthWrite={presentedOpacity > 0.42}
          />
        </mesh>
      )}
      {network.roundabouts && (
        <mesh
          geometry={network.roundabouts}
          receiveShadow={!reducedGraphics}
          dispose={null}
          raycast={NO_RAYCAST}
        >
          <meshStandardMaterial
            map={YELLOW_ROUNDABOUT_TEXTURE}
            color={NE_CLOVERLEAF_COLORS.roundabout}
            roughness={0.88}
            metalness={0}
            side={THREE.FrontSide}
            transparent={transparent}
            opacity={presentedOpacity}
            depthWrite={presentedOpacity > 0.42}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      )}
      {network.islands && (
        <mesh geometry={network.islands} raycast={NO_RAYCAST} dispose={null}>
          <meshStandardMaterial
            map={textures.island?.map}
            color={NE_CLOVERLEAF_COLORS.island}
            roughness={ISLAND_PROFILE.roughness}
            metalness={0}
            side={THREE.FrontSide}
            transparent={transparent}
            opacity={presentedOpacity}
            depthWrite={presentedOpacity > 0.42}
          />
        </mesh>
      )}
      {network.curbs && (
        <mesh geometry={network.curbs} raycast={NO_RAYCAST} dispose={null}>
          <meshStandardMaterial
            color={NE_CLOVERLEAF_COLORS.islandRim}
            roughness={0.86}
            metalness={0}
            side={THREE.FrontSide}
            transparent={transparent}
            opacity={presentedOpacity}
            depthWrite={presentedOpacity > 0.42}
          />
        </mesh>
      )}
      {network.bridge && (
        <mesh geometry={network.bridge} raycast={NO_RAYCAST} dispose={null} castShadow={!reducedGraphics}>
          <meshStandardMaterial
            color={NE_CLOVERLEAF_COLORS.soffit}
            roughness={0.94}
            metalness={0.02}
            side={THREE.FrontSide}
            transparent={transparent}
            opacity={presentedOpacity}
            depthWrite={presentedOpacity > 0.42}
          />
        </mesh>
      )}
      {network.edges && (
        <mesh geometry={network.edges} raycast={NO_RAYCAST} dispose={null}>
          <meshStandardMaterial
            color={NE_CLOVERLEAF_COLORS.edgeLine}
            roughness={0.72}
            metalness={0}
            side={THREE.FrontSide}
            transparent
            opacity={presentedOpacity * 0.94}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-3}
            polygonOffsetUnits={-3}
          />
        </mesh>
      )}
      {network.markings && (
        <mesh geometry={network.markings} raycast={NO_RAYCAST} dispose={null}>
          <meshStandardMaterial
            color={NE_CLOVERLEAF_COLORS.markings}
            roughness={0.84}
            metalness={0}
            side={THREE.FrontSide}
            transparent
            opacity={presentedOpacity * 0.86}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-4}
            polygonOffsetUnits={-4}
          />
        </mesh>
      )}
    </group>
  );
});
