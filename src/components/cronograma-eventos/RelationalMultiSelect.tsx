import { useMemo, useState } from 'react';
import { Check, ChevronDown, Plus, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface RelationalOption {
  /** Stable identifier used as React key and equality check. */
  id: string;
  /** Human label shown in chips/list. */
  label: string;
  /** Optional secondary line (e.g. slug, role). */
  hint?: string;
}

export interface RelationalSelection {
  id: string;
  label: string;
  hint?: string;
  isPrimary?: boolean;
}

interface RelationalMultiSelectProps {
  label: string;
  placeholder?: string;
  emptyLabel?: string;
  options: RelationalOption[];
  value: RelationalSelection[];
  onChange: (next: RelationalSelection[]) => void;
  /** Whether exactly one entry can be marked as `isPrimary`. Defaults to true. */
  singlePrimary?: boolean;
  /** Allow typing a free-text value (external responsible names). */
  allowCustom?: boolean;
  disabled?: boolean;
  isLoading?: boolean;
  primaryLabel?: string;
  id?: string;
}

/**
 * Chip multi-select used in Cronograma & Eventos to attach commissions
 * or responsibles to an event/subevent, with an optional "primary" toggle
 * (`is_primary` / `relation_role='principal'`).
 */
export function RelationalMultiSelect({
  label,
  placeholder = 'Buscar…',
  emptyLabel = 'Nenhum vínculo selecionado.',
  options,
  value,
  onChange,
  singlePrimary = true,
  allowCustom = false,
  disabled = false,
  isLoading = false,
  primaryLabel = 'Principal',
  id,
}: RelationalMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedIds = useMemo(() => new Set(value.map((item) => item.id)), [value]);
  const filteredOptions = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return options
      .filter((option) => !selectedIds.has(option.id))
      .filter((option) => {
        if (!term) return true;
        return (
          option.label.toLocaleLowerCase('pt-BR').includes(term) ||
          option.hint?.toLocaleLowerCase('pt-BR').includes(term)
        );
      })
      .slice(0, 40);
  }, [options, search, selectedIds]);

  const canAddCustom =
    allowCustom &&
    search.trim().length >= 2 &&
    !options.some((option) => option.label.toLocaleLowerCase('pt-BR') === search.trim().toLocaleLowerCase('pt-BR')) &&
    !value.some((item) => item.label.toLocaleLowerCase('pt-BR') === search.trim().toLocaleLowerCase('pt-BR'));

  const addOption = (option: RelationalOption) => {
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
    setSearch('');
  };

  const addCustom = () => {
    const term = search.trim();
    if (!term) return;
    const alreadyPrimary = value.some((item) => item.isPrimary);
    onChange([
      ...value,
      { id: `custom:${term.toLocaleLowerCase('pt-BR')}`, label: term, isPrimary: !alreadyPrimary },
    ]);
    setSearch('');
  };

  const removeAt = (id: string) => {
    const filtered = value.filter((item) => item.id !== id);
    // Ensure at least one primary remains if there are entries.
    if (singlePrimary && filtered.length > 0 && !filtered.some((item) => item.isPrimary)) {
      filtered[0] = { ...filtered[0], isPrimary: true };
    }
    onChange(filtered);
  };

  const togglePrimary = (id: string) => {
    if (singlePrimary) {
      onChange(value.map((item) => ({ ...item, isPrimary: item.id === id })));
    } else {
      onChange(value.map((item) => (item.id === id ? { ...item, isPrimary: !item.isPrimary } : item)));
    }
  };

  return (
    <div className="space-y-2" id={id}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-[0.14em] text-foreground/72">{label}</span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className="h-8 rounded-full bg-white/70 text-xs"
              aria-label={`Adicionar ${label.toLowerCase()}`}
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar
              <ChevronDown className="ml-1 h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="z-[95] w-[min(22rem,90vw)] rounded-2xl p-0" align="end">
            <div className="border-b border-border/40 p-2">
              <Input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={placeholder}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && canAddCustom) {
                    event.preventDefault();
                    addCustom();
                  }
                }}
                className="h-9 rounded-xl bg-white/80 text-sm"
                aria-label={`Buscar ${label.toLowerCase()}`}
              />
            </div>
            <div className="max-h-[min(20rem,60dvh)] overflow-y-auto p-1" role="listbox">
              {isLoading && (
                <div className="p-3 text-xs text-muted-foreground">Carregando opções…</div>
              )}
              {!isLoading && filteredOptions.length === 0 && !canAddCustom && (
                <div className="p-3 text-xs text-muted-foreground">Nenhum resultado.</div>
              )}
              {filteredOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => addOption(option)}
                  className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-primary/10 focus:bg-primary/10 focus:outline-none"
                  role="option"
                  aria-selected={false}
                >
                  <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Check className="h-3.5 w-3.5 opacity-0" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-foreground">{option.label}</span>
                    {option.hint && (
                      <span className="block truncate text-xs text-muted-foreground">{option.hint}</span>
                    )}
                  </span>
                </button>
              ))}
              {canAddCustom && (
                <button
                  type="button"
                  onClick={addCustom}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-primary hover:bg-primary/10"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar &quot;{search.trim()}&quot;
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {value.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/50 bg-white/40 p-2.5 text-center text-xs text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" aria-label={`${label} selecionados`}>
          {value.map((item) => (
            <li key={item.id}>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
                  item.isPrimary
                    ? 'border-gold/60 bg-gold/15 text-amber-950'
                    : 'border-border/60 bg-white/75 text-foreground/80',
                )}
              >
                <button
                  type="button"
                  onClick={() => togglePrimary(item.id)}
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full transition',
                    item.isPrimary ? 'bg-gold/30 text-amber-900' : 'bg-transparent text-muted-foreground hover:bg-primary/10',
                  )}
                  aria-label={item.isPrimary ? `Remover marcação de ${primaryLabel.toLowerCase()}` : `Marcar como ${primaryLabel.toLowerCase()}`}
                  aria-pressed={item.isPrimary || false}
                  title={primaryLabel}
                >
                  <Star className={cn('h-3 w-3', item.isPrimary && 'fill-current')} aria-hidden="true" />
                </button>
                <span className="max-w-[14rem] truncate">{item.label}</span>
                <button
                  type="button"
                  onClick={() => removeAt(item.id)}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-red-100 hover:text-red-800"
                  aria-label={`Remover ${item.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
