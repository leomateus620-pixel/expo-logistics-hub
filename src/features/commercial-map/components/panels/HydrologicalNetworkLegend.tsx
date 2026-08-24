import { ChevronDown, Droplets, Gauge, X } from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import {
  HYDROLOGICAL_INFRASTRUCTURE_REFERENCE,
  HYDROLOGICAL_NODES,
  HYDROLOGICAL_PIPE_SEGMENTS,
} from '../../data/hydrologicalInfrastructure';
import { HYDROLOGICAL_PRESENTATION_PALETTE } from '../../data/hydrologicalPresentation';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';

type HydrologicalPipeSegment = (typeof HYDROLOGICAL_PIPE_SEGMENTS)[number];
type HydrologicalNode = (typeof HYDROLOGICAL_NODES)[number];

type HydrologicalLegendStyle = CSSProperties & {
  '--hydro-pipe-distribution': string;
  '--hydro-pipe-hydrant-supply': string;
  '--hydro-tap-body': string;
  '--hydro-hydrant-body': string;
  '--hydro-hydrant-top': string;
  '--hydro-reservoir-body': string;
  '--hydro-well-body': string;
  '--hydro-well-top': string;
  '--hydro-well-ring': string;
  '--hydro-register-body': string;
  '--hydro-tl-body': string;
  '--hydro-tl-top': string;
  '--hydro-tl-accessory': string;
  '--hydro-corsan-body': string;
  '--hydro-corsan-top': string;
  '--hydro-corsan-accessory': string;
};

const HYDROLOGICAL_LEGEND_STYLE: HydrologicalLegendStyle = {
  '--hydro-pipe-distribution': HYDROLOGICAL_PRESENTATION_PALETTE.pipes.distribution,
  '--hydro-pipe-hydrant-supply': HYDROLOGICAL_PRESENTATION_PALETTE.pipes.hydrantSupply,
  '--hydro-tap-body': HYDROLOGICAL_PRESENTATION_PALETTE.nodes.TAP.body,
  '--hydro-hydrant-body': HYDROLOGICAL_PRESENTATION_PALETTE.nodes.HYDRANT.body,
  '--hydro-hydrant-top': HYDROLOGICAL_PRESENTATION_PALETTE.nodes.HYDRANT.top,
  '--hydro-reservoir-body': HYDROLOGICAL_PRESENTATION_PALETTE.nodes.RESERVOIR.body,
  '--hydro-well-body': HYDROLOGICAL_PRESENTATION_PALETTE.nodes.WELL.body,
  '--hydro-well-top': HYDROLOGICAL_PRESENTATION_PALETTE.nodes.WELL.top,
  '--hydro-well-ring': HYDROLOGICAL_PRESENTATION_PALETTE.nodes.WELL.ring,
  '--hydro-register-body': HYDROLOGICAL_PRESENTATION_PALETTE.nodes.VALVE.body,
  '--hydro-tl-body': HYDROLOGICAL_PRESENTATION_PALETTE.nodes.TECHNICAL_MARKER.body,
  '--hydro-tl-top': HYDROLOGICAL_PRESENTATION_PALETTE.nodes.TECHNICAL_MARKER.top,
  '--hydro-tl-accessory': HYDROLOGICAL_PRESENTATION_PALETTE.nodes.TECHNICAL_MARKER.accessory,
  '--hydro-corsan-body': HYDROLOGICAL_PRESENTATION_PALETTE.nodes.SUPPLY_ENTRY.body,
  '--hydro-corsan-top': HYDROLOGICAL_PRESENTATION_PALETTE.nodes.SUPPLY_ENTRY.top,
  '--hydro-corsan-accessory': HYDROLOGICAL_PRESENTATION_PALETTE.nodes.SUPPLY_ENTRY.accessory,
};

const NODE_TYPE_LABELS: Record<HydrologicalNode['type'], string> = {
  tap: 'Torneira',
  hydrant: 'Hidrante',
  reservoir: 'Reservatório / caixa d’água',
  well: 'Poço',
  register: 'Registro',
  technical_symbol: 'Símbolo técnico preservado',
  corsan_entry: 'Entrada CORSAN',
  junction: 'Conexão técnica',
};

const PIPE_CATEGORY_LABELS: Record<HydrologicalPipeSegment['category'], string> = {
  distribution: 'Distribuição para torneiras',
  hydrant_supply: 'Alimentação de hidrantes',
};

const PIPE_PURPOSE_LABELS: Record<HydrologicalPipeSegment['purpose'], string> = {
  LOW_FLOW_DISTRIBUTION: 'Distribuição de menor vazão para pontos de consumo',
  HYDRANT_FEED: 'Alimentação de maior capacidade para hidrantes',
};

function formatDiameters(category: HydrologicalPipeSegment['category']) {
  const diameters = Array.from(new Set(
    HYDROLOGICAL_PIPE_SEGMENTS
      .filter((segment) => segment.category === category)
      .map((segment) => segment.diameterMm)
      .filter((diameter): diameter is NonNullable<typeof diameter> => diameter !== null),
  )).sort((a, b) => a - b);

  return diameters.length > 0
    ? diameters.map((diameter) => `Ø${diameter}`).join(' · ') + ' mm'
    : 'Diâmetro não indicado na planta';
}

function PipeInspector({
  segment,
  onClose,
}: {
  segment: HydrologicalPipeSegment;
  onClose: () => void;
}) {
  return (
    <section className="hydrological-network-inspector" aria-label="Trecho hidráulico selecionado">
      <header>
        <div>
          <span>Trecho hidráulico</span>
          <strong>{segment.id}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar inspeção do trecho hidráulico">
          <X aria-hidden="true" />
        </button>
      </header>
      <dl>
        <div>
          <dt>Classe</dt>
          <dd>{PIPE_CATEGORY_LABELS[segment.category]}</dd>
        </div>
        <div>
          <dt>Diâmetro</dt>
          <dd>{segment.diameterMm !== null ? `Ø ${segment.diameterMm} mm` : 'Não indicado'}</dd>
        </div>
        <div>
          <dt>Finalidade</dt>
          <dd>{PIPE_PURPOSE_LABELS[segment.purpose]}</dd>
        </div>
        <div>
          <dt>Fonte do diâmetro</dt>
          <dd>{segment.diameterSource === 'OFFICIAL_VECTOR_ANNOTATION'
            ? 'Anotação vetorial oficial'
            : 'Não indicado no trecho'}</dd>
        </div>
        <div>
          <dt>Conectividade</dt>
          <dd>{segment.sourceNodeId} → {segment.targetNodeId}</dd>
        </div>
      </dl>
    </section>
  );
}

function NodeInspector({ node, onClose }: { node: HydrologicalNode; onClose: () => void }) {
  const technicalDetail = typeof node.metadata.engineeringNote === 'string'
    ? node.metadata.engineeringNote
    : typeof node.metadata.role === 'string'
      ? node.metadata.role
      : node.type === 'register' && typeof node.metadata.diameterMm === 'number'
        ? `Ø ${node.metadata.diameterMm} mm`
        : node.type === 'technical_symbol'
          ? 'Sigla TL preservada sem expansão no plano'
          : null;
  return (
    <section className="hydrological-network-inspector" aria-label="Ponto hidráulico selecionado">
      <header>
        <div>
          <span>{NODE_TYPE_LABELS[node.type]}</span>
          <strong>{node.label}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar inspeção do ponto hidráulico">
          <X aria-hidden="true" />
        </button>
      </header>
      <dl>
        <div>
          <dt>Identificador</dt>
          <dd>{node.id}</dd>
        </div>
        <div>
          <dt>Tipo</dt>
          <dd>{NODE_TYPE_LABELS[node.type]}</dd>
        </div>
        <div>
          <dt>Trechos ligados</dt>
          <dd>{node.linkedSegmentIds.length}</dd>
        </div>
        <div>
          <dt>Referência da planta</dt>
          <dd>{Math.round(node.sourcePagePosition[0])}, {Math.round(node.sourcePagePosition[1])}</dd>
        </div>
        {technicalDetail && (
          <div>
            <dt>Nota técnica</dt>
            <dd>{technicalDetail}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

/** Technical legend and selection inspector shown only while water mode is active. */
export function HydrologicalNetworkLegend() {
  const [expanded, setExpanded] = useState(true);
  const selectedHydrologicalElementId = useCommercialMapStore(
    (state) => state.selectedHydrologicalElementId,
  );
  const setSelectedHydrologicalElementId = useCommercialMapStore(
    (state) => state.setSelectedHydrologicalElementId,
  );

  const selectedNode = useMemo(
    () => HYDROLOGICAL_NODES.find((node) => node.id === selectedHydrologicalElementId) ?? null,
    [selectedHydrologicalElementId],
  );
  const selectedSegment = useMemo(
    () => HYDROLOGICAL_PIPE_SEGMENTS.find(
      (segment) => segment.id === selectedHydrologicalElementId,
    ) ?? null,
    [selectedHydrologicalElementId],
  );
  const reference = HYDROLOGICAL_INFRASTRUCTURE_REFERENCE as unknown as {
    sourceFiles?: readonly unknown[];
    uncertainties?: Readonly<Record<string, unknown>>;
    sourcePage?: { printedScale?: string };
  };
  const technicalNodes = HYDROLOGICAL_NODES.filter((node) => node.type !== 'junction');
  const sourceFileCount = reference.sourceFiles?.length ?? 2;
  const uncertaintyCount = Object.keys(reference.uncertainties ?? {}).length;
  const printedScale = reference.sourcePage?.printedScale ?? '1:1500';
  const contentId = 'hydrological-network-legend-content';

  return (
    <aside
      className={`hydrological-network-legend ${expanded ? 'is-expanded' : ''} ${selectedNode || selectedSegment ? 'has-selection' : ''}`}
      aria-label="Legenda técnica da Rede Hidrológica"
      style={HYDROLOGICAL_LEGEND_STYLE}
    >
      <header className="hydrological-network-legend__header">
        <span className="hydrological-network-legend__icon" aria-hidden="true">
          <Droplets />
        </span>
        <div>
          <span>Modo de infraestrutura</span>
          <strong>Rede Hidrológica</strong>
          <small>{HYDROLOGICAL_PIPE_SEGMENTS.length} trechos · {technicalNodes.length} pontos técnicos</small>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? 'Recolher legenda da Rede Hidrológica' : 'Expandir legenda da Rede Hidrológica'}
          aria-expanded={expanded}
          aria-controls={contentId}
        >
          <ChevronDown aria-hidden="true" />
        </button>
      </header>

      {expanded && (
        <div id={contentId} className="hydrological-network-legend__content">
          <div className="hydrological-network-legend__classes" aria-label="Classes de tubulação">
            <div>
              <i className="hydrological-network-swatch is-distribution" aria-hidden="true" />
              <span>
                <strong>Distribuição de menor vazão</strong>
                <small>{formatDiameters('distribution')} · torneiras e consumo</small>
              </span>
            </div>
            <div>
              <i className="hydrological-network-swatch is-hydrant-supply" aria-hidden="true" />
              <span>
                <strong>Rede principal de hidrantes</strong>
                <small>{formatDiameters('hydrant_supply')} · maior capacidade</small>
              </span>
            </div>
          </div>

          <div className="hydrological-network-legend__symbols" aria-label="Símbolos hidráulicos">
            <span><i className="hydrological-node-symbol is-tap" aria-hidden="true" />Torneiras</span>
            <span><i className="hydrological-node-symbol is-hydrant" aria-hidden="true" />Hidrantes</span>
            <span><i className="hydrological-node-symbol is-reservoir" aria-hidden="true" />Reservatórios</span>
            <span><i className="hydrological-node-symbol is-well" aria-hidden="true" />Poços</span>
            <span><i className="hydrological-node-symbol is-register" aria-hidden="true" />Registros</span>
            <span><i className="hydrological-node-symbol is-technical" aria-hidden="true" />Símbolos TL</span>
            <span><i className="hydrological-node-symbol is-corsan" aria-hidden="true" />ENTRADA CORSAN</span>
          </div>

          {selectedSegment && (
            <PipeInspector
              segment={selectedSegment}
              onClose={() => setSelectedHydrologicalElementId(null)}
            />
          )}
          {selectedNode && (
            <NodeInspector
              node={selectedNode}
              onClose={() => setSelectedHydrologicalElementId(null)}
            />
          )}

          <footer>
            <Gauge aria-hidden="true" />
            <span>
              <strong>Leitura calibrada pelas plantas oficiais A2</strong>
              <small>
                {sourceFileCount} referências · escala {printedScale}
                {uncertaintyCount > 0 ? ` · ${uncertaintyCount} ressalvas documentadas` : ''}
              </small>
            </span>
          </footer>
        </div>
      )}
    </aside>
  );
}
