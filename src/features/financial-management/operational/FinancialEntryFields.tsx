import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import * as FinancialDialog from "@radix-ui/react-dialog";
import * as FinancialAlert from "@radix-ui/react-alert-dialog";
import * as Popover from "@radix-ui/react-popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ChevronDown,
  Info,
  Pencil,
  Plus,
  Settings2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createFinancialReference,
  listFinancialReferences,
  updateFinancialReference,
  type FinancialReference,
  type ReferenceKind,
} from "./financialEntryApi";
import type { FundingTypeKey } from "./financialOperationalApi";

/** Local stacked confirmation stays above the entry composer without changing global dialogs. */
export function FinancialConfirmationContent(
  props: React.ComponentProps<typeof FinancialAlert.Content>,
) {
  return (
    <FinancialAlert.Portal>
      <FinancialAlert.Overlay className="f28-entry-confirm-overlay" />
      <FinancialAlert.Content {...props} />
    </FinancialAlert.Portal>
  );
}

export function FinancialInfo({
  label,
  children,
  ariaLabel,
}: {
  label: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pointer = useRef("mouse");
  const trigger = useRef<HTMLButtonElement>(null),
    content = useRef<HTMLDivElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const enter = () => {
    clearTimeout(timer.current);
    setOpen(true);
  };
  const leave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const focused = document.activeElement;
      if (
        !trigger.current?.contains(focused) &&
        !content.current?.contains(focused)
      )
        setOpen(false);
    }, 160);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <button
          ref={trigger}
          type="button"
          className="f28-info-button"
          aria-label={ariaLabel || `Informações sobre ${label}`}
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onPointerDown={(e) => {
            pointer.current = e.pointerType;
          }}
          onClick={() =>
            pointer.current === "touch" ? setOpen((v) => !v) : enter()
          }
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              e.stopPropagation();
            }
          }}
          aria-describedby={open ? id : undefined}
          onPointerEnter={(e) => {
            if (e.pointerType !== "touch") enter();
          }}
          onPointerLeave={(e) => {
            if (e.pointerType !== "touch") leave();
          }}
          onBlur={leave}
          onFocus={(e) => {
            if (e.currentTarget.matches(":focus-visible")) enter();
          }}
        >
          <Info size={16} aria-hidden="true" />
        </button>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          role="tooltip"
          ref={content}
          id={id}
          className="f28-info-content"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (trigger.current?.contains(e.target as Node)) e.preventDefault();
          }}
          onPointerEnter={(e) => {
            if (e.pointerType !== "touch") enter();
          }}
          onPointerLeave={(e) => {
            if (e.pointerType !== "touch") leave();
          }}
          onFocusCapture={enter}
          onBlurCapture={leave}
        >
          {children}
          <Popover.Arrow className="f28-info-arrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
export function EntryField({
  id,
  label,
  help,
  required,
  error,
  children,
  wide = false,
}: {
  id: string;
  label: string;
  help?: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`f28-entry-field${wide ? " f28-entry-field--wide" : ""}`}>
      <div className="f28-entry-label">
        <label htmlFor={id}>
          {label}
          {required && <span> *</span>}
        </label>
        {help && <FinancialInfo label={label}>{help}</FinancialInfo>}
      </div>
      {children}
      {error && (
        <p id={`${id}-error`} className="f28-entry-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export interface ReferenceChoice {
  id: string | null;
  name: string;
  createOnSave?: boolean;
}
const normalize = (s: string) =>
  s.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
export const referenceKey = (org: string, kind: ReferenceKind) =>
  ["financial-operational", "references", org, kind] as const;

function ReferenceAdmin({
  org,
  kind,
  onClose,
}: {
  org: string;
  kind: ReferenceKind;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: referenceKey(org, kind),
    queryFn: () => listFinancialReferences(org, kind, "", true),
  });
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{
    row: FinancialReference;
    name: string;
  } | null>(null);
  const mutation = useMutation({
    mutationFn: ({
      row,
      name,
      active,
    }: {
      row: FinancialReference;
      name: string;
      active: boolean;
    }) => updateFinancialReference(org, row, name, active, crypto.randomUUID()),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: referenceKey(org, kind) });
      setEditing(null);
    },
  });
  return (
    <FinancialDialog.Root
      open
      onOpenChange={(v) => !v && !mutation.isPending && onClose()}
    >
      <FinancialDialog.Portal>
        <FinancialDialog.Overlay className="f28-entry-admin-overlay" />
        <FinancialDialog.Content className="f28-reference-admin">
          <DialogHeader>
            <DialogTitle>Gerenciar opções</DialogTitle>
            <DialogDescription>
              Renomear ou arquivar preserva os vínculos anteriores.
            </DialogDescription>
          </DialogHeader>
          {q.isError || mutation.error ? (
            <p role="alert">{(q.error || mutation.error)?.message}</p>
          ) : null}
          <ul>
            {q.data?.map((row) => (
              <li key={row.id}>
                <div>
                  {editing?.row.id === row.id ? (
                    <Input
                      aria-label={`Novo nome de ${row.name}`}
                      value={editing.name}
                      onChange={(e) =>
                        setEditing({ ...editing, name: e.target.value })
                      }
                    />
                  ) : (
                    <strong>{row.name}</strong>
                  )}
                  <small>{row.active ? "Ativa" : "Arquivada"}</small>
                </div>
                <div>
                  {editing?.row.id === row.id ? (
                    <Button
                      type="button"
                      disabled={
                        mutation.isPending || editing.name.trim().length < 2
                      }
                      onClick={() =>
                        mutation.mutate({
                          row,
                          name: editing.name,
                          active: row.active,
                        })
                      }
                    >
                      Salvar nome
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={mutation.isPending}
                      onClick={() => setEditing({ row, name: row.name })}
                    >
                      <Pencil size={16} />
                      Renomear
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate({
                        row,
                        name: row.name,
                        active: !row.active,
                      })
                    }
                  >
                    <Archive size={16} />
                    {row.active ? "Arquivar" : "Reativar"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar opções
          </Button>
        </FinancialDialog.Content>
      </FinancialDialog.Portal>
    </FinancialDialog.Root>
  );
}

export function FinancialReferenceField({
  org,
  kind,
  id,
  label,
  value,
  onChange,
  onSelect,
  disabled,
  canCreate,
  canAdmin,
  fundingType = null,
}: {
  org: string;
  kind: ReferenceKind;
  id: string;
  label: string;
  value: ReferenceChoice;
  onChange: (choice: ReferenceChoice) => void;
  onSelect?: (row: FinancialReference) => void;
  disabled?: boolean;
  canCreate: boolean;
  canAdmin: boolean;
  fundingType?: FundingTypeKey | null;
}) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: referenceKey(org, kind),
    queryFn: () => listFinancialReferences(org, kind, "", true),
    enabled: Boolean(org),
  });
  const [open, setOpen] = useState(false),
    [admin, setAdmin] = useState(false),
    [active, setActive] = useState(-1);
  const request = useRef(new Map<string, string>());
  const create = useMutation({
    mutationFn: (name: string) => {
      const key = JSON.stringify([name, fundingType]);
      if (!request.current.has(key))
        request.current.set(key, crypto.randomUUID());
      return createFinancialReference(
        org,
        kind,
        name,
        fundingType,
        request.current.get(key)!,
      );
    },
    onSuccess: async (row) => {
      qc.setQueryData<FinancialReference[]>(referenceKey(org, kind), (old) => [
        row,
        ...(old || []).filter((r) => r.id !== row.id),
      ]);
      onChange({ id: row.id, name: row.name });
      onSelect?.(row);
      setOpen(false);
      await qc.invalidateQueries({ queryKey: referenceKey(org, kind) });
    },
  });
  const options = (list.data || []).filter(
    (r) => r.active && normalize(r.name).includes(normalize(value.name)),
  );
  const exact = (list.data || []).some(
    (r) => r.active && normalize(r.name) === normalize(value.name),
  );
  const selected = list.data?.find((r) => r.id === value.id);
  const shown = value.id ? selected?.name || value.name : value.name;
  const choose = (row: FinancialReference) => {
    onChange({ id: row.id, name: row.name });
    onSelect?.(row);
    setOpen(false);
  };
  return (
    <div className="f28-reference-field">
      <EntryField
        id={id}
        label={label}
        help="Pesquise uma opção ou crie um nome reutilizável. Nomes novos serão cadastrados somente ao confirmar Criar ou salvar o lote."
      >
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Anchor asChild>
            <div className="f28-reference-input">
              <Input
                id={id}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls={`${id}-options`}
                aria-activedescendant={
                  open && active >= 0 ? `${id}-option-${active}` : undefined
                }
                disabled={disabled || create.isPending}
                autoComplete="off"
                value={shown}
                onFocus={() => setOpen(true)}
                onChange={(e) => {
                  onChange({
                    id: null,
                    name: e.target.value,
                    createOnSave: canCreate && Boolean(e.target.value.trim()),
                  });
                  setActive(-1);
                  setOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setOpen(true);
                    setActive((n) => Math.min(n + 1, options.length - 1));
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((n) => Math.max(n - 1, 0));
                  }
                  if (e.key === "Enter" && open) {
                    e.preventDefault();
                    if (active >= 0 && options[active]) choose(options[active]);
                    else if (exact) {
                      const match = options.find(
                        (r) => normalize(r.name) === normalize(value.name),
                      );
                      if (match) choose(match);
                    } else if (canCreate && value.name.trim().length >= 2)
                      create.mutate(value.name.trim());
                  }
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setOpen(false);
                  }
                }}
              />
              <button
                type="button"
                aria-label={`Abrir opções de ${label}`}
                disabled={disabled}
                onClick={() => setOpen((v) => !v)}
              >
                <ChevronDown size={16} />
              </button>
            </div>
          </Popover.Anchor>
          <Popover.Portal>
            <Popover.Content
              className="f28-reference-options"
              align="start"
              collisionPadding={12}
              sideOffset={4}
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
              onInteractOutside={(e) => {
                if ((e.target as Element)?.id === id) e.preventDefault();
              }}
            >
              <div id={`${id}-options`} role="listbox" aria-label={label}>
                {list.isLoading ? (
                  <p role="status">Carregando opções…</p>
                ) : (
                  options.map((r, n) => (
                    <button
                      key={r.id}
                      id={`${id}-option-${n}`}
                      type="button"
                      role="option"
                      aria-selected={value.id === r.id}
                      data-highlighted={active === n}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => choose(r)}
                    >
                      {r.name}
                    </button>
                  ))
                )}
              </div>
              {!options.length && !list.isLoading && (
                <p>Nenhuma opção encontrada.</p>
              )}
              {canCreate && !exact && value.name.trim().length >= 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={create.isPending}
                  onClick={() => create.mutate(value.name.trim())}
                >
                  <Plus size={16} />
                  Criar “{value.name.trim()}”
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  onChange({ id: null, name: "" });
                  setOpen(false);
                }}
              >
                Limpar seleção
              </Button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        {selected?.active === false ? (
          <small>Opção arquivada · vínculo anterior preservado</small>
        ) : value.createOnSave && !value.id ? (
          <small>Nova opção · será criada ao salvar o lote</small>
        ) : null}
        {list.isError ? (
          <p role="alert">
            Não foi possível consultar as opções.{" "}
            <button type="button" onClick={() => void list.refetch()}>
              Tentar novamente
            </button>
          </p>
        ) : null}
        {create.error ? <p role="alert">{create.error.message}</p> : null}
      </EntryField>
      {canAdmin && kind !== "expense_category" && (
        <button
          type="button"
          className="f28-reference-manage"
          onClick={() => {
            setOpen(false);
            setAdmin(true);
          }}
        >
          <Settings2 size={14} />
          Gerenciar opções
        </button>
      )}
      {admin && (
        <ReferenceAdmin org={org} kind={kind} onClose={() => setAdmin(false)} />
      )}
    </div>
  );
}
