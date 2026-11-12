import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { storeError, storeRpc, type CommandResult, type StoreScope } from "../api/store";
import { StoreFailure, StoreField, StoreHeading, StoreState } from "../components/StoreElements";
import { useStoreCommand } from "../hooks/useStoreCommand";
import { useUnsavedStoreForm } from "../hooks/useUnsavedStoreForm";

const classifications = {
  unverified: "A confirmar",
  official: "Documento efetivo",
  proposal: "Proposta ou minuta",
  minutes: "Ata",
  estimate: "Estimativa",
  historical: "Versão histórica",
  inspiration: "Inspiração",
} as const;

const mappedFields = {
  name: "Produto",
  sku: "SKU",
  quantity: "Quantidade",
  unit_cost: "Custo unitário",
} as const;

type MappedField = keyof typeof mappedFields;
type ImportPayload = {
  file_name: string;
  file_id: string;
  source_version: string;
  classification: string;
  as_of: string | null;
  sheet: string;
  delimiter: string;
  source_text: string;
  mapping: Partial<Record<MappedField, string>>;
};
const reviewStatuses = {
  staged: "Aguardando conferência",
  in_review: "Em conferência",
  reviewed: "Conferido",
} as const;

type ReviewedValues = Partial<Record<MappedField, string | null>>;
type Batch = {
  id: string;
  file_name: string;
  file_id: string;
  source_version: string;
  classification: keyof typeof classifications;
  sheet: string;
  as_of: string | null;
  sha256: string;
  row_count: number;
  flagged_count: number;
  pending_count: number;
  version: number;
  status: keyof typeof reviewStatuses;
  review_reason: string | null;
  created_at: string;
};
type PreviewLine = {
  source_row: number;
  original: Record<string, string>;
  normalized: ReviewedValues;
  warnings: string[];
  review: { version: number; status: "pending" | "checked"; values: ReviewedValues; reason: string } | null;
};
type Page<T> = { items: T[]; total: number };
type Props = { scope: StoreScope; queryKey: readonly unknown[]; canManage: boolean };

const listSize = 15;
const previewSize = 20;
const maxFileSize = 262144;
const uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

function importError(error: unknown) {
  const known: Record<string, string> = {
    SOJA_STORE_IMPORT_DUPLICATE_CONTENT: "Um lote com o mesmo conteúdo já está na lista.",
    SOJA_STORE_IMPORT_DUPLICATE_VERSION: "Esta versão do arquivo e da aba já consta na lista.",
    SOJA_STORE_IMPORT_EMPTY: "Inclua pelo menos uma linha de dados após os cabeçalhos.",
    SOJA_STORE_IMPORT_HEADER_NOT_FOUND: "Confira se os nomes informados no mapeamento correspondem aos cabeçalhos do arquivo.",
    SOJA_STORE_IMPORT_INVALID_HEADERS: "Preencha todos os cabeçalhos da primeira linha e use nomes distintos.",
    SOJA_STORE_IMPORT_ROW_LIMIT: "Cada lote aceita até 250 registros.",
    SOJA_STORE_IMPORT_COLUMN_LIMIT: "Cada arquivo pode ter até 30 colunas.",
    SOJA_STORE_IMPORT_CELL_LIMIT: "Cada célula pode ter até 2.000 caracteres.",
    SOJA_STORE_IMPORT_MAPPING_REQUIRED: "Informe pelo menos uma coluna para a prévia.",
    SOJA_STORE_IMPORT_ROW_WIDTH: "A linha tem uma quantidade de colunas diferente do cabeçalho.",
    SOJA_STORE_IMPORT_INVALID_CSV: "Confira as aspas e o separador do CSV.",
    SOJA_STORE_IMPORT_INVALID_REVIEW: "Informe a decisão, os valores e o motivo da conferência.",
    SOJA_STORE_IMPORT_INVALID_REVIEW_VALUE: "Confira o formato do valor informado.",
    SOJA_STORE_IMPORT_REOPEN_REQUIRED: "Reabra a conferência do lote para revisar a linha.",
    SOJA_STORE_IMPORT_REVIEW_STATE: "Atualize a prévia e confira as linhas pendentes antes de concluir.",
  };
  const rpc = error as { message?: string; details?: string } | null;
  const message = rpc?.message && known[rpc.message];
  if (!message) return storeError(error);
  return rpc.details && /^\d+$/.test(rpc.details) ? `Linha ${rpc.details}. ${message}` : message;
}

function formatCivilDate(value: string) {
  return value.split("-").reverse().join("/");
}

function warningLabel(warning: string) {
  const [field, reason] = warning.split(":") as [MappedField, string];
  const labels: Record<string, string> = {
    missing: "sem valor na fonte",
    formula: "expressão registrada como texto",
    ambiguous_number: "valor requer conferência",
    length: "texto excede o limite do cadastro",
  };
  return `${mappedFields[field] ?? field} · ${labels[reason] ?? reason}`;
}

function Pagination({ offset, size, total, onPage, label }: {
  offset: number;
  size: number;
  total: number;
  onPage: (next: number) => void;
  label: string;
}) {
  if (total <= size) return null;
  return (
    <nav aria-label={label} className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
      <Button type="button" variant="outline" disabled={!offset} onClick={() => onPage(offset - size)}>Anterior</Button>
      <p className="text-sm">Página {Math.floor(offset / size) + 1} de {Math.ceil(total / size)}</p>
      <Button type="button" variant="outline" disabled={offset + size >= total} onClick={() => onPage(offset + size)}>Próxima</Button>
    </nav>
  );
}

function showMappedValue(key: MappedField, value: string | null | undefined) {
  if (value == null) return "";
  return key === "quantity" || key === "unit_cost" ? value.replace(".", ",") : value;
}

function LineReviewForm({ scope, queryKey, batchId, line }: Omit<Props, "canManage"> & {
  batchId: string;
  line: PreviewLine;
}) {
  const [dirty, setDirty] = useState(false);
  const queryClient = useQueryClient();
  const form = useRef<HTMLFormElement>(null);
  const command = useStoreCommand(
    scope,
    (requestId, { version, ...payload }: { version: number; status: string; reason: string; values: ReviewedValues }) =>
      storeRpc<CommandResult>("soja_store_review_import_line", {
        ...scope, _request_id: requestId, _expected_version: version,
        _payload: { batch_id: batchId, source_row: line.source_row, ...payload },
      }),
    () => {
      setDirty(false);
      form.current?.reset();
      void queryClient.invalidateQueries({ queryKey: [...queryKey, "imports"] });
    },
  );
  useUnsavedStoreForm(dirty);
  const values = line.review?.values ?? line.normalized;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (command.isPending || command.isUncertain) return;
    const fields = new FormData(event.currentTarget);
    const reviewed = Object.fromEntries(Object.keys(values).map((key) => {
      const value = String(fields.get(key) ?? "").trim();
      return [key, value || null];
    }));
    command.mutate({
      version: line.review?.version ?? 0,
      status: String(fields.get("status")),
      reason: String(fields.get("reason")).trim(),
      values: reviewed,
    });
  }

  return (
    <details className="mt-3 border-t pt-2">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Registrar conferência</summary>
      <form ref={form} className="grid gap-3" onSubmit={submit} onChange={() => setDirty(true)}>
        <fieldset disabled={command.isPending || command.isUncertain} className="grid min-w-0 gap-3 sm:grid-cols-2">
          {Object.entries(values).map(([key, value]) => {
            const inputId = `ss-import-review-${line.source_row}-${key}`;
            return (
              <StoreField key={key} id={inputId} label={mappedFields[key as MappedField]}>
                <input id={inputId} name={key} maxLength={key === "name" ? 160 : key === "sku" ? 64 : 20}
                  inputMode={key === "quantity" || key === "unit_cost" ? "decimal" : "text"}
                  defaultValue={showMappedValue(key as MappedField, value)} />
              </StoreField>
            );
          })}
          <p className="text-xs text-[var(--ss-muted)] sm:col-span-2">Use vírgula decimal e até seis casas. Campo vazio registra valor desconhecido.</p>
          <StoreField id={`ss-import-review-status-${line.source_row}`} label="Situação da linha">
            <select id={`ss-import-review-status-${line.source_row}`} name="status" defaultValue={line.review?.status ?? "checked"}>
              <option value="checked">Conferida</option><option value="pending">Pendente</option>
            </select>
          </StoreField>
          <StoreField id={`ss-import-review-reason-${line.source_row}`} label="Motivo da conferência">
            <textarea id={`ss-import-review-reason-${line.source_row}`} name="reason" rows={2} required minLength={4} maxLength={600} />
          </StoreField>
        </fieldset>
        {command.isError && <StoreFailure message={importError(command.error)}
          retry={command.isUncertain ? command.retry : undefined} retryLabel="Verificar envio" />}
        <div>
          <Button type="submit" variant="outline" disabled={command.isPending || command.isUncertain}>
            {command.isPending ? "Salvando conferência…" : "Salvar conferência"}
          </Button>
        </div>
      </form>
    </details>
  );
}

function BatchReviewForm({ scope, queryKey, batch }: Omit<Props, "canManage"> & { batch: Batch }) {
  const [dirty, setDirty] = useState(false);
  const queryClient = useQueryClient();
  const form = useRef<HTMLFormElement>(null);
  const reviewed = batch.status === "reviewed";
  const command = useStoreCommand(
    scope,
    (requestId, { version, ...payload }: { version: number; action: "finish" | "reopen"; reason: string }) =>
      storeRpc<CommandResult>("soja_store_review_import_batch", {
        ...scope, _request_id: requestId, _expected_version: version, _payload: { batch_id: batch.id, ...payload },
      }),
    () => {
      form.current?.reset();
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: [...queryKey, "imports"] });
    },
  );
  useUnsavedStoreForm(dirty);

  if (batch.pending_count > 0) return null;
  return (
    <details className="rounded-lg border p-3">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">{reviewed ? "Reabrir conferência do lote" : "Concluir conferência do lote"}</summary>
      <form ref={form} className="grid gap-3" onChange={() => setDirty(true)} onSubmit={(event) => {
        event.preventDefault();
        if (!command.isPending && !command.isUncertain) {
          command.mutate({
            version: batch.version,
            action: reviewed ? "reopen" : "finish",
            reason: String(new FormData(event.currentTarget).get("reason") ?? "").trim(),
          });
        }
      }}>
        <StoreField id="ss-import-batch-review-reason" label={reviewed ? "Motivo da reabertura" : "Nota da conferência"}>
          <textarea id="ss-import-batch-review-reason" name="reason" rows={2} minLength={4} maxLength={600} required disabled={command.isPending || command.isUncertain} />
        </StoreField>
        {command.isError && <StoreFailure message={importError(command.error)}
          retry={command.isUncertain ? command.retry : undefined} retryLabel="Verificar envio" />}
        <div>
          <Button type="submit" variant="outline" disabled={command.isPending || command.isUncertain}>
            {command.isPending ? "Salvando…" : reviewed ? "Reabrir lote" : "Marcar lote como conferido"}
          </Button>
        </div>
      </form>
    </details>
  );
}

function BatchPreview({ scope, queryKey, id, canManage }: Props & { id: string }) {
  const [offset, setOffset] = useState(0);
  const preview = useQuery({
    queryKey: [...queryKey, "imports", id, offset],
    queryFn: () => storeRpc<Page<PreviewLine> & { batch: Batch }>("soja_store_import_preview", {
      ...scope, _batch_id: id, _limit: previewSize, _offset: offset,
    }),
    meta: { persist: false },
  });

  if (preview.isPending) return <StoreState title="Carregando prévia do lote" busy />;
  if (preview.isError) return <StoreFailure message={importError(preview.error)} retry={() => void preview.refetch()} />;

  const { batch, total, items } = preview.data;
  return (
    <section className="ss-surface grid gap-4" aria-labelledby="ss-import-preview">
      <div className="grid gap-1">
        <h2 id="ss-import-preview" className="break-all">{batch.file_name}</h2>
        <p className="text-sm text-[var(--ss-muted)]">
          {batch.row_count} {batch.row_count === 1 ? "linha" : "linhas"} · {batch.pending_count} pendentes · {reviewStatuses[batch.status]}
        </p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="min-w-0"><dt className="font-semibold">Origem</dt><dd className="break-all">{batch.file_id}</dd></div>
        <div className="min-w-0"><dt className="font-semibold">Versão</dt><dd className="break-all">{batch.source_version}</dd></div>
        <div><dt className="font-semibold">Classificação</dt><dd>{classifications[batch.classification]}</dd></div>
        <div><dt className="font-semibold">Data-base</dt><dd>{batch.as_of ? formatCivilDate(batch.as_of) : "A confirmar"}</dd></div>
        {batch.sheet && <div className="min-w-0"><dt className="font-semibold">Aba</dt><dd className="break-all">{batch.sheet}</dd></div>}
        <div className="min-w-0 sm:col-span-2"><dt className="font-semibold">SHA-256</dt><dd className="break-all font-mono text-xs">{batch.sha256}</dd></div>
        {batch.review_reason && <div className="min-w-0 sm:col-span-2"><dt className="font-semibold">Última decisão do lote</dt><dd className="break-words">{batch.review_reason}</dd></div>}
      </dl>
      <ul className="grid gap-3">
        {items.map((line) => (
          <li key={line.source_row} className="min-w-0 rounded-lg border p-3">
            <div className="flex flex-wrap justify-between gap-2">
              <h3 className="font-semibold">Linha {line.source_row}</h3>
              <span className="ss-pill" data-status={line.review?.status === "checked" || !line.warnings.length && !line.review ? "active" : "draft"}>
                {line.review?.status === "checked" ? "Conferida" : line.review || line.warnings.length ? "Pendente" : "Mapeada"}
              </span>
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {Object.entries(line.review?.values ?? line.normalized).map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <dt className="font-medium">{mappedFields[key as MappedField]}</dt>
                  <dd className="break-words">{showMappedValue(key as MappedField, value) || "A confirmar"}</dd>
                </div>
              ))}
            </dl>
            {line.warnings.length > 0 && <ul aria-label="Divergências no mapeamento inicial" className="mt-3 list-inside list-disc text-sm">{line.warnings.map((warning) => <li key={warning}>{warningLabel(warning)}</li>)}</ul>}
            {line.review && <p className="mt-3 break-words text-sm"><strong>Nota da conferência</strong> · {line.review.reason}</p>}
            <details className="mt-3">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Valores na fonte</summary>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                {Object.entries(line.original).map(([key, value]) => (
                  <div key={key} className="min-w-0">
                    <dt className="break-words font-medium">{key}</dt>
                    <dd className="whitespace-pre-wrap break-words">{value || "Campo vazio"}</dd>
                  </div>
                ))}
              </dl>
            </details>
            {canManage && batch.status !== "reviewed" && <LineReviewForm key={line.review?.version ?? 0} scope={scope} queryKey={queryKey} batchId={batch.id} line={line} />}
          </li>
        ))}
      </ul>
      <Pagination offset={offset} size={previewSize} total={total} onPage={setOffset} label="Paginação das linhas do lote" />
      {canManage && <BatchReviewForm scope={scope} queryKey={queryKey} batch={batch} />}
    </section>
  );
}

export function ImportStagingPage({ scope, queryKey, canManage }: Props) {
  const [params, setParams] = useSearchParams();
  const [offset, setOffset] = useState(0);
  const [fileError, setFileError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [reading, setReading] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const selection = params.get("lote");
  const batchId = selection && uuidPattern.test(selection) ? selection : null;

  const batches = useQuery({
    queryKey: [...queryKey, "imports", "batches", offset],
    queryFn: () => storeRpc<Page<Batch>>("soja_store_import_batches", {
      ...scope, _limit: listSize, _offset: offset,
    }),
    meta: { persist: false },
  });

  const command = useStoreCommand<ImportPayload>(
    scope,
    (requestId, payload) => storeRpc<CommandResult>("soja_store_stage_import", {
      ...scope, _request_id: requestId, _payload: payload,
    }),
    (result) => {
      form.current?.reset();
      setDirty(false);
      setOffset(0);
      setParams({ lote: result.id });
      void queryClient.invalidateQueries({ queryKey: [...queryKey, "imports"] });
    },
  );
  useUnsavedStoreForm(dirty);
  const formBusy = reading || command.isPending;

  async function stage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (formBusy || command.isUncertain) return;
    const data = new FormData(event.currentTarget);
    const value = (field: string) => String(data.get(field) ?? "").trim();
    const file = data.get("csv");
    setFileError("");
    if (!(file instanceof File) || file.size < 1 || file.size > maxFileSize || !/\.csv$/i.test(file.name)) {
      setFileError("Selecione um CSV de até 256 KiB.");
      fileInput.current?.focus();
      return;
    }

    const mapping = Object.fromEntries(Object.keys(mappedFields).map((key) => [key, value(key)]).filter(([, header]) => header));
    if (!Object.keys(mapping).length) {
      setFileError("Preencha pelo menos um campo de mapeamento.");
      form.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
      return;
    }

    setReading(true);
    try {
      const original = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
      if (original.includes("\0")) throw new Error("NUL");
      command.mutate({
        file_name: file.name,
        file_id: value("file_id"),
        source_version: value("source_version"),
        classification: value("classification"),
        as_of: value("as_of") || null,
        sheet: value("sheet"),
        delimiter: value("delimiter"),
        source_text: original,
        mapping,
      });
    } catch {
      setFileError("Exporte o arquivo como CSV em UTF-8 e selecione-o novamente.");
      fileInput.current?.focus();
    } finally {
      setReading(false);
    }
  }

  return (
    <>
      <StoreHeading title="Importações" description="Guarde fontes e confira o mapeamento antes de qualquer lançamento." />
      {canManage && (
        <form ref={form} onSubmit={(event) => void stage(event)} onChange={() => setDirty(true)} className="ss-surface grid gap-4" aria-busy={formBusy}>
          <div>
            <h2>Preparar lote</h2>
            <p className="mt-1 text-sm text-[var(--ss-muted)]">Revise a origem, os valores mapeados e as divergências na prévia do lote.</p>
          </div>
          <fieldset disabled={formBusy || command.isUncertain} className="grid min-w-0 gap-3 sm:grid-cols-2">
            <StoreField id="ss-import-file" label="Arquivo CSV">
              <input ref={fileInput} id="ss-import-file" name="csv" type="file" accept=".csv,text/csv" required aria-describedby="ss-import-limit" />
              <p id="ss-import-limit" className="text-xs text-[var(--ss-muted)]">UTF-8, até 256 KiB, com cabeçalho, 30 colunas e 250 registros.</p>
            </StoreField>
            <StoreField id="ss-import-delimiter" label="Separador de colunas">
              <select id="ss-import-delimiter" name="delimiter" defaultValue=";">
                <option value=";">Ponto e vírgula (;)</option><option value=",">Vírgula (,)</option>
              </select>
            </StoreField>
            <StoreField id="ss-import-source" label="Identificador do arquivo de origem">
              <input id="ss-import-source" name="file_id" required maxLength={240} placeholder="ID no Drive ou código documental" />
            </StoreField>
            <StoreField id="ss-import-version" label="Versão da fonte">
              <input id="ss-import-version" name="source_version" required maxLength={160} placeholder="Versão do arquivo ou revisão registrada" />
            </StoreField>
            <StoreField id="ss-import-classification" label="Classificação da fonte">
              <select id="ss-import-classification" name="classification">
                {Object.entries(classifications).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </StoreField>
            <StoreField id="ss-import-sheet" label="Aba, se aplicável">
              <input id="ss-import-sheet" name="sheet" maxLength={120} />
            </StoreField>
            <StoreField id="ss-import-date" label="Data-base, se confirmada">
              <input id="ss-import-date" name="as_of" type="date" />
            </StoreField>
          </fieldset>
          <fieldset disabled={formBusy || command.isUncertain} className="grid min-w-0 gap-3 border-t pt-3 sm:grid-cols-2">
            <legend className="pr-2 font-semibold">Mapear colunas</legend>
            <p className="text-sm text-[var(--ss-muted)] sm:col-span-2">Digite o nome do cabeçalho correspondente. Informe pelo menos uma coluna.</p>
            {Object.entries(mappedFields).map(([key, label]) => (
              <StoreField key={key} id={`ss-import-map-${key}`} label={label}>
                <input id={`ss-import-map-${key}`} name={key} maxLength={100} placeholder="Nome da coluna na fonte" />
              </StoreField>
            ))}
          </fieldset>
          {fileError && <StoreFailure message={fileError} />}
          {command.isError && <StoreFailure message={importError(command.error)}
            retry={command.isUncertain ? command.retry : undefined} retryLabel="Verificar envio" />}
          <div>
            <Button type="submit" className="ss-primary" disabled={formBusy || command.isUncertain}>
              <FileSpreadsheet aria-hidden="true" /> {formBusy ? "Preparando lote…" : "Salvar lote para conferência"}
            </Button>
          </div>
        </form>
      )}
      {batches.isPending ? <StoreState title="Carregando lotes" busy /> : batches.isError ? (
        <StoreFailure message={importError(batches.error)} retry={() => void batches.refetch()} />
      ) : !batches.data.items.length ? (
        <StoreState title="Nenhum lote preparado" description="Os arquivos preparados para conferência aparecem aqui." />
      ) : (
        <section className="ss-surface" aria-labelledby="ss-import-batches">
          <h2 id="ss-import-batches">Lotes para conferência</h2>
          <ul className="mt-2 divide-y">
            {batches.data.items.map((batch) => (
              <li key={batch.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="break-all font-semibold">{batch.file_name}</p>
                  <p className="text-sm text-[var(--ss-muted)]">{classifications[batch.classification]} · {batch.row_count} linhas · {batch.pending_count} pendentes · {reviewStatuses[batch.status]}</p>
                </div>
                <Button type="button" variant="outline" aria-pressed={batchId === batch.id} onClick={() => setParams({ lote: batch.id })}>Abrir prévia</Button>
              </li>
            ))}
          </ul>
          <Pagination offset={offset} size={listSize} total={batches.data.total} onPage={setOffset} label="Paginação dos lotes" />
        </section>
      )}
      {batchId && <BatchPreview key={batchId} scope={scope} queryKey={queryKey} id={batchId} canManage={canManage} />}
    </>
  );
}
