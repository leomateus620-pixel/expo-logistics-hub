import { prepareHydrologyCoordinates, type HydrologyPreparationInput } from './hydrologyPreparation';

self.onmessage = (event: MessageEvent<HydrologyPreparationInput>) => {
  const prepared = prepareHydrologyCoordinates(event.data);
  self.postMessage(prepared, { transfer: [prepared.spanCoordinates.buffer, prepared.spanSegments.buffer, prepared.nodeElevations.buffer] });
};
