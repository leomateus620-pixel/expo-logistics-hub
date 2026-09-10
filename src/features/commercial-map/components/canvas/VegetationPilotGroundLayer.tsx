import { memo, useMemo, useEffect, useLayoutEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { MapEntity } from "../../types";
import type { CommercialMapTree } from "../../data/commercialTrees";
import {
  VEGETATION_PILOT_AREAS,
  buildPilotGroundAnchors,
  pilotHash,
  pilotRandom,
} from "../../utils/vegetationPilot";
import { createPilotGrassGeometry } from "../../utils/vegetationPilotAssets";
import { disposeInstancedMesh } from "../../utils/instancedMeshDisposal";
import { createPilotFoliageMaterial } from "./vegetationPilotMaterial";
import { commercialTreeGroundElevation } from "../../utils/treeLayer";
import {
  projectedCommercialMapShadowDirection,
  projectedCommercialMapShadowRotation,
} from "../../data/commercialMapEnvironment";

const NO_RAYCAST = () => undefined;
/** Small, mipmapped, irregular shadow footprint for the reduced path's fixed sun. */
function shadowTexture() {
  const size = 128,
    data = new Uint8Array(size * size * 4),
    random = pilotRandom(789);
  const lobes = Array.from({ length: 32 }, () => ({
    x: (random() - 0.5) * 1.1,
    y: (random() - 0.5) * 1.0,
    r: 0.07 + random() * 0.17,
  }));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 2 - 1,
        v = (y / size) * 2 - 1;
      let shade = 0;
      for (const lobe of lobes)
        shade = Math.max(
          shade,
          1 -
            THREE.MathUtils.smoothstep(
              Math.hypot(u - lobe.x, v - lobe.y),
              lobe.r * 0.45,
              lobe.r,
            ),
        );
      const o = (y * size + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = 255;
      data[o + 3] = Math.round(shade * 180);
    }
  const t = new THREE.DataTexture(data, size, size);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export const VegetationPilotGroundLayer = memo(
  function VegetationPilotGroundLayer({
    entities,
    trees,
    visible,
    reducedGraphics,
  }: {
    entities: readonly MapEntity[];
    trees: readonly CommercialMapTree[];
    visible: boolean;
    reducedGraphics: boolean;
  }) {
    const { invalidate } = useThree();
    const anchors = useMemo(
      () => buildPilotGroundAnchors(entities, trees),
      [entities, trees],
    );
    const geometry = useMemo(createPilotGrassGeometry, []);
    const material = useMemo(() => createPilotFoliageMaterial(false, true), []);
    const batches = useMemo(
      () =>
        VEGETATION_PILOT_AREAS.map((area) => {
          const points = anchors
            .filter((p) => p.area === area)
            .slice(0, area === "PARKING_EXHIBITORS_VISITORS" ? 1800 : 2400);
          return {
            area,
            points,
            mesh: new THREE.InstancedMesh(geometry, material, points.length),
          };
        }),
      [anchors, geometry, material],
    );
    const contact = useMemo(() => {
      const map = shadowTexture();
      const geometry = new THREE.PlaneGeometry(2, 2);
      geometry.rotateX(-Math.PI / 2);
      const material = new THREE.MeshBasicMaterial({
        map,
        color: "#253522",
        transparent: true,
        opacity: 0.21,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -2,
      });
      return {
        map,
        geometry,
        material,
        mesh: new THREE.InstancedMesh(geometry, material, trees.length),
      };
    }, [trees.length]);
    useLayoutEffect(() => {
      const transform = new THREE.Object3D(),
        color = new THREE.Color();
      batches.forEach((batch) => {
        batch.points.forEach((p, i) => {
          transform.position.set(p.x, p.y, p.z);
          transform.rotation.set(0, p.angle, 0);
          transform.scale.set(p.scale, p.scale, p.scale);
          transform.updateMatrix();
          batch.mesh.setMatrixAt(i, transform.matrix);
          color.set(p.tone > 0.83 ? "#d0bd82" : "#ffffff");
          batch.mesh.setColorAt(i, color);
        });
        batch.mesh.instanceMatrix.needsUpdate = true;
        if (batch.mesh.instanceColor)
          batch.mesh.instanceColor.needsUpdate = true;
        batch.mesh.computeBoundingBox();
        batch.mesh.computeBoundingSphere();
        batch.mesh.raycast = NO_RAYCAST;
        batch.mesh.userData = {
          area: batch.area,
          fullCount: batch.points.length,
          groundCover: true,
        };
      });
      const direction = projectedCommercialMapShadowDirection();
      trees.forEach((tree, i) => {
        const random = pilotRandom(pilotHash(tree.id));
        const reach = reducedGraphics ? tree.canopyRadius * 0.6 : 0;
        transform.position.set(
          tree.position[0] + direction[0] * reach,
          commercialTreeGroundElevation(tree, entities) + 0.002,
          tree.position[1] + direction[1] * reach,
        );
        transform.rotation.set(
          0,
          reducedGraphics
            ? projectedCommercialMapShadowRotation()
            : random() * Math.PI * 2,
          0,
        );
        const scale = reducedGraphics
          ? tree.canopyRadius * 1.25
          : tree.trunkRadius * 2.2;
        transform.scale.set(
          scale,
          reducedGraphics ? 1 : 1,
          scale * (reducedGraphics ? 1.3 : 0.9),
        );
        transform.updateMatrix();
        contact.mesh.setMatrixAt(i, transform.matrix);
      });
      contact.mesh.instanceMatrix.needsUpdate = true;
      contact.mesh.computeBoundingSphere();
      contact.mesh.raycast = NO_RAYCAST;
      invalidate();
    }, [batches, trees, entities, contact, invalidate, reducedGraphics]);
    useFrame(({ camera }) => {
      for (const { mesh, points } of batches) {
        const sphere = mesh.boundingSphere;
        const distance = sphere
          ? Math.max(
              0,
              camera.position.distanceTo(sphere.center) - sphere.radius,
            )
          : 0;
        mesh.visible = visible && distance < 30;
        // Quality switch preserves nested distribution; camera fades in shader before culling.
        mesh.count = Math.ceil(points.length * (reducedGraphics ? 0.5 : 1));
      }
    });
    useEffect(
      () => () => batches.forEach(({ mesh }) => disposeInstancedMesh(mesh)),
      [batches],
    );
    useEffect(
      () => () => {
        geometry.dispose();
        material.dispose();
      },
      [geometry, material],
    );
    useEffect(
      () => () => {
        disposeInstancedMesh(contact.mesh);
        contact.geometry.dispose();
        contact.material.dispose();
        contact.map.dispose();
      },
      [contact],
    );
    return (
      <group
        name="vegetation-pilot-ground-cover"
        visible={visible}
        dispose={null}
        userData={{ presentationOnly: true, anchorCount: anchors.length }}
      >
        {batches.map(({ area, mesh }) => (
          <primitive
            key={area}
            object={mesh}
            name={`pilot-grass-${area}`}
            receiveShadow
            castShadow={false}
          />
        ))}
        <primitive
          object={contact.mesh}
          name="pilot-tree-ground-contact"
          renderOrder={3}
        />
      </group>
    );
  },
);
