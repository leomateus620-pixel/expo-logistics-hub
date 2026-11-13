import { storeRpc, type StoreScope } from "./store";

export const locationKinds = { warehouse: "Estoque", point: "Ponto de atendimento", temporary: "Local temporário" } as const;
export const supplierKinds = { unspecified: "A definir", individual: "Pessoa física", company: "Pessoa jurídica" } as const;
export const directoryStatuses = { active: "Ativo", archived: "Arquivado" } as const;

export type DirectoryKind = "locations" | "suppliers";
export type DirectoryRow = {
  id: string;
  name: string;
  kind: keyof typeof locationKinds | keyof typeof supplierKinds;
  status: keyof typeof directoryStatuses;
  version: number;
  notes?: string | null;
  categories?: string[];
  lead_days?: number | null;
  terms?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  source_reference?: string | null;
};

export type DirectoryFilters = { search: string; type: string; status: string };

export function readDirectory(scope: StoreScope, kind: DirectoryKind, limit: number, offset: number) {
  return storeRpc<{ items: DirectoryRow[]; total: number }>(
    kind === "locations" ? "soja_store_locations" : "soja_store_suppliers",
    { ...scope, _limit: limit, _offset: offset },
  );
}

export async function* readDirectoryPages(scope: StoreScope, kind: DirectoryKind, signal?: AbortSignal) {
  // The existing RPCs authorize each server page and do not accept filter parameters.
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Consulta cancelada", "AbortError");
    const result = await readDirectory(scope, kind, limit, offset);
    if (signal?.aborted) throw signal.reason ?? new DOMException("Consulta cancelada", "AbortError");
    yield result.items;
    if (offset + result.items.length >= result.total || result.items.length < limit) return;
  }
}

function normalizeSearch(text: string) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");
}

export function matchesDirectoryFilters(
  row: Pick<DirectoryRow, "name" | "kind" | "status" | "categories">,
  filters: DirectoryFilters,
) {
  if (filters.type && row.kind !== filters.type) return false;
  if (filters.status && row.status !== filters.status) return false;
  const search = normalizeSearch(filters.search);
  return !search || [row.name, ...(row.categories ?? [])].some((field) => normalizeSearch(field).includes(search));
}
