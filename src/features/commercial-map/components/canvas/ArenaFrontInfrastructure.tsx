import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  ARENA_FRONT_LAYOUT,
  PARK_ENVIRONMENT_FEATURES,
  sourceBoundsToLocal,
  sourcePolygonToLocal,
} from '../../data/parkEnvironment';

const NO_RAYCAST = () => undefined;
const UNIT_Y = new THREE.Vector3(0, 1, 0);
const BASE_Y = ARENA_FRONT_LAYOUT.plaza.elevation;

function featureUserData(featureId: string) {
  const feature = PARK_ENVIRONMENT_FEATURES.find((candidate) => candidate.id === featureId);
  if (!feature) throw new Error(`Feature ambiental não encontrada: ${featureId}`);
  return Object.freeze({
    featureId: feature.id,
    classification: feature.classification,
    isSellable: feature.isSellable,
    contributesToCommercialMetrics: feature.contributesToCommercialMetrics,
  });
}

const PLAZA_USER_DATA = featureUserData('arena-front-public-plaza');
const STAIRS_USER_DATA = featureUserData('arena-front-concrete-stairs');
const COURTS_USER_DATA = Object.freeze({
  featureIds: ['arena-front-multi-sport-court', 'arena-front-sand-volleyball-court'],
  classification: 'SPORTS_COURT',
  isSellable: false,
  contributesToCommercialMetrics: false,
});
const LANDSCAPE_USER_DATA = featureUserData('arena-front-landscape-support');
const INFRASTRUCTURE_USER_DATA = Object.freeze({
  classification: 'NON_COMMERCIAL_STRUCTURE',
  isSellable: false,
  contributesToCommercialMetrics: false,
});

interface Segment {
  start: readonly [number, number, number];
  end: readonly [number, number, number];
  radius: number;
}

function refreshInstanceBounds(mesh: THREE.InstancedMesh | null) {
  if (!mesh) return;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

function updateMaterialOpacity(material: THREE.Material, opacity: number) {
  const normalizedOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
  const transparent = normalizedOpacity < 0.999;
  const depthWrite = normalizedOpacity > 0.94;
  if (
    material.opacity === normalizedOpacity
    && material.transparent === transparent
    && material.depthWrite === depthWrite
  ) return;
  material.opacity = normalizedOpacity;
  material.transparent = transparent;
  material.depthWrite = depthWrite;
  material.needsUpdate = true;
}

function createHorizontalPolygonGeometry(points: readonly (readonly [number, number])[]) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], index) => {
    if (index === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 2);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createPolygonOutlineGeometry(points: readonly (readonly [number, number])[], y: number) {
  const vertices: number[] = [];
  points.forEach(([x, z], index) => {
    const [nextX, nextZ] = points[(index + 1) % points.length];
    vertices.push(x, y, z, nextX, y, nextZ);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function appendTriangle(
  vertices: number[],
  first: readonly [number, number, number],
  second: readonly [number, number, number],
  third: readonly [number, number, number],
) {
  vertices.push(...first, ...second, ...third);
}

function appendWedge(
  vertices: number[],
  bounds: ReturnType<typeof sourceBoundsToLocal>,
  lowY: number,
  highY: number,
) {
  const a = [bounds.minX, highY, bounds.maxZ] as const;
  const b = [bounds.maxX, lowY, bounds.maxZ] as const;
  const c = [bounds.maxX, lowY, bounds.minZ] as const;
  const d = [bounds.minX, highY, bounds.minZ] as const;
  const a0 = [bounds.minX, BASE_Y, bounds.maxZ] as const;
  const b0 = [bounds.maxX, BASE_Y, bounds.maxZ] as const;
  const c0 = [bounds.maxX, BASE_Y, bounds.minZ] as const;
  const d0 = [bounds.minX, BASE_Y, bounds.minZ] as const;

  appendTriangle(vertices, a, b, c);
  appendTriangle(vertices, a, c, d);
  appendTriangle(vertices, a0, d0, c0);
  appendTriangle(vertices, a0, c0, b0);
  appendTriangle(vertices, d0, d, c);
  appendTriangle(vertices, d0, c, c0);
  appendTriangle(vertices, a0, b0, b);
  appendTriangle(vertices, a0, b, a);
  appendTriangle(vertices, a0, a, d);
  appendTriangle(vertices, a0, d, d0);
  appendTriangle(vertices, b0, c0, c);
  appendTriangle(vertices, b0, c, b);
}

function createBermGeometry() {
  const vertices: number[] = [];
  const stairHeight = ARENA_FRONT_LAYOUT.stairs.stepCount * ARENA_FRONT_LAYOUT.stairs.riserHeight;
  appendWedge(vertices, sourceBoundsToLocal(ARENA_FRONT_LAYOUT.northBerm.sourceBounds), BASE_Y + 0.02, BASE_Y + stairHeight);
  appendWedge(vertices, sourceBoundsToLocal(ARENA_FRONT_LAYOUT.southBerm.sourceBounds), BASE_Y + 0.02, BASE_Y + stairHeight);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function courtLineGeometry() {
  const vertices: number[] = [];
  const addSegment = (start: readonly [number, number], end: readonly [number, number]) => {
    vertices.push(start[0], BASE_Y + 0.087, start[1], end[0], BASE_Y + 0.087, end[1]);
  };
  const addRectangle = (bounds: ReturnType<typeof sourceBoundsToLocal>, inset: number) => {
    const minX = bounds.minX + inset;
    const maxX = bounds.maxX - inset;
    const minZ = bounds.minZ + inset;
    const maxZ = bounds.maxZ - inset;
    addSegment([minX, minZ], [maxX, minZ]);
    addSegment([maxX, minZ], [maxX, maxZ]);
    addSegment([maxX, maxZ], [minX, maxZ]);
    addSegment([minX, maxZ], [minX, minZ]);
  };
  const addCircle = (centerX: number, centerZ: number, radius: number, segments = 20) => {
    for (let index = 0; index < segments; index += 1) {
      const startAngle = (index / segments) * Math.PI * 2;
      const endAngle = ((index + 1) / segments) * Math.PI * 2;
      addSegment(
        [centerX + Math.cos(startAngle) * radius, centerZ + Math.sin(startAngle) * radius],
        [centerX + Math.cos(endAngle) * radius, centerZ + Math.sin(endAngle) * radius],
      );
    }
  };

  const multi = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.multiSportCourt.sourceBounds);
  const sand = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.sandVolleyballCourt.sourceBounds);
  [ARENA_FRONT_LAYOUT.multiSportCourt, ARENA_FRONT_LAYOUT.sandVolleyballCourt].forEach((court) => {
    const bounds = sourceBoundsToLocal(court.sourceBounds);
    addRectangle(bounds, 0.42);
    addSegment([bounds.minX + 0.42, bounds.centerZ], [bounds.maxX - 0.42, bounds.centerZ]);
  });
  addCircle(multi.centerX, multi.centerZ, Math.min(multi.depth, multi.width) * 0.14);
  const laneWidth = multi.width * 0.42;
  const laneDepth = multi.depth * 0.16;
  addRectangle({
    ...multi,
    minX: multi.centerX - laneWidth / 2,
    maxX: multi.centerX + laneWidth / 2,
    minZ: multi.minZ + 0.42,
    maxZ: multi.minZ + 0.42 + laneDepth,
  }, 0);
  addRectangle({
    ...multi,
    minX: multi.centerX - laneWidth / 2,
    maxX: multi.centerX + laneWidth / 2,
    minZ: multi.maxZ - 0.42 - laneDepth,
    maxZ: multi.maxZ - 0.42,
  }, 0);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function courtNetGeometry(reducedGraphics: boolean) {
  const vertices: number[] = [];
  const add = (start: readonly [number, number, number], end: readonly [number, number, number]) => {
    vertices.push(...start, ...end);
  };
  const verticalDivisions = reducedGraphics ? 6 : 10;
  const horizontalDivisions = reducedGraphics ? 2 : 4;
  [ARENA_FRONT_LAYOUT.multiSportCourt, ARENA_FRONT_LAYOUT.sandVolleyballCourt]
    .filter((court) => court.supportsVolleyball)
    .forEach((court) => {
      const bounds = sourceBoundsToLocal(court.sourceBounds);
      const minX = bounds.minX + 0.4;
      const maxX = bounds.maxX - 0.4;
      const bottomY = BASE_Y + 0.34;
      const topY = BASE_Y + 0.94;
      for (let index = 0; index <= verticalDivisions; index += 1) {
        const x = THREE.MathUtils.lerp(minX, maxX, index / verticalDivisions);
        add([x, bottomY, bounds.centerZ], [x, topY, bounds.centerZ]);
      }
      for (let index = 0; index <= horizontalDivisions; index += 1) {
        const y = THREE.MathUtils.lerp(bottomY, topY, index / horizontalDivisions);
        add([minX, y, bounds.centerZ], [maxX, y, bounds.centerZ]);
      }
    });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

type MetalInfrastructureSubset = 'arena-structures' | 'courts';

function buildMetalSegments(
  reducedGraphics: boolean,
  subset: MetalInfrastructureSubset,
): Segment[] {
  const segments: Segment[] = [];
  if (subset === 'arena-structures') {
    const stairs = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.stairs.sourceBounds);
    const config = ARENA_FRONT_LAYOUT.stairs;
    const usableRun = stairs.width - config.lowerLandingDepth - config.upperLandingDepth;
    const stepRun = (
      usableRun - config.intermediateLandingSteps.length * config.intermediateLandingDepth
    ) / config.stepCount;
    const bankDepth = (stairs.depth - config.bankGap * (config.bankCount - 1)) / config.bankCount;
    const railZs = Array.from({ length: config.bankCount }, (_, bank) => (
      [0.04, 0.34, 0.66, 0.96].map((fraction) => (
        stairs.minZ + bank * (bankDepth + config.bankGap) + bankDepth * fraction
      ))
    )).flat();
    railZs.forEach((z) => {
      const flightEnds = [...config.intermediateLandingSteps, config.stepCount];
      let flightStartStep = 0;
      let flightStartX = stairs.maxX - config.lowerLandingDepth;
      flightEnds.forEach((flightEndStep) => {
        const flightEndX = flightStartX - (flightEndStep - flightStartStep) * stepRun;
        segments.push({
          start: [flightStartX, BASE_Y + flightStartStep * config.riserHeight + 0.68, z],
          end: [flightEndX, BASE_Y + flightEndStep * config.riserHeight + 0.68, z],
          radius: 0.022,
        });
        if (flightEndStep !== config.stepCount) {
          const landingEndX = flightEndX - config.intermediateLandingDepth;
          segments.push({
            start: [flightEndX, BASE_Y + flightEndStep * config.riserHeight + 0.68, z],
            end: [landingEndX, BASE_Y + flightEndStep * config.riserHeight + 0.68, z],
            radius: 0.022,
          });
          flightStartX = landingEndX;
        }
        flightStartStep = flightEndStep;
      });
      const postStride = reducedGraphics ? 3 : 2;
      for (let step = 0; step <= config.stepCount; step += postStride) {
        const level = Math.min(config.stepCount, step);
        const completedLandings = config.intermediateLandingSteps.filter((landingStep) => landingStep <= level).length;
        const x = stairs.maxX
          - config.lowerLandingDepth
          - Math.max(0.02, level * stepRun + completedLandings * config.intermediateLandingDepth);
        const surfaceY = BASE_Y + Math.max(config.riserHeight, level * config.riserHeight);
        segments.push({
          start: [x, surfaceY, z],
          end: [x, surfaceY + 0.68, z],
          radius: 0.024,
        });
      }
      config.intermediateLandingSteps.forEach((landingStep, landingIndex) => {
        const startX = stairs.maxX
          - config.lowerLandingDepth
          - landingStep * stepRun
          - landingIndex * config.intermediateLandingDepth;
        segments.push({
          start: [startX, BASE_Y + landingStep * config.riserHeight, z],
          end: [startX, BASE_Y + landingStep * config.riserHeight + 0.68, z],
          radius: 0.024,
        });
      });
    });
  }

  if (subset === 'courts') {
    const multi = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.multiSportCourt.sourceBounds);
    const sand = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.sandVolleyballCourt.sourceBounds);
    [multi, sand].forEach((bounds) => {
      [bounds.minX + 0.4, bounds.maxX - 0.4].forEach((x) => segments.push({
        start: [x, BASE_Y + 0.08, bounds.centerZ],
        end: [x, BASE_Y + 1, bounds.centerZ],
        radius: 0.028,
      }));
    });
    if (ARENA_FRONT_LAYOUT.multiSportCourt.supportsBasketball) [multi.minZ + 0.28, multi.maxZ - 0.28].forEach((z, index) => {
      const direction = index === 0 ? 1 : -1;
      segments.push({
        start: [multi.centerX, BASE_Y + 0.08, z],
        end: [multi.centerX, BASE_Y + 1.02, z],
        radius: 0.033,
      });
      segments.push({
        start: [multi.centerX, BASE_Y + 0.98, z],
        end: [multi.centerX, BASE_Y + 0.98, z + direction * 0.38],
        radius: 0.026,
      });
    });
  }
  return segments;
}

function StepInstances({ reducedGraphics, opacity }: { reducedGraphics: boolean; opacity: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { gl, invalidate } = useThree();
  const bounds = useMemo(() => sourceBoundsToLocal(ARENA_FRONT_LAYOUT.stairs.sourceBounds), []);
  const config = ARENA_FRONT_LAYOUT.stairs;
  const instanceCount = (
    config.stepCount * config.bankCount
    + config.intermediateLandingSteps.length * config.bankCount
    + 2
  );
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#c7c4b9',
    roughness: 0.94,
    metalness: 0,
  }), []);

  useEffect(() => {
    updateMaterialOpacity(material, opacity);
    invalidate();
  }, [invalidate, material, opacity]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const transform = new THREE.Object3D();
    const usableRun = bounds.width - config.lowerLandingDepth - config.upperLandingDepth;
    const stepRun = (
      usableRun - config.intermediateLandingSteps.length * config.intermediateLandingDepth
    ) / config.stepCount;
    const bankDepth = (bounds.depth - config.bankGap * (config.bankCount - 1)) / config.bankCount;
    let instance = 0;
    for (let bank = 0; bank < config.bankCount; bank += 1) {
      const z = bounds.minZ + bankDepth / 2 + bank * (bankDepth + config.bankGap);
      let cursorX = bounds.maxX - config.lowerLandingDepth;
      for (let step = 0; step < config.stepCount; step += 1) {
        const height = (step + 1) * config.riserHeight;
        const x = cursorX - stepRun / 2;
        transform.position.set(x, BASE_Y + height / 2, z);
        transform.rotation.set(0, 0, 0);
        transform.scale.set(stepRun + 0.012, height, bankDepth);
        transform.updateMatrix();
        mesh.setMatrixAt(instance, transform.matrix);
        instance += 1;
        cursorX -= stepRun;
        if (config.intermediateLandingSteps.includes((step + 1) as 6 | 12)) {
          transform.position.set(cursorX - config.intermediateLandingDepth / 2, BASE_Y + height / 2, z);
          transform.scale.set(config.intermediateLandingDepth, height, bankDepth);
          transform.updateMatrix();
          mesh.setMatrixAt(instance, transform.matrix);
          instance += 1;
          cursorX -= config.intermediateLandingDepth;
        }
      }
    }
    transform.position.set(bounds.maxX - config.lowerLandingDepth / 2, BASE_Y + 0.024, bounds.centerZ);
    transform.scale.set(config.lowerLandingDepth, 0.048, bounds.depth);
    transform.updateMatrix();
    mesh.setMatrixAt(instance, transform.matrix);
    instance += 1;
    const topHeight = config.stepCount * config.riserHeight;
    transform.position.set(bounds.minX + config.upperLandingDepth / 2, BASE_Y + topHeight / 2, bounds.centerZ);
    transform.scale.set(config.upperLandingDepth, topHeight, bounds.depth);
    transform.updateMatrix();
    mesh.setMatrixAt(instance, transform.matrix);
    refreshInstanceBounds(mesh);
    mesh.castShadow = !reducedGraphics && opacity > 0.72;
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [bounds, config, gl, invalidate, opacity, reducedGraphics]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  return (
    <instancedMesh
      ref={ref}
      name="degraus-concreto-arena"
      args={[geometry, material, instanceCount]}
      count={instanceCount}
      receiveShadow
      castShadow={!reducedGraphics && opacity > 0.72}
      frustumCulled
      raycast={NO_RAYCAST}
      userData={STAIRS_USER_DATA}
    />
  );
}

function CourtSurfaces({ opacity }: { opacity: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { invalidate } = useThree();
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.91,
    metalness: 0,
  }), []);

  useEffect(() => {
    updateMaterialOpacity(material, opacity);
    invalidate();
  }, [invalidate, material, opacity]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    const courts = [ARENA_FRONT_LAYOUT.multiSportCourt, ARENA_FRONT_LAYOUT.sandVolleyballCourt];
    let instance = 0;
    courts.forEach((court) => {
      const bounds = sourceBoundsToLocal(court.sourceBounds);
      transform.position.set(bounds.centerX, BASE_Y + 0.023, bounds.centerZ);
      transform.scale.set(bounds.width, 0.046, bounds.depth);
      transform.updateMatrix();
      mesh.setMatrixAt(instance, transform.matrix);
      mesh.setColorAt(instance, color.set(court.apronColor));
      instance += 1;
      transform.position.set(bounds.centerX, BASE_Y + 0.056, bounds.centerZ);
      transform.scale.set(bounds.width - court.surfaceInset * 2, 0.035, bounds.depth - court.surfaceInset * 2);
      transform.updateMatrix();
      mesh.setMatrixAt(instance, transform.matrix);
      mesh.setColorAt(instance, color.set(court.surfaceColor));
      instance += 1;
    });
    refreshInstanceBounds(mesh);
    invalidate();
  }, [invalidate]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  return (
    <instancedMesh
      ref={ref}
      name="superficies-quadras-arena"
      args={[geometry, material, 4]}
      count={4}
      receiveShadow
      frustumCulled
      raycast={NO_RAYCAST}
      userData={COURTS_USER_DATA}
    />
  );
}

function MetalInfrastructure({
  reducedGraphics,
  opacity,
  subset,
}: {
  reducedGraphics: boolean;
  opacity: number;
  subset: MetalInfrastructureSubset;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { gl, invalidate } = useThree();
  const segments = useMemo(() => buildMetalSegments(reducedGraphics, subset), [reducedGraphics, subset]);
  const geometry = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, reducedGraphics ? 6 : 8, 1), [reducedGraphics]);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#5d6664',
    roughness: 0.48,
    metalness: 0.58,
  }), []);

  useEffect(() => {
    updateMaterialOpacity(material, opacity);
    invalidate();
  }, [invalidate, material, opacity]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const transform = new THREE.Object3D();
    const start = new THREE.Vector3();
    const end = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const midpoint = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    segments.forEach((segment, index) => {
      start.fromArray(segment.start);
      end.fromArray(segment.end);
      direction.subVectors(end, start);
      midpoint.addVectors(start, end).multiplyScalar(0.5);
      quaternion.setFromUnitVectors(UNIT_Y, direction.clone().normalize());
      transform.position.copy(midpoint);
      transform.quaternion.copy(quaternion);
      transform.scale.set(segment.radius, direction.length(), segment.radius);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    refreshInstanceBounds(mesh);
    mesh.castShadow = !reducedGraphics && opacity > 0.72;
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, invalidate, opacity, reducedGraphics, segments]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  return (
    <instancedMesh
      ref={ref}
      name={subset === 'arena-structures' ? 'corrimaos-escadaria-arena' : 'postes-e-suportes-quadras-arena'}
      args={[geometry, material, segments.length]}
      count={segments.length}
      castShadow={!reducedGraphics && opacity > 0.72}
      frustumCulled
      raycast={NO_RAYCAST}
      userData={subset === 'arena-structures' ? STAIRS_USER_DATA : COURTS_USER_DATA}
    />
  );
}

function BasketballFixtures({ reducedGraphics, opacity }: { reducedGraphics: boolean; opacity: number }) {
  const boardsRef = useRef<THREE.InstancedMesh>(null);
  const ringsRef = useRef<THREE.InstancedMesh>(null);
  const { gl, invalidate } = useThree();
  const bounds = useMemo(() => sourceBoundsToLocal(ARENA_FRONT_LAYOUT.multiSportCourt.sourceBounds), []);
  const boardGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const ringGeometry = useMemo(() => new THREE.TorusGeometry(0.16, 0.018, reducedGraphics ? 5 : 7, reducedGraphics ? 10 : 16), [reducedGraphics]);
  const boardMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e8ece7', roughness: 0.63, metalness: 0.08 }), []);
  const ringMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d96832', roughness: 0.54, metalness: 0.28 }), []);

  useEffect(() => {
    updateMaterialOpacity(boardMaterial, opacity);
    updateMaterialOpacity(ringMaterial, opacity);
    invalidate();
  }, [boardMaterial, invalidate, opacity, ringMaterial]);

  useLayoutEffect(() => {
    const boards = boardsRef.current;
    const rings = ringsRef.current;
    if (!boards || !rings) return;
    const transform = new THREE.Object3D();
    [
      { z: bounds.minZ + 0.42, direction: 1 },
      { z: bounds.maxZ - 0.42, direction: -1 },
    ].forEach((fixture, index) => {
      transform.position.set(bounds.centerX, BASE_Y + 1.04, fixture.z);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(0.68, 0.42, 0.055);
      transform.updateMatrix();
      boards.setMatrixAt(index, transform.matrix);
      transform.position.set(bounds.centerX, BASE_Y + 0.91, fixture.z + fixture.direction * 0.36);
      transform.rotation.set(Math.PI / 2, 0, 0);
      transform.scale.set(1, 1, 1);
      transform.updateMatrix();
      rings.setMatrixAt(index, transform.matrix);
    });
    refreshInstanceBounds(boards);
    refreshInstanceBounds(rings);
    boards.castShadow = !reducedGraphics && opacity > 0.72;
    rings.castShadow = !reducedGraphics && opacity > 0.72;
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [bounds, gl, invalidate, opacity, reducedGraphics]);

  useEffect(() => () => boardGeometry.dispose(), [boardGeometry]);
  useEffect(() => () => ringGeometry.dispose(), [ringGeometry]);
  useEffect(() => () => boardMaterial.dispose(), [boardMaterial]);
  useEffect(() => () => ringMaterial.dispose(), [ringMaterial]);

  return (
    <>
      <instancedMesh
        ref={boardsRef}
        name="tabelas-basquete-arena"
        args={[boardGeometry, boardMaterial, 2]}
        count={2}
        castShadow={!reducedGraphics && opacity > 0.72}
        raycast={NO_RAYCAST}
        userData={COURTS_USER_DATA}
      />
      <instancedMesh
        ref={ringsRef}
        name="aros-basquete-arena"
        args={[ringGeometry, ringMaterial, 2]}
        count={2}
        castShadow={!reducedGraphics && opacity > 0.72}
        raycast={NO_RAYCAST}
        userData={COURTS_USER_DATA}
      />
    </>
  );
}

function ArenaStructures({
  reducedGraphics,
  opacity,
}: {
  reducedGraphics: boolean;
  opacity: number;
}) {
  const { gl, invalidate } = useThree();
  const plazaPoints = useMemo(() => sourcePolygonToLocal(ARENA_FRONT_LAYOUT.plaza.sourcePolygon), []);
  const plazaGeometry = useMemo(() => createHorizontalPolygonGeometry(plazaPoints), [plazaPoints]);
  const plazaOutline = useMemo(() => createPolygonOutlineGeometry(plazaPoints, BASE_Y + 0.012), [plazaPoints]);
  const bermGeometry = useMemo(createBermGeometry, []);

  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, invalidate, opacity, reducedGraphics]);

  useEffect(() => () => plazaGeometry.dispose(), [plazaGeometry]);
  useEffect(() => () => plazaOutline.dispose(), [plazaOutline]);
  useEffect(() => () => bermGeometry.dispose(), [bermGeometry]);

  return (
    <group name="estruturas-publicas-frente-arena" userData={INFRASTRUCTURE_USER_DATA}>
      <mesh
        name="praca-pavimentada-arena"
        geometry={plazaGeometry}
        position={[0, BASE_Y, 0]}
        receiveShadow
        raycast={NO_RAYCAST}
        userData={PLAZA_USER_DATA}
      >
        <meshStandardMaterial
          color="#aaa89e"
          roughness={0.97}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={-1}
          transparent={opacity < 0.999}
          opacity={opacity}
          depthWrite={opacity > 0.94}
        />
      </mesh>
      <lineSegments geometry={plazaOutline} raycast={NO_RAYCAST}>
        <lineBasicMaterial color="#797b74" transparent opacity={0.7 * opacity} toneMapped={false} />
      </lineSegments>
      <mesh
        name="taludes-gramados-escadaria-arena"
        geometry={bermGeometry}
        receiveShadow
        castShadow={!reducedGraphics && opacity > 0.72}
        raycast={NO_RAYCAST}
        userData={LANDSCAPE_USER_DATA}
      >
        <meshStandardMaterial
          color="#73885d"
          roughness={1}
          metalness={0}
          transparent={opacity < 0.999}
          opacity={opacity}
          depthWrite={opacity > 0.94}
        />
      </mesh>
      <StepInstances reducedGraphics={reducedGraphics} opacity={opacity} />
      <MetalInfrastructure
        reducedGraphics={reducedGraphics}
        opacity={opacity}
        subset="arena-structures"
      />
    </group>
  );
}

function ArenaCourts({
  reducedGraphics,
  opacity,
}: {
  reducedGraphics: boolean;
  opacity: number;
}) {
  const { gl, invalidate } = useThree();
  const lines = useMemo(courtLineGeometry, []);
  const nets = useMemo(() => courtNetGeometry(reducedGraphics), [reducedGraphics]);

  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, invalidate, opacity, reducedGraphics]);

  useEffect(() => () => lines.dispose(), [lines]);
  useEffect(() => () => nets.dispose(), [nets]);

  return (
    <group name="quadras-publicas-arena-exporural" userData={COURTS_USER_DATA}>
      <CourtSurfaces opacity={opacity} />
      <lineSegments
        name="marcacoes-quadras-arena"
        geometry={lines}
        raycast={NO_RAYCAST}
        renderOrder={5}
        userData={COURTS_USER_DATA}
      >
        <lineBasicMaterial color="#fff8e6" transparent={opacity < 0.999} opacity={opacity} toneMapped={false} />
      </lineSegments>
      <lineSegments name="redes-volei-arena" geometry={nets} raycast={NO_RAYCAST} userData={COURTS_USER_DATA}>
        <lineBasicMaterial color="#e7e3d7" transparent opacity={0.9 * opacity} toneMapped={false} />
      </lineSegments>
      <MetalInfrastructure reducedGraphics={reducedGraphics} opacity={opacity} subset="courts" />
      {ARENA_FRONT_LAYOUT.multiSportCourt.supportsBasketball && (
        <BasketballFixtures reducedGraphics={reducedGraphics} opacity={opacity} />
      )}
    </group>
  );
}

export const ArenaFrontInfrastructure = memo(function ArenaFrontInfrastructure({
  reducedGraphics,
  showArenaStructures,
  showCourts,
  arenaStructuresOpacity,
  courtsOpacity,
}: {
  reducedGraphics: boolean;
  showArenaStructures: boolean;
  showCourts: boolean;
  arenaStructuresOpacity: number;
  courtsOpacity: number;
}) {
  if (!showArenaStructures && !showCourts) return null;
  return (
    <group name="infraestrutura-publica-frente-arena" userData={INFRASTRUCTURE_USER_DATA}>
      {showArenaStructures && (
        <ArenaStructures reducedGraphics={reducedGraphics} opacity={arenaStructuresOpacity} />
      )}
      {showCourts && <ArenaCourts reducedGraphics={reducedGraphics} opacity={courtsOpacity} />}
    </group>
  );
});
