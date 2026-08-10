import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVenueSearch } from "./VenueSearchContext";

export function VenueHeaderSearch({ className }: { className?: string }) {
  const search = useVenueSearch();
  const [value, setValue] = useState(search?.query ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const externalQuery = search?.query ?? "";

  useEffect(() => {
    setValue((current) => (current === externalQuery ? current : externalQuery));
  }, [externalQuery]);

  useEffect(() => {
    if (!search) return;
    const timer = window.setTimeout(() => {
      if (value !== search.query) search.setQuery(value);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [search, value]);

  if (!search) return null;

  return (
    <div
      className={cn("venue-header-search", className)}
      data-active={value.length > 0 || undefined}
    >
      <Search className="venue-header-search__icon" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Buscar evento, solicitante…"
        aria-label="Buscar na agenda de Restaurante e Arena"
        autoComplete="off"
        enterKeyHint="search"
        className="venue-header-search__input"
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            search.setQuery("");
            inputRef.current?.focus();
          }}
          className="venue-header-search__clear"
          aria-label="Limpar busca"
        >
          <X aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
