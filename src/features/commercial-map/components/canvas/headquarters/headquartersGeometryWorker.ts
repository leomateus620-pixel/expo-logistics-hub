import { preparePackedHeadquartersGeometry } from './headquartersGeometryPreparation';
import { headquartersTransferBuffers, type PackedHeadquartersGeometry } from './headquartersGeometryPacking';

export type HeadquartersWorkerResponse = { ok: true; packed: PackedHeadquartersGeometry }
  | { ok: false; error: string };

const worker = globalThis as unknown as {
  onmessage: (() => void) | null;
  postMessage: (response: HeadquartersWorkerResponse, buffers?: ArrayBuffer[]) => void;
};
worker.onmessage = () => {
  try {
    const packed = preparePackedHeadquartersGeometry();
    worker.postMessage({ ok: true, packed }, headquartersTransferBuffers(packed));
  } catch (error) {
    worker.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
