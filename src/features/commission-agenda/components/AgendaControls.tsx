import { useEffect, useRef, useId, type ReactNode } from 'react';
import { CalendarDays, ListTree, Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgendaMonthFilter, AgendaStatusFilter, AgendaViewMode } from '../types';
import { AGENDA_STATUS_FILTER_LABELS, MONTH_LONG_LABELS, MONTH_SHORT_LABELS } from '../lib/agenda-presentation';

/* ─────────────────────────────── Busca ───────────────────────────────────── */

export interface AgendaSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function AgendaSearch({ value, onChange, placeholder = 'Buscar evento, pessoa, local…', className }: AgendaSearchProps) {
  const id = useId();
  return (
    <div className={cn('ua-search', className)}>
      <Search aria-hidden="true" />
      <label htmlFor={id} className="ua-search__label"><span className="ua-search__label-full">Buscar na agenda</span><span className="ua-search__label-short">Buscar</span></label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="search"
      />
      {value && (
        <button type="button" className="ua-search__clear ws-focus" onClick={() => onChange('')} aria-label="Limpar busca">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/* ───────────────────────────── Filtros ───────────────────────────────────── */

export interface AgendaFilterButtonProps {
  activeCount: number;
  onClick: () => void;
  className?: string;
}

export function AgendaFilterButton({ activeCount, onClick, className }: AgendaFilterButtonProps) {
  return (
    <button
      type="button"
      className={cn('ua-control ws-focus', className)}
      data-active={activeCount > 0 || undefined}
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={activeCount > 0 ? `Filtros, ${activeCount} ativos` : 'Filtros'}
    >
      <SlidersHorizontal aria-hidden="true" />
      <span>Filtros</span>
      {activeCount > 0 && <span className="ua-control__count" aria-hidden="true">{activeCount}</span>}
    </button>
  );
}

/* ───────────────────────── Modo de visualização ──────────────────────────── */

export interface AgendaViewToggleProps {
  value: AgendaViewMode;
  onChange: (value: AgendaViewMode) => void;
  className?: string;
}

export function AgendaViewToggle({ value, onChange, className }: AgendaViewToggleProps) {
  return (
    <div className={cn('ua-segmented ua-segmented--compact', className)} role="group" aria-label="Modo de visualização">
      <button type="button" className="ua-segmented__item ws-focus" aria-pressed={value === 'timeline'} onClick={() => onChange('timeline')} aria-label="Linha do tempo" title="Linha do tempo">
        <ListTree aria-hidden="true" />
        <span>Linha do tempo</span>
      </button>
      <button type="button" className="ua-segmented__item ws-focus" aria-pressed={value === 'calendar'} onClick={() => onChange('calendar')} aria-label="Calendário" title="Calendário">
        <CalendarDays aria-hidden="true" />
        <span>Calendário</span>
      </button>
    </div>
  );
}

/* ───────────────────────────── Toolbar ───────────────────────────────────── */

export interface AgendaToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  activeFilters: number;
  onOpenFilters: () => void;
  view: AgendaViewMode;
  onViewChange: (value: AgendaViewMode) => void;
  periodControls?: ReactNode;
  statusControl?: ReactNode;
  className?: string;
}

export function AgendaToolbar({ search, onSearchChange, activeFilters, onOpenFilters, view, onViewChange, periodControls, statusControl, className }: AgendaToolbarProps) {
  return (
    <div className={cn('ua-toolbar', className)} role="search">
      <AgendaSearch value={search} onChange={onSearchChange} />
      {periodControls && <div className="ua-toolbar__period">{periodControls}</div>}
      {statusControl && <div className="ua-toolbar__status">{statusControl}</div>}
      <div className="ua-toolbar__controls">
        <AgendaFilterButton activeCount={activeFilters} onClick={onOpenFilters} className="flex-1 md:flex-none" />
        <AgendaViewToggle value={view} onChange={onViewChange} />
      </div>
    </div>
  );
}

/* ─────────────────────────────── Anos ────────────────────────────────────── */

export interface AgendaYearSelectorProps {
  years: number[];
  value: number;
  currentYear: number;
  onChange: (year: number) => void;
  compact?: boolean;
  className?: string;
}

export function AgendaYearSelector({ years, value, currentYear, onChange, compact = false, className }: AgendaYearSelectorProps) {
  const selectId = useId();
  if (compact) {
    return (
      <label htmlFor={selectId} className={cn('ua-period-field', className)}>
        <span>Ano</span>
        <select id={selectId} value={value} onChange={(event) => onChange(Number(event.target.value))}>
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      </label>
    );
  }
  return (
    <div className={cn('ua-years', className)} role="group" aria-label="Ano">
      {years.map((year) => (
        <button
          key={year}
          type="button"
          className="ua-year ws-focus"
          aria-pressed={year === value}
          data-current={year === currentYear || undefined}
          onClick={() => onChange(year)}
        >
          {year}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────── Meses ───────────────────────────────────── */

export interface AgendaMonthSelectorProps {
  value: AgendaMonthFilter;
  onChange: (month: AgendaMonthFilter) => void;
  counts?: Record<number, number>;
  /** 1–12 month considered "current" for the selected year, if any. */
  currentMonth?: number | null;
  totalCount?: number;
  compact?: boolean;
  className?: string;
}

export function AgendaMonthSelector({ value, onChange, counts = {}, currentMonth = null, totalCount, compact = false, className }: AgendaMonthSelectorProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const selectId = useId();

  useEffect(() => {
    const rail = railRef.current;
    const active = rail?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!rail || !active) return;
    const left = active.offsetLeft - 16;
    const right = active.offsetLeft + active.offsetWidth + 16;
    if (left < rail.scrollLeft || right > rail.scrollLeft + rail.clientWidth) {
      rail.scrollTo({ left: Math.max(0, left - 8), behavior: 'smooth' });
    }
  }, [value]);

  if (compact) {
    return (
      <label htmlFor={selectId} className={cn('ua-period-field ua-period-field--month', className)}>
        <span>Período</span>
        <select id={selectId} value={value} onChange={(event) => onChange(event.target.value === 'all' ? 'all' : Number(event.target.value))}>
          <option value="all">Todos os meses{typeof totalCount === 'number' ? ` (${totalCount})` : ''}</option>
          {MONTH_LONG_LABELS.map((label, index) => (
            <option key={label} value={index + 1}>{label}{counts[index + 1] ? ` (${counts[index + 1]})` : ''}</option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className={cn('ua-months', className)}>
      <div ref={railRef} className="ua-months__rail" role="group" aria-label="Mês">
        <button type="button" className="ua-month ws-focus" aria-pressed={value === 'all'} onClick={() => onChange('all')}>
          TODOS
          {typeof totalCount === 'number' && <span className="ua-month__count">{totalCount}</span>}
        </button>
        {MONTH_SHORT_LABELS.map((label, index) => {
          const month = index + 1;
          const count = counts[month] ?? 0;
          return (
            <button
              key={label}
              type="button"
              className="ua-month ws-focus"
              aria-pressed={value === month}
              data-current={month === currentMonth || undefined}
              data-empty={count === 0 || undefined}
              onClick={() => onChange(month)}
              aria-label={`${label}${count > 0 ? `, ${count} eventos` : ''}`}
            >
              {label}
              {count > 0 && <span className="ua-month__count">{count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────── Status (abas) ───────────────────────────────── */

export interface AgendaStatusTabsProps {
  value: AgendaStatusFilter;
  onChange: (value: AgendaStatusFilter) => void;
  counts?: Partial<Record<AgendaStatusFilter, number>>;
  className?: string;
}

const STATUS_ORDER: AgendaStatusFilter[] = ['all', 'upcoming', 'today', 'completed'];

export function AgendaStatusTabs({ value, onChange, counts = {}, className }: AgendaStatusTabsProps) {
  const selectId = useId();
  return (
    <div className={cn('ua-status-tabs', className)} role="group" aria-label="Situação dos eventos">
      <label htmlFor={selectId} className="ua-status-select">
        <span>Mostrar eventos</span>
        <select id={selectId} value={value} onChange={(event) => onChange(event.target.value as AgendaStatusFilter)}>
          {STATUS_ORDER.map((status) => <option key={status} value={status}>{AGENDA_STATUS_FILTER_LABELS[status]}{typeof counts[status] === 'number' ? ` (${counts[status]})` : ''}</option>)}
        </select>
      </label>
    </div>
  );
}
