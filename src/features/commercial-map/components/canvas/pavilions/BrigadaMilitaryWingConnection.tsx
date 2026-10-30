import { memo, useMemo } from 'react';
import type { MapEntity } from '../../../types';
import { buildBrigadaMilitaryWingPresentation } from '../../../utils/brigadaMilitaryWingConnection';
import { PavilionConstructionJoinMesh } from './PavilionConnectedComplex';

/** One seam owner, separate from both B19's physical facade and B6's lots. */
export const BrigadaMilitaryWingConnection = memo(function BrigadaMilitaryWingConnection({ entities, visible = true, selectedEntityId = null, layerOpacity = {} }: {
  entities: readonly MapEntity[];
  visible?: boolean;
  selectedEntityId?: string | null;
  layerOpacity?: Readonly<Record<string, number>>;
}) {
  const presentation = useMemo(() => buildBrigadaMilitaryWingPresentation(entities), [entities]);
  if (!presentation) return null;
  const opacity = Math.min(layerOpacity[presentation.wing.layerId] ?? 1, layerOpacity[presentation.pavilion3.layerId] ?? 1);
  return <PavilionConstructionJoinMesh join={presentation.join} opacity={opacity}
    visible={visible && opacity > .015 && selectedEntityId !== presentation.pavilion3.id} />;
});
