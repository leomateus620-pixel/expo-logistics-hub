import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { EXTERIOR_ARCHITECTURE_CATALOG } from "../data/exteriorArchitecture";
import { TERRITORY_BUILDINGS } from "../data/territorialEnvironment";
import { architectureForBuilding } from "../data/exteriorArchitecture";
import {
  createArchitectureGeometry,
  createArchitectureMaterial,
} from "../utils/exteriorArchitectureGeometry";

function Models() {
  const resources = useMemo(() => {
    const material = createArchitectureMaterial();
    const group = new THREE.Group();
    const geometries: THREE.BufferGeometry[] = [];
    EXTERIOR_ARCHITECTURE_CATALOG.forEach((model, i) => {
      const geometry = createArchitectureGeometry(model, true);
      geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(
        ((i % 10) - 4.5) * 3.1,
        0,
        (Math.floor(i / 10) - 2) * 3.7,
      );
      mesh.scale.set(
        2,
        model.floors > 2 ? 2.5 : model.floors === 2 ? 1.9 : 1.35,
        2.4,
      );
      mesh.rotation.y = 0.18;
      group.add(mesh);
    });
    return {
      group,
      dispose: () => {
        geometries.forEach((g) => g.dispose());
        material.dispose();
      },
    };
  }, []);
  useEffect(() => () => resources.dispose(), [resources]);
  return <primitive object={resources.group} />;
}

/** Development-only inventory viewer. It does not instantiate unused models in the commercial map. */
export default function ExteriorCatalogQa() {
  const used = new Map<string, number>();
  TERRITORY_BUILDINGS.forEach((b) => {
    const id = architectureForBuilding(b).id;
    used.set(id, (used.get(id) ?? 0) + 1);
  });
  return (
    <main
      style={{
        background: "#e4e7dd",
        color: "#263a32",
        minHeight: "100vh",
        fontFamily: "sans-serif",
        padding: 24,
      }}
    >
      <h1 style={{ fontSize: 26, margin: 0 }}>
        Catálogo do entorno · 50 modelos arquitetônicos
      </h1>
      <p>
        H01–H20 casas · R01–R08 rurais · G01–G08 galpões · B01–B06 prédios ·
        C01–C08 complementares
      </p>
      <div style={{ height: 850 }}>
        <Canvas
          orthographic
          camera={{ position: [0, 32, 25], zoom: 43, near: 0.1, far: 200 }}
          dpr={1}
          gl={{ antialias: true }}
        >
          <color attach="background" args={["#e4e7dd"]} />
          <hemisphereLight args={["#e5eff7", "#918873", 2]} />
          <directionalLight position={[-12, 24, 15]} intensity={3} />
          <Models />
          <OrbitControls target={[0, 0, 0]} makeDefault />
        </Canvas>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(10,minmax(0,1fr))",
          gap: 10,
          fontSize: 12,
        }}
      >
        {EXTERIOR_ARCHITECTURE_CATALOG.map((m) => (
          <div
            key={m.id}
            style={{ borderTop: "2px solid #abb8a2", paddingTop: 8 }}
          >
            <b>
              {m.id} · {used.get(m.id) ?? 0} usos
            </b>
            <br />
            {m.name}
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12 }}>
        Interpretações arquitetônicas plausíveis. Modelos sem uso permanecem
        disponíveis sem criar ocupação.
      </p>
    </main>
  );
}
