import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCronogramaSearch } from '../CronogramaSearchContext';
import { useExclusiveMobileOverlay } from './mobileOverlayStore';
import '@/styles/cronograma-mobile-refit.css';

/** Lupa compacta no topo mobile que expande o campo de busca sobre a própria faixa. */
export function MobileSearchToggle({ className }: { className?: string }) {
  const search = useCronogramaSearch();
  const [open, setOpen] = useExclusiveMobileOverlay('mobile-search');
  const [value, setValue] = useState(search?.query ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const externalQuery = search?.query ?? '';

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
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  if (!search) return null;

  return (
    <div className={cn('cronograma-mobile-search-toggle', className)} data-open={open || undefined}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="cronograma-mobile-search-toggle__button focus-ring"
        aria-label={open ? 'Fechar busca' : 'Abrir busca'}
        aria-expanded={open}
        data-active={value.length > 0 || undefined}
      >
        <Search aria-hidden="true" />
        {value.length > 0 && !open && <i aria-hidden="true" />}
      </button>

      {open && (
        <div className="cronograma-mobile-search-toggle__field" role="search">
          <Search aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') setOpen(false);
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
                inputRef.current?.focus();
              }}
              className="cronograma-mobile-search-toggle__clear focus-ring"
              aria-label="Limpar busca"
            >
              <X aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="cronograma-mobile-search-toggle__done focus-ring"
          >
            OK
          </button>
        </div>
      )}
    </div>
  );
}
