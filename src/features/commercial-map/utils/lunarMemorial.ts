export const LUNAR_MEMORIAL_HIT_SCALE = 1.65;
export const APOLLO_XIV_SELECTION_CLEARING_RADIUS = 2.65;

export const APOLLO_XIV_REFERENCE = {
  /** Official 2026 PDF coordinates for entity G / Árvore Lunar. */
  lunarTreeSourceAnchor: [2152, 3334],
  /** Photo-informed placement inside G's clearing; compass side remains field-reviewable. */
  replicaSourceAnchor: [2184, 3340],
} as const;

export const APOLLO_XIV_LAYOUT = {
  replicaOffset: [0.7, 0.12],
  signOffset: [0.35, 0.6],
  displayYaw: -0.814,
  bodyRadius: 0.21,
  finRadius: 0.44,
  finHeight: 0.78,
  baseSize: [1.06, 0.86],
  rigidCurbSides: ['south', 'east'] as const,
  signSize: [0.58, 0.34],
  signCenterY: 0.54,
  minimumHeight: 3.6,
  maximumHeight: 3.9,
  heightRatio: 0.84,
} as const;

export function apolloXivRigidCurbClearanceFromTree(trunkRadius: number) {
  const [rocketX, rocketZ] = APOLLO_XIV_LAYOUT.replicaOffset;
  const [baseWidth, baseDepth] = APOLLO_XIV_LAYOUT.baseSize;
  const cosine = Math.cos(APOLLO_XIV_LAYOUT.displayYaw);
  const sine = Math.sin(APOLLO_XIV_LAYOUT.displayYaw);
  const deltaX = -rocketX;
  const deltaZ = -rocketZ;
  const treeLocalX = cosine * deltaX - sine * deltaZ;
  const treeLocalZ = sine * deltaX + cosine * deltaZ;
  const curbThickness = 0.075;
  const curbs = APOLLO_XIV_LAYOUT.rigidCurbSides.map((side) => (
    side === 'south'
      ? { x: 0, z: -baseDepth / 2, width: baseWidth, depth: curbThickness }
      : { x: baseWidth / 2, z: 0, width: curbThickness, depth: baseDepth }
  ));
  return Math.min(...curbs.map((curb) => {
    const outsideX = Math.max(Math.abs(treeLocalX - curb.x) - curb.width / 2, 0);
    const outsideZ = Math.max(Math.abs(treeLocalZ - curb.z) - curb.depth / 2, 0);
    return Math.hypot(outsideX, outsideZ) - trunkRadius;
  }));
}

export function treeRemainsVisibleWithSelectedApollo(
  tree: { area: string; position: readonly [number, number] },
  memorialCenter: readonly [number, number],
) {
  if (tree.area !== 'PAVILIONS_1_14_GROVE') return true;
  return Math.hypot(
    tree.position[0] - memorialCenter[0],
    tree.position[1] - memorialCenter[1],
  ) > APOLLO_XIV_SELECTION_CLEARING_RADIUS;
}

export const APOLLO_XIV_RENDER_BUDGET = {
  atlasWidth: 512,
  atlasHeight: 1024,
  replicaFarPrimaryDrawCalls: 4,
  replicaDetailPrimaryDrawCalls: 6,
  replicaShadowDrawCalls: 2,
  memorialFarPrimaryDrawCalls: 7,
  memorialDetailPrimaryDrawCalls: 11,
  reducedMaxTriangles: 350,
  detailMaxTriangles: 800,
} as const;

export const APOLLO_XIV_FEATURE_METADATA = Object.freeze({
  featureType: 'APOLLO_XIV_REPLICA',
  classification: 'NON_COMMERCIAL_STRUCTURE',
  isSellable: false,
  contributesToCommercialMetrics: false,
  selectionOwner: 'G',
  source: 'Réplica instalada junto à Árvore Lunar; referência fotográfica IMG_9322.jpeg',
});

export function apolloXivReplicaHeight(landmarkHeight: number) {
  return Math.min(
    APOLLO_XIV_LAYOUT.maximumHeight,
    Math.max(APOLLO_XIV_LAYOUT.minimumHeight, landmarkHeight * APOLLO_XIV_LAYOUT.heightRatio),
  );
}

export function apolloXivLocalEnvelope() {
  const [rocketX, rocketZ] = APOLLO_XIV_LAYOUT.replicaOffset;
  const [signX, signZ] = APOLLO_XIV_LAYOUT.signOffset;
  const [baseWidth, baseDepth] = APOLLO_XIV_LAYOUT.baseSize;
  const [signWidth] = APOLLO_XIV_LAYOUT.signSize;
  const radialExtent = Math.max(APOLLO_XIV_LAYOUT.finRadius, baseWidth / 2);

  return {
    minX: Math.min(rocketX - radialExtent, signX - signWidth / 2),
    maxX: Math.max(rocketX + radialExtent, signX + signWidth / 2),
    minZ: Math.min(rocketZ - baseDepth / 2, signZ - 0.12),
    maxZ: Math.max(rocketZ + baseDepth / 2, signZ + 0.12),
  } as const;
}

export function apolloXivFitsLandmarkHitVolume(width: number, depth: number) {
  const envelope = apolloXivLocalEnvelope();
  const halfHitWidth = width * LUNAR_MEMORIAL_HIT_SCALE / 2;
  const halfHitDepth = depth * LUNAR_MEMORIAL_HIT_SCALE / 2;
  return envelope.minX >= -halfHitWidth
    && envelope.maxX <= halfHitWidth
    && envelope.minZ >= -halfHitDepth
    && envelope.maxZ <= halfHitDepth;
}
