import type { Coordinate } from '../types';

/** Presentation only. Registered against the persisted October parcels, not the
 * older rectangular OFFICIAL_REFERENCE_DATA fallback. No cadastral writes. */
export const EXPORURAL_SCENE_CORRECTIONS = {
  revision: '2026-10-25-exporural-scene.1',
  cadastralRevision: '2028-exporural-2026-10-20.1',
  confidence: 'PHOTO_INTERPRETED_SCENE_REGISTERED',
  elevationPolicy: 'CURRENT_LOT_SURFACE_PLUS_CLEARANCE',
  tree: {
    id: 'tree-exporural-r01-01',
    lotIdentifier: 'Q-R-01',
    lotEntityId: '7cbfc7ab-a8fe-4643-ac8b-b9d2b2a63791',
    position: [8.625689, -18.94] as Coordinate,
    referenceElevation: 0.134,
    rotationRadians: -0.78,
    envelopeRadius: 1.02,
    dimensions: { canopyRadius: 1.02, trunkRadius: 0.14, trunkHeight: 0.72, crownHeight: 1.48 },
    source: ['Captura de Tela 2026-10-25 às 01.27.40.png', 'Captura de Tela 2026-10-25 às 01.39.19.png'],
    streetIdentifier: 'RUA-GUSTAVO-BESSEL',
    alignmentMarkerId: 'pole-ref-146',
    alignmentMarkerPosition: [8.625689, -20.565995] as Coordinate,
    notes: 'Tronco recuado da testada Gustavo Bessel e da divisa oeste com a faixa azul. Copa distinguida da sombra no anexo aéreo. Dimensões cenográficas, sem espécie ou levantamento topográfico inferido.',
  },
  transformer: {
    id: 'exporural-r34-transformer-assembly',
    lotIdentifier: 'Q-R-34',
    lotEntityId: '300b4d2d-6313-4e91-8673-4649e5816245',
    position: [30.88, -21.05] as Coordinate,
    referenceElevation: 0.036,
    rotationRadians: 0,
    envelope: [[30.48, -21.30], [31.28, -21.30], [31.28, -20.73], [30.48, -20.73]] as Coordinate[],
    dimensions: { tallHeight: 1.68, centralHeight: 0.84, supportSpacing: 0.4, platformHeight: 0.82, equipmentHeight: 0.36 },
    source: ['WhatsApp Image 2026-10-25 at 01.31.41.jpeg', 'WhatsApp Image 2026-10-25 at 01.31.28.jpeg'],
    replacements: [
      { markerId: 'pole-ref-134', sourcePosition: [28.699080, -20.700025], previousRenderPosition: [30.12153852045103, -20.714142657592163], role: 'LEFT' },
      { markerId: 'pole-ref-135', sourcePosition: [28.973869, -20.699939], previousRenderPosition: [31.785235366221155, -20.72784133047488], role: 'RIGHT' },
      { markerId: 'pole-ref-136', sourcePosition: [33.045056, -20.694770], previousRenderPosition: [35.109842816511126, -20.715240146704943], role: 'REPLACED_BY_RIGHT' },
    ],
    preservedMarker: { markerId: 'pole-ref-138', renderedLotIdentifier: 'Q-R-38', previousRenderPosition: [36.76790543892749, -20.65515527455228] },
    notes: 'As indicações 33/35/36 nos anexos referem-se aos postes visíveis, não aos sufixos do inventário. A implantação anterior projetava os marcadores para Q-R-34/35/37 por células antigas do PDF. Preservam-se os registros fonte; os dois primeiros terminais passam aos apoios altos e o terceiro é substituído pelo terminal direito. Um apoio central mais baixo sustenta a plataforma. Dimensões proporcionais à fotografia, não especificações elétricas.',
  },
} as const;

export function exporuralTransformerSupportPosition(role: 'LEFT' | 'RIGHT'): Coordinate {
  const { position, dimensions } = EXPORURAL_SCENE_CORRECTIONS.transformer;
  return [position[0] + (role === 'LEFT' ? -1 : 1) * dimensions.supportSpacing / 2, position[1]];
}
