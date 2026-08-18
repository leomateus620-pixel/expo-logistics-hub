import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import {
  AlertCircle,
  Building2,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  Search,
  Star,
  UserRound,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { normalizeSearchTerm } from '@/lib/org-units';
import { useMobileOverlayHistory } from './mobile/useMobileOverlayHistory';
import { PersonAvatar } from './PersonAvatar';
import '@/styles/cronograma-registration-interactions.css';

const MAX_VISIBLE_OPTIONS = 120;

export interface RelationalOption {
  /** Stable identifier used as React key and equality check. */
  id: string;
  /** Human label shown in the selected summary and result list. */
  label: string;
  /** Persisted auxiliary value. Keep visual-only metadata out of this field. */
  hint?: string;
  /** Optional group heading (e.g. "Comissões", "Assessorias"). */
  group?: string;
  /** Visual secondary line, such as type + institutional responsible or role. */
  description?: string;
  /** Visual tertiary context, such as organizational unit or user type. */
  context?: string;
  /** Additional normalized-search source that is never persisted. */
  searchText?: string;
}

export interface RelationalSelection {
  id: string;
  label: string;
  hint?: string;
  isPrimary?: boolean;
}

interface RelationalMultiSelectProps {
  label: string;
  description?: string;
  placeholder?: string;
  emptyLabel?: string;
  triggerLabel?: string;
  selectedTriggerLabel?: string;
  options: RelationalOption[];
  value: RelationalSelection[];
  onChange: (next: RelationalSelection[]) => void;
  /** Whether exactly one entry can be marked as `isPrimary`. Defaults to true. */
  singlePrimary?: boolean;
  /** Allow typing a free-text value (external responsible names). */
  allowCustom?: boolean;
  disabled?: boolean;
  isLoading?: boolean;
  errorMessage?: string | null;
  primaryLabel?: string;
  id?: string;
  presentation?: 'desktop' | 'mobile';
  variant?: 'organization' | 'person';
}

function initialsFor(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const initials = words.length === 1
    ? words[0].slice(0, 2)
    : `${words[0][0]}${words[words.length - 1][0]}`;
  return initials.toLocaleUpperCase('pt-BR');
}

function optionSearchValue(option: RelationalOption): string {
  return normalizeSearchTerm([
    option.label,
    option.hint,
    option.group,
    option.description,
    option.context,
    option.searchText,
  ].filter(Boolean).join(' '));
}

export function RelationalMultiSelect({
  label,
  description,
  placeholder = 'Buscar…',
  emptyLabel = 'Nenhum vínculo selecionado.',
  triggerLabel = 'Selecionar vínculo',
  selectedTriggerLabel = 'Adicionar ou alterar vínculos',
  options,
  value,
  onChange,
  singlePrimary = true,
  allowCustom = false,
  disabled = false,
  isLoading = false,
  errorMessage,
  primaryLabel = 'Principal',
  id,
  presentation = 'desktop',
  variant = 'person',
}: RelationalMultiSelectProps) {
  const generatedId = useId().replace(/:/g, '');
  const fieldId = id ?? `cronograma-relation-${generatedId}`;
  const labelId = `${fieldId}-label`;
  const descriptionId = `${fieldId}-description`;
  const listboxId = `${fieldId}-listbox`;
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [listNode, setListNode] = useState<HTMLDivElement | null>(null);
  const setListRef = useCallback((node: HTMLDivElement | null) => {
    listRef.current = node;
    setListNode(node);
  }, []);
  /** Set only by keyboard navigation so scrollIntoView never fires on mouse selection. */
  const keyboardNavRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [announcement, setAnnouncement] = useState('');
  const [sheetStyle, setSheetStyle] = useState<CSSProperties>();
  const isMobile = presentation === 'mobile';

  const normalizedSearch = normalizeSearchTerm(search);
  const selectedById = useMemo(() => new Map(value.map((item) => [item.id, item])), [value]);
  const selectedByName = useMemo(
    () => new Map(value.map((item) => [normalizeSearchTerm(item.label), item])),
    [value],
  );
  const optionById = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
  const optionByName = useMemo(
    () => new Map(options.map((option) => [normalizeSearchTerm(option.label), option])),
    [options],
  );

  const matchingOptions = useMemo(() => options.filter((option) => {
    if (!normalizedSearch) return true;
    const haystack = optionSearchValue(option);
    return normalizedSearch.split(' ').every((token) => haystack.includes(token));
  }), [normalizedSearch, options]);

  const visibleOptions = useMemo(
    () => matchingOptions.slice(0, MAX_VISIBLE_OPTIONS),
    [matchingOptions],
  );
  const groupedOptions = useMemo(() => {
    const buckets = new Map<string, RelationalOption[]>();
    visibleOptions.forEach((option) => {
      const group = option.group ?? '';
      const bucket = buckets.get(group);
      if (bucket) bucket.push(option);
      else buckets.set(group, [option]);
    });
    return Array.from(buckets, ([group, items]) => ({ group, items }));
  }, [visibleOptions]);
  const navigableOptions = useMemo(
    () => groupedOptions.flatMap(({ items }) => items),
    [groupedOptions],
  );

  /** Distinct group labels across ALL options (drives the bulk-action bar). */
  const bulkGroups = useMemo(
    () => Array.from(new Set(options.map((option) => option.group).filter(Boolean) as string[])),
    [options],
  );
  const showBulkBar = bulkGroups.length > 1 && !isLoading && !errorMessage;

  const normalizedCustomLabel = normalizeSearchTerm(search.trim());
  const canAddCustom = allowCustom
    && search.trim().length >= 2
    && Boolean(normalizedCustomLabel)
    && !options.some((option) => normalizeSearchTerm(option.label) === normalizedCustomLabel)
    && !value.some((item) => normalizeSearchTerm(item.label) === normalizedCustomLabel);
  const navigableCount = navigableOptions.length + (canAddCustom ? 1 : 0);

  const findSelectionForOption = (option: RelationalOption) => (
    selectedById.get(option.id) ?? selectedByName.get(normalizeSearchTerm(option.label))
  );

  const closeSelector = () => {
    setOpen(false);
    setSearch('');
    setActiveIndex(-1);
  };

  const mobileHistory = useMobileOverlayHistory({
    open: isMobile && open,
    dirty: false,
    onClose: closeSelector,
    onDirtyClose: closeSelector,
  });

  const requestClose = () => {
    if (isMobile) {
      mobileHistory.requestClose();
      return;
    }
    closeSelector();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setOpen(true);
      setActiveIndex(navigableCount > 0 ? 0 : -1);
      return;
    }
    requestClose();
  };

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [open, presentation]);

  /** Every new query starts the result list from the top. */
  useEffect(() => {
    if (!open) return;
    if (listNode) listNode.scrollTop = 0;
  }, [normalizedSearch, open, listNode]);

  useEffect(() => {
    setActiveIndex((current) => {
      if (navigableCount === 0) return -1;
      if (current < 0) return 0;
      return Math.min(current, navigableCount - 1);
    });
  }, [navigableCount]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    if (!keyboardNavRef.current) return;
    keyboardNavRef.current = false;
    const activeOption = listRef.current?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`);
    activeOption?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  /**
   * Wheel over the option cards scrolls the list itself. React (and Radix)
   * attach wheel listeners passively, so the handler must be native and
   * non-passive to keep the page behind from stealing the gesture.
   * While scrolling, the card under the pointer stays highlighted.
   */
  useEffect(() => {
    const list = listNode;
    if (!open || !list) return;

    const handleWheel = (wheelEvent: WheelEvent) => {
      const maxScroll = list.scrollHeight - list.clientHeight;
      if (maxScroll <= 0) return;
      const unit = wheelEvent.deltaMode === 1 ? 16 : wheelEvent.deltaMode === 2 ? list.clientHeight : 1;
      const next = Math.min(maxScroll, Math.max(0, list.scrollTop + wheelEvent.deltaY * unit));
      if (next === list.scrollTop) return;
      wheelEvent.preventDefault();
      wheelEvent.stopPropagation();
      list.scrollTop = next;
      const under = document
        .elementFromPoint(wheelEvent.clientX, wheelEvent.clientY)
        ?.closest<HTMLElement>('[data-option-index]');
      const index = under?.dataset.optionIndex;
      if (index != null) setActiveIndex(Number(index));
    };

    list.addEventListener('wheel', handleWheel, { passive: false });
    return () => list.removeEventListener('wheel', handleWheel);
  }, [open, listNode]);



  useEffect(() => {
    if (!isMobile || !open) {
      setSheetStyle(undefined);
      return;
    }

    const visualViewport = window.visualViewport;
    let frame = 0;
    const updateViewport = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const height = Math.round(visualViewport?.height ?? window.innerHeight);
        const offsetTop = Math.round(visualViewport?.offsetTop ?? 0);
        const bottom = Math.max(0, window.innerHeight - (offsetTop + height));
        setSheetStyle({
          height: `${Math.min(704, Math.max(280, height - 8))}px`,
          bottom: `${bottom}px`,
        });
      });
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    visualViewport?.addEventListener('resize', updateViewport);
    visualViewport?.addEventListener('scroll', updateViewport);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
      visualViewport?.removeEventListener('resize', updateViewport);
      visualViewport?.removeEventListener('scroll', updateViewport);
    };
  }, [isMobile, open]);

  const removeAt = (selectionId: string) => {
    const removed = value.find((item) => item.id === selectionId);
    const filtered = value.filter((item) => item.id !== selectionId);
    if (singlePrimary && filtered.length > 0 && !filtered.some((item) => item.isPrimary)) {
      filtered[0] = { ...filtered[0], isPrimary: true };
    }
    onChange(filtered);
    if (removed) setAnnouncement(`${removed.label} removido da seleção.`);
  };

  const addOption = (option: RelationalOption) => {
    const existing = findSelectionForOption(option);
    if (existing) {
      removeAt(existing.id);
      return;
    }
    const alreadyPrimary = value.some((item) => item.isPrimary);
    onChange([
      ...value,
      {
        id: option.id,
        label: option.label,
        hint: option.hint,
        isPrimary: !alreadyPrimary,
      },
    ]);
    setAnnouncement(`${option.label} adicionado à seleção.`);
    // Keep search text and active index untouched so the list never jumps
    // back to the top while the user selects multiple entries.
  };

  /** Select every option in the given scope, skipping ones already selected. */
  const addMany = (items: RelationalOption[], scopeLabel: string) => {
    const next = [...value];
    let added = 0;
    items.forEach((option) => {
      const alreadySelected = next.some(
        (item) => item.id === option.id || normalizeSearchTerm(item.label) === normalizeSearchTerm(option.label),
      );
      if (alreadySelected) return;
      next.push({
        id: option.id,
        label: option.label,
        hint: option.hint,
        isPrimary: !next.some((item) => item.isPrimary),
      });
      added += 1;
    });
    if (added === 0) {
      setAnnouncement(`Todos os itens de ${scopeLabel} já estavam selecionados.`);
      return;
    }
    onChange(next);
    setAnnouncement(`${added} ${added === 1 ? 'item adicionado' : 'itens adicionados'} de ${scopeLabel}.`);
  };

  const clearAll = () => {
    if (value.length === 0) return;
    onChange([]);
    setAnnouncement('Seleção limpa.');
  };

  const addCustom = () => {
    const term = search.trim();
    if (!term || !canAddCustom) return;
    const alreadyPrimary = value.some((item) => item.isPrimary);
    onChange([
      ...value,
      {
        id: `custom:${normalizedCustomLabel}`,
        label: term,
        isPrimary: !alreadyPrimary,
      },
    ]);
    setAnnouncement(`${term} adicionado como responsável externo.`);
    setSearch('');
    setActiveIndex(options.length > 0 ? 0 : -1);
  };

  const togglePrimary = (selectionId: string) => {
    const selected = value.find((item) => item.id === selectionId);
    if (!selected) return;
    if (singlePrimary) {
      onChange(value.map((item) => ({ ...item, isPrimary: item.id === selectionId })));
    } else {
      onChange(value.map((item) => (
        item.id === selectionId ? { ...item, isPrimary: !item.isPrimary } : item
      )));
    }
    setAnnouncement(`${selected.label} definido como ${primaryLabel.toLocaleLowerCase('pt-BR')}.`);
  };

  const activateIndex = (index: number) => {
    if (index < navigableOptions.length) {
      addOption(navigableOptions[index]);
      return;
    }
    if (canAddCustom) addCustom();
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      requestClose();
      return;
    }
    if (navigableCount === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      keyboardNavRef.current = true;
      setActiveIndex((current) => (current + 1 + navigableCount) % navigableCount);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      keyboardNavRef.current = true;
      setActiveIndex((current) => (current - 1 + navigableCount) % navigableCount);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      keyboardNavRef.current = true;
      setActiveIndex(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      keyboardNavRef.current = true;
      setActiveIndex(navigableCount - 1);
      return;
    }
    if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      activateIndex(activeIndex);
    }
  };

  const activeDescendant = activeIndex < 0
    ? undefined
    : activeIndex < navigableOptions.length
      ? `${fieldId}-option-${activeIndex}`
      : `${fieldId}-custom-option`;

  const trigger = (
    <button
      id={`${fieldId}-trigger`}
      type="button"
      disabled={disabled}
      className="cronograma-relation-trigger focus-ring"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listboxId : undefined}
      aria-labelledby={`${labelId} ${fieldId}-trigger-label`}
    >
      <span className="cronograma-relation-trigger__icon" aria-hidden="true">
        {variant === 'organization' ? <Building2 /> : <UserRound />}
      </span>
      <span id={`${fieldId}-trigger-label`} className="cronograma-relation-trigger__copy">
        <strong>{value.length > 0 ? selectedTriggerLabel : triggerLabel}</strong>
        {value.length > 0 && (
          <small>{value.length} {value.length === 1 ? 'selecionado' : 'selecionados'}</small>
        )}
      </span>
      <ChevronDown className="cronograma-relation-trigger__chevron" aria-hidden="true" />
    </button>
  );

  const selectorPanel = (
    <div className="cronograma-relation-panel">
      {showBulkBar && (
        <div className="cronograma-relation-bulk" role="group" aria-label="Seleção rápida">
          <button type="button" onClick={() => addMany(options, 'todos os grupos')}>
            Tudo
          </button>
          {bulkGroups.map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => addMany(options.filter((option) => option.group === group), group)}
            >
              {group}
            </button>
          ))}
          <button type="button" data-tone="danger" onClick={clearAll} disabled={value.length === 0}>
            Limpar
          </button>
        </div>
      )}
      <div className="cronograma-relation-search">
        <Search aria-hidden="true" />
        <input
          ref={searchRef}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleSearchKeyDown}
          placeholder={placeholder}
          role="combobox"
          aria-label={placeholder}
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
        />
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setActiveIndex(0);
              searchRef.current?.focus();
            }}
            aria-label="Limpar busca"
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="cronograma-relation-results-summary" aria-live="polite">
        <span>
          {isLoading
            ? 'Carregando opções…'
            : `${matchingOptions.length} ${matchingOptions.length === 1 ? 'resultado' : 'resultados'}`}
        </span>
      </div>

      <div
        ref={setListRef}
        id={listboxId}
        className="cronograma-relation-results"
        role="listbox"
        aria-label={label}
        aria-multiselectable="true"
      >
        {isLoading && (
          <div className="cronograma-relation-state" role="status">
            <Loader2 className="cronograma-relation-state__spinner" aria-hidden="true" />
            <strong>Carregando opções…</strong>
          </div>
        )}

        {!isLoading && errorMessage && (
          <div
            className={`cronograma-relation-state is-error${matchingOptions.length > 0 || canAddCustom ? ' has-results' : ''}`}
            role="alert"
          >
            <AlertCircle aria-hidden="true" />
            <strong>
              {matchingOptions.length > 0 || canAddCustom
                ? 'Parte do registro pode estar indisponível'
                : 'Não foi possível carregar as opções'}
            </strong>
            <span>{errorMessage}</span>
          </div>
        )}

        {!isLoading && matchingOptions.length === 0 && !canAddCustom && !errorMessage && (
          <div className="cronograma-relation-state">
            <Search aria-hidden="true" />
            <strong>Nenhum resultado encontrado para esta busca.</strong>
          </div>
        )}

        {!isLoading && groupedOptions.map(({ group, items }) => {
          const groupId = `${fieldId}-group-${normalizeSearchTerm(group) || 'sem-grupo'}`;
          return (
            <div key={group || 'sem-grupo'} className="cronograma-relation-group" role="group" aria-labelledby={group ? groupId : undefined}>
              {group && <p id={groupId} className="cronograma-relation-group__label">{group}</p>}
              {items.map((option) => {
                const optionIndex = navigableOptions.indexOf(option);
                const selected = findSelectionForOption(option);
                return (
                  <button
                    key={option.id}
                    id={`${fieldId}-option-${optionIndex}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={Boolean(selected)}
                    data-selected={selected ? 'true' : undefined}
                    data-active={activeIndex === optionIndex ? 'true' : undefined}
                    data-option-index={optionIndex}
                    className="cronograma-relation-option"
                    onMouseMove={() => setActiveIndex(optionIndex)}
                    onClick={() => addOption(option)}
                  >
                    {variant === 'organization' ? (
                      <span className="cronograma-relation-option__identity" aria-hidden="true">
                        <Building2 />
                      </span>
                    ) : (
                      <PersonAvatar
                        name={option.label}
                        size="md"
                        className="cronograma-relation-option__identity"
                        fallback={(
                          <span className="cronograma-relation-option__identity" aria-hidden="true">
                            {initialsFor(option.label)}
                          </span>
                        )}
                      />
                    )}
                    <span className="cronograma-relation-option__copy">
                      <strong title={option.label}>{option.label}</strong>
                      {(option.description || option.hint) && (
                        <span>{option.description ?? option.hint}</span>
                      )}
                      {option.context && <small>{option.context}</small>}
                    </span>
                    <span className="cronograma-relation-option__check" aria-hidden="true">
                      <Check />
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}

        {!isLoading && matchingOptions.length > MAX_VISIBLE_OPTIONS && (
          <p className="cronograma-relation-limit">
            Exibindo os primeiros {MAX_VISIBLE_OPTIONS} resultados. Refine a busca para localizar outros registros.
          </p>
        )}

        {!isLoading && canAddCustom && (
          <button
            id={`${fieldId}-custom-option`}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected="false"
            data-active={activeIndex === navigableOptions.length ? 'true' : undefined}
            data-option-index={navigableOptions.length}
            className="cronograma-relation-option is-custom"
            onMouseMove={() => setActiveIndex(navigableOptions.length)}
            onClick={addCustom}
          >
            <span className="cronograma-relation-option__identity" aria-hidden="true"><Plus /></span>
            <span className="cronograma-relation-option__copy">
              <strong>Adicionar “{search.trim()}”</strong>
              <span>Responsável externo</span>
            </span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <section
      className="cronograma-relation-field"
      data-variant={variant}
      aria-labelledby={labelId}
      aria-describedby={description ? descriptionId : undefined}
    >
      <div className="cronograma-relation-field__heading">
        <div>
          <h4 id={labelId}>{label}</h4>
          {description && <p id={descriptionId}>{description}</p>}
        </div>
      </div>

      {isMobile ? (
        <Sheet open={open} onOpenChange={handleOpenChange}>
          <SheetTrigger asChild>{trigger}</SheetTrigger>
          <SheetContent
            side="bottom"
            style={sheetStyle}
            className="cronograma-relation-sheet"
            overlayClassName="cronograma-relation-sheet-overlay"
            closeLabel={`Fechar seleção de ${label.toLocaleLowerCase('pt-BR')}`}
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <SheetHeader className="cronograma-relation-sheet__header">
              <SheetTitle>{label}</SheetTitle>
              {description && <SheetDescription>{description}</SheetDescription>}
            </SheetHeader>
            {selectorPanel}
            <div className="cronograma-relation-sheet__footer">
              <button type="button" onClick={requestClose} className="cronograma-relation-done focus-ring">
                Concluir seleção
                {value.length > 0 && <span>{value.length}</span>}
              </button>
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>{trigger}</DialogTrigger>
          <DialogContent
            className="cronograma-relation-popover z-[95] gap-0 p-0"
            onOpenAutoFocus={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              requestClose();
            }}
          >
            <DialogHeader className="cronograma-relation-dialog__header">
              <DialogTitle>{label}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </DialogHeader>
            {selectorPanel}
            <div className="cronograma-relation-popover__footer">
              <span>{value.length > 0 ? `${value.length} selecionados` : 'Nenhum selecionado'}</span>
              <button type="button" onClick={requestClose}>Concluir</button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {value.length === 0 ? (
        <div className="cronograma-relation-empty">
          <span aria-hidden="true">{variant === 'organization' ? <Building2 /> : <UserRound />}</span>
          <p>{emptyLabel}</p>
        </div>
      ) : (
        <ul className="cronograma-relation-selected" aria-label={`${label} selecionados`} aria-live="polite">
          {value.map((item) => {
            const matchingOption = optionById.get(item.id) ?? optionByName.get(normalizeSearchTerm(item.label));
            const detail = matchingOption?.description ?? item.hint;
            const context = matchingOption?.context
              ?? ((item.id.startsWith('custom:') || item.id.startsWith('external:')) ? 'Responsável externo' : undefined);
            /** People: first/primary link is the "Responsável", the rest are guests. */
            const roleLabel = variant === 'organization'
              ? (item.isPrimary ? 'Área principal' : 'Área institucional')
              : (item.isPrimary ? 'Responsável' : 'Convidado');
            return (
              <li
                key={item.id}
                className="cronograma-relation-selected__item"
                data-primary={item.isPrimary || undefined}
                data-role={variant === 'person' && !item.isPrimary ? 'guest' : undefined}
              >
                {variant === 'organization' ? (
                  <span className="cronograma-relation-selected__identity" aria-hidden="true">
                    <Building2 />
                  </span>
                ) : (
                  <PersonAvatar
                    name={item.label}
                    size="md"
                    className="cronograma-relation-selected__identity"
                    fallback={(
                      <span className="cronograma-relation-selected__identity" aria-hidden="true">
                        {initialsFor(item.label)}
                      </span>
                    )}
                  />
                )}
                <span className="cronograma-relation-selected__copy">
                  <small>{roleLabel}</small>
                  <strong title={item.label}>{item.label}</strong>
                  {detail && <span>{detail}</span>}
                  {context && context !== detail && <em>{context}</em>}
                </span>
                <span className="cronograma-relation-selected__actions">
                  {item.isPrimary && singlePrimary ? (
                    <span className="cronograma-relation-primary" title={primaryLabel}>
                      <Star aria-hidden="true" />
                      <span>{primaryLabel}</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => togglePrimary(item.id)}
                      className="cronograma-relation-mark-primary"
                      aria-label={`Marcar ${item.label} como ${primaryLabel.toLocaleLowerCase('pt-BR')}`}
                    >
                      <Star aria-hidden="true" />
                      <span>{variant === 'person' ? 'Definir como responsável' : 'Definir como principal'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => removeAt(item.id)}
                    className="cronograma-relation-remove"
                    aria-label={`Remover ${item.label}`}
                  >
                    <X aria-hidden="true" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
    </section>
  );
}
