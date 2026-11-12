import { storeRpc, type StoreScope } from "./store";

type StockOwnership = "own" | "third_party";

type StockPosition = {
  variant_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  variant_label: string | null;
  unit: string;
  location_id: string;
  location_name: string;
  ownership: StockOwnership;
  owner_supplier_id: string | null;
  owner_supplier_name?: string | null;
  destination: string;
  quantity: string;
};

export type StockBalance = StockPosition & {
  last_movement_at: string;
};

export type StockMovement = StockPosition & {
  id: string;
  movement_type: "purchase_receipt";
  occurred_on: string;
  recorded_at: string;
  purchase_id: string;
  receipt_id: string;
};

type StockList<T> = { total: number; items: T[] };

type StockOptions = {
  locations: Array<{ id: string; name: string }>;
  variants: Array<{ id: string; product_id: string; product_name: string; sku: string; label: string | null; unit: string }>;
};

type StockFilters = {
  locationId: string;
  variantId: string;
  limit: number;
  offset: number;
};

function stockArgs(scope: StoreScope, filters: StockFilters) {
  return {
    ...scope,
    _location_id: filters.locationId || null,
    _variant_id: filters.variantId || null,
    _limit: filters.limit,
    _offset: filters.offset,
  };
}

export async function readStock(scope: StoreScope, filters: StockFilters, view: "saldos" | "movimentos") {
  const args = stockArgs(scope, filters);
  if (view === "movimentos") {
    const result = await storeRpc<StockList<StockMovement>>("soja_store_stock_movements", args);
    return { view, ...result };
  }
  const result = await storeRpc<StockList<StockBalance>>("soja_store_stock", args);
  return { view, ...result };
}

export function readStockOptions(scope: StoreScope, search: string, locationId: string, variantId: string) {
  return storeRpc<StockOptions>("soja_store_stock_options", {
    ...scope,
    _search: search || null,
    _location_id: locationId || null,
    _variant_id: variantId || null,
    _limit: 30,
  });
}
