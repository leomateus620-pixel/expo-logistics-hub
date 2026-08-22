import { useEffect, useId, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import {
  LocateFixed,
  Minus,
  Plus,
  RotateCcw,
  Search,
} from 'lucide-react';
import type { OrgGraphFilter, OrgSearchResult } from '../hooks/useOrgGraphInteraction';

interface OrgSearchProps {
  query: string;
  results: OrgSearchResult[];
  onQueryChange: (value: string) => void;
  onResultSelect: (result: OrgSearchResult) => void;
}

interface OrgFilterBarProps {
  filter: OrgGraphFilter;
  onFilterChange: (filter: OrgGraphFilter) => void;
}

interface OrgViewportControlsProps {
  scale: number;
  selected: boolean;
  onFit: () => void;
  onFocusSelected: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

const FILTERS: Array<{ id: OrgGraphFilter; label: string; shortLabel: string }> = [
  { id: 'all', label: 'Todo o ecossistema', shortLabel: 'Todos' },
  { id: 'ccp', label: 'CCP', shortLabel: 'CCP' },
  { id: 'executive', label: 'Presidência', shortLabel: 'Presidência' },
  { id: 'central-commission', label: 'Comissão Central', shortLabel: 'Central' },
  { id: 'commission', label: 'Comissões', shortLabel: 'Comissões' },
  { id: 'advisory', label: 'Assessorias', shortLabel: 'Assessorias' },
];

export function OrgSearch({
  query,
  results,
  onQueryChange,
  onResultSelect,
}: OrgSearchProps) {
  const listId = useId();
  const expanded = query.trim().length >= 2 && results.length > 0;
  const [activeIndex, setActiveIndex] = useState(-1);
  const boundedActiveIndex = expanded
    ? Math.min(Math.max(activeIndex, 0), results.length - 1)
    : -1;
  const activeOptionId = boundedActiveIndex >= 0
    ? `${listId}-option-${boundedActiveIndex}`
    : undefined;

  useEffect(() => {
    setActiveIndex(results.length > 0 ? 0 : -1);
  }, [query, results.length]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setActiveIndex(0);
    onQueryChange(event.target.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && query) {
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex(-1);
      onQueryChange('');
      return;
    }

    if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault();
      setActiveIndex((current) => current < 0 ? 0 : (current + 1) % results.length);
      return;
    }

    if (event.key === 'ArrowUp' && results.length > 0) {
      event.preventDefault();
      setActiveIndex((current) => current <= 0 ? results.length - 1 : current - 1);
      return;
    }

    const activeResult = boundedActiveIndex >= 0 ? results[boundedActiveIndex] : null;
    if (event.key === 'Enter' && activeResult) {
      event.preventDefault();
      onResultSelect(activeResult);
    }
  };

  return (
    <div className="org-search" data-org-interactive>
      <label className="org-search__field">
        <span className="sr-only">Buscar pessoa, comissão ou assessoria</span>
        <Search aria-hidden="true" />
        <input
          type="search"
          value={query}
          placeholder="Buscar pessoa ou área"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={expanded}
          aria-haspopup="listbox"
          aria-activedescendant={activeOptionId}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        <kbd aria-hidden="true">↵</kbd>
      </label>

      {expanded && (
        <div id={listId} className="org-search__results" role="listbox">
          {results.map((result, index) => {
            const active = index === boundedActiveIndex;
            return (
            <button
              key={result.id}
              id={`${listId}-option-${index}`}
              type="button"
              role="option"
              className={active ? 'org-search__result--active' : undefined}
              aria-selected={active}
              onClick={() => {
                setActiveIndex(index);
                onResultSelect(result);
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span>{result.label}</span>
              <small>{result.meta}</small>
            </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function OrgFilterBar({ filter, onFilterChange }: OrgFilterBarProps) {
  return (
    <nav className="org-filters" aria-label="Filtrar níveis organizacionais" data-org-interactive>
      {FILTERS.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-label={item.label}
          aria-pressed={filter === item.id}
          onClick={() => onFilterChange(item.id)}
        >
          <span className="org-filters__long">{item.label}</span>
          <span className="org-filters__short">{item.shortLabel}</span>
        </button>
      ))}
    </nav>
  );
}

export function OrgViewportControls({
  scale,
  selected,
  onFit,
  onFocusSelected,
  onZoomIn,
  onZoomOut,
}: OrgViewportControlsProps) {
  return (
    <div className="org-viewport-controls" data-org-interactive aria-label="Controles do mapa organizacional">
      <button type="button" onClick={onZoomOut} aria-label="Reduzir zoom">
        <Minus aria-hidden="true" />
      </button>
      <output aria-label={`Zoom em ${Math.round(scale * 100)} por cento`}>
        {Math.round(scale * 100)}%
      </output>
      <button type="button" onClick={onZoomIn} aria-label="Aumentar zoom">
        <Plus aria-hidden="true" />
      </button>
      <span className="org-viewport-controls__divider" aria-hidden="true" />
      <button type="button" onClick={onFit} aria-label="Enquadrar todo o ecossistema">
        <RotateCcw aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onFocusSelected}
        aria-label="Centralizar nó selecionado"
        disabled={!selected}
      >
        <LocateFixed aria-hidden="true" />
      </button>
    </div>
  );
}
