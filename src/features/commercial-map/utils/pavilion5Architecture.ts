import type { PavilionArchitectureProfile } from '../data/pavilionArchitecture2026';
import type { CommercialPavilionLayout } from './commercialPavilions';
import type {
  ArchitecturePoint,
  PavilionArchitectureLayout,
  PavilionArchitectureMaterial,
  PavilionArchitectureOpening,
  PavilionArchitectureSignPose,
} from './pavilionArchitectureLayout';

type Face = { axis: 'x' | 'z'; direction: -1 | 1; edge: number; span: number };

/** One section sets the masonry, soffit, sheet, overhang and raised entrance band. */
export function pavilion5ExteriorSection(layout: CommercialPavilionLayout, height: number) {
  const { shell } = layout.exterior;
  const wallHalfX = shell.width / 2;
  const wallHalfZ = shell.frontZ;
  const eaveY = height * .78;
  const sheet = height * .024;
  const pitch = height * .135 / wallHalfZ;
  const overhang = Math.min((layout.depth - shell.depth) / 2, shell.width * .016);
  const roofHalfX = Math.min(layout.width / 2, wallHalfX + overhang);
  const roofHalfZ = wallHalfZ + overhang;
  const soffitAt = (z: number) => eaveY + (wallHalfZ - Math.abs(z)) * pitch;

  return {
    wallHalfX, wallHalfZ, eaveY, sheet, roofHalfX, roofHalfZ, soffitAt,
    ridgeY: soffitAt(0) + sheet,
    fascia: {
      x: -shell.width * .073,
      width: shell.width * .40,
      front: Math.min(layout.depth / 2, wallHalfZ + overhang * 1.12),
      rear: wallHalfZ - height * .19,
      bottom: height * .67,
      top: height,
    },
  };
}

export function pavilion5IdentityPose(layout: CommercialPavilionLayout, height: number): PavilionArchitectureSignPose {
  const { fascia } = pavilion5ExteriorSection(layout, height);
  const plateHeight = layout.exterior.shell.width * .0275;
  const supportDepth = plateHeight * .13;
  return {
    width: plateHeight * 4,
    height: plateHeight,
    position: [fascia.x, fascia.bottom + (fascia.top - fascia.bottom) * .59, fascia.front + supportDepth],
    rotation: [0, 0, 0],
    supportSurfaceZ: fascia.front,
    supportDepth,
    supportAnchorY: 0,
    mounting: 'eave-fascia',
  };
}

/** P5 exterior only. All coordinates remain local to the existing B8 transform. */
export function createPavilion5ArchitectureLayout(
  layout: CommercialPavilionLayout, profile: PavilionArchitectureProfile, height: number, detail: boolean, foundationDepth: number,
): PavilionArchitectureLayout {
  const { shell, slab } = layout.exterior;
  const { wallHalfX, wallHalfZ, eaveY, roofHalfX, roofHalfZ, soffitAt, sheet, ridgeY, fascia } = pavilion5ExteriorSection(layout, height);
  const batches: PavilionArchitectureLayout['batches'] = {};
  const triangles: PavilionArchitectureLayout['triangles'] = [];
  const masonryFoot = height * .027;
  const wallHeight = eaveY - masonryFoot;
  const wallThickness = height * .087;
  const pier = height * .086;
  const box = (material: PavilionArchitectureMaterial, position: ArchitecturePoint, scale: ArchitecturePoint, rotation?: ArchitecturePoint) => {
    (batches[material] ??= []).push({ position, scale, ...(rotation ? { rotation } : {}) });
  };
  const quad = (material: PavilionArchitectureMaterial, a: ArchitecturePoint, b: ArchitecturePoint, c: ArchitecturePoint, d: ArchitecturePoint) => {
    triangles.push({ material, vertices: [a, b, c] }, { material, vertices: [a, c, d] });
  };

  // One closed thin sheet envelope. Its two halves share the ridge edges.
  const roofPoint = (x: number, z: number, top = false): ArchitecturePoint => [x, soffitAt(z) + (top ? sheet : 0), z];
  const bounds = [-roofHalfZ, 0, roofHalfZ];
  for (let index = 0; index < bounds.length - 1; index++) {
    const z0 = bounds[index], z1 = bounds[index + 1];
    quad('roof', roofPoint(-roofHalfX, z0, true), roofPoint(-roofHalfX, z1, true), roofPoint(roofHalfX, z1, true), roofPoint(roofHalfX, z0, true));
    quad('roof', roofPoint(-roofHalfX, z0), roofPoint(roofHalfX, z0), roofPoint(roofHalfX, z1), roofPoint(-roofHalfX, z1));
    quad('roof', roofPoint(roofHalfX, z0), roofPoint(roofHalfX, z0, true), roofPoint(roofHalfX, z1, true), roofPoint(roofHalfX, z1));
    quad('roof', roofPoint(-roofHalfX, z0), roofPoint(-roofHalfX, z1), roofPoint(-roofHalfX, z1, true), roofPoint(-roofHalfX, z0, true));
  }
  quad('roof', roofPoint(-roofHalfX, roofHalfZ), roofPoint(roofHalfX, roofHalfZ), roofPoint(roofHalfX, roofHalfZ, true), roofPoint(-roofHalfX, roofHalfZ, true));
  quad('roof', roofPoint(roofHalfX, -roofHalfZ), roofPoint(-roofHalfX, -roofHalfZ), roofPoint(-roofHalfX, -roofHalfZ, true), roofPoint(roofHalfX, -roofHalfZ, true));

  for (const side of [-1, 1] as const) {
    const x = side * wallHalfX;
    const z = side * (roofHalfZ - pier * .28);
    // The ends are inset to the masonry face. Each corner touches the same
    // soffit profile as the long walls, including the two eave endpoints.
    triangles.push({ material: 'cladding', vertices: [
      [x, eaveY, side * wallHalfZ], [x, eaveY, -side * wallHalfZ], [x, soffitAt(0), 0],
    ] });
    box('trim', [0, soffitAt(z) - pier * .26, z], [roofHalfX * 2, pier * .52, pier * .52]);
    if (detail) for (const offset of [-.82, -.55, -.28, 0, .28, .55, .82]) {
      const purlinZ = offset * wallHalfZ;
      box('trim', [side * (wallHalfX + roofHalfX) / 2, soffitAt(purlinZ) - pier * .21, purlinZ],
        [roofHalfX - wallHalfX, pier * .44, pier * .49]);
    }
  }

  const topZ = fascia.front, rearZ = fascia.rear;
  const fasciaDepth = topZ - rearZ;
  const fasciaZ = (topZ + rearZ) / 2;
  box('cladding', [fascia.x, (fascia.top + fascia.bottom) / 2, fasciaZ],
    [fascia.width, fascia.top - fascia.bottom, fasciaDepth]);
  box('trim', [fascia.x, fascia.bottom + sheet * .22, fasciaZ],
    [fascia.width, sheet * .45, fasciaDepth]);

  const front: Face = { axis: 'z', direction: 1, edge: wallHalfZ, span: shell.width };
  const right: Face = { axis: 'x', direction: 1, edge: wallHalfX, span: shell.depth };
  const rear: Face = { ...front, direction: -1 };
  const left: Face = { ...right, direction: -1 };
  const window = (x: number, width: number): PavilionArchitectureOpening => ({
    x, width, y: masonryFoot + wallHeight * .69, height: wallHeight * .23, kind: 'window',
  });
  const gate = (x: number, width: number, doorHeight: number): PavilionArchitectureOpening => ({
    x, width, y: masonryFoot + doorHeight / 2, height: doorHeight, kind: 'gate',
  });
  const facadeOpenings = [
    ...profile.gates.map(opening => gate(opening.x * shell.width, opening.width * shell.width, opening.height * wallHeight)),
    ...[-.43, -.355, -.255, -.155, -.093, .117, .198, .303, .384, .455].map(ratio => window(ratio * shell.width, shell.width * .054)),
  ];
  const sideDoor = gate(-shell.depth * .076, height * .26, wallHeight * .74);
  const rightOpenings = [
    sideDoor,
    ...[-.364, .15, .33].map(ratio => window(ratio * shell.depth, height * .32)),
  ];

  const faceBox = (face: Face, material: PavilionArchitectureMaterial, u: number, y: number, projection: number,
    width: number, height: number, depth: number, tilt = 0) => {
    const n = face.direction * (face.edge + projection);
    if (face.axis === 'z') box(material, [u, y, n], [width, height, depth], tilt ? [tilt, 0, 0] : undefined);
    else box(material, [n, y, u], [depth, height, width], tilt ? [0, 0, -tilt] : undefined);
  };
  const elevation = (face: Face, holes: PavilionArchitectureOpening[], piers: number[]) => {
    const masonry = (x0: number, x1: number, y0: number, y1: number) => {
      if (x1 > x0 && y1 > y0) faceBox(face, 'brick', (x0 + x1) / 2, (y0 + y1) / 2, -wallThickness / 2, x1 - x0, y1 - y0, wallThickness);
    };
    let cursor = -face.span / 2;
    for (const opening of [...holes].sort((a, b) => a.x - b.x)) {
      const x0 = opening.x - opening.width / 2, x1 = opening.x + opening.width / 2;
      const y0 = opening.y - opening.height / 2, y1 = opening.y + opening.height / 2;
      masonry(cursor, x0, masonryFoot, eaveY);
      masonry(x0, x1, masonryFoot, y0);
      masonry(x0, x1, y1, eaveY);
      cursor = x1;

      const isWindow = opening.kind === 'window';
      const stile = sheet * (isWindow ? .44 : .7);
      faceBox(face, isWindow ? 'glass' : 'dark', opening.x, opening.y, -wallThickness * .67, opening.width, opening.height, sheet);
      for (const x of [x0, x1]) faceBox(face, 'metal', x, opening.y, -.002, stile, opening.height + stile, sheet);
      for (const y of [y0, y1]) faceBox(face, 'metal', opening.x, y, -.002, opening.width, stile, sheet);
      if (isWindow) {
        const slats = detail ? 4 : 2;
        for (const x of [-.34, .34]) faceBox(face, 'metal', opening.x + opening.width * x, opening.y, -.004, stile * .78, opening.height, sheet * .78);
        for (let index = 0; index < slats; index++) faceBox(face, 'metal', opening.x,
          y0 + opening.height * (index + .5) / slats, -.009, opening.width * .66, opening.height * .73 / slats, sheet * .62, .32);
        if (detail) faceBox(face, 'metal', opening.x, y0 - stile * .7, sheet * .21, opening.width + stile * 3, stile * .72, sheet * 2.05);
      } else {
        const panels = detail ? (face === front ? 8 : 5) : 2;
        for (let index = 1; index < panels; index++) faceBox(face, 'dark', x0 + opening.width * index / panels,
          opening.y, -wallThickness * .49, stile * .37, opening.height, sheet * .68);
        faceBox(face, 'dark', opening.x, face === front ? opening.y + opening.height * .12 : opening.y,
          -wallThickness * .49, opening.width, stile * .68, sheet * .68);
      }
    }
    masonry(cursor, face.span / 2, masonryFoot, eaveY);
    for (const ratio of piers) {
      const u = ratio * face.span;
      faceBox(face, 'trim', u, (masonryFoot + eaveY) / 2, pier * .31, pier, wallHeight, pier * .98);
    }
  };
  elevation(front, facadeOpenings, [-.485, -.304, -.201, -.064, .066, .243, .344, .492]);
  elevation(right, rightOpenings, [-.48, -.218, .024, .247, .48]);
  elevation(rear, [], [-.485, -.177, .177, .485]);
  elevation(left, [], [-.48, -.18, .18, .48]);
  // Recess the proxy floor behind the door leaves so its edge cannot show
  // through the lower part of the gate in an eye-level facade view.
  box('platform', [0, slab.centerY, 0], [shell.width - wallThickness * 1.8, slab.height, shell.depth - wallThickness * 1.8]);
  box('platform', [0, (masonryFoot - foundationDepth) / 2, 0], [shell.width, masonryFoot + foundationDepth, shell.depth]);

  // The existing B8+B9 site surface still owns the outside verges and street.
  // Complete only the shell's narrow apron inset, with a break at the gate.
  const apron = layout.depth / 2 - wallHalfZ;
  const approach = facadeOpenings[0].width * .65;
  box('platform', [0, masonryFoot / 2, wallHalfZ + apron / 2], [approach * 2, masonryFoot, apron]);
  if (foundationDepth > 0) box('platform', [0, -foundationDepth / 2, wallHalfZ + apron / 2], [shell.width, foundationDepth, apron]);
  const sideApron = layout.width / 2 - wallHalfX;
  box('platform', [wallHalfX + sideApron / 2, masonryFoot / 2, sideDoor.x], [sideApron, masonryFoot, sideDoor.width * 1.4]);
  for (const direction of [-1, 1]) {
    const x = direction * (wallHalfX + approach) / 2;
    box('green', [x, masonryFoot * .8, wallHalfZ + apron * .42], [wallHalfX - approach, masonryFoot * 1.6, apron * .84]);
    box('white', [x, masonryFoot * 1.09, wallHalfZ + apron * .91], [wallHalfX - approach, masonryFoot * 2.18, apron * .18]);
  }
  if (detail) for (const ratio of [-.44, -.31, -.18, .18, .31, .43]) {
    const x = ratio * shell.width, z = wallHalfZ + apron * .65;
    box('metal', [x, masonryFoot + height * .092, z], [sheet * 1.35, height * .184, sheet * 1.35]);
    box('metal', [x, masonryFoot + height * .187, z], [sheet * 1.56, sheet * .28, sheet * 1.56]);
  }

  // The vents share one metal mesh. The rings give the turbines their rolled
  // shoulders and the short middle vent its overhanging cap.
  const vent = (x: number, z: number, turbine: boolean) => {
    const y = soffitAt(z) + sheet - height * .01;
    const rings = turbine
      ? [[0, .045], [.034, .045], [.037, .067], [.065, .072], [.085, .054], [.09, 0]]
      : [[0, .04], [.044, .04], [.046, .071], [.051, .071], [.063, 0]];
    const sides = detail ? 10 : 7;
    for (let i = 0; i < rings.length - 1; i++) for (let side = 0; side < sides; side++) {
      const point = (ring: number, section: number): ArchitecturePoint => {
        const [level, radius] = rings[ring];
        const angle = 2 * Math.PI * section / sides;
        return [x + Math.cos(angle) * radius * height, y + level * height, z + Math.sin(angle) * radius * height];
      };
      const a = point(i, side), b = point(i + 1, side), c = point(i + 1, side + 1), d = point(i, side + 1);
      if (rings[i + 1][1]) quad('metal', a, b, c, d);
      else triangles.push({ material: 'metal', vertices: [a, b, d] });
    }
  };
  vent(-shell.width * .26, wallHalfZ * .56, true);
  vent(shell.width * .16, wallHalfZ * .38, false);
  vent(shell.width * .38, wallHalfZ * .43, true);

  return {
    profile, batches, triangles, floorY: layout.interior.floorY, frontZ: wallHalfZ, eaveY, ridgeY,
    canopyFrontZ: fascia.front, facadeOpenings,
    boxCount: Object.values(batches).reduce((count, parts) => count + parts.length, 0),
  };
}
