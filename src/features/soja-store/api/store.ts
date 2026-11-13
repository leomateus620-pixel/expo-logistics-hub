import { supabase } from "@/integrations/supabase/client";
import type { Product, ProductStatus, productPayload } from "../domain/catalog";

export type StoreScope = {
  _org_id: string;
  _commission_id: string;
};

export type CommandResult = {
  id: string;
  version: number;
  status: string;
};

export type StoreCommand = {
  _request_id: string;
  _expected_version: number | null;
  _payload: object;
};

// The JSON returned by the RPCs follows the read models in this feature.
export async function storeRpc<T>(name: `soja_store_${string}`, args: StoreScope & Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  return data as T;
}

export function readCatalog(scope: StoreScope, search: string, status: ProductStatus | "", offset: number) {
  return storeRpc<{ items: Product[]; total: number }>("soja_store_catalog", {
    ...scope, _search: search || null, _status: status || null, _limit: 30, _offset: offset,
  });
}

export function readProduct(scope: StoreScope, id: string) {
  return storeRpc<Product | null>("soja_store_product", { ...scope, _product_id: id });
}

export function saveProduct(
  scope: StoreScope,
  command: Omit<StoreCommand, "_payload"> & { _payload: ReturnType<typeof productPayload> },
) {
  return storeRpc<CommandResult>("soja_store_save_product", { ...scope, ...command });
}

function isAmbiguous(error: unknown) {
  const code = String((error as { code?: string } | null)?.code ?? "");
  return !code || /^(08|5[0-9]{2}|PGRST00[0-3]|57014)/.test(code);
}

export class PendingCommandError extends Error {}

export async function executeStoreCommand(
  scope: StoreScope,
  requestId: string,
  execute: () => Promise<CommandResult>,
  checkFirst: boolean,
): Promise<CommandResult> {
  const checkResult = () => storeRpc<CommandResult | null>("soja_store_request_status", {
    ...scope, _request_id: requestId,
  });
  if (checkFirst) {
    try {
      const existing = await checkResult();
      if (existing) return existing;
    } catch (error) {
      if (isAmbiguous(error)) throw new PendingCommandError();
      throw error;
    }
  }
  try {
    return await execute();
  } catch (error) {
    if (!isAmbiguous(error)) throw error;
    const existing = await checkResult().catch(() => null);
    if (existing) return existing;
    throw new PendingCommandError();
  }
}

export function storeError(error: unknown): string {
  if (error instanceof PendingCommandError) {
    return "A confirmação ficou pendente. Tente verificar o envio novamente.";
  }
  const details = error as { code?: string; message?: string } | null;
  const message = details?.message ?? "";
  if (details?.code === "42501") return "Seu acesso a este recurso precisa ser verificado.";
  if (details?.code === "23505" || /DUPLICATE_SKU|DUPLICATE_BARCODE/i.test(message)) return "Já existe um cadastro com este código. Revise o código e tente novamente.";
  if (/DUPLICATE_LOCATION/i.test(message)) return "Já existe um local com este nome.";
  if (/LOCATION_HAS_PENDING_PURCHASES/i.test(message)) return "Este local tem pedidos pendentes de recebimento.";
  if (/LOCATION_HAS_STOCK/i.test(message)) return "Este local ainda tem estoque físico registrado.";
  if (/OPENING_ALREADY_RECORDED/i.test(message)) return "Esta posição já tem movimentos. Atualize a consulta para registrar um ajuste.";
  if (/OPENING_REQUIRED/i.test(message)) return "Registre primeiro a contagem inicial desta posição.";
  if (/STOCK_INSUFFICIENT/i.test(message)) return "A quantidade solicitada excede o saldo físico disponível.";
  if (/TRANSFER_INSUFFICIENT/i.test(message)) return "A origem não tem quantidade disponível para a expedição.";
  if (/TRANSFER_EXCEEDS_TRANSIT/i.test(message)) return "A quantidade conferida supera o saldo em trânsito.";
  if (/TRANSFER_INVALID_STATUS/i.test(message)) return "Esta transferência mudou de situação. Confira a versão atual.";
  if (/TRANSFER_UNIT_CHANGED/i.test(message)) return "A unidade do produto mudou. Cancele a solicitação e registre uma nova.";
  if (/LOCATION_HAS_PENDING_TRANSFERS/i.test(message)) return "Este local tem transferências em aberto.";
  if (/PRODUCT_UNIT_IN_USE/i.test(message)) return "A unidade está vinculada a pedidos. Mantenha a unidade usada nesses registros.";
  if (/RECEIPT_EXCEEDS_PENDING|PURCHASE_ALREADY_RECEIVED/i.test(message)) return "A quantidade informada supera o saldo pendente deste pedido.";
  if (/PURCHASE_SUPPLIER_UNAVAILABLE/i.test(message)) return "O fornecedor não está mais disponível para novos pedidos.";
  if (/PURCHASE_LOCATION_UNAVAILABLE/i.test(message)) return "Selecione um local ativo para receber o pedido.";
  if (/PURCHASE_VARIANT_UNAVAILABLE/i.test(message)) return "Um dos SKUs não está mais disponível para novos pedidos.";
  if (details?.code === "PT404") return "Este registro não foi encontrado.";
  if (/VERSION|STALE/i.test(message)) return "Este cadastro foi atualizado. Confira a versão atual antes de enviar as alterações.";
  if (/ARCHIV|IMMUTABLE/i.test(message)) return "Este cadastro não permite a alteração solicitada.";
  return "A solicitação falhou. Confira os dados e tente novamente.";
}
