import { useId, useRef, useState } from 'react';
import { Check, ChevronDown, MapPin, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CRONOGRAMA_LOCATION_OPTIONS } from '@/lib/cronograma-location-options';

interface EventLocationFieldProps {
  value: string;
  code?: string | null;
  onChange: (value: string, code: string | null) => void;
}

export function EventLocationField({ value, code, onChange }: EventLocationFieldProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(() => Boolean(value && !code));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
  const selectedOption = CRONOGRAMA_LOCATION_OPTIONS.find((option) => option.code === code && option.label === value);
  const custom = customMode || Boolean(value && !selectedOption);

  const choose = (nextValue: string, nextCode: string | null, isCustom = false) => {
    setCustomMode(isCustom);
    onChange(nextValue, nextCode);
    setOpen(false);
    if (isCustom) {
      window.requestAnimationFrame(() => customInputRef.current?.focus());
    } else {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  };

  return (
    <div className="space-y-1.5" onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }}>
      <Label id={`${id}-label`}>Local</Label>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        aria-labelledby={`${id}-label ${id}-selection`}
        aria-expanded={open}
        aria-controls={`${id}-choices`}
        onClick={() => setOpen((current) => !current)}
        className="h-auto min-h-11 w-full justify-between gap-3 whitespace-normal rounded-lg bg-background px-3 py-2 text-left font-medium"
      >
        <span className="flex min-w-0 items-center gap-2">
          <MapPin className="shrink-0 text-primary" aria-hidden="true" />
          <span id={`${id}-selection`} className={`min-w-0 break-words text-base md:text-sm ${!value ? 'text-muted-foreground' : ''}`}>
            {selectedOption?.label ?? (custom ? value || 'Outro local' : 'Selecionar local')}
          </span>
        </span>
        <ChevronDown className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </Button>

      {open && (
        <div id={`${id}-choices`} className="max-h-[min(19rem,45dvh)] space-y-1 overflow-y-auto rounded-lg border border-border bg-popover p-1.5 shadow-sm">
          {CRONOGRAMA_LOCATION_OPTIONS.map((option) => (
            <Button
              key={option.code}
              type="button"
              variant="ghost"
              aria-pressed={selectedOption?.code === option.code}
              onClick={() => choose(option.label, option.code)}
              className="h-auto min-h-11 w-full justify-start gap-2 whitespace-normal rounded-md px-3 py-2 text-left text-base font-medium md:text-sm"
            >
              <Check className={`shrink-0 ${selectedOption?.code === option.code ? 'text-primary' : 'invisible'}`} aria-hidden="true" />
              <span className="min-w-0 break-words">{option.label}</span>
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            aria-pressed={custom}
            onClick={() => choose(custom ? value : '', null, true)}
            className="h-auto min-h-11 w-full justify-start gap-2 whitespace-normal rounded-md border-t border-border px-3 py-2 text-left text-base font-medium md:text-sm"
          >
            <Pencil className="shrink-0 text-primary" aria-hidden="true" />
            Outro local
          </Button>
          {value && (
            <Button type="button" variant="ghost" onClick={() => choose('', null)} className="h-auto min-h-11 w-full justify-start px-3 text-left text-muted-foreground">
              Sem local definido
            </Button>
          )}
        </div>
      )}

      {custom && (
        <Input
          ref={customInputRef}
          id={`${id}-custom`}
          aria-label="Outro local do evento"
          value={value}
          onChange={(event) => onChange(event.target.value, null)}
          placeholder="Digite o local do evento"
          className="bg-background text-base md:text-sm"
        />
      )}
    </div>
  );
}