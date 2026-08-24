import type { Coordinate } from '../types';

export type CommercialHydrologicalPipeCategory = 'distribution' | 'hydrant_supply';
export type CommercialHydrologicalDiameterMm = 25 | 32 | 40 | 50 | 60 | 75 | 85;
export type CommercialHydrologicalNodeType =
  | 'tap'
  | 'hydrant'
  | 'reservoir'
  | 'well'
  | 'register'
  | 'technical_symbol'
  | 'corsan_entry'
  | 'junction';

export interface CommercialHydrologicalPipeSegment {
  id: string;
  category: CommercialHydrologicalPipeCategory;
  diameterMm: CommercialHydrologicalDiameterMm | null;
  diameterSource: 'OFFICIAL_VECTOR_ANNOTATION' | 'NOT_ANNOTATED_ON_SPAN';
  purpose: 'LOW_FLOW_DISTRIBUTION' | 'HYDRANT_FEED';
  route: readonly [Coordinate, Coordinate];
  sourceNodeId: string;
  targetNodeId: string;
  activationDistance: number;
  selectable: true;
  metadata: {
    sourceLayer: string;
    sourcePageRoute: readonly [Coordinate, Coordinate];
    verificationStatus: 'OFFICIAL_PLAN_VECTOR_EXTRACTED';
  };
}

export interface CommercialHydrologicalNode {
  id: string;
  type: CommercialHydrologicalNodeType;
  position: Coordinate;
  sourcePagePosition: Coordinate;
  label: string;
  linkedSegmentIds: string[];
  selectable: boolean;
  metadata: Record<string, string | number | boolean | null>;
}

type PipeSourceSpan = readonly [
  category: CommercialHydrologicalPipeCategory,
  diameterMm: CommercialHydrologicalDiameterMm | null,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
];

type PointSourceTuple = readonly [id: string, x: number, y: number, label: string];

export const HYDROLOGICAL_INFRASTRUCTURE_REFERENCE = {
  revision: '2026.08.23.1',
  sourceFiles: [
    {
      name: 'A2-Fenasoja - Parque - Rede Hidro com imagem.pdf',
      sha256: 'edcfbc828c0c62de640c850ebbbe2d7cf423f49b8383c2fa93c3dc670237b64c',
      role: 'official_spatial_overlay',
    },
    {
      name: 'A2-Fenasoja - Parque - Rede Hidro sem imagem.pdf',
      sha256: 'a526bac188a7f7af6e7549dfe41c0539859c1a37fc892d29379454b774af49f1',
      role: 'official_vector_extraction',
    },
    {
      name: 'A2-Fenasoja - Parque - Rede Hidro sem imagem_page-0001 (1).jpg',
      sha256: '67729ce3fe3b3fbd5403f84a98a2552ca298affa80c7fc5b05147dea2356ed69',
      role: 'official_visual_annex',
    },
  ],
  sourcePage: { widthPoints: 1684, heightPoints: 1191, origin: 'top-left', printedScale: '1:1500' },
  physicalScale: {
    metersPerPdfPoint: 0.529167,
    metersPerPixelAt300Dpi: 0.127,
    metersPerPixelInOfficialJpegAt150Dpi: 0.254,
    jpegTransform: 'px = pt × 150 / 72; sem crop, rotação ou deslocamento detectável',
  },
  layers: {
    knownDistribution: 'INFRA-HIDRÁULICA-CONHECIDA',
    waterAssets: 'INFRA-HIDRO-(CAIXA DAGUA E HIDRANTES)',
    distribution: 'INFRA-HIDRÁULICA',
    corsanHydrantFeed: 'INFRA-HIDRÁULICA-CORSAN',
    automobileExtension: 'INFRA-HIDRÁULICA-AUTOMÓVEL (NOVA)',
  },
  extraction: {
    method: 'Centro de ribbons vetoriais oficiais pareados por aresta recíproca, acrescido dos strokes abertos confirmados visualmente; símbolos tipados pelo layer, glifo e microtexto do próprio CAD.',
    distributionRibbonTriangleCount: 420,
    distributionRibbonSpanCount: 210,
    distributionOpenStrokeSpanCount: 10,
    distributionSpanCount: 220,
    hydrantFeedRibbonTriangleCount: 52,
    hydrantFeedSpanCount: 26,
    tapCount: 87,
    hydrantCount: 13,
    reservoirCount: 10,
    wellCount: 4,
    registerCount: 21,
    unresolvedTechnicalSymbolCount: 12,
    corsanEntryCount: 1,
    diameterAnnotations: {
      distributionTextCounts: { 25: 17, 32: 1, 40: 17, 50: 15, 60: 7, 85: 1 },
      distributionOutlined75Count: 4,
      hydrantFeed50TextCount: 14,
      note: 'Ø75 foi confirmado nos contornos vetoriais do conjunto norte; Ø30 não aparece textual nem visualmente.',
    },
  },
  calibration: {
    method: 'Registro afim por 17 marcadores verdes homólogos entre a prancha A2 hidráulica e a prancha A3 já calibrada no mapa comercial.',
    a2PagePointToWorldXZMatrix: [
      [0.0779550493, -0.000000633084162, -68.9292202],
      [0.00000243943617, 0.0779440006, -48.3707964],
      [0, 0, 1],
    ] as const,
    a2PagePointToOfficialPdfPointMatrix: [
      [3.57293976, -0.0000290163584, 190.744074],
      [0.000111807498, 3.57243336, 758.005177],
      [0, 0, 1],
    ] as const,
    diagnostics: {
      sharedMarkerCount: 17,
      rmsResidualA2Points: 0.0420083,
      maximumResidualA2Points: 0.141825,
      approximateRmsResidualWorldUnits: 0.003275,
    },
    formula: '[x,z,1]^T = matrix * [a2PdfX,a2PdfY,1]^T',
  },
  classification: {
    distributionColor: '#00bfff',
    hydrantFeedColor: '#ff0000',
    confirmedDistributionDiametersMm: [25, 32, 40, 50, 60, 75, 85],
    confirmedHydrantFeedDiametersMm: [50],
    absentDiameterNote: 'Não há indicação Ø30 legível na prancha oficial; o valor não foi inferido.',
    unannotatedSpanPolicy: 'Trechos sem anotação inequívoca permanecem com diameterMm=null; nenhum diâmetro é propagado por suposição.',
  },
  uncertainties: {
    technicalSymbolTl: 'A sigla TL é preservada literalmente e não é expandida sem memória de cálculo ou legenda oficial.',
    altitude: 'A prancha informa rotas planimétricas e cotas pontuais de reservatórios, não profundidade individual de tubulação.',
    hydrantRule: 'Somente os 13 glifos verdes acompanhados do microtexto Hidrante são tipados como hidrantes; terminações vermelhas da Arena não são promovidas a hidrantes.',
    hydrantAnnotationCandidates: [
      { sourcePagePosition: [829.25, 482.88], evidence: 'Texto ciano Hidrante sem glifo verde correspondente' },
      { sourcePagePosition: [1114.10, 659.46], evidence: 'Texto ciano Hidrante sem glifo verde correspondente' },
    ],
    automobileExtension: {
      sourceLayer: 'INFRA-HIDRÁULICA-AUTOMÓVEL (NOVA)',
      sourceColor: '#ff3f00',
      geometryA2: [[639.27, 526.74], [639.30, 523.92]],
      semanticStatus: 'NÃO CONFIRMADO',
      decision: 'Não renderizado: o plano não informa diâmetro, finalidade ou símbolo, e o briefing autoriza somente as classes azul e vermelha.',
    },
  },
} as const;

export function hydrologicalPlanPointToWorldXZ([pdfX, pdfY]: Coordinate): Coordinate {
  const matrix = HYDROLOGICAL_INFRASTRUCTURE_REFERENCE.calibration.a2PagePointToWorldXZMatrix;
  return [
    matrix[0][0] * pdfX + matrix[0][1] * pdfY + matrix[0][2],
    matrix[1][0] * pdfX + matrix[1][1] * pdfY + matrix[1][2],
  ];
}

const HYDROLOGICAL_PIPE_SOURCE_SPANS: readonly PipeSourceSpan[] = [
  ['distribution', null, 1012.140, 118.560, 1012.230, 123.240],
  ['distribution', null, 1019.040, 118.590, 1019.130, 123.420],
  ['distribution', 75, 1012.200, 118.598, 1046.250, 118.763],
  ['distribution', null, 1025.640, 118.650, 1025.707, 123.450],
  ['distribution', null, 1019.033, 129.660, 1019.205, 138.270],
  ['distribution', null, 1025.595, 129.690, 1025.767, 138.270],
  ['distribution', null, 1012.245, 129.780, 1012.418, 138.195],
  ['distribution', 75, 1046.100, 137.610, 1046.130, 118.868],
  ['distribution', 75, 1045.980, 137.730, 1065.337, 137.760],
  ['distribution', 75, 1065.233, 137.880, 1065.840, 470.340],
  ['distribution', null, 1026.000, 138.338, 1604.347, 142.673],
  ['distribution', null, 1012.253, 138.345, 1026.000, 138.173],
  ['distribution', null, 1604.182, 142.838, 1604.707, 378.435],
  ['distribution', null, 1065.293, 196.530, 1065.457, 201.900],
  ['distribution', null, 1065.390, 199.298, 1590.900, 199.433],
  ['distribution', null, 1065.322, 211.650, 1065.487, 217.020],
  ['distribution', null, 1065.390, 214.418, 1590.900, 214.553],
  ['distribution', null, 1065.510, 349.950, 1065.697, 355.350],
  ['distribution', null, 1065.600, 352.710, 1604.400, 354.570],
  ['distribution', null, 1603.800, 369.810, 1603.890, 354.630],
  ['distribution', null, 1482.862, 369.878, 1603.680, 369.690],
  ['distribution', null, 1065.540, 370.230, 1065.727, 375.600],
  ['distribution', null, 1306.702, 370.710, 1306.920, 446.610],
  ['distribution', null, 398.482, 371.010, 402.337, 594.038],
  ['distribution', null, 398.647, 371.010, 400.643, 269.160],
  ['distribution', null, 1412.760, 372.870, 1482.847, 369.773],
  ['distribution', null, 1065.630, 372.990, 1306.807, 370.590],
  ['distribution', 25, 854.332, 403.072, 854.385, 407.715],
  ['distribution', 25, 854.497, 403.238, 874.523, 403.373],
  ['distribution', 25, 836.895, 409.305, 854.235, 407.565],
  ['distribution', 25, 836.497, 415.815, 836.745, 409.155],
  ['distribution', 25, 826.755, 416.835, 836.332, 415.665],
  ['distribution', 25, 702.390, 419.468, 826.447, 420.375],
  ['distribution', null, 450.263, 453.660, 450.727, 547.688],
  ['distribution', null, 944.775, 455.738, 981.742, 457.995],
  ['distribution', 50, 825.712, 457.290, 825.787, 463.868],
  ['distribution', 50, 825.877, 457.290, 826.283, 420.525],
  ['distribution', null, 981.727, 458.145, 1029.015, 460.133],
  ['distribution', null, 1029.165, 460.298, 1030.102, 447.533],
  ['distribution', null, 930.480, 460.875, 944.745, 455.572],
  ['distribution', 50, 825.622, 463.942, 847.267, 483.630],
  ['distribution', null, 921.338, 466.635, 930.420, 460.725],
  ['distribution', null, 873.952, 466.898, 921.293, 466.485],
  ['distribution', null, 857.842, 467.062, 858.637, 476.100],
  ['distribution', null, 858.007, 467.228, 873.938, 466.732],
  ['distribution', 60, 858.472, 476.100, 858.757, 501.765],
  ['distribution', null, 450.510, 505.328, 489.600, 505.793],
  ['distribution', null, 638.888, 505.598, 741.960, 508.462],
  ['distribution', 25, 489.600, 505.958, 523.410, 506.903],
  ['distribution', 25, 559.440, 507.038, 607.860, 506.933],
  ['distribution', 60, 852.263, 507.053, 853.688, 523.703],
  ['distribution', null, 523.410, 507.067, 559.440, 506.873],
  ['distribution', null, 607.860, 507.098, 639.000, 505.433],
  ['distribution', null, 846.225, 508.208, 847.132, 483.690],
  ['distribution', null, 783.727, 508.380, 783.862, 503.100],
  ['distribution', 60, 741.960, 508.628, 846.075, 508.043],
  ['distribution', null, 1528.027, 513.487, 1561.462, 516.862],
  ['distribution', null, 1561.567, 517.027, 1604.543, 378.405],
  ['distribution', null, 906.622, 520.290, 906.668, 529.770],
  ['distribution', null, 911.933, 520.350, 911.977, 529.852],
  ['distribution', null, 637.357, 522.892, 638.820, 505.598],
  ['distribution', null, 797.640, 523.628, 853.620, 523.703],
  ['distribution', null, 853.523, 523.868, 892.830, 524.842],
  ['distribution', 25, 741.255, 523.957, 797.640, 523.463],
  ['distribution', null, 892.830, 525.007, 948.930, 525.533],
  ['distribution', null, 997.132, 525.517, 997.418, 590.580],
  ['distribution', null, 948.930, 525.697, 997.297, 525.352],
  ['distribution', null, 888.517, 527.497, 943.410, 527.753],
  ['distribution', null, 943.410, 527.918, 1028.550, 529.223],
  ['distribution', 25, 741.600, 528.128, 759.090, 527.753],
  ['distribution', null, 1003.733, 528.870, 1003.777, 534.630],
  ['distribution', null, 1025.767, 529.253, 1026.322, 510.330],
  ['distribution', null, 1028.430, 529.388, 1030.425, 535.080],
  ['distribution', null, 1003.612, 534.630, 1004.168, 581.790],
  ['distribution', null, 1030.275, 535.125, 1034.317, 550.815],
  ['distribution', null, 450.562, 547.703, 451.545, 610.380],
  ['distribution', null, 993.990, 550.027, 1000.118, 549.773],
  ['distribution', null, 1034.152, 550.860, 1039.335, 566.543],
  ['distribution', 60, 740.168, 572.933, 741.105, 523.793],
  ['distribution', 40, 873.652, 580.987, 904.140, 580.433],
  ['distribution', 40, 740.640, 581.048, 873.660, 580.822],
  ['distribution', 40, 451.395, 610.380, 452.707, 647.408],
  ['distribution', 60, 739.507, 621.533, 740.003, 572.910],
  ['distribution', 32, 1157.782, 633.585, 1318.710, 628.043],
  ['distribution', 40, 201.735, 642.990, 278.993, 653.153],
  ['distribution', 40, 452.543, 647.482, 462.908, 655.883],
  ['distribution', 50, 312.517, 647.798, 354.233, 651.263],
  ['distribution', 40, 354.217, 651.428, 462.660, 657.953],
  ['distribution', 25, 400.860, 652.148, 419.730, 651.893],
  ['distribution', 50, 278.977, 653.317, 352.110, 654.893],
  ['distribution', 60, 739.418, 653.400, 741.862, 508.530],
  ['distribution', 50, 739.320, 653.497, 903.060, 656.633],
  ['distribution', 40, 701.190, 654.967, 725.580, 655.943],
  ['distribution', 40, 611.160, 655.027, 692.910, 655.485],
  ['distribution', 40, 352.110, 655.058, 462.892, 655.883],
  ['distribution', 40, 691.942, 655.118, 701.190, 654.803],
  ['distribution', 25, 400.837, 655.410, 402.173, 594.038],
  ['distribution', 40, 692.910, 655.635, 724.080, 655.582],
  ['distribution', 40, 724.080, 655.747, 739.283, 655.943],
  ['distribution', 50, 926.572, 656.017, 942.750, 656.303],
  ['distribution', 40, 462.862, 656.048, 611.160, 654.862],
  ['distribution', 40, 725.580, 656.108, 738.555, 656.453],
  ['distribution', null, 942.750, 656.467, 962.310, 657.143],
  ['distribution', 60, 738.705, 656.618, 739.342, 621.518],
  ['distribution', 50, 903.060, 656.798, 924.938, 655.965],
  ['distribution', 25, 991.650, 657.277, 1036.380, 657.503],
  ['distribution', 50, 962.310, 657.308, 991.650, 657.112],
  ['distribution', 50, 462.660, 658.118, 614.317, 658.755],
  ['distribution', 40, 614.152, 658.905, 614.587, 679.020],
  ['distribution', null, 996.127, 659.925, 997.253, 590.580],
  ['distribution', 25, 995.962, 660.075, 1043.760, 661.553],
  ['distribution', 25, 1043.760, 661.717, 1088.160, 662.812],
  ['distribution', null, 1088.160, 662.977, 1136.273, 663.622],
  ['distribution', null, 1136.332, 663.735, 1157.707, 633.435],
  ['distribution', null, 1136.257, 663.787, 1197.953, 665.572],
  ['distribution', 50, 1141.515, 664.230, 1141.628, 681.030],
  ['distribution', 85, 1197.938, 665.737, 1247.258, 669.533],
  ['distribution', null, 1247.213, 669.697, 1288.357, 688.387],
  ['distribution', 40, 614.332, 671.130, 614.497, 676.500],
  ['distribution', 50, 567.135, 672.668, 592.920, 673.163],
  ['distribution', 40, 592.928, 673.327, 612.300, 673.793],
  ['distribution', 40, 611.077, 678.420, 611.085, 654.960],
  ['distribution', null, 1288.253, 688.523, 1343.175, 738.285],
  ['distribution', null, 172.808, 697.267, 201.645, 642.810],
  ['distribution', 50, 566.595, 700.050, 566.985, 672.503],
  ['distribution', null, 1518.487, 722.580, 1559.295, 610.372],
  ['distribution', null, 1343.025, 738.375, 1350.832, 765.090],
  ['distribution', null, 565.837, 738.780, 566.445, 700.050],
  ['distribution', null, 737.610, 746.138, 767.722, 747.053],
  ['distribution', null, 565.987, 746.190, 568.267, 741.773],
  ['distribution', 50, 797.790, 746.797, 825.780, 746.723],
  ['distribution', 50, 830.190, 747.128, 876.750, 748.913],
  ['distribution', 50, 767.730, 747.217, 797.790, 746.632],
  ['distribution', null, 939.090, 748.808, 999.630, 750.322],
  ['distribution', null, 876.750, 749.078, 939.090, 748.642],
  ['distribution', null, 564.555, 759.322, 565.822, 746.130],
  ['distribution', null, 1350.697, 765.210, 1385.678, 778.673],
  ['distribution', 50, 825.615, 766.372, 825.712, 746.820],
  ['distribution', 60, 825.540, 766.447, 876.510, 766.072],
  ['distribution', 50, 1500.135, 775.747, 1518.322, 722.520],
  ['distribution', null, 1385.632, 778.838, 1433.798, 788.805],
  ['distribution', null, 562.267, 779.303, 564.405, 759.308],
  ['distribution', 50, 1498.898, 781.388, 1499.985, 775.703],
  ['distribution', 40, 163.327, 782.153, 172.642, 697.223],
  ['distribution', null, 1433.753, 788.955, 1455.577, 793.882],
  ['distribution', 50, 1455.532, 794.047, 1492.845, 801.413],
  ['distribution', 50, 1492.905, 801.540, 1498.733, 781.342],
  ['distribution', 50, 1492.815, 801.585, 1535.235, 810.105],
  ['distribution', null, 1535.175, 810.247, 1582.560, 818.468],
  ['distribution', null, 1535.145, 810.255, 1574.138, 857.827],
  ['distribution', null, 1582.440, 818.603, 1591.785, 845.280],
  ['distribution', null, 796.080, 828.188, 828.510, 828.473],
  ['distribution', null, 828.510, 828.638, 873.090, 829.253],
  ['distribution', null, 934.770, 829.358, 975.840, 829.882],
  ['distribution', null, 873.090, 829.418, 934.770, 829.193],
  ['distribution', null, 746.190, 829.838, 796.080, 828.023],
  ['distribution', null, 736.050, 829.928, 746.190, 829.673],
  ['distribution', null, 975.840, 830.047, 1016.490, 829.822],
  ['distribution', 50, 1478.985, 830.460, 1492.755, 801.480],
  ['distribution', null, 1591.635, 845.340, 1601.955, 871.852],
  ['distribution', null, 561.412, 851.130, 562.087, 865.890],
  ['distribution', null, 561.577, 851.130, 562.102, 779.287],
  ['distribution', null, 1574.033, 857.962, 1582.260, 860.925],
  ['distribution', null, 561.923, 865.890, 562.065, 912.953],
  ['distribution', null, 1601.805, 871.898, 1607.767, 895.020],
  ['distribution', null, 1467.487, 883.455, 1478.835, 830.415],
  ['distribution', 25, 1129.537, 888.053, 1130.513, 855.690],
  ['distribution', null, 550.350, 891.930, 554.565, 914.685],
  ['distribution', null, 550.530, 891.930, 560.392, 840.375],
  ['distribution', 40, 1096.733, 903.795, 1128.877, 900.053],
  ['distribution', null, 1606.005, 911.055, 1607.602, 895.020],
  ['distribution', null, 561.915, 912.997, 571.455, 924.195],
  ['distribution', null, 554.415, 914.775, 571.102, 926.445],
  ['distribution', 25, 1128.188, 920.130, 1129.372, 888.037],
  ['distribution', 40, 571.365, 924.345, 608.722, 929.453],
  ['distribution', 40, 571.028, 926.595, 606.442, 933.862],
  ['distribution', 25, 608.707, 929.618, 644.632, 931.372],
  ['distribution', null, 828.607, 931.237, 828.683, 921.930],
  ['distribution', 25, 644.618, 931.537, 702.540, 934.372],
  ['distribution', 40, 787.170, 931.658, 828.442, 931.072],
  ['distribution', 40, 732.502, 932.858, 787.170, 931.493],
  ['distribution', 25, 1601.227, 932.985, 1605.855, 911.025],
  ['distribution', 25, 908.070, 933.878, 977.310, 933.862],
  ['distribution', 25, 1029.450, 933.915, 1041.832, 933.622],
  ['distribution', 25, 606.428, 934.027, 644.010, 934.545],
  ['distribution', 25, 977.310, 934.027, 1029.450, 933.765],
  ['distribution', 40, 702.540, 934.537, 731.857, 935.513],
  ['distribution', 25, 644.107, 934.635, 644.483, 929.587],
  ['distribution', 40, 644.010, 934.695, 694.110, 935.453],
  ['distribution', null, 1460.025, 935.303, 1467.322, 883.425],
  ['distribution', 40, 694.110, 935.618, 733.500, 937.223],
  ['distribution', 40, 828.390, 936.547, 887.070, 937.072],
  ['distribution', 40, 887.085, 937.237, 1096.695, 903.645],
  ['distribution', 60, 733.567, 937.290, 739.253, 653.400],
  ['distribution', 40, 733.500, 937.388, 828.390, 936.382],
  ['distribution', 25, 1044.293, 941.130, 1044.367, 951.450],
  ['distribution', 25, 1044.457, 941.130, 1044.503, 936.450],
  ['distribution', null, 1594.793, 957.803, 1601.062, 932.955],
  ['distribution', null, 1594.597, 957.908, 1603.223, 960.622],
  ['distribution', null, 1456.597, 958.553, 1459.875, 935.287],
  ['distribution', null, 1603.207, 960.787, 1626.990, 960.645],
  ['distribution', null, 1453.207, 979.372, 1456.432, 958.537],
  ['distribution', 50, 1435.365, 992.692, 1450.568, 982.508],
  ['distribution', 50, 1428.300, 997.410, 1435.275, 992.558],
  ['distribution', 50, 1426.215, 1001.580, 1428.180, 997.290],
  ['distribution', 50, 1373.858, 1004.527, 1424.040, 1006.155],
  ['distribution', 50, 1424.115, 1006.260, 1426.065, 1001.520],
  ['distribution', null, 1356.255, 1017.090, 1373.812, 1004.362],
  ['distribution', null, 1334.205, 1033.222, 1356.165, 1016.970],
  ['distribution', null, 1332.225, 1090.650, 1334.055, 1033.148],
  ['distribution', null, 450.570, 524.910, 475.350, 525.180],
  ['distribution', null, 475.350, 523.290, 475.350, 525.180],
  ['distribution', null, 475.350, 525.180, 540.780, 525.510],
  ['distribution', null, 540.780, 525.510, 540.780, 523.620],
  ['distribution', null, 637.260, 526.740, 595.650, 526.740],
  ['distribution', null, 595.650, 526.740, 595.650, 524.850],
  ['distribution', null, 637.260, 522.870, 637.260, 526.740],
  ['distribution', null, 637.260, 526.740, 639.270, 526.740],
  ['distribution', null, 639.270, 526.740, 682.890, 526.920],
  ['distribution', null, 682.890, 526.920, 682.890, 524.070],
  ['hydrant_supply', 50, 416.362, 354.030, 416.835, 455.190],
  ['hydrant_supply', 50, 415.897, 482.003, 416.685, 455.190],
  ['hydrant_supply', 50, 415.732, 482.168, 420.720, 482.183],
  ['hydrant_supply', 50, 591.060, 482.197, 721.350, 483.495],
  ['hydrant_supply', 50, 420.720, 482.348, 591.060, 482.033],
  ['hydrant_supply', 50, 829.290, 482.798, 903.172, 483.982],
  ['hydrant_supply', 50, 721.350, 483.645, 829.290, 482.633],
  ['hydrant_supply', 50, 903.158, 484.148, 908.557, 484.185],
  ['hydrant_supply', 50, 1341.787, 505.395, 1385.430, 504.202],
  ['hydrant_supply', 50, 1302.795, 529.365, 1341.742, 505.245],
  ['hydrant_supply', 50, 1288.807, 634.822, 1302.645, 529.275],
  ['hydrant_supply', 50, 1287.938, 653.745, 1288.642, 634.808],
  ['hydrant_supply', 50, 1287.773, 653.895, 1471.747, 665.663],
  ['hydrant_supply', 50, 906.510, 656.678, 1114.170, 659.243],
  ['hydrant_supply', 50, 1114.170, 659.378, 1219.620, 659.993],
  ['hydrant_supply', 50, 1219.620, 660.158, 1258.057, 663.352],
  ['hydrant_supply', 50, 1258.072, 663.517, 1287.832, 653.745],
  ['hydrant_supply', 50, 1471.883, 665.827, 1476.773, 634.905],
  ['hydrant_supply', 50, 749.550, 826.297, 887.580, 826.965],
  ['hydrant_supply', 50, 740.565, 826.418, 749.550, 826.132],
  ['hydrant_supply', 50, 887.580, 827.115, 904.515, 827.332],
  ['hydrant_supply', 50, 904.590, 827.497, 960.150, 827.723],
  ['hydrant_supply', 50, 904.665, 827.497, 908.392, 484.335],
  ['hydrant_supply', 50, 713.295, 865.178, 740.475, 826.253],
  ['hydrant_supply', 50, 698.475, 865.237, 713.205, 865.013],
  ['hydrant_supply', 50, 696.398, 940.463, 698.325, 865.072],
];

const TAP_SOURCE_POINTS: readonly PointSourceTuple[] = [
  ['tap-001', 1082.65, 197.03, 'Torneira 01'],
  ['tap-002', 1114.45, 197.03, 'Torneira 02'],
  ['tap-003', 1171.10, 197.06, 'Torneira 03'],
  ['tap-004', 1227.49, 197.12, 'Torneira 04'],
  ['tap-005', 1284.35, 197.14, 'Torneira 05'],
  ['tap-006', 1341.32, 197.18, 'Torneira 06'],
  ['tap-007', 1369.63, 197.18, 'Torneira 07'],
  ['tap-008', 1437.55, 197.24, 'Torneira 08'],
  ['tap-009', 1494.43, 197.26, 'Torneira 09'],
  ['tap-010', 1551.04, 197.30, 'Torneira 10'],
  ['tap-011', 1579.39, 197.33, 'Torneira 11'],
  ['tap-012', 1082.65, 216.53, 'Torneira 12'],
  ['tap-013', 1114.27, 216.53, 'Torneira 13'],
  ['tap-014', 1171.54, 216.56, 'Torneira 14'],
  ['tap-015', 1228.31, 216.62, 'Torneira 15'],
  ['tap-016', 1284.73, 216.64, 'Torneira 16'],
  ['tap-017', 1341.25, 216.64, 'Torneira 17'],
  ['tap-018', 1369.63, 216.68, 'Torneira 18'],
  ['tap-019', 1438.07, 216.71, 'Torneira 19'],
  ['tap-020', 1494.91, 216.74, 'Torneira 20'],
  ['tap-021', 1551.79, 216.80, 'Torneira 21'],
  ['tap-022', 1579.63, 216.83, 'Torneira 22'],
  ['tap-023', 1079.38, 349.55, 'Torneira 23'],
  ['tap-024', 1159.21, 349.85, 'Torneira 24'],
  ['tap-025', 1258.03, 350.21, 'Torneira 25'],
  ['tap-026', 1372.07, 350.62, 'Torneira 26'],
  ['tap-027', 1476.40, 351.01, 'Torneira 27'],
  ['tap-028', 1553.50, 351.29, 'Torneira 28'],
  ['tap-029', 1566.70, 372.92, 'Torneira 29'],
  ['tap-030', 1482.88, 372.95, 'Torneira 30'],
  ['tap-031', 1517.92, 372.95, 'Torneira 31'],
  ['tap-032', 1224.01, 374.57, 'Torneira 32'],
  ['tap-033', 1126.21, 375.50, 'Torneira 33'],
  ['tap-034', 1412.80, 375.95, 'Torneira 34'],
  ['tap-035', 1303.66, 381.01, 'Torneira 35'],
  ['tap-036', 784.06, 499.94, 'Torneira 36'],
  ['tap-037', 639.01, 502.37, 'Torneira 37'],
  ['tap-038', 489.70, 502.70, 'Torneira 38'],
  ['tap-039', 559.54, 503.81, 'Torneira 39'],
  ['tap-040', 523.51, 503.84, 'Torneira 40'],
  ['tap-041', 607.97, 503.87, 'Torneira 41'],
  ['tap-042', 1026.70, 506.84, 'Torneira 42'],
  ['tap-043', 634.12, 522.76, 'Torneira 43'],
  ['tap-044', 888.64, 524.26, 'Torneira 44'],
  ['tap-045', 759.23, 524.69, 'Torneira 45'],
  ['tap-046', 943.51, 524.69, 'Torneira 46'],
  ['tap-047', 1033.45, 534.47, 'Torneira 47'],
  ['tap-048', 1006.93, 542.75, 'Torneira 48'],
  ['tap-049', 1042.34, 565.82, 'Torneira 49'],
  ['tap-050', 1007.12, 565.94, 'Torneira 50'],
  ['tap-051', 904.25, 577.34, 'Torneira 51'],
  ['tap-052', 873.76, 577.73, 'Torneira 52'],
  ['tap-053', 1007.26, 581.87, 'Torneira 53'],
  ['tap-054', 448.33, 610.27, 'Torneira 54'],
  ['tap-055', 419.83, 648.83, 'Torneira 55'],
  ['tap-056', 653.99, 652.10, 'Torneira 56'],
  ['tap-057', 1036.34, 652.22, 'Torneira 57'],
  ['tap-058', 926.68, 652.78, 'Torneira 58'],
  ['tap-059', 942.86, 653.21, 'Torneira 59'],
  ['tap-060', 903.16, 653.53, 'Torneira 60'],
  ['tap-061', 962.41, 654.05, 'Torneira 61'],
  ['tap-062', 798.70, 743.57, 'Torneira 62'],
  ['tap-063', 830.29, 743.87, 'Torneira 63'],
  ['tap-064', 767.83, 743.99, 'Torneira 64'],
  ['tap-065', 939.19, 745.55, 'Torneira 65'],
  ['tap-066', 876.88, 745.82, 'Torneira 66'],
  ['tap-067', 999.76, 747.23, 'Torneira 67'],
  ['tap-068', 821.41, 762.91, 'Torneira 68'],
  ['tap-069', 876.64, 763.00, 'Torneira 69'],
  ['tap-070', 796.21, 824.92, 'Torneira 70'],
  ['tap-071', 828.64, 825.38, 'Torneira 71'],
  ['tap-072', 934.88, 826.12, 'Torneira 72'],
  ['tap-073', 873.19, 826.15, 'Torneira 73'],
  ['tap-074', 746.32, 826.58, 'Torneira 74'],
  ['tap-075', 1016.62, 826.75, 'Torneira 75'],
  ['tap-076', 975.94, 826.82, 'Torneira 76'],
  ['tap-077', 560.60, 837.23, 'Torneira 77'],
  ['tap-078', 1133.74, 855.59, 'Torneira 78'],
  ['tap-079', 1132.61, 887.95, 'Torneira 79'],
  ['tap-080', 1131.28, 920.03, 'Torneira 80'],
  ['tap-081', 644.68, 926.41, 'Torneira 81'],
  ['tap-082', 912.88, 930.64, 'Torneira 82'],
  ['tap-083', 1029.59, 930.67, 'Torneira 83'],
  ['tap-084', 695.02, 932.87, 'Torneira 84'],
  ['tap-085', 1047.52, 941.03, 'Torneira 85'],
  ['tap-086', 1334.23, 1030.04, 'Torneira 86'],
  ['tap-087', 1329.01, 1090.52, 'Torneira 87'],
];

const HYDRANT_SOURCE_POINTS = [
  ['hydrant-01', 416.44, 354.03, 'Hidrante 01 — Portão 4 / Pavilhão 09', true],
  ['hydrant-02', 420.74, 482.27, 'Hidrante 02 — Quadra V / Rua Paraguai', true],
  ['hydrant-03', 591.08, 482.12, 'Hidrante 03 — Quadra Q / Rua Paraguai', true],
  ['hydrant-04', 721.37, 483.57, 'Hidrante 04 — Quadra N (oeste)', false],
  ['hydrant-05', 903.16, 484.07, 'Hidrante 05 — Quadra N (leste)', true],
  ['hydrant-06', 923.53, 487.64, 'Hidrante 06 — Pavilhão 04', false],
  ['hydrant-07', 1043.57, 709.68, 'Hidrante 07 — Quadra E', false],
  ['hydrant-08', 749.55, 826.22, 'Hidrante 08 — Rua Argentina / Alameda Mercosul', true],
  ['hydrant-09', 887.60, 827.04, 'Hidrante 09 — Rua Argentina', true],
  ['hydrant-10', 960.16, 827.81, 'Hidrante 10 — Rua Argentina', true],
  ['hydrant-11', 595.24, 859.59, 'Hidrante 11 — setor Pavilhão 14', false],
  ['hydrant-12', 688.24, 936.43, 'Hidrante 12 — Entrada CORSAN / Ambulatório', false],
  ['hydrant-13', 830.14, 936.52, 'Hidrante 13 — sul do Pavilhão 08 / Cozinha', false],
] as const;

const RESERVOIR_SOURCE_POINTS = [
  ['reservoir-elevated-01', 1012.45, 126.43, 'Caixa d’água elevada 01', '20.000 L; base 6,00 m; cotas 337,55/341,15'],
  ['reservoir-elevated-02', 1019.00, 126.56, 'Caixa d’água elevada 02', '20.000 L; base 6,00 m; cotas 337,92/341,20'],
  ['reservoir-elevated-03', 1025.60, 126.56, 'Caixa d’água elevada 03', '20.000 L; base 6,00 m; cotas 338,02/341,27'],
  ['reservoir-cooperative-01', 852.28, 488.89, 'Caixa d’água — Espaço Cooperativo 01', 'Cotas 339,01/342,27'],
  ['reservoir-cooperative-02', 852.31, 495.71, 'Caixa d’água — Espaço Cooperativo 02', 'Cotas 338,94/341,92'],
  ['reservoir-cooperative-03', 852.19, 502.27, 'Caixa d’água — Espaço Cooperativo 03', 'Cotas 338,99/342,44'],
  ['reservoir-isolated-01', 426.34, 301.16, 'Caixa d’água isolada 01', 'Cotas 335,47/338,48'],
  ['reservoir-isolated-02', 1146.67, 679.28, 'Caixa d’água isolada 02', 'Cotas 334,04/336,53'],
  ['reservoir-isolated-03', 624.82, 690.83, 'Caixa d’água isolada 03', 'Cotas 337,54/339,05'],
  ['reservoir-isolated-04', 828.28, 919.82, 'Caixa d’água isolada 04', 'Cotas 336,28/338,07'],
] as const;

const WELL_SOURCE_POINTS: readonly PointSourceTuple[] = [
  ['well-01', 312.56, 647.69, 'POÇO 01'],
  ['well-02', 1027.34, 447.20, 'POÇO 02'],
  ['well-03', 1583.60, 861.40, 'POÇO 03'],
  ['well-04', 1528.07, 513.40, 'POÇO 04'],
];

const REGISTER_SOURCE_POINTS = [
  ['register-01', 1078.10, 199.22, 50], ['register-02', 1077.57, 214.34, 50],
  ['register-03', 1076.28, 352.68, 25], ['register-04', 1395.28, 353.85, 25],
  ['register-05', 1597.42, 369.75, 25], ['register-06', 1080.80, 372.77, 40],
  ['register-07', 825.70, 463.92, 50], ['register-08', 1065.78, 465.86, null],
  ['register-09', 872.19, 580.85, 40], ['register-10', 692.95, 655.56, 40],
  ['register-11', 924.86, 656.00, 50], ['register-12', 462.70, 657.11, 40],
  ['register-13', 614.55, 679.00, 50], ['register-14', 1139.49, 680.00, 50],
  ['register-15', 796.62, 746.73, 50], ['register-16', 825.79, 746.80, 50],
  ['register-17', 825.54, 766.37, 60], ['register-18', 1096.71, 903.72, 40],
  ['register-19', 977.29, 933.95, 25], ['register-20', 694.11, 935.53, 40],
  ['register-21', 887.05, 937.15, 40],
] as const;

const TECHNICAL_SYMBOL_SOURCE_POINTS: readonly PointSourceTuple[] = [
  ['technical-tl-01', 723.18, 503.63, 'TL 01'], ['technical-tl-02', 1023.03, 506.90, 'TL 02'],
  ['technical-tl-03', 1022.94, 510.21, 'TL 03'], ['technical-tl-04', 1034.25, 550.85, 'TL 04'],
  ['technical-tl-05', 1036.62, 558.00, 'TL 05'], ['technical-tl-06', 861.66, 600.89, 'TL 06'],
  ['technical-tl-07', 769.26, 601.16, 'TL 07'], ['technical-tl-08', 1363.14, 658.88, 'TL 08'],
  ['technical-tl-09', 1448.10, 664.13, 'TL 09'], ['technical-tl-10', 1149.00, 867.77, 'TL 10'],
  ['technical-tl-11', 1210.65, 926.60, 'TL 11'], ['technical-tl-12', 1230.21, 1001.03, 'TL 12'],
];

const CORSAN_SOURCE_POINT: PointSourceTuple = ['corsan-entry', 696.48, 940.47, 'ENTRADA CORSAN'];

const ENDPOINT_SNAP_TOLERANCE_PDF_POINTS = 0.8;

function distancePointToSpan(point: Coordinate, [start, end]: readonly [Coordinate, Coordinate]) {
  const deltaX = end[0] - start[0];
  const deltaY = end[1] - start[1];
  const denominator = deltaX * deltaX + deltaY * deltaY;
  const ratio = denominator === 0 ? 0 : Math.max(0, Math.min(1, (
    (point[0] - start[0]) * deltaX + (point[1] - start[1]) * deltaY
  ) / denominator));
  return Math.hypot(
    point[0] - (start[0] + ratio * deltaX),
    point[1] - (start[1] + ratio * deltaY),
  );
}

interface EndpointCluster {
  id: string;
  sourcePagePosition: Coordinate;
  count: number;
  linkedSegmentIds: string[];
}

const endpointClusters: EndpointCluster[] = [];

function endpointClusterFor(point: Coordinate) {
  const existing = endpointClusters.find((candidate) => (
    Math.hypot(
      candidate.sourcePagePosition[0] - point[0],
      candidate.sourcePagePosition[1] - point[1],
    ) <= ENDPOINT_SNAP_TOLERANCE_PDF_POINTS
  ));
  if (existing) {
    existing.sourcePagePosition = [
      (existing.sourcePagePosition[0] * existing.count + point[0]) / (existing.count + 1),
      (existing.sourcePagePosition[1] * existing.count + point[1]) / (existing.count + 1),
    ];
    existing.count += 1;
    return existing;
  }
  const created: EndpointCluster = {
    id: `hydro-junction-${String(endpointClusters.length + 1).padStart(3, '0')}`,
    sourcePagePosition: [...point],
    count: 1,
    linkedSegmentIds: [],
  };
  endpointClusters.push(created);
  return created;
}

const preliminarySegments = HYDROLOGICAL_PIPE_SOURCE_SPANS.map((sourceSpan, index) => {
  const [category, diameterMm, startX, startY, endX, endY] = sourceSpan;
  const prefix = category === 'distribution' ? 'distribution' : 'hydrant-feed';
  const id = `hydro-${prefix}-${String(index + 1).padStart(3, '0')}`;
  const sourcePageRoute: readonly [Coordinate, Coordinate] = [[startX, startY], [endX, endY]];
  const sourceNode = endpointClusterFor(sourcePageRoute[0]);
  const targetNode = endpointClusterFor(sourcePageRoute[1]);
  sourceNode.linkedSegmentIds.push(id);
  targetNode.linkedSegmentIds.push(id);
  return { id, category, diameterMm, sourcePageRoute, sourceNode, targetNode };
});

function calculateActivationDistances() {
  const distanceByNode = new Map<string, number>();
  const unvisited = new Set(endpointClusters.map(({ id }) => id));
  const corsanPagePosition: Coordinate = [CORSAN_SOURCE_POINT[1], CORSAN_SOURCE_POINT[2]];
  const origin = endpointClusters.reduce((nearest, candidate) => (
    Math.hypot(candidate.sourcePagePosition[0] - corsanPagePosition[0], candidate.sourcePagePosition[1] - corsanPagePosition[1])
      < Math.hypot(nearest.sourcePagePosition[0] - corsanPagePosition[0], nearest.sourcePagePosition[1] - corsanPagePosition[1])
      ? candidate
      : nearest
  ));
  distanceByNode.set(origin.id, 0);
  while (unvisited.size > 0) {
    let currentId: string | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;
    unvisited.forEach((id) => {
      const candidateDistance = distanceByNode.get(id) ?? Number.POSITIVE_INFINITY;
      if (candidateDistance < currentDistance) {
        currentDistance = candidateDistance;
        currentId = id;
      }
    });
    if (!currentId || !Number.isFinite(currentDistance)) break;
    unvisited.delete(currentId);
    preliminarySegments.forEach((segment) => {
      const isSource = segment.sourceNode.id === currentId;
      const isTarget = segment.targetNode.id === currentId;
      if (!isSource && !isTarget) return;
      const neighbour = isSource ? segment.targetNode : segment.sourceNode;
      if (!unvisited.has(neighbour.id)) return;
      const length = Math.hypot(
        segment.sourcePageRoute[1][0] - segment.sourcePageRoute[0][0],
        segment.sourcePageRoute[1][1] - segment.sourcePageRoute[0][1],
      );
      const nextDistance = currentDistance + length;
      if (nextDistance < (distanceByNode.get(neighbour.id) ?? Number.POSITIVE_INFINITY)) {
        distanceByNode.set(neighbour.id, nextDistance);
      }
    });
  }
  const maximumConnectedDistance = Math.max(0, ...distanceByNode.values());
  endpointClusters.forEach((cluster) => {
    if (distanceByNode.has(cluster.id)) return;
    distanceByNode.set(cluster.id, maximumConnectedDistance + Math.hypot(
      cluster.sourcePagePosition[0] - corsanPagePosition[0],
      cluster.sourcePagePosition[1] - corsanPagePosition[1],
    ));
  });
  return distanceByNode;
}

const activationDistanceByNode = calculateActivationDistances();

export const HYDROLOGICAL_PIPE_SEGMENTS: readonly CommercialHydrologicalPipeSegment[] = preliminarySegments.map((segment) => ({
  id: segment.id,
  category: segment.category,
  diameterMm: segment.diameterMm,
  diameterSource: segment.diameterMm === null ? 'NOT_ANNOTATED_ON_SPAN' : 'OFFICIAL_VECTOR_ANNOTATION',
  purpose: segment.category === 'distribution' ? 'LOW_FLOW_DISTRIBUTION' : 'HYDRANT_FEED',
  route: segment.sourcePageRoute.map(hydrologicalPlanPointToWorldXZ) as [Coordinate, Coordinate],
  sourceNodeId: segment.sourceNode.id,
  targetNodeId: segment.targetNode.id,
  activationDistance: Math.min(
    activationDistanceByNode.get(segment.sourceNode.id) ?? 0,
    activationDistanceByNode.get(segment.targetNode.id) ?? 0,
  ) * 0.0779495,
  selectable: true,
  metadata: {
    sourceLayer: segment.category === 'distribution'
      ? HYDROLOGICAL_INFRASTRUCTURE_REFERENCE.layers.distribution
      : HYDROLOGICAL_INFRASTRUCTURE_REFERENCE.layers.corsanHydrantFeed,
    sourcePageRoute: segment.sourcePageRoute,
    verificationStatus: 'OFFICIAL_PLAN_VECTOR_EXTRACTED',
  },
}));

function linkedSegmentsForPoint(sourcePagePosition: Coordinate, maximumDistance = 4) {
  const ranked = preliminarySegments
    .map((segment) => ({
      id: segment.id,
      distance: distancePointToSpan(sourcePagePosition, segment.sourcePageRoute),
    }))
    .sort((left, right) => left.distance - right.distance);
  const withinTolerance = ranked.filter(({ distance }) => distance <= maximumDistance).slice(0, 4);
  return (withinTolerance.length > 0 ? withinTolerance : ranked.slice(0, 1)).map(({ id }) => id);
}

function pointNode(
  source: PointSourceTuple,
  type: Exclude<CommercialHydrologicalNodeType, 'junction'>,
  metadata: CommercialHydrologicalNode['metadata'] = {},
  maximumLinkDistance = 4,
): CommercialHydrologicalNode {
  const sourcePagePosition: Coordinate = [source[1], source[2]];
  return {
    id: source[0],
    type,
    position: hydrologicalPlanPointToWorldXZ(sourcePagePosition),
    sourcePagePosition,
    label: source[3],
    linkedSegmentIds: linkedSegmentsForPoint(sourcePagePosition, maximumLinkDistance),
    selectable: true,
    metadata: {
      source: 'OFFICIAL_PLAN_VECTOR_SYMBOL',
      verificationStatus: 'OFFICIAL_PLAN_AFFINE_CALIBRATED',
      ...metadata,
    },
  };
}

const domainNodes: CommercialHydrologicalNode[] = [
  ...TAP_SOURCE_POINTS.map((source) => pointNode(source, 'tap')),
  ...HYDRANT_SOURCE_POINTS.map(([id, x, y, label, redCap]) => pointNode(
    [id, x, y, label],
    'hydrant',
    { redCap, typingEvidence: 'GLIFO_VERDE_E_MICROTEXTO_HIDRANTE' },
  )),
  ...RESERVOIR_SOURCE_POINTS.map(([id, x, y, label, engineeringNote]) => pointNode(
    [id, x, y, label],
    'reservoir',
    { engineeringNote },
    12,
  )),
  ...WELL_SOURCE_POINTS.map((source) => pointNode(source, 'well', {}, 12)),
  ...REGISTER_SOURCE_POINTS.map(([id, x, y, diameterMm], index) => pointNode(
    [id, x, y, `Registro ${String(index + 1).padStart(2, '0')}`],
    'register',
    {
      symbolCode: 'RG',
      diameterMm,
      diameterStatus: diameterMm === null ? 'NÃO INEQUÍVOCO NO RECORTE' : 'ANOTAÇÃO OFICIAL PRÓXIMA',
      typingStatus: index === 12 ? 'TEXTO OFICIAL REGISTRO' : 'CANDIDATO PELO SÍMBOLO RG',
    },
  )),
  ...TECHNICAL_SYMBOL_SOURCE_POINTS.map((source) => pointNode(
    source,
    'technical_symbol',
    { symbolCode: 'TL', interpretation: null },
  )),
  pointNode(CORSAN_SOURCE_POINT, 'corsan_entry', { role: 'ORIGEM PRINCIPAL DO ABASTECIMENTO' }, 12),
];

const junctionNodes: CommercialHydrologicalNode[] = endpointClusters.map((cluster) => ({
  id: cluster.id,
  type: 'junction',
  position: hydrologicalPlanPointToWorldXZ(cluster.sourcePagePosition),
  sourcePagePosition: cluster.sourcePagePosition,
  label: 'Conexão hidráulica',
  linkedSegmentIds: [...new Set(cluster.linkedSegmentIds)],
  selectable: false,
  metadata: {
    source: 'OFFICIAL_VECTOR_ENDPOINT_CLUSTER',
    snapTolerancePdfPoints: ENDPOINT_SNAP_TOLERANCE_PDF_POINTS,
  },
}));

export const HYDROLOGICAL_NODES: readonly CommercialHydrologicalNode[] = [
  ...domainNodes,
  ...junctionNodes,
];

export const HYDROLOGICAL_SELECTABLE_NODES = domainNodes;
