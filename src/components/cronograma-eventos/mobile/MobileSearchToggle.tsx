import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCronogramaSearch } from '../CronogramaSearchContext';
import { useExclusiveMobileOverlay } from './mobileOverlayStore';
import '@/styles/cronograma-mobile-refit.css';

/** Lupa junto ao Portal; um único campo ocupa o espaço reservado ao resumo. */
export function MobileSearchToggle({ className, fieldContainer }: {
  className?: string;
  fieldContainer: HTMLElement | null;
}) {
  const search = useCronogramaSearch();
  const [open, setOpen] = useExclusiveMobileOverlay('mobile-search');
  const [value, setValue] = useState(search?.query ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const fieldId = useId();
  const externalQuery = search?.query ?? '';
  const closeSearch = useCallback(() => {
    setOpen(false);
    toggleRef.current?.focus({ preventScroll: true });
  }, [setOpen]);

  useEffect(() => {
    setValue((current) => (current === externalQuery ? current : externalQuery));
  }, [externalQuery]);

  useEffect(() => {
    if (!search) return;
    const timer = window.setTimeout(() => {
      if (value !== search.query) search.setQuery(value);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [search, value]);

  useEffect(() => {
    if (!open || !fieldContainer || window.matchMedia('(min-width: 1024px)').matches) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, closeSearch, fieldContainer]);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => {
      if (!desktop.matches || !open) return;
      const ownedFocus = toggleRef.current === document.activeElement
        || fieldContainer?.contains(document.activeElement);
      // Entrega a edição pendente antes de permitir digitação na busca desktop.
      if (search && value !== search.query) search.setQuery(value);
      setOpen(false);
      if (ownedFocus) {
        const header = fieldContainer?.closest('.cronograma-module-bar');
        const desktopInput = header?.querySelector<HTMLInputElement>('.cronograma-header-search-input');
        const focusTarget = desktopInput?.getBoundingClientRect().width
          ? desktopInput
          : header?.querySelector<HTMLElement>('.cronograma-module-back');
        focusTarget?.focus({ preventScroll: true });
      }
    };
    closeOnDesktop();
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, [open, setOpen, fieldContainer, search, value]);

  if (!search) return null;

  return (
    <div className={cn('cronograma-mobile-search-toggle', className)} data-open={open || undefined}>
      <button
        ref={toggleRef}
        type="button"
        onClick={() => open ? closeSearch() : setOpen(true)}
        className="cronograma-mobile-search-toggle__button focus-ring"
        aria-label={open ? 'Fechar busca' : 'Abrir busca'}
        aria-expanded={open}
        aria-controls={open ? fieldId : undefined}
        data-active={value.length > 0 || undefined}
      >
        {open ? <X aria-hidden="true" /> : <Search aria-hidden="true" />}
        {value.length > 0 && !open && <i aria-hidden="true" />}
      </button>

      {open && fieldContainer && createPortal(
        <div id={fieldId} className="cronograma-mobile-search-toggle__field" role="search">
          <input
            ref={inputRef}
            type="search"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                closeSearch();
              }
            }}
            placeholder="Buscar evento, pessoa, comissão…"
            aria-label="Buscar no cronograma"
            autoComplete="off"
            enterKeyHint="search"
          />
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setValue('');
                search.setQuery('');
                inputRef.current?.focus({ preventScroll: true });
              }}
              className="cronograma-mobile-search-toggle__clear focus-ring"
              aria-label="Limpar busca"
            >
              <X aria-hidden="true" />
            </button>
          )}
        </div>,
        fieldContainer,
      )}
    </div>
  );
}
