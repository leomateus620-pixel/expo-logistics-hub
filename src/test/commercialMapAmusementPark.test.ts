import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkBounds,
  strategicLandmarkVisualHeight,
} from '@/features/commercial-map/utils/landmarks';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const parkSource = read('src/features/commercial-map/components/canvas/AmusementPark.tsx');
const environmentSource = read('src/features/commercial-map/components/canvas/CommercialMapEnvironment.tsx');
const canvasSource = read('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');
const officialSource = read('src/features/commercial-map/data/officialReference2026.ts');
const packageJson = JSON.parse(read('package.json')) as {
  dependencies: Record<string, string>;
};
const park = OFFICIAL_REFERENCE_ENTITIES.find((entity) => entity.publicIdentifier === 'J')!;
const KAMIKAZE_APEX_SOURCE_VALUE = Number(
  parkSource.match(/KAMIKAZE_APEX_RADIANS = ([\d.]+)/)?.[1],
);

describe('Parque de Diversões J', () => {
  it('preserva o footprint oficial e registra J como landmark estratégico', () => {
    expect(officialSource).toContain("[930, 2450, 1600, 3000]");
    expect(resolveStrategicLandmarkKind(park)).toBe('amusement-park');
    const bounds = strategicLandmarkBounds(park);
    expect(bounds.width).toBeCloseTo(14.6182, 4);
    expect(bounds.depth).toBeCloseTo(12, 4);
    expect(strategicLandmarkVisualHeight(park)).toBeGreaterThan(park.geometry.extrusionHeight);
  });

  it('mantém GSAP e Rapier v1 nos trabalhos para os quais foram escolhidos', () => {
    expect(packageJson.dependencies.gsap).toMatch(/^\^3\./);
    expect(packageJson.dependencies['@react-three/rapier']).toMatch(/^\^1\./);
    expect(parkSource).toContain('gsap.timeline({');
    expect(parkSource).toContain('repeat: -1');
    expect(parkSource).toContain('timeline.kill()');
    expect(parkSource).toContain('<Physics paused={!parkActive}');
    expect(parkSource).toContain('body.current.applyImpulse({');
    expect(parkSource).toContain('body.current.applyTorqueImpulse(');
  });

  it('dorme quando inativo e ativa noite, LEDs instanciados e bloom sem point lights', () => {
    expect(parkSource).toContain('if (!parkActive || !wheel.current) return;');
    expect(parkSource).toContain('if (!parkActive || !body.current) return;');
    expect(parkSource).toContain('body.current?.sleep()');
    expect(parkSource).toContain('<instancedMesh');
    expect(parkSource).toContain('emissiveIntensity={parkActive ? peak : 0}');
    expect(parkSource).not.toMatch(/<pointLight/i);
    expect(parkSource).not.toMatch(/<spotLight/i);
    expect(canvasSource).toContain("=== 'amusement-park'");
    expect(environmentSource).toContain("nightMode ? '#050916'");
    expect(environmentSource).toContain('<SunrisePostProcessing qualityTier={qualityTier} enabled={active} />');
  });

  it('só inicializa o mundo Rapier na primeira ativação, com carrinhos estáticos antes', () => {
    expect(parkSource).toContain('const [physicsBooted, setPhysicsBooted] = useState(false);');
    expect(parkSource).toContain('if (parkActive) setPhysicsBooted(true);');
    expect(parkSource).toContain('<ParkedBumperCars carCount={carCount} />');
    expect(parkSource).toMatch(/physicsBooted \? \(\s*<Suspense fallback=\{<ParkedBumperCars/);
  });

  it('anima os dois braços espelhados do Kamikaze em rise-pause-descend', () => {
    expect(parkSource).toContain('KAMIKAZE_APEX_RADIANS');
    // Apex além da vertical, como nas referências do brinquedo real.
    expect(KAMIKAZE_APEX_SOURCE_VALUE).toBeGreaterThan(Math.PI / 2);
    expect(parkSource).toContain('armA.current.rotation.z = angle;');
    expect(parkSource).toContain('armB.current.rotation.z = -angle;');
    const armRenders = parkSource.match(/<KamikazeArm/g) ?? [];
    expect(armRenders.length).toBe(2);
  });

  it('agrupa LEDs instanciados por cor emissiva e gira o anel junto da roda', () => {
    // Cores por-instância não tingem o termo emissivo; cada cor tem seu grupo.
    const ledStrings = parkSource.match(/<LedString/g) ?? [];
    expect(ledStrings.length).toBeGreaterThanOrEqual(5);
    expect(parkSource).toContain("color=\"#ff315f\"");
    expect(parkSource).toContain("color=\"#42d9ff\"");
    expect(parkSource).toContain("color=\"#f5c638\"");
    // O anel de LEDs vive dentro do grupo rotativo da roda-gigante.
    expect(parkSource.indexOf('<LedString positions={ringLeds.even}'))
      .toBeGreaterThan(parkSource.indexOf('<group ref={wheel}'));
  });

  it('assenta os brinquedos em terreno verde-marrom com cerca perimetral', () => {
    expect(parkSource).toContain('function ParkTerrain');
    expect(parkSource).toContain('vertexColors');
    expect(parkSource).toContain("new THREE.Color('#66764a')");
    expect(parkSource).toContain("new THREE.Color('#8a704e')");
    expect(parkSource).toContain('function ParkFence');
    expect(parkSource).toContain('geometry.dispose()');
  });
});
