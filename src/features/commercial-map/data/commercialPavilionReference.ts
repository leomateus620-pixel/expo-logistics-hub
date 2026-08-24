export type CommercialPavilionReferenceModuleOrientation =
  | 'east-west'
  | 'north-south';

export type CommercialPavilionReferenceSequenceOrientation =
  | 'x-increasing'
  | 'x-decreasing'
  | 'z-increasing'
  | 'z-decreasing';

export type CommercialPavilionReferenceSourceDiscrepancy =
  | 'official-range-omission'
  | 'manual-confirmation-required'
  | null;

export interface CommercialPavilionReferenceRect {
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
}

export interface CommercialPavilionReferenceCluster {
  id: string;
  numberRanges: readonly (readonly [start: number, end: number])[];
}

export interface CommercialPavilionReferenceRun {
  id: string;
  label: string;
  role: 'perimeter' | 'island';
  bounds: CommercialPavilionReferenceRect;
  numberRange: readonly [start: number, end: number];
  orientation: CommercialPavilionReferenceModuleOrientation;
  sequenceOrientation: CommercialPavilionReferenceSequenceOrientation;
  group: string;
  cluster: string;
  clusters?: readonly CommercialPavilionReferenceCluster[];
}

export interface CommercialPavilionReferenceCorridor
  extends CommercialPavilionReferenceRect {
  id: string;
  kind: 'main' | 'cross' | 'perimeter';
  label: string;
}

export interface CommercialPavilionModuleSource {
  document: string;
  referenceYear: number;
  discrepancy: CommercialPavilionReferenceSourceDiscrepancy;
}

export interface CommercialPavilionReferenceCell<PavilionId extends string = string>
  extends CommercialPavilionReferenceRect {
  id: string;
  number: number;
  label: string;
  zoneId: string;
  pavilionId: PavilionId;
  lotNumber: string;
  orientation: CommercialPavilionReferenceModuleOrientation;
  sequenceOrientation: CommercialPavilionReferenceSequenceOrientation;
  labelAnchor: readonly [x: number, z: number];
  type: 'commercial-lot';
  areaM2: null;
  sortOrder: number;
  group: string;
  cluster: string;
  source: CommercialPavilionModuleSource;
}

export interface BuildCommercialPavilionReferenceCellsInput<
  PavilionId extends string,
> {
  pavilionId: PavilionId;
  runs: readonly CommercialPavilionReferenceRun[];
  moduleGap: number;
  sourceDocument: string;
  referenceYear: number;
  discrepancyForNumber?: (
    moduleNumber: number,
  ) => CommercialPavilionReferenceSourceDiscrepancy;
}

export function commercialPavilionReferenceRect(
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
): CommercialPavilionReferenceRect {
  return { centerX, centerZ, width, depth };
}

export function formatCommercialPavilionModuleNumber(number: number): string {
  return String(number).padStart(2, '0');
}

function clusterForNumber(
  run: CommercialPavilionReferenceRun,
  number: number,
): string {
  const matchingCluster = run.clusters?.find((cluster) => (
    cluster.numberRanges.some(([start, end]) => number >= start && number <= end)
  ));
  return matchingCluster?.id ?? run.cluster;
}

function expandRun<PavilionId extends string>(
  run: CommercialPavilionReferenceRun,
  input: BuildCommercialPavilionReferenceCellsInput<PavilionId>,
): CommercialPavilionReferenceCell<PavilionId>[] {
  const [start, end] = run.numberRange;
  const moduleCount = end - start + 1;
  const horizontalSequence = run.sequenceOrientation === 'x-increasing'
    || run.sequenceOrientation === 'x-decreasing';
  const decreasingSequence = run.sequenceOrientation === 'x-decreasing'
    || run.sequenceOrientation === 'z-decreasing';
  const sequenceLength = horizontalSequence ? run.bounds.width : run.bounds.depth;
  const cellLength = (
    sequenceLength - input.moduleGap * (moduleCount - 1)
  ) / moduleCount;
  const left = run.bounds.centerX - run.bounds.width / 2;
  const top = run.bounds.centerZ - run.bounds.depth / 2;

  if (moduleCount <= 0 || cellLength <= 0) {
    throw new Error(`${input.pavilionId}: sequencia ${run.id} possui geometria invalida.`);
  }

  return Array.from({ length: moduleCount }, (_, index) => {
    const number = start + index;
    const spatialIndex = decreasingSequence ? moduleCount - index - 1 : index;
    const centerX = horizontalSequence
      ? left + spatialIndex * (cellLength + input.moduleGap) + cellLength / 2
      : run.bounds.centerX;
    const centerZ = horizontalSequence
      ? run.bounds.centerZ
      : top + spatialIndex * (cellLength + input.moduleGap) + cellLength / 2;
    const label = formatCommercialPavilionModuleNumber(number);

    return {
      id: `${input.pavilionId}:module:${String(number).padStart(3, '0')}`,
      number,
      label,
      zoneId: run.id,
      centerX,
      centerZ,
      width: horizontalSequence ? cellLength : run.bounds.width,
      depth: horizontalSequence ? run.bounds.depth : cellLength,
      pavilionId: input.pavilionId,
      lotNumber: label,
      orientation: run.orientation,
      sequenceOrientation: run.sequenceOrientation,
      labelAnchor: [centerX, centerZ],
      type: 'commercial-lot',
      areaM2: null,
      sortOrder: number,
      group: run.group,
      cluster: clusterForNumber(run, number),
      source: {
        document: input.sourceDocument,
        referenceYear: input.referenceYear,
        discrepancy: input.discrepancyForNumber?.(number) ?? null,
      },
    };
  });
}

export function buildCommercialPavilionReferenceCells<PavilionId extends string>(
  input: BuildCommercialPavilionReferenceCellsInput<PavilionId>,
): CommercialPavilionReferenceCell<PavilionId>[] {
  const cells = input.runs.flatMap((run) => expandRun(run, input));
  const numbers = cells.map((cell) => cell.number);
  if (new Set(numbers).size !== numbers.length) {
    throw new Error(`${input.pavilionId}: a referencia possui numeros de modulo duplicados.`);
  }
  return cells;
}
