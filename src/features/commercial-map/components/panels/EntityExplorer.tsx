import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
} from 'react';
import {
  BadgeCheck,
  Building2,
  ChevronDown,
  ChevronRight,
  Eye,
  Layers3,
  List,
  MapPinned,
  MoreHorizontal,
  PencilLine,
  Search,
  SearchX,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CLASSIFICATION_LABELS, STATUS_CONFIG, VERIFICATION_LABELS } from '../../constants';
import type { MapEntityFilterResult } from '../../hooks/useCommercialMap';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import type {
  CommercialLot,
  CommercialStatus,
  EntitySortOrder,
  MapClassification,
  MapPermissions,
  VerificationStatus,
} from '../../types';
import type { EntityExplorerItem, EntityLocationGroup, EntityLocationOption } from '../../utils/entityExplorer';
import { LotEditDialog } from '../commercial/LotEditDialog';

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

const CLASSIFICATION_INITIALS: Partial<Record<MapClassification, string>> = {
  SELLABLE_LOT: 'LT',
  INTERNAL_STAND: 'ES',
  QUADRA: 'QD',
  PAVILION: 'PV',
  BUILDING: 'ED',
  RESTAURANT: 'RE',
  FOOD_AREA: 'AL',
  RESTROOM: 'WC',
  CHEMICAL_RESTROOM: 'BQ',
  GATE: 'PT',
  PARKING: 'ET',
  ROAD: 'RU',
  PEDESTRIAN_PATH: 'CP',
  ADMINISTRATION: 'AD',
  SECURITY: 'SG',
  EMERGENCY: 'EM',
  SERVICE: 'SV',
  ATTRACTION: 'AT',
  EVENT_VENUE: 'EV',
  LIVESTOCK_AREA: 'PC',
  RURAL_EXHIBITION: 'EX',
  LANDMARK: 'MR',
};

const SORT_LABELS: Record<EntitySortOrder, string> = {
  relevance: 'Relevância / nome',
  name: 'Nome A–Z',
  location: 'Localização',
  status: 'Situação comercial',
};

function classificationInitial(classification: MapClassification): string {
  return CLASSIFICATION_INITIALS[classification]
    ?? CLASSIFICATION_LABELS[classification].split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toLocaleUpperCase('pt-BR');
}

function EntityStatusBadge({ item }: { item: EntityExplorerItem }) {
  if (!item.lot) return <span className="commercial-map-entity-status is-neutral">Não comercial</span>;
  const config = STATUS_CONFIG[item.lot.status];
  return (
    <span
      className="commercial-map-entity-status"
      style={{ color: config.border, backgroundColor: config.surface, borderColor: config.color }}
    >
      <i aria-hidden="true">{config.symbol}</i>
      {config.label}
    </span>
  );
}

function VerificationBadge({ status }: { status: VerificationStatus }) {
  return (
    <span className={`commercial-map-verification is-${status.toLocaleLowerCase('en-US').replace('_', '-')}`}>
      <i aria-hidden="true" />
      {VERIFICATION_LABELS[status]}
    </span>
  );
}

function ExplorerPanelHeader({ explorer, onClose }: { explorer: MapEntityFilterResult; onClose: () => void }) {
  return (
    <div className="commercial-map-panel-header commercial-map-explorer-panel-header">
      <div>
        <span>Busca e seleção</span>
        <h2>{explorer.filteredCount} de {explorer.totalCount} entidades</h2>
      </div>
      <button type="button" onClick={onClose} aria-label="Fechar busca e seleção"><X className="h-4 w-4" /></button>
    </div>
  );
}

interface ExplorerControlsProps {
  explorer: MapEntityFilterResult;
  variant: 'panel' | 'table';
  inputRef?: MutableRefObject<HTMLInputElement | null>;
  onSearchKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onEscape?: () => void;
}

function ExplorerControls({ explorer, variant, inputRef, onSearchKeyDown, onEscape }: ExplorerControlsProps) {
  const search = useCommercialMapStore((state) => state.search);
  const statusFilters = useCommercialMapStore((state) => state.statusFilters);
  const classificationFilters = useCommercialMapStore((state) => state.classificationFilters);
  const locationFilter = useCommercialMapStore((state) => state.locationFilter);
  const verificationFilters = useCommercialMapStore((state) => state.verificationFilters);
  const sortOrder = useCommercialMapStore((state) => state.sortOrder);
  const tableDensity = useCommercialMapStore((state) => state.tableDensity);
  const setSearch = useCommercialMapStore((state) => state.setSearch);
  const toggleStatus = useCommercialMapStore((state) => state.toggleStatus);
  const toggleClassification = useCommercialMapStore((state) => state.toggleClassification);
  const setLocationFilter = useCommercialMapStore((state) => state.setLocationFilter);
  const toggleVerification = useCommercialMapStore((state) => state.toggleVerification);
  const setSortOrder = useCommercialMapStore((state) => state.setSortOrder);
  const setTableDensity = useCommercialMapStore((state) => state.setTableDensity);
  const clearExplorerFilters = useCommercialMapStore((state) => state.clearExplorerFilters);

  const locationOptions = explorer.facets.locations;
  const locationGroups = useMemo(() => locationOptions.reduce<Record<EntityLocationGroup, EntityLocationOption[]>>((groups, option) => {
    groups[option.group].push(option);
    return groups;
  }, { Quadras: [], Vias: [], 'Pisos e níveis': [] }), [locationOptions]);
  const activeLocation = locationOptions.find((option) => option.value === locationFilter);
  const activeFilterCount = (search.trim() ? 1 : 0)
    + statusFilters.length
    + classificationFilters.length
    + (locationFilter ? 1 : 0)
    + verificationFilters.length;
  const canClear = activeFilterCount > 0 || sortOrder !== 'relevance';

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (search) setSearch('');
      else onEscape?.();
      return;
    }
    onSearchKeyDown?.(event);
  };

  return (
    <div className={`commercial-map-explorer-controls is-${variant}`}>
      <div className="commercial-map-explorer-search-row">
        <label className="commercial-map-explorer-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Buscar entidades do parque</span>
          <input
            ref={inputRef}
            data-commercial-map-search
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="ID, nome, quadra, lote, rua ou empresa"
            aria-label="Buscar entidades do parque"
            aria-keyshortcuts="Control+K Meta+K"
            autoComplete="off"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Limpar busca"><X /></button>
          )}
          <kbd aria-hidden="true">Ctrl K</kbd>
        </label>
        <div className="commercial-map-explorer-count" role="status" aria-live="polite">
          <strong>{explorer.filteredCount}</strong>
          <span>de {explorer.totalCount}</span>
        </div>
      </div>

      <div className="commercial-map-status-filters" role="group" aria-label="Filtrar por situação comercial">
        {(Object.keys(STATUS_CONFIG) as CommercialStatus[]).map((status) => {
          const config = STATUS_CONFIG[status];
          const selected = statusFilters.includes(status);
          const count = explorer.facets.statusCounts[status];
          return (
            <button
              key={status}
              type="button"
              className={selected ? 'is-active' : ''}
              onClick={() => toggleStatus(status)}
              aria-pressed={selected}
              disabled={count === 0 && !selected}
              style={{ color: selected ? config.border : undefined, backgroundColor: selected ? config.surface : undefined, borderColor: selected ? config.color : undefined }}
            >
              <i style={{ backgroundColor: config.color }} aria-hidden="true" />
              <span>{config.shortLabel}</span>
              <small>{count}</small>
            </button>
          );
        })}
      </div>

      <div className="commercial-map-explorer-filter-row">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={classificationFilters.length ? 'is-active' : ''}>
              <Building2 aria-hidden="true" />
              <span>{classificationFilters.length ? `Tipos (${classificationFilters.length})` : 'Tipos'}</span>
              <ChevronDown aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={variant === 'panel' ? 'start' : 'end'} className="commercial-map-filter-dropdown">
            <DropdownMenuLabel>Tipo de entidade</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {explorer.facets.classifications.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={classificationFilters.includes(option.value)}
                onCheckedChange={() => toggleClassification(option.value)}
                onSelect={(event) => event.preventDefault()}
              >
                <span>{option.label}</span><small>{option.count}</small>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <label className={`commercial-map-explorer-select ${locationFilter ? 'is-active' : ''}`}>
          <MapPinned aria-hidden="true" />
          <span className="sr-only">Filtrar por localização</span>
          <select
            aria-label="Filtrar por localização"
            value={locationFilter ?? ''}
            onChange={(event) => setLocationFilter(event.target.value || null)}
          >
            <option value="">Localização</option>
            {(Object.keys(locationGroups) as EntityLocationGroup[]).map((group) => locationGroups[group].length > 0 && (
              <optgroup label={group} key={group}>
                {locationGroups[group].map((option) => <option value={option.value} key={option.value}>{option.label} ({option.count})</option>)}
              </optgroup>
            ))}
          </select>
          <ChevronDown aria-hidden="true" />
        </label>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={verificationFilters.length ? 'is-active' : ''}>
              <BadgeCheck aria-hidden="true" />
              <span>{verificationFilters.length ? `Verificação (${verificationFilters.length})` : 'Verificação'}</span>
              <ChevronDown aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="commercial-map-filter-dropdown">
            <DropdownMenuLabel>Qualidade dos dados</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {explorer.facets.verifications.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={verificationFilters.includes(option.value)}
                onCheckedChange={() => toggleVerification(option.value)}
                onSelect={(event) => event.preventDefault()}
              >
                <span>{option.label}</span><small>{option.count}</small>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <label className={`commercial-map-explorer-select ${sortOrder !== 'relevance' ? 'is-active' : ''}`}>
          <SlidersHorizontal aria-hidden="true" />
          <span className="sr-only">Ordenar entidades</span>
          <select aria-label="Ordenar entidades" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as EntitySortOrder)}>
            {(Object.keys(SORT_LABELS) as EntitySortOrder[]).map((order) => <option value={order} key={order}>{SORT_LABELS[order]}</option>)}
          </select>
          <ChevronDown aria-hidden="true" />
        </label>

        {variant === 'table' && (
          <button
            type="button"
            className={tableDensity === 'compact' ? 'is-active' : ''}
            onClick={() => setTableDensity(tableDensity === 'compact' ? 'comfortable' : 'compact')}
            aria-pressed={tableDensity === 'compact'}
          >
            <List aria-hidden="true" />
            <span>{tableDensity === 'compact' ? 'Compacta' : 'Confortável'}</span>
          </button>
        )}

        <button type="button" className="commercial-map-clear-filters" onClick={clearExplorerFilters} disabled={!canClear}>
          <X aria-hidden="true" />
          <span>Limpar</span>
        </button>
      </div>

      {activeFilterCount > 0 && (
        <div className="commercial-map-active-filters" aria-label={`${activeFilterCount} filtros ativos`}>
          <span>{activeFilterCount} {activeFilterCount === 1 ? 'filtro ativo' : 'filtros ativos'}</span>
          {search.trim() && <button type="button" onClick={() => setSearch('')}>Busca: “{search.trim()}”<X /></button>}
          {statusFilters.map((status) => <button type="button" key={status} onClick={() => toggleStatus(status)}>{STATUS_CONFIG[status].shortLabel}<X /></button>)}
          {classificationFilters.map((classification) => <button type="button" key={classification} onClick={() => toggleClassification(classification)}>{CLASSIFICATION_LABELS[classification]}<X /></button>)}
          {locationFilter && <button type="button" onClick={() => setLocationFilter(null)}>{activeLocation?.label ?? 'Localização'}<X /></button>}
          {verificationFilters.map((status) => <button type="button" key={status} onClick={() => toggleVerification(status)}>{VERIFICATION_LABELS[status]}<X /></button>)}
        </div>
      )}
    </div>
  );
}

function ResultCard({
  item,
  selected,
  tabIndex,
  buttonRef,
  onSelect,
  onHover,
  onKeyDown,
}: {
  item: EntityExplorerItem;
  selected: boolean;
  tabIndex: number;
  buttonRef: (element: HTMLButtonElement | null) => void;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}) {
  const area = item.lot?.officialAreaSqm;
  const accessibleContext = [
    CLASSIFICATION_LABELS[item.entity.classification],
    item.locationLabel,
    item.lot ? STATUS_CONFIG[item.lot.status].label : 'Não comercial',
    item.companyLabel,
  ].filter(Boolean).join(', ');

  return (
    <button
      ref={buttonRef}
      type="button"
      role="option"
      tabIndex={tabIndex}
      aria-selected={selected}
      aria-label={`${item.metadata.officialDisplayName}, ${item.entity.publicIdentifier}. ${accessibleContext}`}
      className={`commercial-map-result-card ${selected ? 'is-selected' : ''}`}
      onClick={onSelect}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      onKeyDown={onKeyDown}
    >
      <span className="commercial-map-entity-type-mark" aria-hidden="true">{classificationInitial(item.entity.classification)}</span>
      <span className="commercial-map-result-body">
        <span className="commercial-map-result-title">
          <strong>{item.metadata.officialDisplayName}</strong>
          {item.matchReason && <em>{item.matchReason}</em>}
        </span>
        <span className="commercial-map-result-identity">
          <b>{item.entity.publicIdentifier}</b>
          <small>{CLASSIFICATION_LABELS[item.entity.classification]}</small>
        </span>
        {item.locationLabel && <span className="commercial-map-result-location"><MapPinned aria-hidden="true" />{item.locationLabel}</span>}
        <span className="commercial-map-result-meta">
          <EntityStatusBadge item={item} />
          {item.companyLabel && <small>{item.companyLabel}</small>}
          {area && <small>{number.format(area)} m²</small>}
        </span>
      </span>
      <ChevronRight className="commercial-map-result-arrow" aria-hidden="true" />
    </button>
  );
}

export const ResultsPanel = memo(function ResultsPanel({ explorer }: { explorer: MapEntityFilterResult }) {
  const setActivePanel = useCommercialMapStore((state) => state.setActivePanel);
  const selectEntityFromExplorer = useCommercialMapStore((state) => state.selectEntityFromExplorer);
  const selectedEntityId = useCommercialMapStore((state) => state.selectedEntityId);
  const setHoveredEntityId = useCommercialMapStore((state) => state.setHoveredEntityId);
  const clearExplorerFilters = useCommercialMapStore((state) => state.clearExplorerFilters);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = explorer.items.findIndex((item) => item.entity.id === selectedEntityId);
  const firstTabIndex = selectedIndex >= 0 ? selectedIndex : 0;

  useEffect(() => () => setHoveredEntityId(null), [setHoveredEntityId]);

  const focusResult = useCallback((index: number) => {
    if (explorer.items.length === 0) return;
    const wrapped = (index + explorer.items.length) % explorer.items.length;
    resultRefs.current[wrapped]?.focus();
  }, [explorer.items.length]);

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusResult(firstTabIndex);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusResult(explorer.items.length - 1);
    } else if (event.key === 'Enter' && explorer.items.length > 0) {
      event.preventDefault();
      selectEntityFromExplorer(explorer.items[firstTabIndex]?.entity.id ?? explorer.items[0].entity.id);
    }
  };

  const handleResultKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const entityId = explorer.items[index]?.entity.id;
      if (entityId) selectEntityFromExplorer(entityId);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusResult(index + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusResult(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusResult(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusResult(explorer.items.length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      inputRef.current?.focus();
    }
  };

  return (
    <aside className="commercial-map-panel commercial-map-results-panel" aria-label="Busca e seleção de entidades">
      <ExplorerPanelHeader explorer={explorer} onClose={() => setActivePanel(null)} />
      <ExplorerControls
        explorer={explorer}
        variant="panel"
        inputRef={inputRef}
        onSearchKeyDown={handleSearchKeyDown}
        onEscape={() => setActivePanel(null)}
      />
      <ScrollArea className="commercial-map-panel-scroll">
        <div className="commercial-map-result-list" role="listbox" aria-label={`${explorer.filteredCount} entidades encontradas`}>
          {explorer.items.length === 0 && (
            <div className="commercial-map-empty commercial-map-explorer-empty">
              <SearchX />
              <strong>Nenhuma entidade encontrada</strong>
              <span>Revise o termo ou combine menos filtros.</span>
              {explorer.hasActiveCriteria && <Button type="button" variant="outline" size="sm" onClick={clearExplorerFilters}>Limpar filtros</Button>}
            </div>
          )}
          {explorer.items.map((item, index) => (
            <ResultCard
              key={item.entity.id}
              item={item}
              selected={item.entity.id === selectedEntityId}
              tabIndex={index === firstTabIndex ? 0 : -1}
              buttonRef={(element) => { resultRefs.current[index] = element; }}
              onSelect={() => selectEntityFromExplorer(item.entity.id)}
              onHover={(hovered) => setHoveredEntityId(hovered ? item.entity.id : null)}
              onKeyDown={(event) => handleResultKeyDown(event, index)}
            />
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
});

interface EntityTableProps {
  items: EntityExplorerItem[];
  selectedEntityId: string | null;
  density: 'compact' | 'comfortable';
  permissions: MapPermissions;
  onOpen: (entityId: string) => void;
  onEdit: (lot: CommercialLot) => void;
}

const EntityTable = memo(function EntityTable({ items, selectedEntityId, density, permissions, onOpen, onEdit }: EntityTableProps) {
  return (
    <table className={`commercial-map-entity-table is-${density}`}>
      <caption className="sr-only">Entidades do parque filtradas e sincronizadas com o mapa comercial 3D</caption>
      <thead>
        <tr>
          <th>Entidade</th>
          <th>Tipo</th>
          <th>Localização</th>
          <th>Situação</th>
          <th>Área oficial</th>
          <th>Verificação</th>
          <th>Empresa / ocupante</th>
          <th><span className="sr-only">Ações</span></th>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 && (
          <tr className="commercial-map-table-empty-row">
            <td colSpan={8}>
              <div className="commercial-map-empty"><SearchX /><strong>Nenhuma entidade corresponde aos filtros</strong><span>Altere a busca ou limpe os filtros para voltar ao inventário completo.</span></div>
            </td>
          </tr>
        )}
        {items.map((item) => {
          const selected = item.entity.id === selectedEntityId;
          return (
            <tr
              key={item.entity.id}
              data-entity-id={item.entity.id}
              className={selected ? 'is-selected' : ''}
              aria-selected={selected}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('button, a, [role="menuitem"]')) return;
                onOpen(item.entity.id);
              }}
            >
              <td data-label="Entidade">
                <div className="commercial-map-table-identity">
                  <span className="commercial-map-entity-type-mark" aria-hidden="true">{classificationInitial(item.entity.classification)}</span>
                  <span><strong>{item.metadata.officialDisplayName}</strong><small>{item.entity.publicIdentifier}</small></span>
                </div>
              </td>
              <td data-label="Tipo"><span className="commercial-map-table-type">{CLASSIFICATION_LABELS[item.entity.classification]}</span></td>
              <td data-label="Localização">
                <span className="commercial-map-table-primary">{item.locationLabel ?? 'Não informada'}</span>
                {item.locationDetail && <small>{item.locationDetail}</small>}
              </td>
              <td data-label="Situação"><EntityStatusBadge item={item} /></td>
              <td data-label="Área oficial">
                {item.lot?.officialAreaSqm
                  ? <span className="commercial-map-table-primary">{number.format(item.lot.officialAreaSqm)} m²</span>
                  : <span className="commercial-map-table-muted">Não validada</span>}
              </td>
              <td data-label="Verificação"><VerificationBadge status={item.entity.verificationStatus} /></td>
              <td data-label="Empresa / ocupante">
                <span className={item.companyLabel ? 'commercial-map-table-primary' : 'commercial-map-table-muted'}>{item.companyLabel ?? 'Sem vínculo ativo'}</span>
                {item.lot?.activeContractNumber && <small>Contrato {item.lot.activeContractNumber}</small>}
              </td>
              <td data-label="Ações">
                <div className="commercial-map-table-actions">
                  <Button size="sm" variant="ghost" onClick={() => onOpen(item.entity.id)}>Ver no mapa<ChevronRight className="h-4 w-4" /></Button>
                  {item.lot && permissions.canManageLots && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" aria-label={`Mais ações para ${item.metadata.officialDisplayName}`}><MoreHorizontal /></button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => onOpen(item.entity.id)}><Eye />Abrir detalhes no mapa</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onEdit(item.lot!)}><PencilLine />Editar cadastro do lote</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
});

export const MapListView = memo(function MapListView({ explorer, permissions }: { explorer: MapEntityFilterResult; permissions: MapPermissions }) {
  const selectedEntityId = useCommercialMapStore((state) => state.selectedEntityId);
  const selectEntityFromExplorer = useCommercialMapStore((state) => state.selectEntityFromExplorer);
  const setWorkspaceMode = useCommercialMapStore((state) => state.setWorkspaceMode);
  const tableDensity = useCommercialMapStore((state) => state.tableDensity);
  const [editingLot, setEditingLot] = useState<CommercialLot | null>(null);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!selectedEntityId) return;
    const selectedRow = tableWrapRef.current?.querySelector<HTMLElement>(`[data-entity-id="${CSS.escape(selectedEntityId)}"]`);
    selectedRow?.scrollIntoView({ block: 'nearest' });
  }, [explorer.items, selectedEntityId]);

  const handleOpen = useCallback((entityId: string) => selectEntityFromExplorer(entityId), [selectEntityFromExplorer]);
  const handleEdit = useCallback((lot: CommercialLot) => setEditingLot(lot), []);

  return (
    <div className="commercial-map-list-view">
      <div className="commercial-map-list-heading">
        <div>
          <span>Alternativa acessível ao mapa 3D</span>
          <h2>Entidades do parque</h2>
          <p>Pesquise, compare e abra qualquer registro preservando o contexto da cena.</p>
        </div>
        <Button variant="outline" onClick={() => setWorkspaceMode('3d')}><Layers3 className="h-4 w-4" />Voltar ao mapa</Button>
      </div>

      <ExplorerControls explorer={explorer} variant="table" onEscape={() => setWorkspaceMode('3d')} />

      <div className="commercial-map-table-wrap" ref={tableWrapRef}>
        <EntityTable
          items={explorer.items}
          selectedEntityId={selectedEntityId}
          density={tableDensity}
          permissions={permissions}
          onOpen={handleOpen}
          onEdit={handleEdit}
        />
      </div>

      {editingLot && <LotEditDialog lot={editingLot} open onClose={() => setEditingLot(null)} />}
    </div>
  );
});
