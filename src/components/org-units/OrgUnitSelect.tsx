import { useId, useMemo, useState } from 'react';
import { Building2, Check, ChevronsUpDown, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import '@/styles/org-units.css';
import {
  ORG_UNIT_SELECT_LABEL,
  groupOrgUnits,
  orgUnitHint,
  orgUnitMatches,
  orgUnitTypeLabel,
  responsibleHeading,
  responsibleRoleLabel,
  type OrgUnit,
} from '@/lib/org-units';

interface OrgUnitSelectProps {
  units: OrgUnit[];
  value: string | null;
  onChange: (unitId: string | null) => void;
  label?: string;
  id?: string;
  isLoading?: boolean;
  disabled?: boolean;
  allowClear?: boolean;
  emptyOptionLabel?: string;
  describedBy?: string;
  invalid?: boolean;
  /** Hide the internal label when the surrounding field already renders one. */
  hideLabel?: boolean;
}

/** Structured summary of the selected unit and its institutional responsibles. */
export function OrgUnitSummary({ unit }: { unit: OrgUnit }) {
  return (
    <div className="org-unit-summary" aria-live="polite">
      <div className="org-unit-summary__head">
        <span className="org-unit-summary__icon" aria-hidden="true">
          <Building2 />
        </span>
        <div className="min-w-0">
          <p className="org-unit-summary__label">{orgUnitTypeLabel(unit.type)} responsável</p>
          <p className="org-unit-summary__name">{unit.name}</p>
        </div>
        <span className="org-unit-summary__badge">{orgUnitTypeLabel(unit.type)}</span>
      </div>
      <div className="org-unit-summary__body">
        <p className="org-unit-summary__label">
          {responsibleHeading(unit)}
          {unit.responsibles.length > 1 ? ` (${unit.responsibles.length})` : ''}
        </p>
        {unit.responsibles.length === 0 ? (
          <p className="org-unit-summary__empty">Nenhum responsável institucional cadastrado.</p>
        ) : (
          <ul className="org-unit-summary__list">
            {unit.responsibles.map((person) => (
              <li key={person.id}>
                <span className="org-unit-summary__person">
                  {person.responsibleType === 'equipe' ? <Users aria-hidden="true" /> : null}
                  {person.displayName}
                </span>
                <span className="org-unit-summary__role">{responsibleRoleLabel(person.relationshipRole)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Searchable, grouped selector for the shared organizational registry.
 * Searches by unit name and by responsible name, ignoring case and accents.
 */
export function OrgUnitSelect({
  units,
  value,
  onChange,
  label = ORG_UNIT_SELECT_LABEL,
  id,
  isLoading = false,
  disabled = false,
  allowClear = true,
  emptyOptionLabel = 'Sem comissão ou assessoria vinculada',
  describedBy,
  invalid,
  hideLabel = false,
}: OrgUnitSelectProps) {
  const generatedId = useId();
  const fieldId = id ?? `org-unit-${generatedId}`;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = useMemo(() => units.find((unit) => unit.id === value) ?? null, [units, value]);
  const groups = useMemo(
    () => groupOrgUnits(units.filter((unit) => orgUnitMatches(unit, search))),
    [units, search],
  );
  const resultCount = groups.reduce((total, group) => total + group.units.length, 0);

  return (
    <div className="org-unit-field">
      <label className={cn('org-unit-field__label', hideLabel && 'sr-only')} htmlFor={fieldId}>
        {label}
      </label>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch('');
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={fieldId}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            disabled={disabled || isLoading}
            className={cn('org-unit-trigger', invalid && 'org-unit-trigger--invalid')}
          >
            <span className="org-unit-trigger__text">
              {selected ? (
                <>
                  <span className="org-unit-trigger__name">{selected.name}</span>
                  <span className="org-unit-trigger__hint">{orgUnitHint(selected)}</span>
                </>
              ) : (
                <span className="org-unit-trigger__placeholder">
                  {isLoading ? 'Carregando registro oficial…' : emptyOptionLabel}
                </span>
              )}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="org-unit-popover z-[95] p-0">
          <div className="org-unit-popover__search">
            <Input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por comissão, assessoria ou responsável…"
              aria-label="Buscar comissão, assessoria ou responsável"
              className="h-11 rounded-xl text-sm normal-case"
            />
          </div>
          <div className="org-unit-popover__list" role="listbox" aria-label={label}>
            {allowClear && (
              <button
                type="button"
                role="option"
                aria-selected={!selected}
                className="org-unit-option org-unit-option--clear"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                {emptyOptionLabel}
              </button>
            )}
            {resultCount === 0 && (
              <p className="org-unit-popover__empty">Nenhuma comissão ou assessoria encontrada.</p>
            )}
            {groups.map((group) => (
              <div key={group.type} className="org-unit-group" role="group" aria-label={group.label}>
                <p className="org-unit-group__label">{group.label}</p>
                {group.units.map((unit) => {
                  const isSelected = unit.id === value;
                  return (
                    <button
                      key={unit.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={cn('org-unit-option', isSelected && 'org-unit-option--selected')}
                      onClick={() => {
                        onChange(unit.id);
                        setOpen(false);
                      }}
                    >
                      <span className="org-unit-option__check" aria-hidden="true">
                        <Check className={cn('h-3.5 w-3.5', !isSelected && 'opacity-0')} />
                      </span>
                      <span className="min-w-0">
                        <span className="org-unit-option__name">{unit.name}</span>
                        <span className="org-unit-option__hint">
                          {orgUnitHint(unit)}
                          {unit.isLegacy ? ' · Histórico' : ''}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {selected && <OrgUnitSummary unit={selected} />}
    </div>
  );
}
