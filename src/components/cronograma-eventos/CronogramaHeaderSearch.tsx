import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCronogramaSearch } from './CronogramaSearchContext';

export function CronogramaHeaderSearch({ className }: { className?: string }) {
  const search = useCronogramaSearch();
  const [value, setValue] = useState(search?.query ?? '');
  const [focused, setFocused] = useState(false);
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

  if (!search) return null;

  return (
    <div
      className={cn('cronograma-header-search', className)}
      data-active={value.length > 0 || undefined}
      data-focused={focused || undefined}
    >
      <span className="cronograma-header-search-glow" aria-hidden="true" />
      <Search className="cronograma-header-search-icon" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Buscar evento, pessoa, comissão…"
        aria-label="Buscar no cronograma"
        autoComplete="off"
        enterKeyHint="search"
        className="cronograma-header-search-input"
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setValue('');
            search.setQuery('');
            inputRef.current?.focus();
          }}
          className="cronograma-header-search-clear focus-ring"
          aria-label="Limpar busca"
        >
          <X aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
