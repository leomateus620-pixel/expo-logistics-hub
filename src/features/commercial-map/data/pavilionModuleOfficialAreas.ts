/**
 * Áreas individuais dos lotes internos dos oito pavilhões (referência 2026).
 *
 * Fonte: croquis oficiais 2026 + PDFs de conferência "Pavilhao_NN_Lotes_e_Metragens"
 * (16/09/2026). Os PDFs são memória de cálculo, não plantas oficiais novas.
 *
 * Regras:
 * - Nunca aplicar um default global: cada faixa é declarada explicitamente.
 * - `written`  → área escrita no croqui e conferida.
 * - `nominal`  → área derivada da malha modular impressa (método registrado).
 * - `disputed` → área escrita porém com cotas divergentes; não é validada.
 *
 * Os valores são áreas em m², nunca lados, preços ou cotas de corredor.
 */

export const PAVILION_MODULE_AREA_REVISION = '2026.4-pavilion-module-areas.2' as const;

export const PAVILION_MODULE_AREA_SOURCE_DOCUMENTS = {
  B1: 'Pavilhao_01_Lotes_e_Metragens.pdf',
  B6: 'Planta Pavilhão 3 — Fenasoja 2028 (desenho set/2026).pdf',
  B8: 'Pavilhao_05_Lotes_e_Metragens.pdf',
  B10: 'Pavilhao_07_Lotes_e_Metragens.pdf',
  B4: 'Planta PAVILHÃO 8 - Fenasoja 2028.pdf',
  B3: 'Pavilhao_12_Lotes_e_Metragens.pdf',
  B5: 'Planta Pavilhão 13 — Fenasoja 2028 (desenho set/2026).pdf',
  B2: 'Pavilhao_14_Lotes_e_Metragens.pdf',
} as const;

export type PavilionModuleAreaPavilionId = keyof typeof PAVILION_MODULE_AREA_SOURCE_DOCUMENTS;

/** Grau de evidência da metragem. Área escrita com conflito não é área validada. */
export type PavilionModuleAreaEvidence = 'written' | 'nominal' | 'disputed';

/** Status aceito por `commercial_lots.area_validation_status`. */
export type PavilionModuleAreaValidationStatus =
  | 'VALIDATED'
  | 'CALCULATED'
  | 'UNVALIDATED';

export interface PavilionModuleAreaEntry {
  pavilionId: PavilionModuleAreaPavilionId;
  pavilionNumber: number;
  moduleNumber: number;
  publicIdentifier: string;
  moduleKey: string;
  areaSqm: number;
  evidence: PavilionModuleAreaEvidence;
  method: string;
  validationStatus: PavilionModuleAreaValidationStatus;
  caveat: string | null;
}

interface AreaBand {
  ranges: ReadonlyArray<readonly [number, number]>;
  areaSqm: number;
  evidence: PavilionModuleAreaEvidence;
  method: string;
  caveat?: string;
}

interface PavilionAreaPlan {
  pavilionId: PavilionModuleAreaPavilionId;
  pavilionNumber: number;
  moduleCount: number;
  bands: readonly AreaBand[];
  /** Soma lote a lote declarada no PDF de conferência. */
  expectedTotalSqm: number;
  /** Soma impressa no carimbo do croqui, quando diverge da soma individual. */
  stampedTotalSqm?: number;
  documentalCaveat?: string;
}

const NOMINAL = (frontage: number, depth: number) =>
  `Malha modular impressa ${frontage.toLocaleString('pt-BR')} × ${depth.toLocaleString('pt-BR')} m`;

const PAVILION_AREA_PLANS: readonly PavilionAreaPlan[] = [
  {
    pavilionId: 'B1',
    pavilionNumber: 1,
    moduleCount: 189,
    expectedTotalSqm: 586.5,
    bands: [
      {
        ranges: [[1, 57], [65, 140], [142, 189]],
        areaSqm: 3,
        evidence: 'nominal',
        method: NOMINAL(1, 3),
      },
      {
        ranges: [[58, 58]],
        areaSqm: 4.5,
        evidence: 'written',
        method: 'Área escrita no croqui; 1,5 × 3 m',
      },
      {
        ranges: [[59, 64]],
        areaSqm: 3.5,
        evidence: 'written',
        method: 'Área escrita no croqui; 1 × 3,5 m',
      },
      {
        ranges: [[141, 141]],
        areaSqm: 18,
        evidence: 'written',
        method: 'Área oficial; recorte em L: 4,5 × 4,5 − 1,5 × 1,5',
      },
    ],
  },
  {
    pavilionId: 'B6',
    pavilionNumber: 3,
    moduleCount: 214,
    expectedTotalSqm: 663,
    bands: [
      {
        ranges: [[1, 35], [37, 214]],
        areaSqm: 3,
        evidence: 'nominal',
        method: NOMINAL(1, 3),
      },
      {
        ranges: [[36, 36]],
        areaSqm: 24,
        evidence: 'written',
        method: 'Área escrita no croqui; 6 × 5 − 3 × 2',
      },
    ],
  },
  {
    pavilionId: 'B8',
    pavilionNumber: 5,
    moduleCount: 81,
    expectedTotalSqm: 244.5,
    bands: [
      {
        ranges: [[1, 1]],
        areaSqm: 4.5,
        evidence: 'written',
        method: 'Área escrita no croqui; 1,5 × 3 m',
      },
      {
        ranges: [[2, 81]],
        areaSqm: 3,
        evidence: 'nominal',
        method: NOMINAL(1, 3),
      },
    ],
  },
  {
    pavilionId: 'B10',
    pavilionNumber: 7,
    moduleCount: 171,
    expectedTotalSqm: 427.5,
    documentalCaveat:
      'O carimbo do croqui registra 57 módulos, mas a malha desenha e numera 171 células, que são as unidades cadastradas. A soma de 427,50 m² coincide nas duas leituras.',
    bands: [
      {
        ranges: [[1, 171]],
        areaSqm: 2.5,
        evidence: 'nominal',
        method: NOMINAL(1, 2.5),
      },
    ],
  },
  {
    pavilionId: 'B4',
    pavilionNumber: 8,
    moduleCount: 114,
    expectedTotalSqm: 438.5,
    bands: [
      {
        ranges: [[1, 25], [91, 114]],
        areaSqm: 4,
        evidence: 'nominal',
        method: NOMINAL(1, 4),
      },
      {
        ranges: [[26, 37]],
        areaSqm: 3,
        evidence: 'nominal',
        method: NOMINAL(1, 3),
      },
      {
        ranges: [[38, 89]],
        areaSqm: 3.5,
        evidence: 'nominal',
        method: NOMINAL(1, 3.5),
      },
      {
        ranges: [[90, 90]],
        areaSqm: 24.5,
        evidence: 'written',
        method: 'Área escrita no croqui; recorte em L: 5,5 × 3 + 4 × 2',
      },
    ],
  },
  {
    pavilionId: 'B3',
    pavilionNumber: 12,
    moduleCount: 257,
    expectedTotalSqm: 771,
    bands: [
      {
        ranges: [[1, 257]],
        areaSqm: 3,
        evidence: 'nominal',
        method: NOMINAL(1, 3),
      },
    ],
  },
  {
    pavilionId: 'B5',
    pavilionNumber: 13,
    moduleCount: 103,
    expectedTotalSqm: 351,
    bands: [
      {
        ranges: [[1, 24], [27, 77], [80, 103]],
        areaSqm: 3,
        evidence: 'nominal',
        method: NOMINAL(1, 3),
      },
      {
        ranges: [[25, 26], [78, 79]],
        areaSqm: 13.5,
        evidence: 'written',
        method: 'Área escrita na planta 2028; metade do envelope 6 × 6 dividida pela diagonal com retorno de 3 m',
      },
    ],
  },
  {
    pavilionId: 'B2',
    pavilionNumber: 14,
    moduleCount: 186,
    expectedTotalSqm: 616,
    stampedTotalSqm: 616.16,
    documentalCaveat:
      'Soma lote a lote de 616,00 m² contra 616,16 m² no carimbo: divergência agregada de 0,16 m², sem lote identificado e sem rateio.',
    bands: [
      {
        ranges: [[1, 35], [152, 186]],
        areaSqm: 3,
        evidence: 'nominal',
        method: NOMINAL(1, 3),
      },
      {
        ranges: [[36, 151]],
        areaSqm: 3.5,
        evidence: 'nominal',
        method: NOMINAL(1, 3.5),
      },
    ],
  },
];

const VALIDATION_BY_EVIDENCE: Record<
  PavilionModuleAreaEvidence,
  PavilionModuleAreaValidationStatus
> = {
  written: 'VALIDATED',
  nominal: 'CALCULATED',
  disputed: 'UNVALIDATED',
};

export function pavilionModuleAreaKey(
  pavilionId: string,
  moduleNumber: number,
): string {
  return `${pavilionId}:module:${String(moduleNumber).padStart(3, '0')}`;
}

function buildEntries(): Map<string, PavilionModuleAreaEntry> {
  const entries = new Map<string, PavilionModuleAreaEntry>();

  for (const plan of PAVILION_AREA_PLANS) {
    const assigned = new Map<number, PavilionModuleAreaEntry>();

    for (const band of plan.bands) {
      for (const [start, end] of band.ranges) {
        if (start < 1 || end > plan.moduleCount || start > end) {
          throw new Error(
            `${plan.pavilionId}: faixa ${start}–${end} fora do intervalo 1–${plan.moduleCount}.`,
          );
        }
        for (let moduleNumber = start; moduleNumber <= end; moduleNumber += 1) {
          if (assigned.has(moduleNumber)) {
            throw new Error(
              `${plan.pavilionId}: módulo ${moduleNumber} recebeu mais de uma área.`,
            );
          }
          const moduleKey = pavilionModuleAreaKey(plan.pavilionId, moduleNumber);
          assigned.set(moduleNumber, {
            pavilionId: plan.pavilionId,
            pavilionNumber: plan.pavilionNumber,
            moduleNumber,
            publicIdentifier: `${plan.pavilionId}-M${String(moduleNumber).padStart(3, '0')}`,
            moduleKey,
            areaSqm: band.areaSqm,
            evidence: band.evidence,
            method: band.method,
            validationStatus: VALIDATION_BY_EVIDENCE[band.evidence],
            caveat: band.caveat ?? null,
          });
        }
      }
    }

    if (assigned.size !== plan.moduleCount) {
      throw new Error(
        `${plan.pavilionId}: ${assigned.size} módulos com área; esperado ${plan.moduleCount}.`,
      );
    }

    const total = [...assigned.values()].reduce((sum, entry) => sum + entry.areaSqm, 0);
    if (Math.abs(total - plan.expectedTotalSqm) > 1e-9) {
      throw new Error(
        `${plan.pavilionId}: soma ${total} m² diverge do esperado ${plan.expectedTotalSqm} m².`,
      );
    }

    for (const entry of assigned.values()) {
      entries.set(entry.moduleKey, entry);
    }
  }

  return entries;
}

export const PAVILION_MODULE_OFFICIAL_AREAS = buildEntries();

export const PAVILION_MODULE_AREA_TOTALS = PAVILION_AREA_PLANS.map((plan) => ({
  pavilionId: plan.pavilionId,
  pavilionNumber: plan.pavilionNumber,
  moduleCount: plan.moduleCount,
  totalSqm: plan.expectedTotalSqm,
  stampedTotalSqm: plan.stampedTotalSqm ?? null,
  documentalCaveat: plan.documentalCaveat ?? null,
  sourceDocument: PAVILION_MODULE_AREA_SOURCE_DOCUMENTS[plan.pavilionId],
}));

export const PAVILION_MODULE_AREA_TOTAL_COUNT = PAVILION_MODULE_OFFICIAL_AREAS.size;

if (PAVILION_MODULE_AREA_TOTAL_COUNT !== 1315) {
  throw new Error(
    `A referência de áreas cobriu ${PAVILION_MODULE_AREA_TOTAL_COUNT} módulos; o cadastro tem 1.315.`,
  );
}

export function getPavilionModuleArea(
  pavilionId: string,
  moduleNumber: number,
): PavilionModuleAreaEntry | null {
  return PAVILION_MODULE_OFFICIAL_AREAS.get(
    pavilionModuleAreaKey(pavilionId, moduleNumber),
  ) ?? null;
}

export function getPavilionAreaSummary(pavilionId: string) {
  return PAVILION_MODULE_AREA_TOTALS.find(
    (summary) => summary.pavilionId === pavilionId,
  ) ?? null;
}

/** Formata uma área em m² no padrão pt-BR com duas casas. */
export function formatAreaSqm(value: number): string {
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m²`;
}
