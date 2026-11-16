import * as THREE from 'three';

type Point = [number, number, number];
type ServiceSurface = 'stainless' | 'inner-metal' | 'dark' | 'trim' | 'green' | 'white' | 'lamp';

interface ServiceBuilder {
  add: (surface: ServiceSurface, geometry: THREE.BufferGeometry, position: Point, service: true) => void;
  box: (surface: ServiceSurface, size: Point, position: Point, options: { bevel?: number; service: true }) => void;
  detailed: boolean;
}

const TANK_RADIUS = 0.093;
const TANK_Z = -0.043;
const TANK_BOTTOM = 0.383;
const SUPPLY_Y = 0.825;
const SUPPLY_Z = 0.071;
const RETURN_Y = 0.398;
const RETURN_Z = 0.086;
const TANK_PROFILE: readonly [radius: number, y: number, fine?: boolean][] = [
  [0, 0], [0.37, 0.002, true], [0.67, 0.014], [0.87, 0.033, true], [0.98, 0.052], [1, 0.067],
  [1, 0.344], [0.982, 0.364, true], [0.888, 0.384], [0.695, 0.405, true], [0.39, 0.418], [0, 0.423],
];

/** Open exhibition bays and the deployable dispensers below. The builder batches these into the truck's materials. */
export function buildChoppTruckService({ add, box, detailed }: ServiceBuilder) {
  const radialSegments = detailed ? 22 : 14;
  const tankProfile = TANK_PROFILE.filter(([, , fine]) => detailed || !fine)
    .map(([radius, y]) => new THREE.Vector2(radius * TANK_RADIUS, y));
  const part = (surface: ServiceSurface, geometry: THREE.BufferGeometry, position: Point) => {
    add(surface, geometry, position, true);
  };
  const panel = (surface: ServiceSurface, size: Point, position: Point, bevel?: number) => {
    box(surface, size, position, { bevel, service: true });
  };
  function cylinder(surface: ServiceSurface, radius: number, length: number, position: Point, axis: 'x' | 'y' | 'z' = 'y') {
    const geometry = new THREE.CylinderGeometry(radius, radius, length, detailed ? 10 : 8);
    if (axis === 'x') geometry.rotateZ(Math.PI / 2);
    if (axis === 'z') geometry.rotateX(Math.PI / 2);
    part(surface, geometry, position);
  }
  function elbow(radius: number, start: Point, corner: Point, end: Point) {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(...start), new THREE.Vector3(...corner), new THREE.Vector3(...end),
    );
    part('stainless', new THREE.TubeGeometry(curve, detailed ? 5 : 4, radius, detailed ? 6 : 5, false), [0, 0, 0]);
  }

  // Each bay has a shallow rear liner, exposed floor tracks and a diffuse work light.
  for (const x of [-0.321, 0.321]) {
    panel('dark', [0.6, 0.495, 0.017], [x, 0.596, -0.146]);
    panel('inner-metal', [0.593, 0.029, 0.19], [x, 0.355, -0.045], 0.009);
    panel('trim', [0.581, 0.026, 0.032], [x, 0.796, -0.137]);
    panel('lamp', [0.514, 0.011, 0.025], [x, 0.848, 0.03]);
    panel('lamp', [0.523, 0.008, 0.013], [x, 0.374, 0.055]);
    for (const side of [-1, 1]) {
      panel('inner-metal', [0.022, 0.448, 0.025], [x + side * 0.281, 0.593, -0.121]);
    }
  }

  for (const x of [-0.538, -0.329, -0.12, 0.19, 0.448]) {
    part('stainless', new THREE.LatheGeometry(tankProfile, radialSegments), [x, TANK_BOTTOM, TANK_Z]);
    // Rolled shoulders and the colored collars keep the vessel shape readable.
    for (const y of [TANK_BOTTOM + 0.067, TANK_BOTTOM + 0.344]) {
      part('inner-metal', new THREE.CylinderGeometry(TANK_RADIUS + 0.002, TANK_RADIUS + 0.002, 0.009,
        radialSegments, 1, true), [x, y, TANK_Z]);
    }
    part('green', new THREE.CylinderGeometry(TANK_RADIUS + 0.0015, TANK_RADIUS + 0.0015, 0.019,
      radialSegments, 1, true), [x, TANK_BOTTOM + 0.312, TANK_Z]);
    for (const side of [-1, 1]) {
      panel('inner-metal', [0.022, 0.057, 0.065], [x + side * 0.054, 0.391, -0.051]);
    }
    cylinder('inner-metal', 0.026, 0.014, [x, 0.812, TANK_Z]);
    cylinder('stainless', 0.011, 0.028, [x, 0.824, TANK_Z]);
    cylinder('trim', 0.014, 0.034, [x, 0.825, -0.02], 'z');
    elbow(0.013, [x, 0.835, TANK_Z], [x, 0.848, 0.051], [x, SUPPLY_Y, SUPPLY_Z]);
    cylinder('inner-metal', 0.019, 0.021, [x, SUPPLY_Y, SUPPLY_Z], 'x');

    // The outlet uses a valve and a curved return into the lower header.
    cylinder('trim', 0.021, 0.018, [x, 0.429, 0.026], 'z');
    cylinder('green', 0.018, 0.016, [x, 0.429, 0.046], 'z');
    elbow(0.013, [x, 0.429, 0.046], [x, 0.429, RETURN_Z], [x, RETURN_Y, RETURN_Z]);
    cylinder('inner-metal', 0.021, 0.021, [x, RETURN_Y, RETURN_Z], 'x');
    if (detailed) {
      cylinder('white', 0.011, 0.004, [x, 0.826, -0.001], 'z');
    }
  }
  cylinder('stainless', 0.014, 1.2, [-0.024, SUPPLY_Y, SUPPLY_Z], 'x');
  cylinder('stainless', 0.016, 1.2, [-0.024, RETURN_Y, RETURN_Z], 'x');
  for (const x of [0.058, 0.56]) {
    elbow(0.012, [x, SUPPLY_Y, SUPPLY_Z], [x, SUPPLY_Y, 0.095], [x, 0.795, 0.095]);
    cylinder('stainless', 0.012, 0.36, [x, 0.616, 0.095]);
    elbow(0.012, [x, 0.436, 0.095], [x, RETURN_Y, 0.095], [x, RETURN_Y, RETURN_Z]);
    cylinder('inner-metal', 0.019, 0.042, [x, 0.592, 0.095]);
    cylinder('green', 0.024, 0.012, [x, 0.592, 0.114], 'z');
    cylinder('trim', 0.009, 0.009, [x, 0.592, 0.122], 'z');
  }
  panel('trim', [1.11, 0.015, 0.021], [0, 0.382, 0.019]);
  panel('inner-metal', [1.18, 0.032, 0.031], [0, 0.342, 0.044]);

  // Chassis-mounted dispensers, with service hardware above each hinged front.
  for (const center of [-0.393, 0.393]) {
    for (const offset of [-0.119, 0.119]) {
      panel('trim', [0.025, 0.026, 0.137], [center + offset, 0.17, -0.024]);
    }
    panel('dark', [0.337, 0.133, 0.12], [center, 0.227, 0.062], 0.011);
    panel('green', [0.314, 0.107, 0.023], [center, 0.226, 0.118], 0.009);
    panel('inner-metal', [0.348, 0.019, 0.145], [center, 0.295, 0.065], 0.008);
    panel('dark', [0.205, 0.007, 0.049], [center, 0.306, 0.102]);
    panel('trim', [0.236, 0.064, 0.026], [center, 0.345, 0.029], 0.008);
    for (const side of [-1, 1]) {
      const x = center + side * 0.058;
      cylinder('inner-metal', 0.014, 0.023, [x, 0.347, 0.052], 'z');
      elbow(0.008, [x, 0.347, 0.053], [x, 0.361, 0.098], [x, 0.328, 0.099]);
      cylinder('dark', 0.01, 0.036, [x, 0.373, 0.076]);
    }
    if (detailed) {
      for (const z of [0.085, 0.104, 0.123]) {
        panel('inner-metal', [0.195, 0.003, 0.003], [center, 0.311, z]);
      }
      panel('trim', [0.069, 0.011, 0.007], [center, 0.249, 0.133]);
    }
  }

  panel('trim', [0.155, 0.026, 0.137], [0, 0.174, -0.024]);
  panel('dark', [0.206, 0.122, 0.118], [0, 0.225, 0.058], 0.014);
  panel('green', [0.187, 0.109, 0.023], [0, 0.224, 0.114], 0.009);
  panel('inner-metal', [0.212, 0.016, 0.138], [0, 0.294, 0.064], 0.007);
  panel('trim', [0.097, 0.029, 0.008], [0, 0.244, 0.128]);
  for (const x of [-0.025, 0.025]) {
    cylinder('white', 0.01, 0.005, [x, 0.244, 0.134], 'z');
  }
}
