import { MAP_REFERENCE_HEIGHT, MAP_REFERENCE_WIDTH } from '../constants';
import type { CommercialMapTree, CommercialTreeSpeciesGroup } from './commercialTrees';
import { COMMERCIAL_TREE_SOURCE_REFERENCES } from './commercialTrees';
import {
  projectedCommercialMapShadowDirection,
  projectedCommercialMapShadowRotation,
} from './commercialMapEnvironment';
import { OFFICIAL_2026_SOURCE_MANIFEST } from './officialReference2026';

export type RearParkingSatellitePoint = readonly [number, number];

export type RearParkingVegetationGroup =
  | 'C_B_JUNCTION'
  | 'CAMPEIRA_REAR_EDGE'
  | 'SOUTH_REENTRANT_GROVE'
  | 'EAST_PERIMETER'
  | 'C_WEST_EDGE';

export interface RearParkingCanopyObservation {
  /** Authored identifier, independent of array order and projection changes. */
  id: string;
  group: RearParkingVegetationGroup;
  /** Pixel origin is the upper-left corner of the complete annex, including its frame. */
  satellitePosition: RearParkingSatellitePoint;
  /** Approximate half-width/half-depth of the visible foliage, excluding long shadows. */
  canopyRadiiPixels: RearParkingSatellitePoint;
  interpretation: 'INDIVIDUAL_CROWN' | 'MERGED_CANOPY_LOBE';
  /** Conservative digitization uncertainty, not a statistical confidence interval. */
  centerUncertaintyPixels: number;
  radiusUncertaintyPixels: number;
  speciesGroup: Extract<CommercialTreeSpeciesGroup, 'MATURE_BROADLEAF' | 'OPEN_CANOPY'>;
  notes: string;
}

export interface RearParkingTree extends CommercialMapTree {
  area: 'REAR_PARKING';
  satelliteObservation: Readonly<RearParkingCanopyObservation>;
  /** Two projected ellipse axes retained even though the shared renderer uses one radius. */
  projectedCanopyAxes: readonly [RearParkingSatellitePoint, RearParkingSatellitePoint];
  heightProvenance: 'PRESENTATION_PROPORTIONS_NOT_SURVEYED';
}

export const REAR_PARKING_VEGETATION_SOURCE = Object.freeze({
  revision: '2026.8-rear-parking-satellite.1',
  fileName: 'IMG_9816 (1).jpeg',
  imageSize: Object.freeze({ width: 1179, height: 861 }),
  coordinateSpace: 'FULL_ANNEX_PIXELS_TOP_LEFT' as const,
  authority: 'ANNEX_7_ENVIRONMENT_ONLY' as const,
  captureDate: null,
  fieldReviewRequired: true,
  notes: 'Centros e raios de copas interpretados no anexo original. O traço vermelho, '
    + 'o contraste reduzido, a sobreposição de copas e o recorte da imagem limitam '
    + 'a precisão. Lobos de dossel não equivalem a troncos inventariados. Nenhuma '
    + 'árvore foi distribuída aleatoriamente ou acrescentada nas clareiras das vagas.',
});

/**
 * Individually digitized foliage observations. Adjacent lobes of a continuous
 * canopy are intentionally marked as interpretations, not a surveyed tree count.
 * Keep their authored IDs when correcting a location after field review.
 */
const CANOPY_OBSERVATIONS: readonly RearParkingCanopyObservation[] = [
  // The narrow wooded seam between the end of C and the west access to B.
  { id: 'tree-rear-parking-junction-01', group: 'C_B_JUNCTION', satellitePosition: [510, 691], canopyRadiiPixels: [13, 14], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 5, radiusUncertaintyPixels: 4, speciesGroup: 'MATURE_BROADLEAF', notes: 'Lobo oeste da faixa arborizada junto à travessia de Expo Rural; limite difuso com copas vizinhas.' },
  { id: 'tree-rear-parking-junction-02', group: 'C_B_JUNCTION', satellitePosition: [534, 691], canopyRadiiPixels: [17, 15], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 5, radiusUncertaintyPixels: 4, speciesGroup: 'MATURE_BROADLEAF', notes: 'Lobo central do maciço a oeste da faixa vertical de C; não ocupar a pista livre a leste.' },
  { id: 'tree-rear-parking-junction-03', group: 'C_B_JUNCTION', satellitePosition: [556, 682], canopyRadiiPixels: [13, 13], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 5, radiusUncertaintyPixels: 4, speciesGroup: 'OPEN_CANOPY', notes: 'Extremidade clara superior do maciço C/B, contígua à vegetação da borda campeira.' },
  { id: 'tree-rear-parking-junction-04', group: 'C_B_JUNCTION', satellitePosition: [525, 718], canopyRadiiPixels: [15, 16], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 5, radiusUncertaintyPixels: 4, speciesGroup: 'MATURE_BROADLEAF', notes: 'Trecho médio do dossel estreito; sombra escura na via oeste não foi usada como centro.' },
  { id: 'tree-rear-parking-junction-05', group: 'C_B_JUNCTION', satellitePosition: [530, 744], canopyRadiiPixels: [15, 15], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 5, radiusUncertaintyPixels: 4, speciesGroup: 'MATURE_BROADLEAF', notes: 'Lobo inferior da faixa C/B; traço vermelho passa próximo da borda leste da copa.' },
  { id: 'tree-rear-parking-junction-06', group: 'C_B_JUNCTION', satellitePosition: [533, 770], canopyRadiiPixels: [13, 13], interpretation: 'INDIVIDUAL_CROWN', centerUncertaintyPixels: 4, radiusUncertaintyPixels: 3, speciesGroup: 'OPEN_CANOPY', notes: 'Copa arredondada na terminação sul da faixa C/B; não estender o dossel sobre a saída de C.' },

  // Sparse crowns above the parking strip; large open intervals are intentional.
  { id: 'tree-rear-parking-campeira-01', group: 'CAMPEIRA_REAR_EDGE', satellitePosition: [637, 668], canopyRadiiPixels: [10, 10], interpretation: 'INDIVIDUAL_CROWN', centerUncertaintyPixels: 5, radiusUncertaintyPixels: 3, speciesGroup: 'OPEN_CANOPY', notes: 'Copa pequena junto ao início da borda posterior campeira; anotação vermelha reduz a leitura inferior.' },
  { id: 'tree-rear-parking-campeira-02', group: 'CAMPEIRA_REAR_EDGE', satellitePosition: [664, 670], canopyRadiiPixels: [12, 11], interpretation: 'INDIVIDUAL_CROWN', centerUncertaintyPixels: 5, radiusUncertaintyPixels: 3, speciesGroup: 'MATURE_BROADLEAF', notes: 'Copa isolada no bordo superior do acesso oeste de B; borda inferior parcialmente anotada em vermelho.' },
  { id: 'tree-rear-parking-campeira-03', group: 'CAMPEIRA_REAR_EDGE', satellitePosition: [695, 672], canopyRadiiPixels: [12, 11], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 5, radiusUncertaintyPixels: 4, speciesGroup: 'OPEN_CANOPY', notes: 'Dossel ralo entre o acesso oeste e a reentrância de B; tratar como interpretação ambiental.' },
  { id: 'tree-rear-parking-campeira-04', group: 'CAMPEIRA_REAR_EDGE', satellitePosition: [886, 684], canopyRadiiPixels: [13, 13], interpretation: 'INDIVIDUAL_CROWN', centerUncertaintyPixels: 3, radiusUncertaintyPixels: 3, speciesGroup: 'MATURE_BROADLEAF', notes: 'Copa individual ao sul do Pavilhão 9, separada das clareiras do estacionamento e dos telhados.' },
  { id: 'tree-rear-parking-campeira-05', group: 'CAMPEIRA_REAR_EDGE', satellitePosition: [992, 682], canopyRadiiPixels: [16, 15], interpretation: 'INDIVIDUAL_CROWN', centerUncertaintyPixels: 3, radiusUncertaintyPixels: 3, speciesGroup: 'MATURE_BROADLEAF', notes: 'Copa de maior diâmetro junto à ligação oriental da borda posterior; não inclui a sombra a oeste.' },
  { id: 'tree-rear-parking-campeira-06', group: 'CAMPEIRA_REAR_EDGE', satellitePosition: [1055, 688], canopyRadiiPixels: [10, 11], interpretation: 'INDIVIDUAL_CROWN', centerUncertaintyPixels: 4, radiusUncertaintyPixels: 3, speciesGroup: 'OPEN_CANOPY', notes: 'Copa pequena próxima da transição para o corredor leste; conferir duplicidade com o distrito do Portão 4.' },

  // The visible grove in the southern re-entrant; the rest of the southern verge stays open.
  { id: 'tree-rear-parking-south-01', group: 'SOUTH_REENTRANT_GROVE', satellitePosition: [714, 815], canopyRadiiPixels: [14, 14], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 4, radiusUncertaintyPixels: 4, speciesGroup: 'MATURE_BROADLEAF', notes: 'Lobo oeste da copa composta no recuo sul de B; limite próximo da linha vermelha inferior.' },
  { id: 'tree-rear-parking-south-02', group: 'SOUTH_REENTRANT_GROVE', satellitePosition: [733, 803], canopyRadiiPixels: [17, 16], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 4, radiusUncertaintyPixels: 4, speciesGroup: 'MATURE_BROADLEAF', notes: 'Lobo alto do maciço claramente visível na reentrância; tronco não distinguível no satélite.' },
  { id: 'tree-rear-parking-south-03', group: 'SOUTH_REENTRANT_GROVE', satellitePosition: [751, 819], canopyRadiiPixels: [13, 14], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 4, radiusUncertaintyPixels: 4, speciesGroup: 'OPEN_CANOPY', notes: 'Lobo sudeste da mesma massa, sem preencher o corredor de saída que a contorna.' },
  { id: 'tree-rear-parking-south-04', group: 'SOUTH_REENTRANT_GROVE', satellitePosition: [788, 826], canopyRadiiPixels: [13, 10], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 5, radiusUncertaintyPixels: 4, speciesGroup: 'OPEN_CANOPY', notes: 'Pequena massa baixa junto ao bordo sul; resolução insuficiente para confirmar quantos troncos a formam.' },

  // Outer eastern tree belt. These are visible lobes, not an evenly spaced planting scheme.
  { id: 'tree-rear-parking-east-01', group: 'EAST_PERIMETER', satellitePosition: [1132, 406], canopyRadiiPixels: [12, 16], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 5, radiusUncertaintyPixels: 4, speciesGroup: 'OPEN_CANOPY', notes: 'Lobo da borda externa a sudeste do pequeno acesso superior; não ocupa o corredor marcado em vermelho.' },
  { id: 'tree-rear-parking-east-02', group: 'EAST_PERIMETER', satellitePosition: [1135, 438], canopyRadiiPixels: [13, 17], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 5, radiusUncertaintyPixels: 4, speciesGroup: 'MATURE_BROADLEAF', notes: 'Dossel externo à direita do pequeno prédio; limite oriental parcialmente cortado pela moldura.' },
  { id: 'tree-rear-parking-east-03', group: 'EAST_PERIMETER', satellitePosition: [1129, 476], canopyRadiiPixels: [16, 20], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 5, radiusUncertaintyPixels: 5, speciesGroup: 'MATURE_BROADLEAF', notes: 'Massa madura contínua fora do traçado A; raios representam o lobo visível, não uma espécie identificada.' },
  { id: 'tree-rear-parking-east-04', group: 'EAST_PERIMETER', satellitePosition: [1134, 514], canopyRadiiPixels: [14, 18], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 5, radiusUncertaintyPixels: 5, speciesGroup: 'MATURE_BROADLEAF', notes: 'Lobo externo intermediário; a faixa de solo entre esse dossel e a linha vermelha deve permanecer livre.' },
  { id: 'tree-rear-parking-east-05', group: 'EAST_PERIMETER', satellitePosition: [1127, 548], canopyRadiiPixels: [16, 18], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 5, radiusUncertaintyPixels: 5, speciesGroup: 'OPEN_CANOPY', notes: 'Lobo claro do dossel oriental; a clareira lateral próxima dos Crioulos não foi preenchida.' },
  { id: 'tree-rear-parking-east-06', group: 'EAST_PERIMETER', satellitePosition: [1131, 585], canopyRadiiPixels: [16, 19], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 5, radiusUncertaintyPixels: 5, speciesGroup: 'MATURE_BROADLEAF', notes: 'Massa externa à curva de A; verificação de campo necessária antes de qualquer inventário de troncos.' },
  { id: 'tree-rear-parking-east-07', group: 'EAST_PERIMETER', satellitePosition: [1124, 621], canopyRadiiPixels: [18, 18], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 5, radiusUncertaintyPixels: 5, speciesGroup: 'MATURE_BROADLEAF', notes: 'Lobo arredondado da faixa periférica na aproximação da esquina posterior.' },
  { id: 'tree-rear-parking-east-08', group: 'EAST_PERIMETER', satellitePosition: [1118, 655], canopyRadiiPixels: [18, 16], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 5, radiusUncertaintyPixels: 4, speciesGroup: 'MATURE_BROADLEAF', notes: 'Massa na ligação externa A/B, a leste da faixa de circulação; sombra não define seu centro.' },
  { id: 'tree-rear-parking-east-09', group: 'EAST_PERIMETER', satellitePosition: [1130, 715], canopyRadiiPixels: [15, 15], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 5, radiusUncertaintyPixels: 4, speciesGroup: 'OPEN_CANOPY', notes: 'Lobo ao sul do pequeno telhado branco: o intervalo junto ao telhado foi deliberadamente deixado sem árvores.' },
  { id: 'tree-rear-parking-east-10', group: 'EAST_PERIMETER', satellitePosition: [1126, 746], canopyRadiiPixels: [17, 16], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 5, radiusUncertaintyPixels: 4, speciesGroup: 'MATURE_BROADLEAF', notes: 'Massa externa junto à faixa oriental de B; não avançar para o interior das fileiras.' },
  { id: 'tree-rear-parking-east-11', group: 'EAST_PERIMETER', satellitePosition: [1125, 781], canopyRadiiPixels: [18, 18], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 5, radiusUncertaintyPixels: 5, speciesGroup: 'MATURE_BROADLEAF', notes: 'Lobo inferior do cinturão oriental, com borda de copa sobreposta às massas adjacentes.' },
  { id: 'tree-rear-parking-east-12', group: 'EAST_PERIMETER', satellitePosition: [1118, 813], canopyRadiiPixels: [18, 18], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 5, radiusUncertaintyPixels: 5, speciesGroup: 'MATURE_BROADLEAF', notes: 'Massa arredondada da esquina sudeste; a imagem limita sua continuidade para fora do parque.' },
  { id: 'tree-rear-parking-east-13', group: 'EAST_PERIMETER', satellitePosition: [1138, 827], canopyRadiiPixels: [10, 10], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 6, radiusUncertaintyPixels: 5, speciesGroup: 'OPEN_CANOPY', notes: 'Último lobo visível da esquina, recortado pela moldura; não extrapolar vegetação além da imagem.' },

  // Small observations at the western frame, outside the long C parking strip.
  { id: 'tree-rear-parking-west-01', group: 'C_WEST_EDGE', satellitePosition: [43, 715], canopyRadiiPixels: [13, 15], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 5, radiusUncertaintyPixels: 4, speciesGroup: 'OPEN_CANOPY', notes: 'Lobo externo à via oeste, abaixo do pequeno telhado de serviço; não inclui a faixa de brita de C.' },
  { id: 'tree-rear-parking-west-02', group: 'C_WEST_EDGE', satellitePosition: [51, 748], canopyRadiiPixels: [13, 13], interpretation: 'INDIVIDUAL_CROWN', centerUncertaintyPixels: 4, radiusUncertaintyPixels: 3, speciesGroup: 'OPEN_CANOPY', notes: 'Copa menor separada da via oeste, junto à transição gramada antes da primeira fileira C.' },
  { id: 'tree-rear-parking-west-03', group: 'C_WEST_EDGE', satellitePosition: [35, 789], canopyRadiiPixels: [13, 17], interpretation: 'MERGED_CANOPY_LOBE', centerUncertaintyPixels: 6, radiusUncertaintyPixels: 5, speciesGroup: 'MATURE_BROADLEAF', notes: 'Dossel baixo junto à moldura oeste; identificação parcial, sem extrapolação sobre as vagas.' },
];

export const REAR_PARKING_CANOPY_OBSERVATIONS: readonly Readonly<RearParkingCanopyObservation>[] = Object.freeze(CANOPY_OBSERVATIONS.map((observation) => Object.freeze({
  ...observation,
  satellitePosition: Object.freeze(observation.satellitePosition),
  canopyRadiiPixels: Object.freeze(observation.canopyRadiiPixels),
})));

export type RearParkingSatelliteProjection = (pixel: RearParkingSatellitePoint) => RearParkingSatellitePoint;

const round = (value: number) => Number(value.toFixed(5));

function stableVariant(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (Math.imul(hash, 31) + id.charCodeAt(index)) >>> 0;
  return hash % 6;
}

function canonicalSourcePoint([x, z]: RearParkingSatellitePoint): RearParkingSatellitePoint {
  const crop = OFFICIAL_2026_SOURCE_MANIFEST.parkCropPdf;
  return [
    crop.x + ((x + MAP_REFERENCE_WIDTH / 2) / MAP_REFERENCE_WIDTH) * crop.width,
    crop.y + ((z + MAP_REFERENCE_HEIGHT / 2) / MAP_REFERENCE_HEIGHT) * crop.height,
  ];
}

/**
 * Projection belongs to the parking reference calibration, not to this file.
 * Radius is the area-equivalent circle of the locally projected canopy ellipse.
 * The raw ellipse and uncertainty stay attached for review and future refinements.
 * Height, trunk size and crown profile are presentation proportions: Annex 7
 * provides no vertical survey or botanical identification.
 *
 * The caller must reconcile these candidates against existing trees, building
 * footprints, technical parking rows and circulation before showing them.
 */
export function buildRearParkingTrees(
  projectSatellitePoint: RearParkingSatelliteProjection,
): RearParkingTree[] {
  const project = (pixel: RearParkingSatellitePoint) => {
    const point = projectSatellitePoint(pixel);
    if (!point.every(Number.isFinite)) throw new RangeError('Rear parking satellite projection must return finite world coordinates.');
    return point;
  };
  const shadowRotation = projectedCommercialMapShadowRotation();
  const shadowDirection = projectedCommercialMapShadowDirection();

  return REAR_PARKING_CANOPY_OBSERVATIONS.map((observation): RearParkingTree => {
    const [pixelX, pixelY] = observation.satellitePosition;
    const [radiusX, radiusY] = observation.canopyRadiiPixels;
    const position = project(observation.satellitePosition);
    const left = project([pixelX - radiusX, pixelY]);
    const right = project([pixelX + radiusX, pixelY]);
    const top = project([pixelX, pixelY - radiusY]);
    const bottom = project([pixelX, pixelY + radiusY]);
    const axisX: RearParkingSatellitePoint = [(right[0] - left[0]) / 2, (right[1] - left[1]) / 2];
    const axisY: RearParkingSatellitePoint = [(bottom[0] - top[0]) / 2, (bottom[1] - top[1]) / 2];
    const canopyRadius = Math.sqrt(Math.abs(axisX[0] * axisY[1] - axisX[1] * axisY[0]));
    if (!Number.isFinite(canopyRadius) || canopyRadius <= 0) {
      throw new RangeError(`Rear parking canopy projection collapsed: ${observation.id}`);
    }

    return {
      id: observation.id,
      classification: 'PARK_TREE',
      isSellable: false,
      contributesToCommercialMetrics: false,
      area: 'REAR_PARKING',
      quadra: null,
      relatedLotId: null,
      surfaceEntityIdentifier: null,
      placement: observation.interpretation === 'MERGED_CANOPY_LOBE' ? 'LANDSCAPE_MASS' : 'OUTSIDE_COMMERCIAL_LOT',
      position: [round(position[0]), round(position[1])],
      sourcePosition: canonicalSourcePoint(position),
      canopyRadius: round(canopyRadius),
      trunkRadius: round(canopyRadius * 0.085),
      trunkHeight: round(canopyRadius * 1.2),
      crownHeight: round(canopyRadius * 1.75),
      speciesGroup: observation.speciesGroup,
      visualVariant: stableVariant(observation.id),
      shadowSize: [round(canopyRadius * 1.68), round(canopyRadius * 1.02)],
      shadowRotation,
      shadowDirection,
      isVisible: true,
      sourceReference: COMMERCIAL_TREE_SOURCE_REFERENCES.REAR_PARKING,
      notes: `${observation.notes} Centro de copa, não tronco levantado; altura e espécie não aferidas.`,
      verificationStatus: 'FIELD_REVIEW_RECOMMENDED',
      satelliteObservation: observation,
      projectedCanopyAxes: [axisX, axisY],
      heightProvenance: 'PRESENTATION_PROPORTIONS_NOT_SURVEYED',
    };
  });
}
