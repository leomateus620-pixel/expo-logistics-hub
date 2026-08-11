import { useEffect, useMemo, useRef } from 'react';
import { useTexture } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { AlvoradaQualityProfile } from '../capabilities';
import { useAlvoradaTimeline } from '../TimelineContext';
import { smoothRange } from '../timeline';

interface SantaRosaCinematicBackdropProps {
  quality: AlvoradaQualityProfile;
}

interface BackdropMaterial {
  dawn: { value: number };
  material: THREE.MeshBasicMaterial;
  opacity: { value: number };
}

interface ArrivalMaterial {
  dawn: { value: number };
  material: THREE.MeshBasicMaterial;
  opacity: { value: number };
}

const DESKTOP_SOURCE = '/alvorada/santa-rosa-horizon.webp';
const PORTRAIT_SOURCE = '/alvorada/santa-rosa-horizon-portrait.webp';
const DESKTOP_ASPECT = 1536 / 753;
const PORTRAIT_ASPECT = 845 / 753;

function createCurvedBackdropGeometry(width: number, height: number) {
  const geometry = new THREE.PlaneGeometry(width, height, 40, 12);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const horizontal = Math.abs(x) / (width / 2);
    const upper = Math.max(0, y / (height / 2));
    positions.setZ(
      index,
      -Math.pow(horizontal, 1.72) * 4.8 - Math.pow(upper, 2) * 0.42,
    );
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createBackdropMaterial(map: THREE.Texture): BackdropMaterial {
  const opacity = { value: 0 };
  const dawn = { value: 0 };
  const material = new THREE.MeshBasicMaterial({
    alphaTest: 0.025,
    depthWrite: true,
    fog: true,
    map,
    toneMapped: true,
    transparent: true,
  });
  material.dithering = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAlvoradaBackdropOpacity = opacity;
    shader.uniforms.uAlvoradaBackdropDawn = dawn;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uAlvoradaBackdropOpacity;\nuniform float uAlvoradaBackdropDawn;',
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float alvoradaHorizonHaze = smoothstep(0.7, 1.0, vMapUv.y);
        vec3 alvoradaCoolCity = diffuseColor.rgb * vec3(0.82, 0.93, 1.08);
        vec3 alvoradaWarmCity = diffuseColor.rgb * vec3(1.11, 1.035, 0.88);
        diffuseColor.rgb = mix(
          alvoradaCoolCity,
          alvoradaWarmCity,
          0.42 + uAlvoradaBackdropDawn * 0.34
        );
        diffuseColor.rgb *= mix(0.7, 0.82, uAlvoradaBackdropDawn);
        diffuseColor.rgb = mix(
          diffuseColor.rgb,
          vec3(0.37, 0.49, 0.61),
          alvoradaHorizonHaze * (0.22 - uAlvoradaBackdropDawn * 0.08)
        );
        diffuseColor.a *= uAlvoradaBackdropOpacity;`,
      );
  };
  material.customProgramCacheKey = () => 'alvorada-cinematic-city-backdrop-v1';
  return { dawn, material, opacity };
}

function createArrivalMaterial(map: THREE.Texture): ArrivalMaterial {
  const opacity = { value: 0 };
  const dawn = { value: 0 };
  const material = new THREE.MeshBasicMaterial({
    alphaTest: 0.008,
    depthTest: false,
    depthWrite: false,
    map,
    toneMapped: true,
    transparent: true,
  });
  material.dithering = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAlvoradaArrivalOpacity = opacity;
    shader.uniforms.uAlvoradaArrivalDawn = dawn;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uAlvoradaArrivalOpacity;\nuniform float uAlvoradaArrivalDawn;',
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec3 alvoradaArrivalCool = diffuseColor.rgb * vec3(0.82, 0.92, 1.07);
        vec3 alvoradaArrivalWarm = diffuseColor.rgb * vec3(1.08, 1.015, 0.9);
        diffuseColor.rgb = mix(
          alvoradaArrivalCool,
          alvoradaArrivalWarm,
          0.38 + uAlvoradaArrivalDawn * 0.34
        );
        diffuseColor.rgb *= mix(0.72, 0.84, uAlvoradaArrivalDawn);
        diffuseColor.a *= uAlvoradaArrivalOpacity;`,
      );
  };
  material.customProgramCacheKey = () => 'alvorada-cinematic-city-arrival-v1';
  return { dawn, material, opacity };
}

export function SantaRosaCinematicBackdrop({ quality }: SantaRosaCinematicBackdropProps) {
  const timeline = useAlvoradaTimeline();
  const { camera, viewport } = useThree();
  const root = useRef<THREE.Group>(null);
  const backdropMesh = useRef<THREE.Mesh>(null);
  const arrivalMesh = useRef<THREE.Mesh>(null);
  const portrait = viewport.aspect < 1;
  const sourceTexture = useTexture(portrait ? PORTRAIT_SOURCE : DESKTOP_SOURCE);
  const texture = useMemo(() => {
    const clone = sourceTexture.clone();
    clone.colorSpace = THREE.SRGBColorSpace;
    clone.anisotropy = quality.mobile ? 4 : 8;
    clone.generateMipmaps = true;
    clone.minFilter = THREE.LinearMipmapLinearFilter;
    clone.needsUpdate = true;
    return clone;
  }, [quality.mobile, sourceTexture]);
  // Overscan prevents the alpha feather from ever becoming a visible image
  // boundary while the camera reframes from the city to the final sky.
  const dimensions = portrait
    ? { height: 57.03, width: 64, x: 0, y: -12, z: -58 }
    : { height: 74.52, width: 152, x: -8, y: -15, z: -62 };
  const geometry = useMemo(
    () => createCurvedBackdropGeometry(dimensions.width, dimensions.height),
    [dimensions.height, dimensions.width],
  );
  const backdrop = useMemo(() => createBackdropMaterial(texture), [texture]);
  const arrival = useMemo(() => createArrivalMaterial(texture), [texture]);
  const forward = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(), []);
  const arrivalPosition = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => () => {
    geometry.dispose();
    backdrop.material.dispose();
    arrival.material.dispose();
    texture.dispose();
  }, [arrival.material, backdrop.material, geometry, texture]);

  useFrame(() => {
    const { ambientElapsed, elapsed } = timeline.current;
    const reveal = smoothRange(elapsed, 5.18, 6.04);
    const dawn = smoothRange(elapsed, 5.25, 8.9);
    const cityArrival = smoothRange(elapsed, 5.3, 5.92)
      * (1 - smoothRange(elapsed, 7.36, 8.22));
    const cityProgress = smoothRange(elapsed, 5.3, 7.7);
    backdrop.opacity.value = reveal * THREE.MathUtils.lerp(0.78, 0.9, dawn);
    backdrop.dawn.value = dawn;
    arrival.opacity.value = cityArrival * 0.94;
    arrival.dawn.value = dawn;
    if (root.current) {
      root.current.visible = reveal > 0.001;
      root.current.position.x = Math.sin(ambientElapsed * 0.045) * 0.035;
    }
    const sourceAspect = portrait ? PORTRAIT_ASPECT : DESKTOP_ASPECT;
    if (backdropMesh.current) {
      backdropMesh.current.scale.setScalar(Math.max(1, viewport.aspect / sourceAspect));
    }
    if (arrivalMesh.current) {
      arrivalMesh.current.visible = cityArrival > 0.001;
      camera.getWorldDirection(forward);
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      arrivalPosition.copy(camera.position)
        .addScaledVector(forward, 2.8)
        .addScaledVector(right, THREE.MathUtils.lerp(-0.08, 0.08, cityProgress))
        .addScaledVector(up, THREE.MathUtils.lerp(-0.04, 0.05, cityProgress));
      arrivalMesh.current.position.copy(arrivalPosition);
      arrivalMesh.current.quaternion.copy(camera.quaternion);
      const arrivalViewport = viewport.getCurrentViewport(camera, arrivalPosition);
      const plateHeight = Math.max(
        arrivalViewport.height,
        arrivalViewport.width / sourceAspect,
      ) * 1.12;
      const plateWidth = plateHeight * sourceAspect;
      const arrivalScale = THREE.MathUtils.lerp(1.045, 1, cityProgress);
      arrivalMesh.current.scale.set(
        plateWidth * arrivalScale,
        plateHeight * arrivalScale,
        1,
      );
    }
  });

  return (
    <group ref={root} visible={false}>
      <mesh
        ref={backdropMesh}
        frustumCulled={false}
        geometry={geometry}
        material={backdrop.material}
        position={[dimensions.x, dimensions.y, dimensions.z]}
        renderOrder={-20}
      />
      <mesh
        ref={arrivalMesh}
        frustumCulled={false}
        material={arrival.material}
        renderOrder={-10}
        visible={false}
      >
        <planeGeometry args={[1, 1, 24, 12]} />
      </mesh>
    </group>
  );
}

useTexture.preload(DESKTOP_SOURCE);
useTexture.preload(PORTRAIT_SOURCE);
