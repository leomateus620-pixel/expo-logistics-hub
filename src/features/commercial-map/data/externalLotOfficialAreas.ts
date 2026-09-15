/**
 * Áreas oficiais dos lotes externos do Parque Fenasoja.
 *
 * Fonte documental: "A1 - Fenasoja - Parque - Lotes sem imagem.pdf", página 1
 * (conteúdo textual idêntico ao "A1 - Fenasoja - Parque - Lotes com imagem.pdf").
 *
 * Escopo: Indústria, Comércio e Serviços externa (D, E, F, G, I, J, L, M),
 * Espaço do Automóvel (O, P, T, U) e faixa superior (Q, V).
 *
 * Estes valores são áreas CADASTRAIS oficiais do levantamento documental.
 * Não são áreas calculadas a partir da geometria simplificada do mapa 3D:
 * `calculatedAreaSqm` permanece nulo enquanto não houver cálculo por calibração real.
 */

export const EXTERNAL_LOT_AREA_SOURCE =
  'A1 - Fenasoja - Parque - Lotes sem imagem.pdf, p.1';

export const EXTERNAL_LOT_AREA_REVISION = '2026.4-external-areas.1';

export interface ExternalLotOfficialArea {
  publicIdentifier: string;
  block: string;
  lotNumber: number;
  officialAreaSqm: number;
}

export const EXTERNAL_LOT_OFFICIAL_AREAS: readonly ExternalLotOfficialArea[] = [
  { publicIdentifier: 'Q-D-01', block: 'D', lotNumber: 1, officialAreaSqm: 208.20 },
  { publicIdentifier: 'Q-D-02', block: 'D', lotNumber: 2, officialAreaSqm: 207.38 },
  { publicIdentifier: 'Q-D-03', block: 'D', lotNumber: 3, officialAreaSqm: 209.11 },
  { publicIdentifier: 'Q-D-04', block: 'D', lotNumber: 4, officialAreaSqm: 209.11 },
  { publicIdentifier: 'Q-D-05', block: 'D', lotNumber: 5, officialAreaSqm: 208.96 },
  { publicIdentifier: 'Q-D-06', block: 'D', lotNumber: 6, officialAreaSqm: 208.96 },
  { publicIdentifier: 'Q-D-07', block: 'D', lotNumber: 7, officialAreaSqm: 208.80 },
  { publicIdentifier: 'Q-D-08', block: 'D', lotNumber: 8, officialAreaSqm: 208.80 },
  { publicIdentifier: 'Q-D-09', block: 'D', lotNumber: 9, officialAreaSqm: 208.64 },
  { publicIdentifier: 'Q-D-10', block: 'D', lotNumber: 10, officialAreaSqm: 208.64 },
  { publicIdentifier: 'Q-D-11', block: 'D', lotNumber: 11, officialAreaSqm: 263.74 },
  { publicIdentifier: 'Q-D-12', block: 'D', lotNumber: 12, officialAreaSqm: 248.99 },
  { publicIdentifier: 'Q-E-01', block: 'E', lotNumber: 1, officialAreaSqm: 197.41 },
  { publicIdentifier: 'Q-E-02', block: 'E', lotNumber: 2, officialAreaSqm: 243.12 },
  { publicIdentifier: 'Q-E-03', block: 'E', lotNumber: 3, officialAreaSqm: 199.81 },
  { publicIdentifier: 'Q-E-04', block: 'E', lotNumber: 4, officialAreaSqm: 245.39 },
  { publicIdentifier: 'Q-E-05', block: 'E', lotNumber: 5, officialAreaSqm: 199.81 },
  { publicIdentifier: 'Q-E-06', block: 'E', lotNumber: 6, officialAreaSqm: 245.79 },
  { publicIdentifier: 'Q-E-07', block: 'E', lotNumber: 7, officialAreaSqm: 199.81 },
  { publicIdentifier: 'Q-E-08', block: 'E', lotNumber: 8, officialAreaSqm: 246.19 },
  { publicIdentifier: 'Q-E-09', block: 'E', lotNumber: 9, officialAreaSqm: 199.81 },
  { publicIdentifier: 'Q-E-10', block: 'E', lotNumber: 10, officialAreaSqm: 246.58 },
  { publicIdentifier: 'Q-E-11', block: 'E', lotNumber: 11, officialAreaSqm: 179.49 },
  { publicIdentifier: 'Q-E-12', block: 'E', lotNumber: 12, officialAreaSqm: 175.72 },
  { publicIdentifier: 'Q-E-13', block: 'E', lotNumber: 13, officialAreaSqm: 165.88 },
  { publicIdentifier: 'Q-F-01', block: 'F', lotNumber: 1, officialAreaSqm: 168.00 },
  { publicIdentifier: 'Q-F-02', block: 'F', lotNumber: 2, officialAreaSqm: 168.00 },
  { publicIdentifier: 'Q-F-03', block: 'F', lotNumber: 3, officialAreaSqm: 168.00 },
  { publicIdentifier: 'Q-F-04', block: 'F', lotNumber: 4, officialAreaSqm: 168.00 },
  { publicIdentifier: 'Q-F-05', block: 'F', lotNumber: 5, officialAreaSqm: 168.00 },
  { publicIdentifier: 'Q-F-06', block: 'F', lotNumber: 6, officialAreaSqm: 168.00 },
  { publicIdentifier: 'Q-F-07', block: 'F', lotNumber: 7, officialAreaSqm: 168.00 },
  { publicIdentifier: 'Q-F-08', block: 'F', lotNumber: 8, officialAreaSqm: 168.00 },
  { publicIdentifier: 'Q-G-01', block: 'G', lotNumber: 1, officialAreaSqm: 168.00 },
  { publicIdentifier: 'Q-G-02', block: 'G', lotNumber: 2, officialAreaSqm: 168.00 },
  { publicIdentifier: 'Q-G-03', block: 'G', lotNumber: 3, officialAreaSqm: 168.00 },
  { publicIdentifier: 'Q-G-04', block: 'G', lotNumber: 4, officialAreaSqm: 168.00 },
  { publicIdentifier: 'Q-G-05', block: 'G', lotNumber: 5, officialAreaSqm: 168.00 },
  { publicIdentifier: 'Q-G-06', block: 'G', lotNumber: 6, officialAreaSqm: 168.00 },
  { publicIdentifier: 'Q-G-07', block: 'G', lotNumber: 7, officialAreaSqm: 168.00 },
  { publicIdentifier: 'Q-G-08', block: 'G', lotNumber: 8, officialAreaSqm: 168.00 },
  { publicIdentifier: 'Q-I-01', block: 'I', lotNumber: 1, officialAreaSqm: 205.97 },
  { publicIdentifier: 'Q-I-02', block: 'I', lotNumber: 2, officialAreaSqm: 208.36 },
  { publicIdentifier: 'Q-I-03', block: 'I', lotNumber: 3, officialAreaSqm: 210.03 },
  { publicIdentifier: 'Q-I-04', block: 'I', lotNumber: 4, officialAreaSqm: 210.03 },
  { publicIdentifier: 'Q-I-05', block: 'I', lotNumber: 5, officialAreaSqm: 209.95 },
  { publicIdentifier: 'Q-I-06', block: 'I', lotNumber: 6, officialAreaSqm: 209.95 },
  { publicIdentifier: 'Q-I-07', block: 'I', lotNumber: 7, officialAreaSqm: 209.87 },
  { publicIdentifier: 'Q-I-08', block: 'I', lotNumber: 8, officialAreaSqm: 209.87 },
  { publicIdentifier: 'Q-I-09', block: 'I', lotNumber: 9, officialAreaSqm: 209.79 },
  { publicIdentifier: 'Q-I-10', block: 'I', lotNumber: 10, officialAreaSqm: 209.79 },
  { publicIdentifier: 'Q-I-11', block: 'I', lotNumber: 11, officialAreaSqm: 209.71 },
  { publicIdentifier: 'Q-I-12', block: 'I', lotNumber: 12, officialAreaSqm: 209.71 },
  { publicIdentifier: 'Q-I-13', block: 'I', lotNumber: 13, officialAreaSqm: 209.62 },
  { publicIdentifier: 'Q-I-14', block: 'I', lotNumber: 14, officialAreaSqm: 209.62 },
  { publicIdentifier: 'Q-I-15', block: 'I', lotNumber: 15, officialAreaSqm: 209.31 },
  { publicIdentifier: 'Q-I-16', block: 'I', lotNumber: 16, officialAreaSqm: 210.09 },
  { publicIdentifier: 'Q-J-01', block: 'J', lotNumber: 1, officialAreaSqm: 201.46 },
  { publicIdentifier: 'Q-J-02', block: 'J', lotNumber: 2, officialAreaSqm: 255.71 },
  { publicIdentifier: 'Q-J-03', block: 'J', lotNumber: 3, officialAreaSqm: 203.40 },
  { publicIdentifier: 'Q-J-04', block: 'J', lotNumber: 4, officialAreaSqm: 258.15 },
  { publicIdentifier: 'Q-J-05', block: 'J', lotNumber: 5, officialAreaSqm: 203.40 },
  { publicIdentifier: 'Q-J-06', block: 'J', lotNumber: 6, officialAreaSqm: 258.63 },
  { publicIdentifier: 'Q-J-07', block: 'J', lotNumber: 7, officialAreaSqm: 203.40 },
  { publicIdentifier: 'Q-J-08', block: 'J', lotNumber: 8, officialAreaSqm: 259.11 },
  { publicIdentifier: 'Q-J-09', block: 'J', lotNumber: 9, officialAreaSqm: 203.40 },
  { publicIdentifier: 'Q-J-10', block: 'J', lotNumber: 10, officialAreaSqm: 259.59 },
  { publicIdentifier: 'Q-J-11', block: 'J', lotNumber: 11, officialAreaSqm: 203.40 },
  { publicIdentifier: 'Q-J-12', block: 'J', lotNumber: 12, officialAreaSqm: 260.08 },
  { publicIdentifier: 'Q-J-13', block: 'J', lotNumber: 13, officialAreaSqm: 203.40 },
  { publicIdentifier: 'Q-J-14', block: 'J', lotNumber: 14, officialAreaSqm: 260.56 },
  { publicIdentifier: 'Q-J-15', block: 'J', lotNumber: 15, officialAreaSqm: 212.24 },
  { publicIdentifier: 'Q-J-16', block: 'J', lotNumber: 16, officialAreaSqm: 272.96 },
  { publicIdentifier: 'Q-L-01', block: 'L', lotNumber: 1, officialAreaSqm: 191.61 },
  { publicIdentifier: 'Q-L-02', block: 'L', lotNumber: 2, officialAreaSqm: 191.61 },
  { publicIdentifier: 'Q-L-03', block: 'L', lotNumber: 3, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-L-04', block: 'L', lotNumber: 4, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-L-05', block: 'L', lotNumber: 5, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-L-06', block: 'L', lotNumber: 6, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-L-07', block: 'L', lotNumber: 7, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-L-08', block: 'L', lotNumber: 8, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-L-09', block: 'L', lotNumber: 9, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-L-10', block: 'L', lotNumber: 10, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-L-11', block: 'L', lotNumber: 11, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-L-12', block: 'L', lotNumber: 12, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-L-13', block: 'L', lotNumber: 13, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-L-14', block: 'L', lotNumber: 14, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-L-15', block: 'L', lotNumber: 15, officialAreaSqm: 191.61 },
  { publicIdentifier: 'Q-L-16', block: 'L', lotNumber: 16, officialAreaSqm: 191.61 },
  { publicIdentifier: 'Q-M-01', block: 'M', lotNumber: 1, officialAreaSqm: 191.61 },
  { publicIdentifier: 'Q-M-02', block: 'M', lotNumber: 2, officialAreaSqm: 191.61 },
  { publicIdentifier: 'Q-M-03', block: 'M', lotNumber: 3, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-M-04', block: 'M', lotNumber: 4, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-M-05', block: 'M', lotNumber: 5, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-M-06', block: 'M', lotNumber: 6, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-M-07', block: 'M', lotNumber: 7, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-M-08', block: 'M', lotNumber: 8, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-M-09', block: 'M', lotNumber: 9, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-M-10', block: 'M', lotNumber: 10, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-M-11', block: 'M', lotNumber: 11, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-M-12', block: 'M', lotNumber: 12, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-M-13', block: 'M', lotNumber: 13, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-M-14', block: 'M', lotNumber: 14, officialAreaSqm: 187.00 },
  { publicIdentifier: 'Q-M-15', block: 'M', lotNumber: 15, officialAreaSqm: 191.61 },
  { publicIdentifier: 'Q-M-16', block: 'M', lotNumber: 16, officialAreaSqm: 191.61 },
  { publicIdentifier: 'Q-O-01', block: 'O', lotNumber: 1, officialAreaSqm: 192.91 },
  { publicIdentifier: 'Q-O-02', block: 'O', lotNumber: 2, officialAreaSqm: 192.91 },
  { publicIdentifier: 'Q-O-03', block: 'O', lotNumber: 3, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-O-04', block: 'O', lotNumber: 4, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-O-05', block: 'O', lotNumber: 5, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-O-06', block: 'O', lotNumber: 6, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-O-07', block: 'O', lotNumber: 7, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-O-08', block: 'O', lotNumber: 8, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-O-09', block: 'O', lotNumber: 9, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-O-10', block: 'O', lotNumber: 10, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-O-11', block: 'O', lotNumber: 11, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-O-12', block: 'O', lotNumber: 12, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-O-13', block: 'O', lotNumber: 13, officialAreaSqm: 192.91 },
  { publicIdentifier: 'Q-O-14', block: 'O', lotNumber: 14, officialAreaSqm: 192.91 },
  { publicIdentifier: 'Q-P-01', block: 'P', lotNumber: 1, officialAreaSqm: 192.91 },
  { publicIdentifier: 'Q-P-02', block: 'P', lotNumber: 2, officialAreaSqm: 192.91 },
  { publicIdentifier: 'Q-P-03', block: 'P', lotNumber: 3, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-P-04', block: 'P', lotNumber: 4, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-P-05', block: 'P', lotNumber: 5, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-P-06', block: 'P', lotNumber: 6, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-P-07', block: 'P', lotNumber: 7, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-P-08', block: 'P', lotNumber: 8, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-P-09', block: 'P', lotNumber: 9, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-P-10', block: 'P', lotNumber: 10, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-P-11', block: 'P', lotNumber: 11, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-P-12', block: 'P', lotNumber: 12, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-P-13', block: 'P', lotNumber: 13, officialAreaSqm: 192.91 },
  { publicIdentifier: 'Q-P-14', block: 'P', lotNumber: 14, officialAreaSqm: 192.91 },
  { publicIdentifier: 'Q-Q-01', block: 'Q', lotNumber: 1, officialAreaSqm: 283.00 },
  { publicIdentifier: 'Q-Q-02', block: 'Q', lotNumber: 2, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-Q-03', block: 'Q', lotNumber: 3, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-Q-04', block: 'Q', lotNumber: 4, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-Q-05', block: 'Q', lotNumber: 5, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-Q-06', block: 'Q', lotNumber: 6, officialAreaSqm: 190.98 },
  { publicIdentifier: 'Q-T-01', block: 'T', lotNumber: 1, officialAreaSqm: 192.91 },
  { publicIdentifier: 'Q-T-02', block: 'T', lotNumber: 2, officialAreaSqm: 192.91 },
  { publicIdentifier: 'Q-T-03', block: 'T', lotNumber: 3, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-T-04', block: 'T', lotNumber: 4, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-T-05', block: 'T', lotNumber: 5, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-T-06', block: 'T', lotNumber: 6, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-T-07', block: 'T', lotNumber: 7, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-T-08', block: 'T', lotNumber: 8, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-T-09', block: 'T', lotNumber: 9, officialAreaSqm: 192.91 },
  { publicIdentifier: 'Q-T-10', block: 'T', lotNumber: 10, officialAreaSqm: 192.91 },
  { publicIdentifier: 'Q-T-11', block: 'T', lotNumber: 11, officialAreaSqm: 244.51 },
  { publicIdentifier: 'Q-T-12', block: 'T', lotNumber: 12, officialAreaSqm: 244.51 },
  { publicIdentifier: 'Q-U-01', block: 'U', lotNumber: 1, officialAreaSqm: 192.91 },
  { publicIdentifier: 'Q-U-02', block: 'U', lotNumber: 2, officialAreaSqm: 192.91 },
  { publicIdentifier: 'Q-U-03', block: 'U', lotNumber: 3, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-U-04', block: 'U', lotNumber: 4, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-U-05', block: 'U', lotNumber: 5, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-U-06', block: 'U', lotNumber: 6, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-U-07', block: 'U', lotNumber: 7, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-U-08', block: 'U', lotNumber: 8, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-U-09', block: 'U', lotNumber: 9, officialAreaSqm: 192.91 },
  { publicIdentifier: 'Q-U-10', block: 'U', lotNumber: 10, officialAreaSqm: 192.91 },
  { publicIdentifier: 'Q-U-11', block: 'U', lotNumber: 11, officialAreaSqm: 244.51 },
  { publicIdentifier: 'Q-U-12', block: 'U', lotNumber: 12, officialAreaSqm: 244.51 },
  { publicIdentifier: 'Q-V-01', block: 'V', lotNumber: 1, officialAreaSqm: 190.98 },
  { publicIdentifier: 'Q-V-02', block: 'V', lotNumber: 2, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-V-03', block: 'V', lotNumber: 3, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-V-04', block: 'V', lotNumber: 4, officialAreaSqm: 191.00 },
  { publicIdentifier: 'Q-V-05', block: 'V', lotNumber: 5, officialAreaSqm: 190.98 },
  { publicIdentifier: 'Q-V-06', block: 'V', lotNumber: 6, officialAreaSqm: 240.65 },
];

export const EXTERNAL_LOT_AREA_BLOCKS = [
  'D', 'E', 'F', 'G', 'I', 'J', 'L', 'M', 'O', 'P', 'Q', 'T', 'U', 'V',
] as const;

export type ExternalLotAreaBlock = (typeof EXTERNAL_LOT_AREA_BLOCKS)[number];

/** Subtotais documentais por quadra (m²), conforme a página 1 do PDF oficial. */
export const EXTERNAL_LOT_AREA_BLOCK_SUBTOTALS: Record<ExternalLotAreaBlock, number> = {
  D: 2599.33, E: 2744.81, F: 1344.0, G: 1344.0,
  I: 3351.67, J: 3718.89, L: 3010.44, M: 3010.44,
  O: 2681.64, P: 2681.64, Q: 1237.98, T: 2406.66,
  U: 2406.66, V: 1195.61,
};

/** Total documental das 169 referências externas (m²). */
export const EXTERNAL_LOT_AREA_TOTAL_SQM = 33733.77;

const externalAreaByIdentifier = new Map<string, ExternalLotOfficialArea>(
  EXTERNAL_LOT_OFFICIAL_AREAS.map((entry) => [entry.publicIdentifier, entry]),
);

const externalAreaByBlockLot = new Map<string, ExternalLotOfficialArea>(
  EXTERNAL_LOT_OFFICIAL_AREAS.map((entry) => [`${entry.block}-${entry.lotNumber}`, entry]),
);

export function getExternalLotOfficialArea(
  block: string,
  lotNumber: number,
): ExternalLotOfficialArea | undefined {
  return externalAreaByBlockLot.get(`${block}-${lotNumber}`);
}

export function getExternalLotOfficialAreaByIdentifier(
  publicIdentifier: string,
): ExternalLotOfficialArea | undefined {
  return externalAreaByIdentifier.get(publicIdentifier);
}
