import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { storeError, storeRpc, type CommandResult, type StoreScope } from "../api/store";
import { fieldError, StoreFailure, StoreField } from "../components/StoreElements";
import { dateLabel, todayInSaoPaulo } from "../domain/purchases";
import type { SojaStoreAccess } from "../hooks/useSojaStoreAccess";
import { useStoreCommand } from "../hooks/useStoreCommand";
import { useUnsavedStoreForm } from "../hooks/useUnsavedStoreForm";
import "../soja-store.css";

type Kind = "shift" | "training";
type Option = { id: string; name: string };
type TeamRecord = {
  id: string;
  person_id: string;
  person_name: string;
  kind: Kind;
  title: string;
  location_id: string | null;
  location_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  completed_on: string | null;
  notes: string | null;
  status: "active" | "cancelled";
  version: number;
};
type Records = { items: TeamRecord[]; total: number; people: Option[]; locations: Option[] };
const pageSize = 30;
const tabLabels = { shift: "Escalas", training: "Treinamentos" };
const newLabels = { shift: "Agendar turno", training: "Registrar conclusão" };
const timeZone = "America/Sao_Paulo";
const dateTime = new Intl.DateTimeFormat("pt-BR", { timeZone, dateStyle: "short", timeStyle: "short" });
const civilParts = new Intl.DateTimeFormat("pt-BR", {
  timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function localTime(value: string | null | undefined) {
  if (!value) return "";
  const parts = Object.fromEntries(civilParts.formatToParts(new Date(value)).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function StoreTeamPanel({ commissionId, access }: { commissionId: string; access: SojaStoreAccess }) {
  const { user } = useAuth();
  const { orgId } = useCurrentOrg();
  if (!user || !orgId || !access.enabled || !access.capabilities.includes("team.view")) return null;
  const key = [user.id, orgId, commissionId, [...access.capabilities].sort().join(",")] as const;
  return (
    <TeamRecords key={key.join(":")} scope={{ _org_id: orgId, _commission_id: commissionId }}
      queryKey={["soja-store", ...key, "team-records"]} canManage={access.capabilities.includes("team.manage")} />
  );
}

function TeamRecords({ scope, queryKey, canManage }: { scope: StoreScope; queryKey: readonly unknown[]; canManage: boolean }) {
  const [kind, setKind] = useState<Kind>("shift");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<TeamRecord | "new" | null>(null);
  const records = useQuery({
    queryKey: [...queryKey, kind, page],
    queryFn: () => storeRpc<Records>("soja_store_team", { ...scope, _kind: kind, _limit: pageSize, _offset: (page - 1) * pageSize }),
    meta: { persist: false },
  });
  const current = editing && editing !== "new" ? records.data?.items.find(({ id }) => id === editing.id) : undefined;

  return (
    <section className="ss-page ss-surface mb-4 grid gap-4" aria-labelledby="ss-team-operations">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ss-team-operations">Operação da equipe</h2>
        {canManage && !editing && !!records.data?.people.length && (
          <Button type="button" className="ss-primary" onClick={() => setEditing("new")}><Plus aria-hidden="true" />{newLabels[kind]}</Button>
        )}
      </header>
      <div role="group" aria-label="Registros da equipe" className="flex flex-wrap gap-2">
        {(Object.keys(tabLabels) as Kind[]).map((tab) => (
          <Button type="button" variant={tab === kind ? "secondary" : "outline"} aria-pressed={tab === kind} key={tab} disabled={!!editing}
            onClick={() => { setKind(tab); setPage(1); }}>{tabLabels[tab]}</Button>
        ))}
      </div>
      {records.isPending ? <p role="status">Carregando registros da equipe…</p> : records.isError ? (
        <StoreFailure message={storeError(records.error)} retry={() => void records.refetch()} />
      ) : (
        <>
          {editing && <TeamEditor key={editing === "new" ? "new" : `${editing.id}:${editing.version}`}
            scope={scope} queryKey={queryKey} record={editing === "new" ? undefined : editing} current={current} kind={kind}
            people={records.data.people} locations={records.data.locations}
            close={() => setEditing(null)} reload={current ? () => setEditing(current) : undefined} />}
          {records.data.items.length === 0 ? <p role="status">{kind === "shift" ? "Nenhum turno registrado." : "Nenhum treinamento concluído registrado."}</p> : (
            <ul className="divide-y">
              {records.data.items.map((record) => (
                <li className="flex flex-wrap items-center justify-between gap-3 py-3" key={record.id}>
                  <div className="min-w-0 break-words">
                    <p className="font-semibold">{record.person_name} · {record.title}</p>
                    <p className="text-sm text-[var(--ss-muted)]">
                      {record.starts_at && record.ends_at && `${dateTime.format(new Date(record.starts_at))} a ${dateTime.format(new Date(record.ends_at))}`}
                      {record.completed_on && `Concluído em ${dateLabel(record.completed_on)}`}
                      {record.location_name && ` · ${record.location_name}`}
                    </p>
                    {record.notes && <p className="mt-1 text-sm">{record.notes}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {record.status === "cancelled" && <span className="ss-pill" data-status="archived">Cancelado</span>}
                    {canManage && !editing && <Button type="button" variant="outline" aria-label={`Editar ${record.title} de ${record.person_name}`}
                      onClick={() => setEditing(record)}>Editar</Button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {records.data.total > pageSize && <nav className="flex flex-wrap items-center gap-2" aria-label="Paginação da equipe">
            <Button type="button" variant="outline" disabled={!!editing || page === 1} onClick={() => setPage(page - 1)}><ArrowLeft aria-hidden="true" /> Anterior</Button>
            <p className="text-sm">Página {page} de {Math.ceil(records.data.total / pageSize)}</p>
            <Button type="button" variant="outline" disabled={!!editing || page * pageSize >= records.data.total} onClick={() => setPage(page + 1)}>Próxima <ArrowRight aria-hidden="true" /></Button>
          </nav>}
        </>
      )}
    </section>
  );
}

function TeamEditor({ scope, queryKey, record, current, kind, people, locations, close, reload }: {
  scope: StoreScope;
  queryKey: readonly unknown[];
  record?: TeamRecord;
  current?: TeamRecord;
  kind: Kind;
  people: Option[];
  locations: Option[];
  close: () => void;
  reload?: () => void;
}) {
  const client = useQueryClient();
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const command = useStoreCommand(scope, (requestId, payload: object) =>
    storeRpc<CommandResult>("soja_store_save_team_record", {
      ...scope, _request_id: requestId, _expected_version: record?.version ?? null, _payload: payload,
    }), () => {
    toast.success(kind === "shift" ? "Turno salvo." : "Treinamento salvo.");
    void client.invalidateQueries({ queryKey });
    close();
  });
  const blocked = command.isPending || command.isUncertain;
  const stale = !!record && current?.version !== record.version;
  useUnsavedStoreForm(dirty || blocked);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || stale) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    const invalid: Record<string, string> = {};
    const starts = value("starts");
    const ends = value("ends");
    const completed = value("completed");
    if (!value("person")) invalid.person = "Selecione uma pessoa da equipe.";
    if (value("title").length < 2) invalid.title = "Informe ao menos dois caracteres.";
    if (kind === "shift") {
      if (!starts) invalid.starts = "Informe o início do turno.";
      if (!ends || ends <= starts) invalid.ends = "Informe um término posterior ao início.";
    } else if (!completed || completed > todayInSaoPaulo()) {
      invalid.completed = "Informe uma data de conclusão até hoje.";
    }
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    command.mutate({
      id: record?.id,
      kind,
      person_id: value("person"),
      title: value("title"),
      location_id: value("location") || null,
      starts_local: starts || null,
      ends_local: ends || null,
      completed_on: completed || null,
      status: value("status") || "active",
      notes: value("notes") || null,
    }, { onError: (error) => {
      if (/STALE_VERSION/i.test(String((error as { message?: string })?.message))) {
        void client.invalidateQueries({ queryKey });
      }
    } });
  }

  const errorText = /TEAM_SHIFT_OVERLAP/i.test(String((command.error as { message?: string } | null)?.message ?? ""))
    ? "Já existe um turno que se sobrepõe para esta pessoa. Revise o horário."
    : storeError(command.error);

  return (
    <form className="ss-variant grid gap-3" onSubmit={submit} onChange={() => setDirty(true)} noValidate aria-label={record ? "Editar registro da equipe" : newLabels[kind]}>
      <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2" disabled={blocked || stale}>
        <StoreField id="ss-team-person" label="Pessoa da equipe" error={errors.person}>
          <select {...fieldError("ss-team-person", errors.person)} name="person" defaultValue={record?.person_id ?? ""}>
            <option value="">Selecione a pessoa</option>
            {record && !people.some(({ id }) => id === record.person_id) && <option value={record.person_id}>{record.person_name}</option>}
            {people.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select>
        </StoreField>
        <StoreField id="ss-team-title" label={kind === "shift" ? "Função no turno" : "Nome do treinamento"} error={errors.title}>
          <input {...fieldError("ss-team-title", errors.title)} name="title" defaultValue={record?.title} maxLength={160} />
        </StoreField>
        {kind === "shift" ? (
          <>
            <StoreField id="ss-team-start" label="Início (horário de Brasília)" error={errors.starts}>
              <input {...fieldError("ss-team-start", errors.starts)} name="starts" type="datetime-local" defaultValue={localTime(record?.starts_at)} />
            </StoreField>
            <StoreField id="ss-team-end" label="Término (horário de Brasília)" error={errors.ends}>
              <input {...fieldError("ss-team-end", errors.ends)} name="ends" type="datetime-local" defaultValue={localTime(record?.ends_at)} />
            </StoreField>
            <StoreField id="ss-team-location" label="Ponto de atendimento (opcional)">
              <select id="ss-team-location" name="location" defaultValue={record?.location_id ?? ""}>
                <option value="">Sem ponto vinculado</option>
                {record?.location_id && !locations.some(({ id }) => id === record.location_id) && <option value={record.location_id}>{record.location_name}</option>}
                {locations.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
              </select>
            </StoreField>
          </>
        ) : (
          <StoreField id="ss-team-completed" label="Data de conclusão" error={errors.completed}>
            <input {...fieldError("ss-team-completed", errors.completed)} name="completed" type="date" defaultValue={record?.completed_on ?? todayInSaoPaulo()} max={todayInSaoPaulo()} />
          </StoreField>
        )}
        {record && <StoreField id="ss-team-status" label="Situação">
          <select id="ss-team-status" name="status" defaultValue={record.status}><option value="active">Ativo</option><option value="cancelled">Cancelado</option></select>
        </StoreField>}
        <div className="sm:col-span-2">
          <StoreField id="ss-team-notes" label="Observação (opcional)">
            <textarea id="ss-team-notes" name="notes" maxLength={600} rows={2} defaultValue={record?.notes ?? ""} />
          </StoreField>
        </div>
      </fieldset>
      {command.isError && <StoreFailure message={errorText} retry={command.isUncertain ? command.retry : undefined} retryLabel="Verificar envio" />}
      {stale && !command.isUncertain && <StoreFailure message="O registro mudou enquanto estava aberto." retryLabel="Carregar versão atual"
        retry={reload ? () => { if (!dirty || window.confirm("Descartar as alterações e carregar a versão atual?")) reload(); } : undefined} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="ss-primary" disabled={blocked || stale}>{command.isPending ? "Salvando…" : "Salvar registro"}</Button>
        <Button type="button" variant="outline" disabled={command.isPending} onClick={() => {
          if ((!dirty && !command.isUncertain) || window.confirm("Descartar as alterações do registro?")) close();
        }}>Cancelar</Button>
      </div>
    </form>
  );
}
