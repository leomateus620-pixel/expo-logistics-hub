export type ExecutiveCharacterId = 'fabiano-soltis' | 'djeison-drey';

export interface ExecutiveCharacterProfile {
  id: ExecutiveCharacterId;
  displayName: string;
  role: string;
  assetUrl: string;
  referenceImages: readonly string[];
  heightMapUnits: number;
  route: {
    lateralOffset: number;
    longitudinalOffset: number;
    stridePhase: number;
    speedVariation: number;
  };
  refinement: {
    definingFacialCharacteristics: readonly string[];
    definingBodyCharacteristics: readonly string[];
    clothingSpecification: readonly string[];
    distinctiveAccessories: readonly string[];
    animationConsiderations: readonly string[];
    currentVisualWeaknesses: readonly string[];
    appliedCorrections: readonly string[];
    remainingRefinementOpportunities: readonly string[];
  };
}

/**
 * Reference identity decision
 * ---------------------------
 * The supplied group photograph and its published caption identify Fabiano as
 * the dark-haired executive in the centre and Djeison as the taller,
 * fair-haired executive at right. The third supplied image repeats Fabiano;
 * it must not be blended into Djeison's face. The wardrobe below follows the
 * explicit product brief even where the event photographs show a different
 * suit colour.
 */
export const EXECUTIVE_CHARACTER_PROFILES: Readonly<Record<ExecutiveCharacterId, ExecutiveCharacterProfile>> = {
  'fabiano-soltis': {
    id: 'fabiano-soltis',
    displayName: 'Fabiano Soltis',
    role: 'Presidente da Fenasoja',
    assetUrl: '/models/executives/fabiano-soltis.glb',
    referenceImages: ['referência 1 · centro', 'referência 2', 'referência 3 · confirmação facial'],
    heightMapUnits: 0.505,
    route: {
      lateralOffset: -0.135,
      longitudinalOffset: 0,
      stridePhase: 0.08,
      speedVariation: 0.985,
    },
    refinement: {
      definingFacialCharacteristics: [
        'rosto oval-alongado com mandíbula afunilada e queixo arredondado-quadrado',
        'olhos castanho-escuros amendoados, sobrancelhas escuras quase retas',
        'nariz médio e estreito, ponte reta e ponta arredondada',
        'cabelo castanho muito escuro, laterais curtas e topo denso elevado para o lado',
        'barba curta de um a três milímetros, mais marcada no queixo e na mandíbula',
        'pele clara-média de subtom quente e assimetria facial preservada',
      ],
      definingBodyCharacteristics: [
        'porte esbelto-atlético, ombros médios e cintura estreita',
        'relação aproximada de 7,5 cabeças e postura executiva ereta sem rigidez',
        'altura visual ligeiramente inferior à de Djeison',
      ],
      clothingSpecification: [
        'terno executivo azul-marinho com paletó e calça como volumes separados',
        'camisa branca, gravata verde-escura e sapatos sociais castanho-escuros',
        'dobras discretas em cotovelos, joelhos, cintura e barra; tecido de alta rugosidade',
      ],
      distinctiveAccessories: [
        'óculos leves de aro metálico/rimless exigidos pelo briefing, sem ocultar pálpebras ou sobrancelhas',
      ],
      animationConsiderations: [
        'passada contida e segura, tronco estável e gestos de baixa amplitude',
        'aceno curto com mão livre e transição suave para caminhada',
      ],
      currentVisualWeaknesses: [
        'as referências não incluem perfil ortográfico real nem medidas oficiais de altura',
        'os óculos pertencem à direção de produto, mas não aparecem nas fotos frontais de Fabiano',
      ],
      appliedCorrections: [
        'a terceira imagem foi reatribuída a Fabiano para impedir mistura de identidades',
        'proporção de cabeça, largura de ombro, cabelo e barba foram individualizadas',
      ],
      remainingRefinementOpportunities: [
        'aprovação humana de turntable frontal, três-quartos e perfis',
        'substituição futura por scan ou escultura supervisionada se forem fornecidas vistas ortográficas',
      ],
    },
  },
  'djeison-drey': {
    id: 'djeison-drey',
    displayName: 'Djeison Drey',
    role: 'Vice-presidente da Fenasoja',
    assetUrl: '/models/executives/djeison-drey.glb',
    referenceImages: ['referência 1 · direita', 'referência 4', 'referência 5'],
    heightMapUnits: 0.54,
    route: {
      lateralOffset: 0.135,
      longitudinalOffset: 0.045,
      stridePhase: 0.43,
      speedVariation: 1.015,
    },
    refinement: {
      definingFacialCharacteristics: [
        'rosto retangular-oval mais longo, testa alta e queixo arredondado',
        'olhos claros azul-acinzentados e nariz médio-longo de dorso quase reto',
        'cabelo loiro-escuro/castanho-claro, curto, texturizado e elevado para o lado',
        'barba cheia curta ruiva com variação loira e grisalha',
        'pele clara de subtom rosado e sorriso expressivo',
      ],
      definingBodyCharacteristics: [
        'porte alto e longilíneo, pernas longas e ombros médios',
        'relação aproximada de 7,7 cabeças e postura executiva relaxada',
        'altura visual cerca de sete por cento superior à de Fabiano',
      ],
      clothingSpecification: [
        'terno executivo cinza médio com alfaiataria ajustada e espessura visível',
        'camisa branca, gravata verde-escura e sapatos sociais castanhos',
        'tecido fosco com microvariação, vincos de queda e separação entre corpo e roupa',
      ],
      distinctiveAccessories: [
        'óculos executivos de aro metálico claro, arredondado-retangular',
        'cuia de chimarrão escura na mão esquerda, bomba metálica e erva visível',
      ],
      animationConsiderations: [
        'passada ligeiramente mais longa e fase diferente da caminhada de Fabiano',
        'mão esquerda estabilizada para impedir clipping da cuia; aceno usa a mão direita',
      ],
      currentVisualWeaknesses: [
        'as referências usam lentes e perspectivas diferentes e não fornecem perfil ortográfico puro',
        'a terceira imagem fornecida foi excluída deste perfil por retratar Fabiano',
      ],
      appliedCorrections: [
        'cabelo claro, barba ruiva, olhos claros, óculos e proporção mais alta foram preservados como marcadores primários',
        'o chimarrão foi dimensionado pela mão e preso ao membro correto, não flutuando ao lado do corpo',
      ],
      remainingRefinementOpportunities: [
        'aprovação humana da espessura dos aros, densidade da barba e tom dos olhos',
        'refino de IK dos dedos caso uma captura de mão em repouso seja fornecida',
      ],
    },
  },
} as const;

export const EXECUTIVE_CHARACTER_IDS = Object.keys(
  EXECUTIVE_CHARACTER_PROFILES,
) as ExecutiveCharacterId[];
