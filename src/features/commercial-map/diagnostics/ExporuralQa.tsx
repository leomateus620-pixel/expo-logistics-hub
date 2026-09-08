import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

/** Read-only DEV instrumentation, requested explicitly by the reproducible QA script. */
export function ExporuralQa() {
  const { scene, gl, camera } = useThree();
  useEffect(() => {
    const report = () => {
      const root = scene.getObjectByName(
        'churrascaria-exporural-com-catavento',
      );
      if (!root) return;
      const entries: {
        name: string;
        uuid: string;
        triangles: number;
        shadow: boolean;
      }[] = [];
      root.traverseVisible((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        if (materials.every((m) => !m.visible)) return;
        const triangles =
          (mesh.geometry.index?.count ??
            mesh.geometry.getAttribute('position')?.count ??
            0) / 3;
        entries.push({
          name: o.name,
          uuid: o.uuid,
          triangles:
            triangles *
            ((o as THREE.InstancedMesh).isInstancedMesh
              ? (o as THREE.InstancedMesh).count
              : 1),
          shadow: mesh.castShadow,
        });
      });
      const rotor = root.getObjectByName('rotor-eixo-local-z');
      const activity = root.getObjectByName(
        'atividade-contextual-churrascaria',
      );
      const roof = root.getObjectByName('recorte-local-cobertura-noroeste');
      const project = (point: THREE.Vector3) => {
        point.project(camera);
        const r = gl.domElement.getBoundingClientRect();
        return [
          r.x + ((point.x + 1) * r.width) / 2,
          r.y + ((1 - point.y) * r.height) / 2,
        ];
      };
      const center = root.getWorldPosition(new THREE.Vector3());
      const c4Point = center.clone().add(new THREE.Vector3(0.1, 0.7, 0));
      gl.domElement.dataset.exporuralQa = JSON.stringify({
        restroomHandlerAvailable: root.userData.restroomHandlerAvailable,
        calls: entries.length,
        triangles: entries.reduce((n, e) => n + e.triangles, 0),
        shadowCalls: entries.filter((e) => e.shadow).length,
        entries,
        activity: activity?.userData.activity ?? {
          selected: false,
          amount: 0,
          updates: 0,
          crew: 0,
          particles: 0,
        },
        rotor: rotor && {
          phase: rotor.rotation.z,
          yaw: rotor.parent.rotation.y,
          axis: new THREE.Vector3(0, 0, 1)
            .applyQuaternion(rotor.getWorldQuaternion(new THREE.Quaternion()))
            .toArray(),
        },
        roofVisible: roof?.visible,
        roofOpacity: (
          (roof?.children[0] as THREE.Mesh)?.material as THREE.Material
        )?.opacity,
        screenC4: project(c4Point),
        screenE06: project(root.getObjectByName('hit-volume-anexo-churrascaria-exporural')!.getWorldPosition(new THREE.Vector3())),
        memory: { ...gl.info.memory, programs: gl.info.programs?.length },
      });
    };
    window.addEventListener('exporural-qa', report);
    return () => window.removeEventListener('exporural-qa', report);
  }, [scene, gl, camera]);
  return null;
}
