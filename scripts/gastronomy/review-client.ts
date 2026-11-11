import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';

const project = '0538d132-34dd-4347-a33c-526edac7339c';
const org = '00000000-0000-4000-a000-000000000001';
const user = { id: '00000000-0000-4000-a000-000000000010', email: 'qa@fenasoja.invalid' };
const session = { user, access_token: 'gastronomy-qa' };
const ok = (data: unknown) => ({ data, error: null });
const reference = OFFICIAL_REFERENCE_DATA;
let pendingInventory: Promise<any> | null = null;

function inventory() {
  if (!pendingInventory) {
    pendingInventory = fetch('/__gastronomy/inventory').then((result) => result.json()).then((result) => {
      if (result.error) throw new Error(result.error.message);
      return result.data;
    }).finally(() => { pendingInventory = null; });
  }
  return pendingInventory;
}

async function tableRows(table: string): Promise<Record<string, any>[]> {
  if (table === 'org_members') return [{ org_id: org, role: 'admin', organizations: { id: org, nome: 'Fenasoja QA' } }];
  if (table === 'user_roles') return [{ role: 'admin' }];
  if (table === 'user_capabilities') return ['map.view','map.manage_sales','map.manage_contracts'].map((capability) => ({ capability }));
  if (table === 'map_projects') return [{
    id: project, org_id: org, name: 'Parque Fenasoja', description: null, coordinate_system: 'LOCAL_NORMALIZED',
    reference_width: reference.project.referenceWidth, reference_height: reference.project.referenceHeight,
    active_version: 1, reference_revision: reference.project.referenceRevision, is_archived: false, is_published: true,
  }];
  if (table === 'map_calibrations') return [];
  if (table === 'map_layers') return reference.layers.map((l) => ({
    id: l.id, project_id: project, layer_key: l.key, name: l.name, description: l.description,
    color: l.color, opacity: l.opacity, is_visible: l.isVisible, is_locked: l.isLocked, sort_order: l.sortOrder,
  }));
  const snapshot = await inventory();
  const liveByCode = new Map<string, any>(snapshot.entities.map((entity: any) => [entity.public_identifier, entity]));
  const officialById = new Map(reference.entities.map((entity) => [entity.id, entity]));
  const toEntityId = (id: string | null) => id ? liveByCode.get(officialById.get(id)?.publicIdentifier ?? '')?.id ?? id : null;
  const cadastralRows = reference.entities.map((entity) => {
    const persisted = liveByCode.get(entity.publicIdentifier);
    return {
      id: persisted?.id ?? entity.id, project_id: project, layer_id: entity.layerId,
      parent_entity_id: toEntityId(entity.parentEntityId), segment_id: persisted?.segment_id ?? null,
      public_identifier: entity.publicIdentifier, name: entity.name, description: entity.description,
      classification: entity.classification, verification_status: entity.verificationStatus, is_sellable: entity.isSellable, is_archived: false,
      metadata: entity.metadata,
    };
  });
  if (table === 'map_entities') {
    const byId = new Map(cadastralRows.map((entity) => [entity.id, entity]));
    return [...cadastralRows, ...snapshot.entities.filter((row: any) => row.classification === 'FOOD_POINT')
      .map((row: any) => ({ ...row, layer_id: byId.get(row.parent_entity_id)?.layer_id }))];
  }
  if (table === 'map_entity_geometries') return reference.entities.map((entity) => ({
    id: entity.geometry.id ?? entity.id, project_id: project, entity_id: toEntityId(entity.id), geometry: entity.geometry,
    elevation: entity.geometry.elevation, extrusion_height: entity.geometry.extrusionHeight, rotation: entity.geometry.rotation,
    version: 1, is_current: true, calibration_version: entity.geometry.calibrationVersion,
  }));
  if (table === 'commercial_lots') return snapshot.lots;
  if (table === 'map_segments') return snapshot.segments;
  if (table === 'commercial_lot_pricing_2028') return snapshot.pricing;
  if (table === 'commercial_sale_eligibility') return snapshot.eligibility;
  if (table === 'commercial_exhibitors') return snapshot.exhibitors;
  if (table === 'lot_sale_orders') return snapshot.orders;
  if (table === 'lot_sale_order_items') return snapshot.items.map((item: any) => ({
    ...item, lot_sale_orders: snapshot.orders.find((order: any) => order.id === item.order_id),
  }));
  return [];
}

function query(table: string) {
  const filters: ((row: Record<string, any>) => boolean)[] = [];
  let limit = Infinity, from = 0, one = false;
  const sorters: ((a: Record<string, any>, b: Record<string, any>) => number)[] = [];
  const lookup = (row: Record<string, any>, key: string) => key.split('.').reduce((value, field) => value?.[field], row);
  const builder = {
    select: () => builder,
    eq: (key: string, value: unknown) => {
      filters.push((row) => lookup(row,key) === undefined || lookup(row,key) === value);
      return builder;
    },
    in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(lookup(row,key))); return builder; },
    is: (key: string, value: unknown) => { filters.push((row) => (lookup(row,key) ?? null) === value); return builder; },
    neq: (key: string, value: unknown) => { filters.push((row) => lookup(row,key) !== value); return builder; },
    order: (key: string) => { sorters.push((a,b) => String(a[key]).localeCompare(String(b[key]))); return builder; },
    limit: (n: number) => { limit = n; return builder; },
    range: (a: number, b: number) => { from = a; limit = b-a+1; return builder; },
    maybeSingle: () => { one = true; return builder; },
    single: () => { one = true; return builder; },
    abortSignal: () => builder,
    ilike: () => builder,
    or: () => builder,
    then: async (resolve: (data: unknown) => void) => {
      try {
        const rows = (await tableRows(table)).filter((row) => filters.every((f) => f(row)));
        sorters.forEach((sort) => rows.sort(sort));
        const selected = rows.slice(from, from + limit);
        resolve(ok(one ? selected[0] ?? null : selected));
      } catch (error) { resolve({ data: null, error }); }
    },
  };
  return builder;
}
function rpc(name: string, args: unknown) {
  const request = (signal?: AbortSignal) => fetch('/__gastronomy/rpc', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, args }), signal,
  }).then((response) => response.json());
  return { abortSignal: request, then: (resolve: any, reject: any) => request().then(resolve, reject) };
}
export const supabase = {
  auth: {
    onAuthStateChange(callback: (event: string, value: typeof session) => void) {
      queueMicrotask(() => callback('INITIAL_SESSION', session));
      return { data: { subscription: { unsubscribe() {} } } };
    },
    getSession: async () => ok({ session }),
    refreshSession: async () => ok({ session }),
    getUser: async () => ok({ user }),
  },
  from: query,
  rpc,
  functions: { invoke: async () => ok({}) },
  storage: { from: () => ({ createSignedUrl: async () => ok(null) }) },
};
