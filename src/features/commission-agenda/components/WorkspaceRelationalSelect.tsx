import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface WorkspaceRelationOption {
  id: string;
  label: string;
  description?: string | null;
  leading?: ReactNode;
}

interface WorkspaceRelationalSelectProps {
  label: string;
  description?: string;
  options: WorkspaceRelationOption[];
  value: string[];
  onToggle: (id: string) => void;
  lockedIds?: string[];
  primaryId?: string;
  lockedLabel?: string;
  emptyLabel: string;
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

/** Workspace-only presentation: selections are matched by ID and keep their input order. */
export function WorkspaceRelationalSelect({ label, description, options, value, onToggle, lockedIds = [], primaryId, lockedLabel = 'Obrigatória', emptyLabel }: WorkspaceRelationalSelectProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const byId = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
  const selected = value.map((selectionId) => byId.get(selectionId)).filter((option): option is WorkspaceRelationOption => Boolean(option));
  const normalizedSearch = normalize(search.trim());
  const matching = options.filter((option) => normalize(`${option.label} ${option.description ?? ''}`).includes(normalizedSearch));
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  return (
    <div className="ua-relation" data-open={open} onKeyDown={handleKeyDown}>
      <div className="ua-relation__heading">
        <span id={`${id}-label`} className="ua-field__label ws-meta">{label}</span>
        <span className="ua-relation__count ws-caption" aria-live="polite">{value.length} {value.length === 1 ? 'selecionado' : 'selecionados'}</span>
      </div>
      {description && <p id={`${id}-description`} className="ua-field__hint ws-caption">{description}</p>}
      <button
        ref={triggerRef}
        type="button"
        className="ua-relation__trigger ws-focus"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        aria-labelledby={`${id}-label ${id}-trigger-label`}
        aria-describedby={description ? `${id}-description` : undefined}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
        }}
      >
        <Search aria-hidden="true" />
        <span id={`${id}-trigger-label`}>{open ? 'Concluir seleção' : 'Buscar e selecionar'}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div id={`${id}-panel`} className="ua-relation__panel">
          <label htmlFor={`${id}-search`} className="ua-field__label ws-caption">Buscar em {label.toLocaleLowerCase('pt-BR')}</label>
          <div className="ua-relation__search ua-field">
            <Search aria-hidden="true" />
            <input
              ref={searchRef}
              id={`${id}-search`}
              type="search"
              value={search}
              placeholder="Digite um nome…"
              autoComplete="off"
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  listRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();
                }
                // Searching must never submit the event form.
                if (event.key === 'Enter') event.preventDefault();
              }}
            />
          </div>
          <p className="ua-relation__results ws-caption" role="status">{matching.length} {matching.length === 1 ? 'resultado' : 'resultados'}</p>
          <div ref={listRef} className="ua-relation__options" role="group" aria-labelledby={`${id}-label`}>
            {matching.length === 0 && <p className="ua-relation__no-results ws-meta-secondary">Nenhum resultado. Tente outro nome.</p>}
            {matching.map((option) => {
              const isSelected = value.includes(option.id);
              const locked = lockedIds.includes(option.id);
              return (
                <label key={option.id} className="ua-relation__option" data-selected={isSelected}>
                  <input type="checkbox" checked={isSelected} disabled={locked} onChange={() => onToggle(option.id)} onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onToggle(option.id);
                    }
                  }} />
                  {option.leading && <span className="ua-relation__leading" aria-hidden="true">{option.leading}</span>}
                  <span className="ua-relation__option-copy">
                    <span className="ws-meta">{option.label}</span>
                    {(option.description || locked) && <span className="ws-caption">{locked ? lockedLabel : option.description}</span>}
                  </span>
                  {isSelected && <Check className="ua-relation__check" aria-hidden="true" />}
                </label>
              );
            })}
          </div>
        </div>
      )}
      {selected.length === 0 ? (
        <p className="ua-relation__empty ws-caption">{emptyLabel}</p>
      ) : (
        <div className="ua-relation__selection">
          <span className="ws-caption ua-relation__selected-label">Selecionados</span>
          <ul ref={selectedRef} aria-label={`${label} selecionados`}>
            {selected.map((option) => {
              const locked = lockedIds.includes(option.id);
              return (
                <li key={option.id} className="ua-relation__selected" data-primary={option.id === primaryId}>
                  {option.leading && <span className="ua-relation__leading" aria-hidden="true">{option.leading}</span>}
                  <span className="ua-relation__option-copy">
                    <span className="ws-meta">{option.label}</span>
                    <span className="ws-caption">{option.id === primaryId ? `Principal${option.description && !/^(principal|responsável principal)$/i.test(option.description) ? ` · ${option.description}` : ''}` : locked ? lockedLabel : option.description}</span>
                  </span>
                  {locked ? <span className="ua-relation__locked ws-caption">Obrigatória</span> : (
                    <button type="button" className="ua-relation__remove ws-focus" aria-label={`Remover ${option.label}`} onClick={(event) => {
                      const buttons = Array.from(selectedRef.current?.querySelectorAll<HTMLButtonElement>('.ua-relation__remove') ?? []);
                      const index = buttons.indexOf(event.currentTarget);
                      onToggle(option.id);
                      requestAnimationFrame(() => {
                        const remaining = selectedRef.current?.querySelectorAll<HTMLButtonElement>('.ua-relation__remove');
                        (remaining?.[Math.min(index, remaining.length - 1)] ?? triggerRef.current)?.focus({ preventScroll: true });
                      });
                    }}><X aria-hidden="true" /></button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
