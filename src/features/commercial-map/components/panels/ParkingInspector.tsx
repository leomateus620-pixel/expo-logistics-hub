import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ChevronDown, Focus, Info, Layers3, ParkingCircle, Scan, X } from 'lucide-react';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import type { ParkingCameraView } from '../../utils/parkingViewport';
import './parking-inspector.css';

export interface ParkingInspectorBlock {
  id: string;
  label: string;
  group?: string;
  rows: readonly unknown[];
  spaces: readonly { id: string }[];
  referenceAmbiguity?: string | null;
}

interface ParkingInspectorProps {
  blocks: readonly ParkingInspectorBlock[];
}

const VIEW_OPTIONS = [
  { id: 'overview', label: 'Geral', accessibleLabel: 'Visão geral do estacionamento', Icon: Scan },
  { id: 'aerial', label: 'Aérea', accessibleLabel: 'Vista aérea do estacionamento', Icon: Layers3 },
  { id: 'rear', label: 'Fundos', accessibleLabel: 'Vista dos fundos alinhada ao Pavilhão 9 e Expo Rural', Icon: ArrowDownToLine },
  { id: 'lateral', label: 'Lateral', accessibleLabel: 'Vista lateral junto ao Núcleo dos Criadores de Cavalos Crioulos', Icon: ChevronDown },
  { id: 'detail', label: 'Detalhe', accessibleLabel: 'Aproximar bloco ou vaga selecionada', Icon: Focus },
] as const satisfies readonly {
  id: ParkingCameraView;
  label: string;
  accessibleLabel: string;
  Icon: typeof Scan;
}[];

/** Compact, read-only cartographic controls; parking never inherits lot status. */
export function ParkingInspector({ blocks }: ParkingInspectorProps) {
  const open = useCommercialMapStore((state) => state.parkingInspectionOpen);
  const blockId = useCommercialMapStore((state) => state.selectedParkingBlockId);
  const spaceId = useCommercialMapStore((state) => state.selectedParkingSpaceId);
  const view = useCommercialMapStore((state) => state.parkingCameraView);
  const inspectBlock = useCommercialMapStore((state) => state.inspectParkingBlock);
  const requestView = useCommercialMapStore((state) => state.requestParkingView);
  const closeInspection = useCommercialMapStore((state) => state.closeParkingInspection);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const blockSelectRef = useRef<HTMLSelectElement>(null);
  const restoreLauncherFocus = useRef(false);
  const focusBlockSelect = useRef(false);
  const panelId = useId();
  const detailsId = `${panelId}-details`;
  const selectedBlock = blocks.find((block) => block.id === blockId);
  const groupedBlocks = useMemo(() => {
    const groups = new Map<string, ParkingInspectorBlock[]>();
    for (const block of blocks) {
      const key = block.group ?? '';
      const group = groups.get(key) ?? [];
      group.push(block);
      groups.set(key, group);
    }
    return [...groups];
  }, [blocks]);
  const inspectedBlocks = selectedBlock ? [selectedBlock] : blocks;
  const rowCount = inspectedBlocks.reduce((count, block) => count + block.rows.length, 0);
  const spaceCount = inspectedBlocks.reduce((count, block) => count + block.spaces.length, 0);

  useEffect(() => {
    if (open && focusBlockSelect.current) {
      focusBlockSelect.current = false;
      blockSelectRef.current?.focus({ preventScroll: true });
    }
    if (!open && restoreLauncherFocus.current) {
      restoreLauncherFocus.current = false;
      launcherRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  const close = () => {
    restoreLauncherFocus.current = true;
    setDetailsExpanded(false);
    closeInspection();
  };

  if (blocks.length === 0) return null;
  if (!open) {
    return (
      <button
        ref={launcherRef}
        type="button"
        className="parking-inspector-launcher"
        data-parking-inspector-launcher
        aria-label="Inspecionar estacionamento posterior"
        aria-controls={panelId}
        aria-expanded={false}
        onClick={() => {
          focusBlockSelect.current = true;
          setDetailsExpanded(false);
          inspectBlock(null);
        }}
      >
        <ParkingCircle aria-hidden="true" />
        <span>Estacionamento posterior</span>
      </button>
    );
  }

  const statusText = spaceId
    ? `Vaga ${spaceId.replace('rear-parking:', '').replaceAll(':', ' · ')} · ocupação não informada`
    : 'Consulta da planta · ocupação não informada';

  return (
    <aside
      id={panelId}
      className={`parking-inspector ${detailsExpanded ? 'is-details-expanded' : ''}`}
      aria-label="Inspeção do estacionamento posterior"
      data-parking-inspector
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
    >
      <header className="parking-inspector__header">
        <div className="parking-inspector__title">
          <span>Estacionamento</span>
          <strong>Posterior</strong>
        </div>
        <select
          ref={blockSelectRef}
          className="parking-inspector__block-select"
          aria-label="Selecionar bloco do estacionamento"
          value={selectedBlock?.id ?? ''}
          onChange={(event) => {
            setDetailsExpanded(false);
            inspectBlock(event.target.value || null);
          }}
        >
          <option value="">Todos os blocos</option>
          {groupedBlocks.map(([group, entries]) => group ? (
            <optgroup key={group} label={`Setor ${group}`}>
              {entries.map((block) => <option key={block.id} value={block.id}>{block.label}</option>)}
            </optgroup>
          ) : entries.map((block) => <option key={block.id} value={block.id}>{block.label}</option>))}
        </select>
        <button
          type="button"
          className="parking-inspector__icon-button"
          aria-label={detailsExpanded ? 'Voltar às vistas do estacionamento' : 'Ver dados e referências do estacionamento'}
          aria-controls={detailsId}
          aria-expanded={detailsExpanded}
          onClick={() => setDetailsExpanded((expanded) => !expanded)}
        >
          {detailsExpanded ? <ChevronDown aria-hidden="true" /> : <Info aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="parking-inspector__icon-button"
          aria-label="Fechar inspeção do estacionamento"
          aria-keyshortcuts="Escape"
          onClick={close}
        >
          <X aria-hidden="true" />
        </button>
      </header>

      {detailsExpanded ? (
        <div className="parking-inspector__details" id={detailsId} tabIndex={0}>
          <dl>
            <div><dt>Blocos</dt><dd>{inspectedBlocks.length}</dd></div>
            <div><dt>Fileiras</dt><dd>{rowCount}</dd></div>
            <div><dt>Vagas mapeadas</dt><dd>{spaceCount}</dd></div>
          </dl>
          {selectedBlock && <p><strong>{selectedBlock.label}</strong>{spaceId ? ` · Vaga ${spaceId}` : ''}</p>}
          <p>Geometria dos anexos 4–6; entorno da referência de satélite. Vagas mapeadas não indicam ocupação, reserva ou disponibilidade comercial.</p>
          <p>{selectedBlock?.referenceAmbiguity ?? 'Registro proporcional ao mapa existente, sem levantamento topográfico. O total de 2.187 impresso na planta tem abrangência não confirmada.'}</p>
          <p>Selecione um bloco para aproximar; toque em uma vaga para consultar seu identificador.</p>
        </div>
      ) : (
        <>
          <div className="parking-inspector__views" role="group" aria-label="Vistas do estacionamento">
            {VIEW_OPTIONS.map(({ id, label, accessibleLabel, Icon }) => (
              <button
                key={id}
                type="button"
                aria-label={accessibleLabel}
                aria-pressed={view === id}
                disabled={id === 'detail' && !selectedBlock}
                title={id === 'detail' && !selectedBlock ? 'Selecione um bloco para aproximar' : accessibleLabel}
                onClick={() => requestView(id)}
              >
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <p className="parking-inspector__status" role="status" aria-live="polite" title={statusText}>
            {statusText}
          </p>
        </>
      )}
    </aside>
  );
}
