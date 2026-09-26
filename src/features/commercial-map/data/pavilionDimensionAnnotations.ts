/**
 * Display-only readings from the September 2026 Fenasoja 2028 PDFs, page 1.
 * Anchors reference existing corridors/cells, never a second floor plan.
 * Values are printed references, NOT measurements of the historical geometry.
 * This registry deliberately lives outside CommercialPavilionModulePlan/cells.
 */
export type DimensionPavilionId = 'B1' | 'B6' | 'B8' | 'B4' | 'B3' | 'B2';
export type DimensionRectReference = { kind: 'zone' | 'corridor'; id: string } | { kind: 'boundary' };
export type DimensionAnchor =
  | { kind: 'corridor'; id: string; axis: 'x' | 'z'; at?: number }
  | { kind: 'cell-edge'; number: number; axis: 'x' | 'z'; lane: string }
  | { kind: 'gap'; axis: 'x' | 'z'; from: DimensionRectReference; fromEdge: 0 | 1; to: DimensionRectReference; toEdge: 0 | 1 }
  | { kind: 'context'; side: 'left'; corridor: string };

export interface PavilionDimensionAnnotation {
  id: string;
  pavilionId: DimensionPavilionId;
  type: 'linear' | 'context-label';
  /** Literal official reading; no area, price or commercial identity. */
  value: string;
  unit: 'm' | null;
  priority: 1 | 2 | 3;
  anchor: DimensionAnchor;
  source: { document: string; page: 1; reference: string };
}

const numbers = { B1: 1, B6: 3, B8: 5, B4: 8, B3: 12, B2: 14 };
function dimension(pavilionId: DimensionPavilionId, id: string, value: string, priority: 1 | 2 | 3, anchor: DimensionAnchor, reference: string): PavilionDimensionAnnotation {
  return { id: `${pavilionId}:dimension:${id}`, pavilionId, type: 'linear', value, unit: 'm', priority, anchor,
    source: { document: `Planta PAVILHÃO ${numbers[pavilionId]} - Fenasoja 2028.pdf`, page: 1, reference } };
}
const zone = (id: string): DimensionRectReference => ({ kind: 'zone', id });

export const PAVILION_DIMENSION_ANNOTATIONS: readonly PavilionDimensionAnnotation[] = [
  dimension('B1', 'north-clearance', '5,40', 1, { kind: 'corridor', id: 'north-distribution', axis: 'z' }, 'Entre a ilha 103–140 e a faixa 142–189; PDF 5,40, referência histórica 5,42.'),
  dimension('B1', 'south-clearance', '5,40', 1, { kind: 'corridor', id: 'south-distribution', axis: 'z' }, 'Entre a ilha 65–102 e a faixa 07–58.'),
  dimension('B1', 'island-side', '4,00', 2, { kind: 'gap', axis: 'x', from: zone('central-south-65-102'), fromEdge: 1, to: zone('east-59-64'), toEdge: 0 }, 'Lateral da ilha junto aos boxes 64/65.'),
  dimension('B1', 'module-depth', '3,00', 3, { kind: 'cell-edge', number: 103, axis: 'z', lane: 'west-access' }, 'Profundidade da fileira central.'),
  dimension('B1', 'module-frontage', '1,00', 3, { kind: 'cell-edge', number: 80, axis: 'x', lane: 'south-distribution' }, 'Frente representativa de um box; não é distância entre boxes.'),

  dimension('B6', 'west-aisle', '4,40', 1, { kind: 'corridor', id: 'west-longitudinal', axis: 'x' }, 'Corredor entre a ilha 48–79 e os boxes laterais 20–35.'),
  dimension('B6', 'east-aisle', '4,40', 1, { kind: 'corridor', id: 'east-longitudinal', axis: 'x' }, 'Corredor entre a ilha 144–175 e a faixa 176–214.'),
  dimension('B6', 'central-aisle', '4,40', 2, { kind: 'corridor', id: 'central-longitudinal', axis: 'x' }, 'Uma referência entre as duas grandes ilhas; sem reescalar o croqui histórico.'),
  dimension('B6', 'lower-clearance', '4,25', 2, { kind: 'gap', axis: 'z', from: { kind: 'boundary' }, fromEdge: 0, to: zone('island-1-east-column'), toEdge: 0 }, 'Extremidade inferior do PDF, entre boxes 48/111 e acesso inferior.'),
  dimension('B6', 'module-depth', '3,00', 3, { kind: 'cell-edge', number: 112, axis: 'x', lane: 'north-distribution' }, 'Profundidade da fileira 112–143, deslocada para o vazio inferior.'),
  dimension('B6', 'module-frontage', '1,00', 3, { kind: 'cell-edge', number: 150, axis: 'z', lane: 'east-longitudinal' }, 'Uma divisão da fileira 144–175.'),

  dimension('B8', 'central-aisle', '5,60', 1, { kind: 'corridor', id: 'central-commercial-aisle', axis: 'x' }, 'Vazio entre as duas fileiras de borda; PDF 5,60, referência histórica 5,70.'),
  dimension('B8', 'module-depth', '3,00', 3, { kind: 'cell-edge', number: 62, axis: 'x', lane: 'west-cross-access' }, 'Profundidade do box junto ao vão 62/63.'),
  dimension('B8', 'special-frontage', '1,50', 3, { kind: 'cell-edge', number: 1, axis: 'z', lane: 'central-commercial-aisle' }, 'Frente especial do box 01, ao lado da fileira contínua.'),

  dimension('B4', 'west-aisle', '3,35', 1, { kind: 'corridor', id: 'west-commercial-aisle', axis: 'x' }, 'Corredor à esquerda da ilha central; 4,00 no PDF é a profundidade das fileiras laterais.'),
  dimension('B4', 'east-aisle', '3,35', 1, { kind: 'corridor', id: 'east-commercial-aisle', axis: 'x', at: 2 / 3 }, 'Uma referência no corredor à direita da ilha.'),
  dimension('B4', 'north-clearance', '3,00', 2, { kind: 'corridor', id: 'north-distribution', axis: 'z' }, 'Vazio entre 26–37 e 38/89.'),
  dimension('B4', 'side-depth', '4,00', 2, { kind: 'cell-edge', number: 100, axis: 'x', lane: 'west-cross-access' }, 'Profundidade da faixa lateral, cotada no vão 100/101.'),
  dimension('B4', 'module-frontage', '1,00', 3, { kind: 'cell-edge', number: 70, axis: 'z', lane: 'west-commercial-aisle' }, 'Uma divisão da fileira 64–89.'),

  dimension('B3', 'central-aisle', '5,00', 1, { kind: 'corridor', id: 'central-distribution', axis: 'z' }, 'Corredor entre as duas ilhas paralelas.'),
  dimension('B3', 'north-aisle', '5,00', 2, { kind: 'corridor', id: 'north-distribution', axis: 'z' }, 'Corredor entre 01–40 e a primeira ilha.'),
  dimension('B3', 'south-aisle', '5,00', 2, { kind: 'corridor', id: 'south-distribution', axis: 'z' }, 'Corredor entre a segunda ilha e 209–257.'),
  dimension('B3', 'module-depth', '3,00', 3, { kind: 'cell-edge', number: 208, axis: 'z', lane: 'west-lower-access' }, 'Profundidade de uma fileira da ilha.'),
  dimension('B3', 'module-frontage', '1,00', 3, { kind: 'cell-edge', number: 180, axis: 'x', lane: 'south-distribution' }, 'Uma divisão da fileira 167–208.'),

  dimension('B2', 'central-aisle', '5,00', 1, { kind: 'corridor', id: 'central-distribution', axis: 'z' }, 'Corredor central entre 94–122 e 65–93.'),
  dimension('B2', 'north-aisle', '4,00', 2, { kind: 'corridor', id: 'north-distribution', axis: 'z' }, 'Corredor superior entre 152–186 e 123–151.'),
  dimension('B2', 'south-aisle', '4,00', 2, { kind: 'corridor', id: 'south-distribution', axis: 'z' }, 'Corredor inferior entre 36–64 e 01–35.'),
  dimension('B2', 'module-depth', '3,50', 3, { kind: 'cell-edge', number: 123, axis: 'z', lane: 'west-upper-access' }, 'Profundidade de metade da ilha central.'),
  dimension('B2', 'module-frontage', '1,00', 3, { kind: 'cell-edge', number: 80, axis: 'x', lane: 'central-distribution' }, 'Uma divisão da fileira 65–93.'),
  { ...dimension('B2', 'bosque', 'Caminho do Bosque', 1, { kind: 'context', side: 'left', corridor: 'west-upper-access' }, 'Lateral esquerda do PDF, ao lado da ilha 94–151, entre os acessos superior e central.'), type: 'context-label', unit: null },
];
