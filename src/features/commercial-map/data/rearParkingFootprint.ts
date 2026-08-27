/**
 * Rear parking trace in the ORIGINAL 4967 x 3509 pixels of annex 5.
 *
 * These are digitized plan boundaries, not a cadastral survey. The plan fixes
 * geometry; annex 7 supplies the gravel/soil/grass interpretation. In particular,
 * the CAD pebble hatch is NOT interpreted as black asphalt. The B south notch,
 * west return and the A stepped/curved edge are deliberately retained.
 */
export type RearParkingSourcePoint = readonly [number, number];
export type RearParkingSourceGroup = 'A' | 'B' | 'C';

export interface RearParkingSourceSurface {
  id: string;
  group: RearParkingSourceGroup;
  kind: 'gravel' | 'soil' | 'grass';
  polygon: readonly RearParkingSourcePoint[];
  provenance: string;
}

export interface RearParkingSourceOperation {
  id: string;
  kind: 'EXIT_ARROW' | 'ENTRY_ARROW' | 'GATE' | 'BARRIER' | 'NO_RIGHT_TURN';
  position: RearParkingSourcePoint;
  /** Angle of the movement (or the barrier's long axis) in source image XY. */
  headingRadians: number;
  label: string;
  /** Null means the annotation establishes a location, not a physical span. */
  spanPixels?: number | null;
  /** Visible curved arrow shaft; preserve this instead of a straight substitute. */
  curvePixels?: readonly RearParkingSourcePoint[];
  provenance?: string;
}

export interface RearParkingSourceCirculation {
  id: string;
  group: RearParkingSourceGroup;
  points: readonly RearParkingSourcePoint[];
  widthPixels: number;
  widthProvenance: 'BETWEEN_DRAWN_EDGES' | 'LOCAL_AISLE_MODULE_NOT_SURVEYED';
  provenance: string;
}

export const REAR_PARKING_FOOTPRINT_SOURCE = Object.freeze({
  fileName: 'IMG_9811 (1).jpeg',
  imageSize: { width: 4967, height: 3509 },
  coordinateSpace: 'ORIGINAL_ANNEX_5_PIXELS_TOP_LEFT',
  revision: '2026.8-rear-parking-footprint.1',
  contourDigitizationTolerancePixels: 6,
  authority: 'ANNEXES_4_5_6_GEOMETRY_ANNEX_7_MATERIAL_CHARACTER',
  boundaryCaveat: 'O bordo exterior de A1 é o envelope dos símbolos e a continuação '
    + 'do alinhamento curvo; a planta não fornece uma divisa cadastral exterior. '
    + 'Nenhuma cota altimétrica ou espessura de pavimento está disponível.',
});

const gravelProvenance = 'Contorno digitizado no anexo 5 original, conferido nos '
  + 'detalhes 4/6. Brita/solo claro observados no anexo 7; hachura CAD não define asfalto.';

export const REAR_PARKING_SOURCE_SURFACES: readonly RearParkingSourceSurface[] = [
  {
    id: 'rear-parking:terrain:A',
    group: 'A',
    kind: 'gravel',
    // Clockwise exterior, then the stepped inner boundary. The recess at
    // [4407,1810] keeps the small existing northern building outside this patch.
    polygon: [
      [4464, 1616], [4482, 1643], [4481, 1745], [4480, 1910],
      [4476, 2078], [4476, 2220], [4474, 2290], [4473, 2357], [4466, 2401],
      [4431, 2460], [4409, 2510], [4387, 2580], [4371, 2634],
      [4355, 2690], [4240, 2690], [4240, 2668], [4164, 2668],
      [4164, 2684], [4027, 2684], [4028, 2619], [4032, 2215],
      [4244, 2237], [4247, 1810], [4407, 1810], [4407, 1664],
      [4415, 1622],
    ],
    provenance: gravelProvenance + ' A acompanha A1–A5, a inflexão exterior e o '
      + 'recuo que preserva a edificação superior. A1 tem envelope de símbolos, '
      + 'não um limite fundiário levantado.',
  },
  {
    id: 'rear-parking:terrain:B-main',
    group: 'B',
    kind: 'gravel',
    // The concave south return is essential: do not convex-hull this polygon.
    polygon: [
      [2850, 2703], [2985, 2706], [3032, 2698], [3063, 2698],
      [3074, 2709], [3200, 2711], [3580, 2717], [3980, 2721],
      [4382, 2725], [4384, 2845], [4380, 3000], [4380, 3156],
      [4378, 3173], [4373, 3185], [4360, 3195], [4340, 3198],
      [3332, 3194], [3275, 3193], [3260, 3187], [3241, 3183],
      [3090, 3183], [3077, 3173], [3077, 3071], [3040, 3071],
      [3000, 3064], [2970, 3067], [2940, 3078], [2910, 3096],
      [2880, 3130], [2830, 3195], [2823, 3242], [2560, 3240],
      [2560, 3190], [2570, 3080], [2590, 2975], [2615, 2888],
      [2640, 2825], [2663, 2793], [2690, 2765], [2715, 2747],
      [2740, 2732], [2767, 2719], [2790, 2709], [2820, 2705],
    ],
    provenance: gravelProvenance + ' B1–B22: retorno oeste e reentrância da saída '
      + 'entre B16/B17 conservados. O envelope inclui a faixa simples exterior '
      + 'de B1, que não tem uma placa independente no recorte.',
  },
  {
    id: 'rear-parking:terrain:B-transverse',
    group: 'B',
    kind: 'gravel',
    polygon: [
      [2305, 2696], [2540, 2696], [2535, 2790], [2531, 2895],
      [2530, 3012], [2528, 3120], [2527, 3195], [2275, 3195],
      [2278, 3088], [2283, 2970], [2288, 2842], [2294, 2737],
      [2304, 2737],
    ],
    provenance: gravelProvenance + ' B23–B29 formam a faixa transversal, entre '
      + 'o acesso do portão e o extremo da faixa C; o lado leste afunila.',
  },
  {
    id: 'rear-parking:terrain:B-junction',
    group: 'B',
    kind: 'gravel',
    polygon: [[2070, 3048], [2280, 3050], [2276, 3195], [2069, 3193]],
    provenance: gravelProvenance + ' B30–B32: três faixas curtas abaixo do '
      + 'bloqueio transversal, com intervalos de circulação hachurados.',
  },
  {
    id: 'rear-parking:terrain:C',
    group: 'C',
    kind: 'gravel',
    polygon: [
      [584, 3028], [850, 3029], [1068, 3031], [1155, 3032],
      [1540, 3031], [1820, 3033], [2037, 3035], [2036, 3194],
      [1640, 3193], [1260, 3192], [1068, 3192], [584, 3191],
    ],
    provenance: gravelProvenance + ' C01–C22: faixa contínua posterior aos lotes '
      + 'de Expo Rural. Símbolos cruzados de vagas permanecem sob revisão; a '
      + 'superfície não certifica polígonos operacionais sem sobreposição.',
  },
  {
    id: 'rear-parking:terrain:A2-island',
    group: 'A',
    kind: 'grass',
    polygon: [
      [4338, 1863], [4343, 1861], [4348, 1866], [4348, 1884],
      [4340, 2429], [4338, 2438], [4333, 2440], [4330, 2435],
      [4330, 2419], [4337, 1880],
    ],
    provenance: 'Ilha estreita de A2 delineada no anexo 5. Acabamento de relva '
      + 'baixa da mesma família ambiental do anexo 7; sem meio-fio ou altura inventados.',
  },
  {
    id: 'rear-parking:terrain:A3-island',
    group: 'A',
    kind: 'grass',
    polygon: [
      [4230, 2236], [4240, 2237], [4240, 2535], [4238, 2544],
      [4234, 2547], [4230, 2543],
    ],
    provenance: 'Separador estreito dos lados de A3 visível nos anexos 5/6. '
      + 'Material ambiental interpretado; não implica canteiro ou drenagem construídos.',
  },
  {
    id: 'rear-parking:terrain:A4-island',
    group: 'A',
    kind: 'grass',
    polygon: [
      [4127, 2271], [4132, 2268], [4137, 2271], [4138, 2284],
      [4135, 2598], [4132, 2607], [4126, 2604], [4126, 2586],
    ],
    provenance: 'Ilha central arredondada de A4 visível nos anexos 5/6. '
      + 'O traço dá a forma; o satélite sustenta somente o caráter vegetado do solo.',
  },
];

/**
 * Drawn circulation axes. For the undelimited external exits, the width is the
 * measured adjacent aisle module (31 original pixels), not an asserted survey.
 * Render as compacted wear on the same terrain family, never as a new highway.
 */
export const REAR_PARKING_SOURCE_CIRCULATION: readonly RearParkingSourceCirculation[] = [
  {
    id: 'rear-parking:circulation:B-north-west', group: 'B',
    points: [[4180, 2700], [3675, 2696], [3160, 2685], [2850, 2680],
      [2723, 2690], [2665, 2726], [2620, 2780], [2597, 2842],
      [2571, 2930], [2548, 3058], [2540, 3180]],
    widthPixels: 31, widthProvenance: 'BETWEEN_DRAWN_EDGES',
    provenance: 'Via externa ao bordo norte/curvo oeste, com setas SAÍDA no anexo 5; '
      + 'centro entre as duas linhas existentes, sem deslocar a Pista Campeira.',
  },
  {
    id: 'rear-parking:circulation:B-west-inner', group: 'B',
    points: [[2636, 3210], [2649, 3090], [2672, 2950], [2700, 2850],
      [2729, 2800], [2755, 2770]],
    widthPixels: 31, widthProvenance: 'BETWEEN_DRAWN_EDGES',
    provenance: 'Circulação curva entre o bordo hachurado oeste e a primeira faixa B22.',
  },
  {
    id: 'rear-parking:circulation:B-reentrant', group: 'B',
    points: [[2905, 3208], [2937, 3168], [2961, 3128], [3001, 3097],
      [3038, 3096], [3056, 3123], [3056, 3177]],
    widthPixels: 31, widthProvenance: 'LOCAL_AISLE_MODULE_NOT_SURVEYED',
    provenance: 'Saída bifurcada desenhada no recuo sul. Largura da via externa '
      + 'sem cota; usa o módulo de circulação adjacente apenas para apresentação.',
  },
  {
    id: 'rear-parking:circulation:B-middle-exit', group: 'B',
    points: [[3108, 3170], [3114, 3040], [3119, 2880], [3128, 2720]],
    widthPixels: 31, widthProvenance: 'BETWEEN_DRAWN_EDGES',
    provenance: 'Corredor de SAÍDA entre B16 e B17; não permitir que uma faixa de '
      + 'vagas procedimental atravesse o corredor.',
  },
  {
    id: 'rear-parking:circulation:B-south-exit', group: 'B',
    points: [[4370, 3237], [3940, 3237], [3520, 3236], [3122, 3230]],
    widthPixels: 31, widthProvenance: 'LOCAL_AISLE_MODULE_NOT_SURVEYED',
    provenance: 'Setas da saída sul apontam para oeste na planta. A margem inferior '
      + 'da via não está cotada nem inteiramente delineada.',
  },
  {
    id: 'rear-parking:circulation:C-south', group: 'C',
    points: [[546, 3238], [1065, 3239], [1540, 3240], [1997, 3242], [2500, 3242]],
    widthPixels: 31, widthProvenance: 'LOCAL_AISLE_MODULE_NOT_SURVEYED',
    provenance: 'Sequência de setas SAÍDA sob C22–C01 e ligação B; largura de '
      + 'apresentação tomada do módulo adjacente, sem criar divisa cadastral.',
  },
  {
    id: 'rear-parking:circulation:C-B-entry', group: 'C',
    points: [[2510, 3210], [2288, 3210], [2030, 3210], [2030, 3060]],
    widthPixels: 26, widthProvenance: 'BETWEEN_DRAWN_EDGES',
    provenance: 'Ligação de entrada delimitada em magenta no anexo 4/5; sentidos '
      + 'opostos são explicitados por setas separadas e não inferidos como mão única.',
  },
  {
    id: 'rear-parking:circulation:A-return', group: 'A',
    points: [[4160, 2642], [4224, 2634], [4290, 2581], [4360, 2508],
      [4402, 2430], [4421, 2346], [4427, 2180], [4427, 1970],
      [4426, 1820], [4432, 1680], [4443, 1609]],
    widthPixels: 30, widthProvenance: 'BETWEEN_DRAWN_EDGES',
    provenance: 'Ligação curva contínua entre A1–A5, mantida fora das ilhas e '
      + 'edificações existentes. O traçado não substitui o desenho de cada vaga.',
  },
];

const east = 0;
const south = Math.PI / 2;
const west = Math.PI;
const north = -Math.PI / 2;

export const REAR_PARKING_SOURCE_OPERATIONS: readonly RearParkingSourceOperation[] = [
  { id: 'rear-parking:operation:A2-turnaround', kind: 'EXIT_ARROW', position: [4297, 1861], headingRadians: south, label: 'Retorno A2', curvePixels: [[4387, 1882], [4388, 1861], [4383, 1845], [4373, 1833], [4357, 1825], [4342, 1824], [4326, 1827], [4313, 1836], [4303, 1848], [4297, 1861]], provenance: 'Arco e ponta da seta vermelha sobre A2 nos anexos 5/6; retorno, sem inferência de preferência.' },
  { id: 'rear-parking:operation:A4-turnaround', kind: 'EXIT_ARROW', position: [4083, 2296], headingRadians: south, label: 'Retorno A4', curvePixels: [[4186, 2318], [4187, 2298], [4182, 2282], [4171, 2268], [4156, 2257], [4137, 2254], [4119, 2258], [4103, 2268], [4091, 2281], [4083, 2296]], provenance: 'Arco e ponta da seta vermelha sobre A4 nos anexos 5/6; não transformar o retorno em rua reta.' },
  { id: 'rear-parking:operation:A-south-exit', kind: 'EXIT_ARROW', position: [4140, 2720], headingRadians: west, label: 'Saída', provenance: 'Seta vermelha para oeste no retorno sul de A, visível nos anexos 5/6; sentido preservado sem inferir preferência.' },
  { id: 'rear-parking:operation:C-exit-west', kind: 'EXIT_ARROW', position: [557, 3253], headingRadians: east, label: 'Saída' },
  { id: 'rear-parking:operation:C-exit-middle-west', kind: 'EXIT_ARROW', position: [1120, 3253], headingRadians: east, label: 'Saída' },
  { id: 'rear-parking:operation:C-exit-middle-east', kind: 'EXIT_ARROW', position: [1550, 3253], headingRadians: east, label: 'Saída' },
  { id: 'rear-parking:operation:C-exit-east', kind: 'EXIT_ARROW', position: [1880, 3253], headingRadians: east, label: 'Saída' },
  { id: 'rear-parking:operation:C-west-arrival', kind: 'EXIT_ARROW', position: [520, 3100], headingRadians: south, label: 'Saída' },
  { id: 'rear-parking:operation:CB-exit', kind: 'EXIT_ARROW', position: [2280, 3263], headingRadians: east, label: 'Saída' },
  { id: 'rear-parking:operation:CB-north-exit', kind: 'EXIT_ARROW', position: [2180, 3033], headingRadians: east, label: 'Saída' },
  { id: 'rear-parking:operation:CB-upper-entry', kind: 'ENTRY_ARROW', position: [2040, 3020], headingRadians: west, label: 'Entrada do estacionamento' },
  { id: 'rear-parking:operation:CB-lower-entry-west', kind: 'ENTRY_ARROW', position: [2152, 3201], headingRadians: west, label: 'Entrada do estacionamento' },
  { id: 'rear-parking:operation:CB-lower-entry-east', kind: 'ENTRY_ARROW', position: [2148, 3217], headingRadians: east, label: 'Entrada do estacionamento' },
  { id: 'rear-parking:operation:B-transverse-entry', kind: 'ENTRY_ARROW', position: [2406, 3201], headingRadians: west, label: 'Entrada do bloco B' },
  { id: 'rear-parking:operation:B-transverse-exit', kind: 'ENTRY_ARROW', position: [2408, 3217], headingRadians: east, label: 'Entrada do bloco B' },
  { id: 'rear-parking:operation:B-west-entry', kind: 'ENTRY_ARROW', position: [2565, 3194], headingRadians: west, label: 'Entrada do estacionamento' },
  { id: 'rear-parking:operation:B-gate', kind: 'GATE', position: [2581, 3220], headingRadians: east, label: 'Portão do estacionamento', spanPixels: 54, provenance: 'PORTÃO assinalado no pé do acesso hachurado oeste. A abertura acompanha a faixa de acesso existente; modelo do portão não é levantado.' },
  { id: 'rear-parking:operation:CB-north-block', kind: 'BARRIER', position: [2174, 3061], headingRadians: east, label: 'Bloquear passagem transversal', spanPixels: 207, provenance: 'Faixa hachurada laranja entre C01 e B23–B29, com líder BLOQUEAR nos anexos 4/5.' },
  { id: 'rear-parking:operation:C-lower-block', kind: 'BARRIER', position: [2017, 3197], headingRadians: south, label: 'Ponto de bloqueio indicado na planta', spanPixels: null, provenance: 'Líder BLOQUEAR termina junto à entrada inferior de C01. O desenho não informa extensão: apresentar sinalização de ponto, sem inventar barreira que feche a via.' },
  { id: 'rear-parking:operation:B-north-exit', kind: 'EXIT_ARROW', position: [3106, 2666], headingRadians: west, label: 'Saída' },
  { id: 'rear-parking:operation:B-north-west-exit', kind: 'EXIT_ARROW', position: [2638, 2723], headingRadians: Math.PI * 0.75, label: 'Saída' },
  { id: 'rear-parking:operation:B-west-north-exit', kind: 'EXIT_ARROW', position: [2554, 2876], headingRadians: south, label: 'Saída' },
  { id: 'rear-parking:operation:B-west-south-exit', kind: 'EXIT_ARROW', position: [2539, 3050], headingRadians: south, label: 'Saída' },
  { id: 'rear-parking:operation:B-south-west-exit', kind: 'EXIT_ARROW', position: [2743, 3261], headingRadians: east, label: 'Saída' },
  { id: 'rear-parking:operation:B-reentrant-west-exit', kind: 'EXIT_ARROW', position: [2918, 3155], headingRadians: -Math.PI / 4, label: 'Saída' },
  { id: 'rear-parking:operation:B-reentrant-east-exit', kind: 'EXIT_ARROW', position: [3047, 3181], headingRadians: north, label: 'Saída' },
  { id: 'rear-parking:operation:B-middle-exit', kind: 'EXIT_ARROW', position: [3118, 3070], headingRadians: north, label: 'Saída' },
  { id: 'rear-parking:operation:B-no-right', kind: 'NO_RIGHT_TURN', position: [3125, 3111], headingRadians: north, label: 'Proibido dobrar à direita', spanPixels: null, provenance: 'Líder magenta liga a advertência ao ponto indicado no corredor B16/B17. Não é inferida outra restrição.' },
  { id: 'rear-parking:operation:B-south-exit-01', kind: 'EXIT_ARROW', position: [3290, 3232], headingRadians: west, label: 'Saída' },
  { id: 'rear-parking:operation:B-south-exit-02', kind: 'EXIT_ARROW', position: [3590, 3242], headingRadians: west, label: 'Saída' },
  { id: 'rear-parking:operation:B-south-exit-03', kind: 'EXIT_ARROW', position: [3965, 3242], headingRadians: west, label: 'Saída' },
  { id: 'rear-parking:operation:B-south-exit-04', kind: 'EXIT_ARROW', position: [4300, 3242], headingRadians: west, label: 'Saída' },
];

/** Four shared landmarks, fitted with a uniform 2-D similarity (no shear). */
export const REAR_PARKING_SATELLITE_REGISTRATION = Object.freeze({
  sourceFileName: 'IMG_9816 (1).jpeg',
  sourceImageSize: { width: 1179, height: 861 },
  targetFileName: 'IMG_9811 (1).jpeg',
  method: 'LEAST_SQUARES_SIMILARITY_WITHOUT_SHEAR',
  controls: [
    { id: 'PAVILHAO_09', satellite: [902, 604], plan: [3647, 2363], residualPlanPixels: 9.048362689397761 },
    { id: 'CRIADORES_CRIOULOS', satellite: [957, 581], plan: [3859, 2280], residualPlanPixels: 8.158982945570735 },
    { id: 'PISTA_CAMPEIRA', satellite: [750, 627], plan: [3095, 2454], residualPlanPixels: 21.891899968298414 },
    { id: 'ARENA', satellite: [258, 459], plan: [1184, 1802], residualPlanPixels: 5.825807228146532 },
  ],
  // planX = a*satX - b*satY + tx; planY = b*satX + a*satY + ty.
  a: 3.8317684674717523,
  b: 0.007769453672740437,
  tx: 204.2410582623199,
  ty: 43.694696672975624,
  maxControlResidualPlanPixels: 21.891899968298414,
  fieldReviewRequired: true,
  notes: 'Registro visual por centros de quatro marcos, em pixels dos anexos '
    + 'completos. O maior resíduo equivale a cerca de 4,30 m pela escala local '
    + 'adotada, além da incerteza do registro da planta no mapa. Usar apenas para '
    + 'caráter ambiental; testar conflitos com vagas, vias, estruturas e árvores '
    + 'já existentes. Não alterar o estacionamento para fazer o satélite coincidir.',
});

export function rearParkingSatelliteToPlan(point: RearParkingSourcePoint): RearParkingSourcePoint {
  const { a, b, tx, ty } = REAR_PARKING_SATELLITE_REGISTRATION;
  return [a * point[0] - b * point[1] + tx, b * point[0] + a * point[1] + ty];
}
