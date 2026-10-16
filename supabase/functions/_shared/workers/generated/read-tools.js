// @ts-self-types="./read-tools.d.ts"
// AUTO-GENERATED. Do not edit; canonical source: src/lib/workers/index.ts.
// Regenerate: node scripts/workers/build-edge-registry.mjs
// Verify without writing: node scripts/workers/build-edge-registry.mjs --check
// Source inputs + generator SHA256: e1c4f6d3fdf6988526ede48adf7605831d709272a7e312dc58a9ab8a31639544
// esbuild: 0.21.5; ESM JavaScript; external runtime dependency: zod.
// Input src/lib/workers/access.ts SHA256 f41ad9816a52e57d67ca57bfbbbd08736ef3a508b8e0dca1078addd43619307a
// Input src/lib/workers/catalog.ts SHA256 b7a40864279ee0f1308651b42b0c9fafc66e4e311390732e8411f449b3dd52af
// Input src/lib/workers/index.ts SHA256 658986def892b6cd32d73c89a1a94ea6877a623694bc151d46af8ba651e80a7c
// Input src/lib/workers/inventory.ts SHA256 68e24327d4120f412fcac87ede4721163c405b93be2a42ed56bb5d784bdbea82
// Input src/lib/workers/privacy.ts SHA256 1f5fcc2d31575238767494eb18f8fdb6bbd8b685c6b3ce9ffa39b2fc99a26a7c
// Input src/lib/workers/registry.ts SHA256 dd821c6dc80499cd56bf7af09a6038258160fe09632a1b09acaa998cec2da250
// Input src/lib/workers/schema.ts SHA256 86bc5f371ae14416e79688b9a6029291fb8db1abe0d59c97a1d15f9eeca6e35f
// Input src/lib/workers/sources.ts SHA256 af245859f8481999a02ea16fd0c03382eafff9ff32e6ede8d74a0ef0a7f971cd
// Input src/lib/workers/tools/agenda/index.ts SHA256 3b4d5b0e0f583e0edbd136d683cd8f385746ca2fde6f62fc6aa7b57db2b4173f
// Input src/lib/workers/tools/arena/index.ts SHA256 200c83ae297c0fc81c6b11d0b04c7f4442bd3f71c298d7000c63c40cd551c29e
// Input src/lib/workers/tools/caixa/index.ts SHA256 38a118eb2924901d1695fea37e1b7dd6fd889860e22f8836dd6aed3f5d857c4a
// Input src/lib/workers/tools/comissao/index.ts SHA256 b3f38078138b02993d5b1bc6dda18a03a24a3833505b3270e75ed1bc3050d1ad
// Input src/lib/workers/tools/definition.ts SHA256 a6b7ca50a6c33e22ad28fea8422b7333a73fc5021f4fdada53e6a3c33ee5dd69
// Input src/lib/workers/tools/interesse/index.ts SHA256 a7786eab88fca2eed15c896cc677c581245f0ad2cbdfd97bb4a511204cda21be
// Input src/lib/workers/tools/logistica/index.ts SHA256 368ec161b47faf07bf5966f264c14b529e16a04fac4290ade7674236eb92538c
// Input src/lib/workers/tools/mapa/index.ts SHA256 9cce562b2078fbd9f322eba34523365c806559664c820e9a911640cca7a5cd2f
// Input src/lib/workers/types.ts SHA256 c75e201077db938b62e345990ea796ce2576d9b49da6d9f943abc18587f99819

// src/lib/workers/types.ts
var WorkerToolError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "WorkerToolError";
  }
};

// src/lib/workers/access.ts
var roles = ["admin", "gestor", "operador", "leitura"];
async function resolveWorkerAccess(client, userId, orgId) {
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth?.user || auth.user.id !== userId || auth.user.role === "service_role") {
    throw new WorkerToolError("AUTH_REQUIRED", "Sessão de usuário necessária.");
  }
  const { data: member, error: memberError } = await client.from("org_members").select("role,org_id,user_id").eq("user_id", userId).eq("org_id", orgId).eq("is_active", true).maybeSingle();
  if (memberError || !member || member.org_id !== orgId || member.user_id !== userId || !roles.includes(member.role)) {
    throw new WorkerToolError("PERMISSION_DENIED", "Organização sem vínculo ativo.");
  }
  const { data: grants, error: grantsError } = await client.from("user_capabilities").select("capability").eq("user_id", userId).eq("org_id", orgId);
  if (grantsError) throw new WorkerToolError("PERMISSION_DENIED", "Não foi possível verificar as permissões.");
  return { userId, orgId, role: member.role, capabilities: new Set((grants ?? []).map((item) => item.capability)), supabase: client };
}
function hasWorkerPolicy(policy, ctx) {
  const caps = ctx.capabilities;
  const elevated = ctx.role === "admin" || ctx.role === "gestor";
  const operator = ctx.role === "operador" && !caps.has("restricted_scope");
  const full = elevated || operator || caps.has("full_access");
  const map = (cap) => elevated || caps.has(cap) || caps.has("map.admin") || caps.has("full_access");
  switch (policy) {
    case "member":
      return true;
    case "commission":
      return true;
    case "map":
      return operator || map("map.view");
    case "map_sales":
      return map("map.manage_sales");
    case "map_contracts":
      return map("map.manage_sales") && map("map.manage_contracts");
    case "analytics":
      return (full || caps.has("map.analytics.view")) && map("map.manage_sales");
    case "venue":
      return full || caps.has("venue_events_access") || caps.has("venue_events_full_access");
    case "venue_reports":
      return full || caps.has("venue_counterparts_manage") || caps.has("venue_reports_view") || caps.has("venue_events_full_access");
    case "financial":
      return ctx.role === "admin" || ["financial_access", "financial_edit", "financial_confirm", "financial_settle", "financial_admin"].some((cap) => caps.has(cap));
    case "logistics":
      return full;
  }
}
async function authorizeWorkerPolicy(policy, ctx) {
  if (!hasWorkerPolicy(policy, ctx)) return false;
  if (policy === "financial") {
    const { data, error } = await ctx.supabase.rpc("financial_can", { _org_id: ctx.orgId, _capability: "financial_access" });
    return !error && data === true;
  }
  if (policy === "venue" || policy === "venue_reports") {
    const { data, error } = await ctx.supabase.rpc("venue_get_permissions", { _org_id: ctx.orgId });
    if (error || !data || typeof data !== "object") return false;
    const permissions = data;
    return permissions.venue_events_access === true && (policy !== "venue_reports" || permissions.venue_reports_view === true || permissions.venue_counterparts_manage === true);
  }
  if (policy === "map_sales" || policy === "map_contracts" || policy === "analytics") {
    const { data, error } = await ctx.supabase.rpc("map_has_explicit_capability", { _org_id: ctx.orgId, _capability: "map.manage_sales" });
    if (error || data !== true) return false;
    if (policy === "map_contracts") {
      const result = await ctx.supabase.rpc("map_has_explicit_capability", { _org_id: ctx.orgId, _capability: "map.manage_contracts" });
      return !result.error && result.data === true;
    }
  }
  return true;
}

// src/lib/workers/schema.ts
import { z } from "zod";
function workerJsonSchema(schema) {
  if (schema instanceof z.ZodOptional) return workerJsonSchema(schema.unwrap());
  if (schema instanceof z.ZodDefault) return { ...workerJsonSchema(schema._def.innerType), default: schema._def.defaultValue() };
  if (schema instanceof z.ZodString) {
    const result = { type: "string" };
    for (const check of schema._def.checks) {
      if (check.kind === "uuid") result.format = "uuid";
      if (check.kind === "min") result.minLength = check.value;
      if (check.kind === "max") result.maxLength = check.value;
      if (check.kind === "regex") result.pattern = check.regex.source;
      if (check.kind === "datetime") result.format = "date-time";
    }
    if (schema.description) result.description = schema.description;
    return result;
  }
  if (schema instanceof z.ZodNumber) {
    const result = { type: "number" };
    for (const check of schema._def.checks) {
      if (check.kind === "int") result.type = "integer";
      if (check.kind === "min") result.minimum = check.value;
      if (check.kind === "max") result.maximum = check.value;
    }
    return result;
  }
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodEnum) return { type: "string", enum: schema.options };
  if (schema instanceof z.ZodArray) return { type: "array", items: workerJsonSchema(schema.element), maxItems: schema._def.maxLength?.value ?? 100 };
  if (schema instanceof z.ZodObject) {
    const properties = {};
    const required2 = [];
    for (const [key, field] of Object.entries(schema.shape)) {
      properties[key] = workerJsonSchema(field);
      if (!field.isOptional()) required2.push(key);
    }
    return { type: "object", properties, additionalProperties: false, ...required2.length ? { required: required2 } : {} };
  }
  throw new Error("Unsupported worker input schema");
}
var uuid = () => z.string().uuid();
var date = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
var timestamp = () => z.string().datetime({ offset: true });
var limit = () => z.number().int().min(1).max(100).default(20);
var listEventsInput = z.object({
  from_date: date().optional().describe("Data inicial (YYYY-MM-DD)."),
  to_date: date().optional().describe("Data final (YYYY-MM-DD)."),
  status: z.string().max(60).optional(),
  search: z.string().max(120).optional(),
  limit: limit()
}).strict();
var getEventInput = z.object({ event_id: uuid().describe("ID do evento.") }).strict();
var listTransportsInput = z.object({
  status: z.string().max(60).optional(),
  from_datetime: timestamp().optional(),
  to_datetime: timestamp().optional(),
  limit: limit()
}).strict();

// src/lib/workers/tools/definition.ts
import { z as z2 } from "zod";
var required = {
  member: [],
  commission: [],
  map: ["map.view"],
  map_sales: ["map.manage_sales"],
  map_contracts: ["map.manage_sales", "map.manage_contracts"],
  analytics: ["map.analytics.view", "map.manage_sales"],
  venue: ["venue_events_access"],
  venue_reports: ["venue_events_access"],
  financial: ["financial_access"],
  logistics: ["full_access"]
};
var input = (shape = {}) => z2.object(shape).strict();
var project = () => ({ project_id: uuid(), limit: limit() });
var commission = () => ({ commission_id: uuid(), limit: limit() });
var financial = () => input({ edition_id: uuid() });
function tool(name, worker, title, description, inputSchema, policy, deepLink, sources) {
  return Object.freeze({
    name,
    worker,
    title,
    description,
    inputSchema,
    inputJsonSchema: workerJsonSchema(inputSchema),
    readOnly: true,
    requiresConfirmation: false,
    capability: Object.freeze({ policy, required: required[policy], ...policy === "venue_reports" ? { anyOf: ["venue_reports_view", "venue_counterparts_manage"] } : {}, membershipRequired: true, scope: "JWT do usuário + organização ativa + RLS + escopo persistido do registro" }),
    deepLink,
    sources: Object.freeze([...sources])
  });
}

// src/lib/workers/tools/agenda/index.ts
var agendaTools = [
  tool("list_events", "agenda", "Agenda Fenasoja", "Consulta eventos visíveis no período. Descrições privadas e contatos são omitidos.", listEventsInput, "member", "/cronograma-eventos", ["cronograma_eventos_full"]),
  tool("get_event", "agenda", "Detalhe do evento", "Consulta dados operacionais seguros de um evento visível.", getEventInput, "member", "/cronograma-eventos", ["cronograma_eventos_full"]),
  tool("list_subevents", "agenda", "Subeventos", "Consulta subeventos visíveis do evento informado.", input({ event_id: uuid(), limit: limit() }), "member", "/cronograma-eventos", ["cronograma_eventos_full", "cronograma_subeventos"]),
  tool("commission_agenda", "agenda", "Agenda por comissão", "Consulta agenda da comissão persistida, sob RLS.", input(commission()), "member", "/cronograma-eventos", ["commissions", "cronograma_unit_agenda"]),
  tool("commission_metrics", "agenda", "Métricas por comissão", "Retorna métricas calculadas da comissão, sob RLS.", input({ commission_id: uuid() }), "member", "/cronograma-eventos", ["commissions", "cronograma_unit_metrics"])
];

// src/lib/workers/tools/arena/index.ts
import { z as z3 } from "zod";
var arenaTools = [
  tool("list_venue_events", "arena", "Eventos da Arena e Restaurante", "Consulta datas, estado e público de eventos; omite notas internas, contatos e pagamentos.", input({ from_datetime: timestamp().optional(), to_datetime: timestamp().optional(), limit: limit() }), "venue", "/eventos-restaurante-arena", ["venue_events"]),
  tool("venue_availability", "arena", "Disponibilidade de espaços", "Consulta conflitos em espaços persistidos; não reserva nem altera ocupações.", input({ space_ids: z3.array(uuid()).min(1).max(10), setup_start_at: timestamp(), teardown_end_at: timestamp() }), "venue", "/eventos-restaurante-arena", ["venue_spaces", "venue_check_availability"]),
  tool("venue_occupancy", "arena", "Ocupação", "Consulta períodos de ocupações ativas.", input({ limit: limit() }), "venue", "/eventos-restaurante-arena", ["venue_occupancies"]),
  tool("venue_counterparts", "arena", "Saldos de contrapartida", "Consulta somente quantidades agregadas autorizadas.", input({ limit: limit() }), "venue_reports", "/eventos-restaurante-arena", ["venue_counterpart_balances"]),
  tool("restaurant_alert", "arena", "Conflitos Restaurante × Agenda", "Consulta alerta de conflito no intervalo. Não altera agenda nem reservas.", input({ from_date: date(), to_date: date() }), "venue", "/cronograma-eventos", ["cronograma_restaurant_alert"])
];

// src/lib/workers/tools/mapa/index.ts
import { z as z4 } from "zod";
var mapaTools = [
  tool("map_projects", "mapa", "Projetos comerciais", "Lista projetos ativos visíveis.", input({ limit: limit() }), "map", "/mapa-comercial", ["map_projects"]),
  tool("map_segments", "mapa", "Segmentos do mapa", "Consulta segmentos ativos do projeto autorizado.", input(project()), "map", "/mapa-comercial", ["map_projects", "map_segments"]),
  tool("map_entities", "mapa", "Identificação de pavilhões", "Consulta entidades persistidas para relacionar lote, pavilhão e segmento. Não retorna geometria.", input({ ...project(), segment_id: uuid().optional() }), "map", "/mapa-comercial", ["map_projects", "map_entities"]),
  tool("map_inventory", "mapa", "Inventário comercial", "Lista lotes ativos com identidade persistida; distingue SALE_OPEN de SOLD. Total refere-se ao filtro e registros podem ser parciais.", input({ ...project(), status: z4.enum(["AVAILABLE", "BLOCKED", "RESERVED", "IN_NEGOTIATION", "SALE_OPEN", "SOLD"]).optional() }), "map", "/mapa-comercial", ["map_projects", "commercial_lots"]),
  tool("map_prices", "mapa", "Preços autorizados", "Consulta preços oficiais sob RLS; nunca altera valores.", input({ ...project(), pavilion: z4.string().max(80).optional() }), "map", "/mapa-comercial", ["map_projects", "commercial_lot_pricing_2028"]),
  tool("map_segment_inventory", "mapa", "Completude do segmento", "Retorna contagens estruturais, sem inferir inventário comercial.", input({ project_id: uuid(), segment_id: uuid() }), "map", "/mapa-comercial", ["map_projects", "map_segments", "get_commission_map_segment_inventory"]),
  tool("list_sale_orders", "mapa", "Vendas em aberto e confirmadas", "Consulta estados e quantidade de itens; omite comprador, contatos, valores e pagamentos.", input({ ...project(), status: z4.enum(["PENDING", "SIGNED", "PARTIAL", "CANCELLED_PARTIAL", "LEGACY"]).optional(), has_document: z4.boolean().optional() }), "map_sales", "/mapa-comercial", ["map_projects", "list_commercial_sale_orders"]),
  tool("sale_order_detail", "mapa", "Itens de uma venda", "Consulta itens e estado de assinatura. Não confirma, cancela ou revisa venda; não retorna dados pessoais nem parcelas.", input({ project_id: uuid(), order_id: uuid() }), "map_sales", "/mapa-comercial", ["map_projects", "lot_sale_orders", "get_commercial_sale_order_detail"]),
  tool("sale_order_contract_summary", "mapa", "Abrangência dos contratos", "Consulta somente quantidade e lotes abrangidos pelos contratos autorizados de uma venda; sem arquivos, contatos ou pagamentos.", input({ project_id: uuid(), order_id: uuid() }), "map_contracts", "/mapa-comercial", ["map_projects", "lot_sale_orders", "get_commercial_sale_order_detail"])
];

// src/lib/workers/tools/interesse/index.ts
var interesseTools = [
  tool("interest_summary", "interesse", "Interesse por área", "Consulta estatísticas agregadas dos links da organização; sem token ou identidade dos visitantes.", input({ from_datetime: timestamp().optional(), to_datetime: timestamp().optional() }), "analytics", "/mapa-comercial", ["workers_interest_summary"]),
  tool("public_links_overview", "interesse", "Links por área", "Consulta nomes e estado dos links da organização; nunca retorna URLs públicas ou tokens.", input(), "analytics", "/mapa-comercial", ["workers_public_links_overview"])
];

// src/lib/workers/tools/comissao/index.ts
var comissaoTools = [
  tool("my_commissions", "comissao", "Minhas comissões", "Consulta comissões do vínculo persistido. Somente admin consulta a visão central.", input({ limit: limit() }), "commission", "/portal", ["commissions", "commission_responsibles"]),
  tool("commission_responsibles", "comissao", "Responsáveis da comissão", "Consulta nomes e papéis da comissão autorizada, sem contatos.", input(commission()), "commission", "/portal", ["commissions", "commission_responsibles"]),
  tool("meeting_sessions", "comissao", "Reuniões autorizadas", "Lista sessões visíveis com consentimento confirmado para consultar ações; sem áudio, transcrição ou anexos.", input({ commission_id: uuid(), event_id: uuid(), limit: limit() }), "commission", "/cronograma-eventos", ["commissions", "cronograma_eventos_full", "cronograma_evento_comissoes", "agenda_meeting_sessions"]),
  tool("meeting_actions", "comissao", "Ações de reunião", "Consulta ações de sessão autorizada com consentimento confirmado. Não acessa transcrição nem anexos.", input({ commission_id: uuid(), event_id: uuid(), session_id: uuid(), limit: limit() }), "commission", "/cronograma-eventos", ["commissions", "cronograma_eventos_full", "cronograma_evento_comissoes", "agenda_meeting_sessions", "agenda_meeting_action_items"])
];

// src/lib/workers/tools/logistica/index.ts
var logisticaTools = [
  tool("list_transports", "logistica", "Transportes", "Consulta estados e horários dos transportes; omite contatos, passageiros individuais e observações privadas.", listTransportsInput, "logistics", "/transports", ["transports"]),
  tool("vehicle_summary", "logistica", "Frota", "Consulta disponibilidade e KM; omite placas, documentos e responsáveis individuais.", input({ limit: limit() }), "logistics", "/vehicles", ["vehicles"]),
  tool("cart_reservations", "logistica", "Carrinhos", "Consulta períodos e estados de reservas, sem contatos.", input({ limit: limit() }), "logistics", "/electric-carts", ["cart_reservations"]),
  tool("scooter_reservations", "logistica", "Patinetes", "Consulta períodos e estados de reservas, sem contatos.", input({ limit: limit() }), "logistics", "/scooters", ["scooter_reservations"]),
  tool("logistics_schedules", "logistica", "Escalas", "Consulta períodos das escalas, sem contatos pessoais.", input({ limit: limit() }), "logistics", "/ver-escala", ["schedules"]),
  tool("transport_weather", "logistica", "Clima nos transportes", "Consulta snapshots existentes visíveis por JWT; informa validade, sem atualizar dados nem chamar funções com service role.", input({ limit: limit() }), "logistics", "/transports", ["transport_weather_snapshots"])
];

// src/lib/workers/tools/caixa/index.ts
var caixaTools = [
  tool("financial_editions", "caixa", "Edições financeiras", "Lista edições autorizadas para selecionar o resumo. Nenhuma ação financeira disponível.", input({ limit: limit() }), "financial", "/comissoes/financeiro-gerencial", ["financial_editions"]),
  tool("financial_edition_summary", "caixa", "Resumo financeiro agregado", "Consulta somente totais calculados da edição, em centavos.", financial(), "financial", "/comissoes/financeiro-gerencial", ["financial_editions", "financial_edition_summary"]),
  tool("financial_budget_execution", "caixa", "Orçamento × execução", "Consulta agregados por orçamento e linha, em centavos.", financial(), "financial", "/comissoes/financeiro-gerencial", ["financial_editions", "financial_budget_execution"]),
  tool("financial_expense_comparison", "caixa", "Comparação de despesas", "Consulta totais e agregados por categoria/comissão, sem despesas individuais.", financial(), "financial", "/comissoes/financeiro-gerencial", ["financial_editions", "financial_expense_comparison"])
];

// src/lib/workers/catalog.ts
var workerToolDefinitions = Object.freeze([
  ...agendaTools,
  ...arenaTools,
  ...mapaTools,
  ...interesseTools,
  ...comissaoTools,
  ...logisticaTools,
  ...caixaTools
]);

// src/lib/workers/privacy.ts
var PRIVATE_KEYS = /(?:token|secret|password|authorization|document(?:number|_number)?|cpf|cnpj|telefone|phone|email|e_mail|pix|renavam|storage.?path|raw_payload|internal.?notes|observa[cç][oõ]es|description|descricao|evidence|contact|buyer_?name|buyer_?trade_?name|responsible_?text)/i;
function maskWorkerText(text) {
  return text.replace(/\b(?:Bearer\s+)?eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gi, "[token protegido]").replace(/\b(?:sb_secret_|sb_publishable_|sk-)[A-Za-z0-9_-]+\b/g, "[chave protegida]").replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[e-mail protegido]").replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF protegido]").replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[documento protegido]").replace(/(?:\+?55[\s.-]*)?\(?\b\d{2}\)?[\s.-]*9?\d{4}[\s.-]*\d{4}\b/g, "[telefone protegido]").replace(/\b(?:PIX|chave\s+pix)\s*[:=]\s*[^\s,;]+/gi, "PIX: [protegido]").replace(/https?:\/\/[^\s]+/gi, "[link externo omitido]");
}
function sanitizeWorkerData(value, depth = 0) {
  if (depth > 8) return null;
  if (typeof value === "string") return maskWorkerText(value).slice(0, 1200);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeWorkerData(item, depth + 1));
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (PRIVATE_KEYS.test(key) || key === "__proto__" || key === "constructor" || key === "prototype") continue;
      if (/^(?:id|.*_id|.*Id|lot_ids)$/.test(key) && (typeof item === "string" || Array.isArray(item))) {
        const ids = Array.isArray(item) ? item : [item];
        result[key] = ids.every((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) ? item : sanitizeWorkerData(item, depth + 1);
      } else result[key] = sanitizeWorkerData(item, depth + 1);
    }
    return result;
  }
  return null;
}
function pickWorkerFields(value, fields) {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return sanitizeWorkerData(Object.fromEntries(fields.filter((field) => Object.prototype.hasOwnProperty.call(row, field)).map((field) => [field, row[field]])));
}

// src/lib/workers/sources.ts
var READ_TABLES = {
  cronograma_eventos_full: { scope: "org", fields: ["id", "title", "status", "priority", "category", "start_date", "end_date", "start_time", "end_time", "location", "commission_name"] },
  cronograma_subeventos: { scope: "org", fields: ["id", "parent_event_id", "title", "status", "priority", "start_date", "end_date", "start_time", "end_time", "sort_order"] },
  venue_events: { scope: "org", fields: ["id", "title", "status", "event_type", "start_at", "end_at", "setup_start_at", "teardown_end_at", "pending_date", "estimated_audience", "confirmed_audience", "approval_status", "conflict_status", "contract_status"] },
  venue_spaces: { scope: "org", fields: ["id", "name", "slug", "active"] },
  venue_occupancies: { scope: "org", fields: ["id", "event_id", "event_space_id", "active", "setup_start_at", "teardown_end_at"] },
  venue_counterpart_balances: { scope: "org", fields: ["id", "space_id", "unit_type", "granted_quantity", "reserved_quantity", "consumed_quantity", "remaining_quantity", "pending_quantity", "projected_excess_quantity", "confirmed_excess_quantity"] },
  map_projects: { scope: "org", fields: ["id", "name", "is_archived"] },
  map_segments: { scope: "project", fields: ["id", "project_id", "slug", "name", "display_name", "is_active", "required_capability"] },
  map_entities: { scope: "project", fields: ["id", "project_id", "public_identifier", "name", "parent_entity_id", "segment_id", "classification"] },
  commercial_lots: { scope: "project", fields: ["id", "project_id", "entity_id", "public_identifier", "display_name", "lot_number", "block", "official_area_sqm", "status"] },
  commercial_lot_pricing_2028: { scope: "project", fields: ["lot_id", "project_id", "entity_id", "public_identifier", "pavilion", "block", "lot_num", "official_area_sqm", "status", "renovacao_total", "segunda_total", "resolution_status"] },
  lot_sale_orders: { scope: "project", fields: ["id", "project_id", "status"] },
  commissions: { scope: "org", fields: ["id", "nome", "slug", "unit_type", "is_active"] },
  commission_responsibles: { scope: "org", fields: ["id", "commission_id", "display_name", "relationship_role", "is_primary"] },
  agenda_meeting_action_items: { scope: "org", fields: ["id", "event_id", "session_id", "title", "due_date", "status", "confirmed_at"] },
  agenda_meeting_sessions: { scope: "org", fields: ["id", "event_id", "started_at", "ended_at", "processing_state", "consent_confirmed"] },
  transports: { scope: "org", fields: ["id", "titulo", "status", "tipo", "inicio_em", "fim_em", "passageiros_qtd", "prioridade"] },
  vehicles: { scope: "org", fields: ["id", "categoria", "marca", "modelo", "status", "km_atual", "cycle_year"] },
  cart_reservations: { scope: "org", fields: ["id", "cart_id", "inicio_em", "fim_em", "status", "comissao", "cycle_year"] },
  scooter_reservations: { scope: "org", fields: ["id", "scooter_id", "inicio_em", "fim_em", "status", "comissao", "cycle_year"] },
  schedules: { scope: "org", fields: ["id", "nome", "data_inicio", "data_fim", "status", "cycle_year"] },
  transport_weather_snapshots: { scope: "org", fields: ["id", "transport_id", "city_name", "current_condition_label", "temperature_c", "precipitation_probability_pct", "wind_speed_kph", "operational_risk_level", "fetched_at", "valid_until"] },
  financial_editions: { scope: "org", fields: ["id", "code", "label", "status", "period_start", "period_end"] }
};
var READ_RPCS = [
  "financial_can",
  "venue_get_permissions",
  "map_has_explicit_capability",
  "map_can_access_segment",
  "cronograma_unit_agenda",
  "cronograma_unit_metrics",
  "cronograma_restaurant_alert",
  "venue_check_availability",
  "get_commission_map_segment_inventory",
  "list_commercial_sale_orders",
  "get_commercial_sale_order_detail",
  "financial_edition_summary",
  "financial_budget_execution",
  "financial_expense_comparison",
  "workers_interest_summary",
  "workers_public_links_overview"
];
async function requireProject(ctx, id) {
  const { data, error } = await ctx.supabase.from("map_projects").select("id,org_id,is_archived").eq("org_id", ctx.orgId).eq("id", id).eq("is_archived", false).maybeSingle();
  if (error || !data || data.org_id !== ctx.orgId) throw new WorkerToolError("NOT_FOUND", "Projeto não encontrado ou sem acesso.");
}
async function readRows(ctx, table, options = {}) {
  if (!Object.prototype.hasOwnProperty.call(READ_TABLES, table)) throw new WorkerToolError("TOOL_NOT_ALLOWED", "Fonte de leitura não permitida.");
  const spec = READ_TABLES[table];
  const size = Math.max(1, Math.min(options.limit ?? 20, 100));
  if (spec.scope === "project") {
    if (!options.projectId) throw new WorkerToolError("INVALID_INPUT", "Informe o projeto.");
    await requireProject(ctx, options.projectId);
  }
  let query = ctx.supabase.from(table).select(spec.fields.join(","), { count: "exact" });
  if (spec.scope === "org") query = query.eq("org_id", ctx.orgId);
  else {
    query = query.eq("project_id", options.projectId);
  }
  for (const [column, operation, value] of options.filters ?? []) {
    if (operation === "eq") query = query.eq(column, value);
    if (operation === "gte") query = query.gte(column, value);
    if (operation === "lte") query = query.lte(column, value);
    if (operation === "ilike") query = query.ilike(column, String(value));
    if (operation === "in") query = query.in(column, value);
    if (operation === "is") query = query.is(column, value);
  }
  if (options.order) query = query.order(options.order, { ascending: true });
  const { data, error, count } = await query.limit(size + 1);
  if (error) throw new WorkerToolError("DATA_UNAVAILABLE", "Não foi possível consultar os dados autorizados.");
  const rows2 = data ?? [];
  return { records: rows2.slice(0, size).map((row) => pickWorkerFields(row, spec.fields)), total: count ?? rows2.length, truncated: count != null ? count > size : rows2.length > size };
}
async function readRpc(ctx, rpc, args) {
  if (!READ_RPCS.includes(rpc)) throw new WorkerToolError("TOOL_NOT_ALLOWED", "RPC fora da allowlist de leitura.");
  if ("_org_id" in args && args._org_id !== ctx.orgId) throw new WorkerToolError("PERMISSION_DENIED", "Organização inválida.");
  const { data, error } = await ctx.supabase.rpc(rpc, args);
  if (error) throw new WorkerToolError("DATA_UNAVAILABLE", "Não foi possível consultar os dados autorizados.");
  return data;
}

// src/lib/workers/registry.ts
var ACCESS_SOURCES = ["agenda_meeting_sessions", "cronograma_evento_comissoes", "org_members", "user_capabilities", "commission_responsibles"];
var allowedSources = /* @__PURE__ */ new Set([...Object.keys(READ_TABLES), ...READ_RPCS, ...ACCESS_SOURCES]);
var definitions = new Map(workerToolDefinitions.map((tool2) => [tool2.name, tool2]));
function assertReadToolRegistrable(candidate) {
  const known = definitions.get(candidate.name);
  if (!known || candidate.readOnly !== true || candidate.requiresConfirmation !== false || candidate.sources.some((source) => !allowedSources.has(source)) || candidate.sources.length !== known.sources.length || candidate.sources.some((source, index) => source !== known.sources[index])) {
    throw new WorkerToolError("TOOL_NOT_ALLOWED", "Ferramenta fora do catálogo fechado de leitura.");
  }
}
for (const definition of workerToolDefinitions) assertReadToolRegistrable(definition);
async function listWorkerTools(workerId, context) {
  const ctx = await resolveWorkerAccess(context.supabase, context.userId, context.orgId);
  const permissions = /* @__PURE__ */ new Map();
  const result = [];
  for (const definition of workerToolDefinitions.filter((item) => item.worker === workerId)) {
    const policy = definition.capability.policy;
    if (!permissions.has(policy)) permissions.set(policy, await authorizeWorkerPolicy(policy, ctx));
    if (permissions.get(policy)) result.push(definition);
  }
  return result;
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function rows(value) {
  return Array.isArray(value) ? value.map(object) : [];
}
function output(definition, records, options = {}) {
  const safe = sanitizeWorkerData(records);
  return {
    summary: options.summary ?? (safe.length ? `${safe.length} registro(s) autorizado(s) retornado(s).${options.truncated ? " Resultado parcial; consulte a tela para a lista completa." : ""}` : "Não há dados visíveis para esta consulta."),
    records: safe,
    citations: [{ label: definition.title, url: options.link ?? definition.deepLink, source: "app" }],
    total: options.total ?? safe.length,
    truncated: options.truncated ?? false
  };
}
async function requireCommission(ctx, id, ownOnly = false) {
  const { data, error } = await ctx.supabase.from("commissions").select("id,org_id").eq("org_id", ctx.orgId).eq("id", id).eq("is_active", true).maybeSingle();
  if (error || !data || data.org_id !== ctx.orgId) throw new WorkerToolError("NOT_FOUND", "Comissão não encontrada ou sem acesso.");
  if (ownOnly && ctx.role !== "admin" && !(await ownCommissionIds(ctx)).includes(id)) throw new WorkerToolError("PERMISSION_DENIED", "Comissão fora do seu vínculo.");
}
async function ownCommissionIds(ctx) {
  const [memberResult, responsibleResult] = await Promise.all([
    ctx.supabase.from("org_members").select("commission_id").eq("org_id", ctx.orgId).eq("user_id", ctx.userId).eq("is_active", true).maybeSingle(),
    ctx.supabase.from("commission_responsibles").select("commission_id").eq("org_id", ctx.orgId).eq("user_id", ctx.userId).eq("active", true).limit(100)
  ]);
  if (memberResult.error || responsibleResult.error) throw new WorkerToolError("PERMISSION_DENIED", "Não foi possível validar o vínculo da comissão.");
  return [...new Set([memberResult.data?.commission_id, ...(responsibleResult.data ?? []).map((row) => row.commission_id)].filter((id) => typeof id === "string"))];
}
async function requireEvent(ctx, id) {
  const result = await readRows(ctx, "cronograma_eventos_full", { filters: [["id", "eq", id]], limit: 1 });
  if (!result.records.length) throw new WorkerToolError("NOT_FOUND", "Evento não encontrado ou sem acesso.");
  return result.records[0];
}
async function requireEdition(ctx, id) {
  const result = await readRows(ctx, "financial_editions", { filters: [["id", "eq", id]], limit: 1 });
  if (!result.records.length) throw new WorkerToolError("NOT_FOUND", "Edição não encontrada ou sem acesso.");
}
var moneyFields = ["count", "cap_cents", "uncapped_count", "planned_cents", "line_count", "committed_cents", "projected_cents", "confirmed_cents", "declared_cents", "in_kind_cents", "paid_cents", "payable_open_cents", "overdue_count", "received_cents", "receivable_open_cents", "inconsistent_count", "inflow_cents", "outflow_cents", "expense_planned_cents", "open_cents", "deviation_cents", "deviation_pct", "comparison_state", "overdue_cents", "realized_without_plan_count"];
async function dispatch(def, input2, ctx) {
  const size = Number(input2.limit ?? 20);
  const text = (key) => String(input2[key]);
  switch (def.name) {
    case "list_events": {
      const result = await readRows(ctx, "cronograma_eventos_full", { limit: size, order: "start_date", filters: [
        ...input2.from_date ? [["start_date", "gte", input2.from_date]] : [],
        ...input2.to_date ? [["start_date", "lte", input2.to_date]] : [],
        ...input2.status ? [["status", "eq", input2.status]] : [],
        ...input2.search ? [["title", "ilike", `%${String(input2.search).replace(/[%_\\]/g, "")}%`]] : []
      ] });
      return output(def, result.records, result);
    }
    case "get_event":
      return output(def, [await requireEvent(ctx, text("event_id"))], { link: `/cronograma-eventos?event=${encodeURIComponent(text("event_id"))}` });
    case "list_subevents": {
      await requireEvent(ctx, text("event_id"));
      const result = await readRows(ctx, "cronograma_subeventos", { limit: size, order: "sort_order", filters: [["parent_event_id", "eq", input2.event_id]] });
      return output(def, result.records, result);
    }
    case "commission_agenda":
    case "commission_metrics": {
      await requireCommission(ctx, text("commission_id"));
      const rpc = def.name === "commission_agenda" ? "cronograma_unit_agenda" : "cronograma_unit_metrics";
      const result = rows(await readRpc(ctx, rpc, { _commission_id: input2.commission_id }));
      const fields = def.name === "commission_agenda" ? READ_TABLES.cronograma_eventos_full.fields : ["completed", "documents", "in_month", "total", "upcoming"];
      return output(def, result.slice(0, size).map((row) => pickWorkerFields(row, fields)), { total: result.length, truncated: result.length > size });
    }
    case "list_venue_events": {
      const result = await readRows(ctx, "venue_events", { limit: size, order: "start_at", filters: [
        ...input2.from_datetime ? [["start_at", "gte", input2.from_datetime]] : [],
        ...input2.to_datetime ? [["start_at", "lte", input2.to_datetime]] : []
      ] });
      return output(def, result.records, result);
    }
    case "venue_availability": {
      if (text("teardown_end_at") <= text("setup_start_at")) throw new WorkerToolError("INVALID_INPUT", "O fim precisa ocorrer após o início.");
      const ids = input2.space_ids;
      const spaces = await readRows(ctx, "venue_spaces", { limit: 100, filters: [["id", "in", ids], ["active", "eq", true]] });
      if (new Set(spaces.records.map((space) => space.id)).size !== new Set(ids).size) throw new WorkerToolError("NOT_FOUND", "Espaço não encontrado ou fora da organização.");
      const result = rows(await readRpc(ctx, "venue_check_availability", { _org_id: ctx.orgId, _space_ids: ids, _setup_start_at: input2.setup_start_at, _teardown_end_at: input2.teardown_end_at }));
      return output(def, result.slice(0, 100).map((row) => pickWorkerFields(row, ["conflict_kind", "space_id", "starts_at", "ends_at", "title"])), { truncated: result.length > 100 });
    }
    case "venue_occupancy": {
      const result = await readRows(ctx, "venue_occupancies", { limit: size, order: "setup_start_at", filters: [["active", "eq", true]] });
      return output(def, result.records, result);
    }
    case "venue_counterparts": {
      const result = await readRows(ctx, "venue_counterpart_balances", { limit: size });
      return output(def, result.records, result);
    }
    case "restaurant_alert": {
      const result = rows(await readRpc(ctx, "cronograma_restaurant_alert", { _org_id: ctx.orgId, _start_date: input2.from_date, _end_date: input2.to_date }));
      return output(def, result.slice(0, 100).map((row) => pickWorkerFields(row, ["title", "event_date", "event_end_date", "start_time", "end_time"])), { truncated: result.length > 100 });
    }
    case "map_projects": {
      const result = await readRows(ctx, "map_projects", { limit: size, filters: [["is_archived", "eq", false]] });
      return output(def, result.records, result);
    }
    case "map_segments":
    case "map_entities":
    case "map_inventory":
    case "map_prices": {
      const table = def.name === "map_segments" ? "map_segments" : def.name === "map_entities" ? "map_entities" : def.name === "map_prices" ? "commercial_lot_pricing_2028" : "commercial_lots";
      const result = await readRows(ctx, table, { projectId: text("project_id"), limit: size, filters: [
        ...def.name === "map_segments" ? [["is_active", "eq", true]] : [],
        ...def.name === "map_inventory" ? [["archived_at", "is", null]] : [],
        ...def.name === "map_entities" ? [["is_archived", "eq", false]] : [],
        ...input2.segment_id ? [["segment_id", "eq", input2.segment_id]] : [],
        ...input2.status ? [["status", "eq", input2.status]] : [],
        ...input2.pavilion ? [["pavilion", "eq", input2.pavilion]] : []
      ] });
      return output(def, result.records, result);
    }
    case "map_segment_inventory": {
      const segment = await readRows(ctx, "map_segments", { projectId: text("project_id"), limit: 1, filters: [["id", "eq", input2.segment_id], ["is_active", "eq", true]] });
      if (!segment.records.length) throw new WorkerToolError("NOT_FOUND", "Segmento fora do projeto autorizado.");
      const result = rows(await readRpc(ctx, "get_commission_map_segment_inventory", { p_segment_id: input2.segment_id }));
      return output(def, result.map((row) => pickWorkerFields(row, ["expected_entity_count", "expected_lot_count", "lineage_delta"])));
    }
    case "list_sale_orders": {
      await requireProject(ctx, text("project_id"));
      if (input2.has_document !== void 0 && !await authorizeWorkerPolicy("map_contracts", ctx)) throw new WorkerToolError("PERMISSION_DENIED", "Consulta de contratos requer permissão de contratos.");
      const response = object(await readRpc(ctx, "list_commercial_sale_orders", { p_project_id: input2.project_id, p_limit: size, ...input2.status ? { p_status: input2.status } : {}, ...input2.has_document !== void 0 ? { p_has_document: input2.has_document } : {} }));
      const result = rows(response.rows).map((row) => pickWorkerFields(row, ["record_id", "kind", "order_id", "sale_id", "reference", "created_at", "status", "item_count", "active_count", "signed_count", "pending_count", "cancelled_count", "legacy_count", "lot_ids"]));
      return output(def, result, { total: Number(response.total ?? result.length), truncated: Number(response.total ?? 0) > size });
    }
    case "sale_order_detail":
    case "sale_order_contract_summary": {
      const order = await readRows(ctx, "lot_sale_orders", { projectId: text("project_id"), limit: 1, filters: [["id", "eq", input2.order_id]] });
      if (!order.records.length) throw new WorkerToolError("NOT_FOUND", "Pedido fora do projeto autorizado.");
      const response = object(await readRpc(ctx, "get_commercial_sale_order_detail", { p_order_id: input2.order_id }));
      const header = object(response.header);
      if (header.projectId !== input2.project_id || header.orderId !== input2.order_id) throw new WorkerToolError("PERMISSION_DENIED", "Pedido fora do projeto autorizado.");
      if (def.name === "sale_order_contract_summary") {
        if (response.documentsAccessible !== true) throw new WorkerToolError("PERMISSION_DENIED", "Contratos sem permissão de leitura.");
        const contracts = rows(response.contracts);
        return output(def, contracts.slice(0, 100).map((row) => pickWorkerFields(row, ["contractId", "scope", "lotIds"])), { total: contracts.length, truncated: contracts.length > 100 });
      }
      const result = rows(response.items).slice(0, 100).map((item) => pickWorkerFields(item, ["itemId", "lotId", "entityId", "publicIdentifier", "lotNumber", "displayName", "areaSnapshot", "contractState", "lotStatus"]));
      return output(def, result, { truncated: rows(response.items).length > 100 });
    }
    case "interest_summary": {
      const response = object(await readRpc(ctx, "workers_interest_summary", { _org_id: ctx.orgId, ...input2.from_datetime ? { _from: input2.from_datetime } : {}, ...input2.to_datetime ? { _to: input2.to_datetime } : {} }));
      return output(def, rows(response.areas).slice(0, 50).map((row) => pickWorkerFields(row, ["id", "slug", "displayName", "scopeKind", "visits", "sessions", "lotSelections", "detailViews"])), { truncated: rows(response.areas).length >= 50 });
    }
    case "public_links_overview": {
      const result = rows(await readRpc(ctx, "workers_public_links_overview", { _org_id: ctx.orgId }));
      return output(def, result.slice(0, 100).map((row) => pickWorkerFields(row, ["id", "slug", "displayName", "scopeKind", "isActive", "sortOrder"])), { truncated: result.length >= 100 });
    }
    case "my_commissions": {
      const ids = ctx.role === "admin" ? null : await ownCommissionIds(ctx);
      if (ids && !ids.length) return output(def, []);
      const result = await readRows(ctx, "commissions", { limit: size, filters: [["is_active", "eq", true], ...ids ? [["id", "in", ids]] : []] });
      return output(def, result.records, result);
    }
    case "commission_responsibles": {
      await requireCommission(ctx, text("commission_id"), true);
      const result = await readRows(ctx, "commission_responsibles", { limit: size, filters: [["commission_id", "eq", input2.commission_id], ["active", "eq", true]] });
      return output(def, result.records, result);
    }
    case "meeting_sessions":
    case "meeting_actions": {
      await requireCommission(ctx, text("commission_id"), true);
      await requireEvent(ctx, text("event_id"));
      const { data: link, error: linkError } = await ctx.supabase.from("cronograma_evento_comissoes").select("event_id").eq("org_id", ctx.orgId).eq("event_id", input2.event_id).eq("commission_id", input2.commission_id).limit(1).maybeSingle();
      if (linkError || !link) throw new WorkerToolError("NOT_FOUND", "Evento não vinculado à comissão.");
      if (def.name === "meeting_sessions") {
        const result2 = await readRows(ctx, "agenda_meeting_sessions", { limit: size, order: "started_at", filters: [["event_id", "eq", input2.event_id], ["consent_confirmed", "eq", true], ["deleted_at", "is", null]] });
        return output(def, result2.records, { ...result2, link: `/cronograma-eventos?event=${encodeURIComponent(text("event_id"))}` });
      }
      const { data: session, error } = await ctx.supabase.from("agenda_meeting_sessions").select("id,consent_confirmed").eq("org_id", ctx.orgId).eq("event_id", input2.event_id).eq("id", input2.session_id).eq("consent_confirmed", true).is("deleted_at", null).maybeSingle();
      if (error || !session?.consent_confirmed) throw new WorkerToolError("PERMISSION_DENIED", "Sessão sem acesso ou consentimento confirmado.");
      const result = await readRows(ctx, "agenda_meeting_action_items", { limit: size, filters: [["session_id", "eq", input2.session_id], ["event_id", "eq", input2.event_id]] });
      return output(def, result.records, { ...result, link: `/cronograma-eventos?event=${encodeURIComponent(text("event_id"))}` });
    }
    case "list_transports": {
      const result = await readRows(ctx, "transports", { limit: size, order: "inicio_em", filters: [
        ...input2.status ? [["status", "eq", input2.status]] : [],
        ...input2.from_datetime ? [["inicio_em", "gte", input2.from_datetime]] : [],
        ...input2.to_datetime ? [["inicio_em", "lte", input2.to_datetime]] : []
      ] });
      return output(def, result.records, result);
    }
    case "vehicle_summary":
    case "cart_reservations":
    case "scooter_reservations":
    case "logistics_schedules":
    case "transport_weather":
    case "financial_editions": {
      const table = def.name === "vehicle_summary" ? "vehicles" : def.name === "logistics_schedules" ? "schedules" : def.name === "transport_weather" ? "transport_weather_snapshots" : def.name;
      const result = await readRows(ctx, table, { limit: size, filters: def.name === "transport_weather" ? [["is_latest", "eq", true]] : [] });
      return output(def, result.records, result);
    }
    case "financial_edition_summary":
    case "financial_budget_execution":
    case "financial_expense_comparison": {
      await requireEdition(ctx, text("edition_id"));
      const response = object(await readRpc(ctx, def.name, { _org_id: ctx.orgId, _edition_id: input2.edition_id }));
      if (def.name === "financial_edition_summary") {
        const result = {};
        for (const group of ["budget", "revenue", "sponsorship", "expenses", "revenues", "obligations", "movements"]) result[group] = pickWorkerFields(response[group], moneyFields);
        return output(def, [result]);
      }
      if (def.name === "financial_budget_execution") {
        return output(def, [{ budgets: rows(response.budgets).slice(0, 100).map((row) => pickWorkerFields(row, ["budget_id", ...moneyFields])), lines: rows(response.lines).slice(0, 100).map((row) => pickWorkerFields(row, ["line_id", ...moneyFields])) }], { truncated: rows(response.budgets).length > 100 || rows(response.lines).length > 100 });
      }
      return output(def, [{ totals: pickWorkerFields(response.totals, moneyFields), by_category: rows(response.by_category).slice(0, 100).map((row) => pickWorkerFields(row, ["id", "name", ...moneyFields])), by_commission: rows(response.by_commission).slice(0, 100).map((row) => pickWorkerFields(row, ["id", "name", ...moneyFields])) }], { truncated: rows(response.by_category).length > 100 || rows(response.by_commission).length > 100 });
    }
    default:
      throw new WorkerToolError("TOOL_NOT_ALLOWED", "Ferramenta não disponível nesta fase.");
  }
}
async function executeWorkerTool(name, input2, context) {
  const definition = definitions.get(name);
  if (!definition) throw new WorkerToolError("TOOL_NOT_ALLOWED", "Ferramenta não permitida.");
  assertReadToolRegistrable(definition);
  const ctx = await resolveWorkerAccess(context.supabase, context.userId, context.orgId);
  if (!await authorizeWorkerPolicy(definition.capability.policy, ctx)) throw new WorkerToolError("PERMISSION_DENIED", "Você não tem acesso a esta consulta.");
  const parsed = definition.inputSchema.safeParse(input2);
  if (!parsed.success) throw new WorkerToolError("INVALID_INPUT", "Parâmetros inválidos para esta consulta.");
  return dispatch(definition, parsed.data, ctx);
}

// src/lib/workers/inventory.ts
var workerReadSourceInventory = Object.freeze({ tables: Object.freeze(READ_TABLES), rpcs: Object.freeze(READ_RPCS) });
var futureWorkerWriteInventory = Object.freeze([
  { worker: "agenda", rpc: "cronograma_save_event", capability: "cronograma_eventos_write", enabled: false },
  { worker: "agenda", rpc: "cronograma_save_subevent", capability: "cronograma_eventos_write", enabled: false },
  { worker: "agenda", rpc: "cronograma_save_subevent_plan", capability: "cronograma_eventos_write", enabled: false },
  { worker: "arena", rpc: "venue_save_event_note", capability: "venue_events_manage", enabled: false },
  { worker: "arena", rpc: "venue_update_checklist_item", capability: "venue_operations_manage", enabled: false },
  { worker: "arena", rpc: "venue_save_event", capability: "venue_events_manage", enabled: false },
  { worker: "mapa", rpc: "start_commercial_negotiation", capability: "map.manage_sales", enabled: false },
  { worker: "mapa", rpc: "reserve_commercial_lot", capability: "map.manage_sales", enabled: false },
  { worker: "comissao", rpc: null, capability: null, enabled: false, reason: "Não há RPC segura de criação de tarefa; useTasks faz INSERT direto." }
]);
var prohibitedWorkerOperations = Object.freeze([
  "cronograma_delete_event",
  "cronograma_delete_subevent",
  "venue_delete_event",
  "financial_record_movement",
  "financial_reverse_movement",
  "financial_transition_expense",
  "confirm_sale_order_items",
  "cancel_sale_order_items",
  "revise_sale_order_items",
  "register_commercial_sale_order",
  "public_map_link_rotate",
  "public_map_link_set_active",
  "public_map_track",
  "publish_commercial_map",
  "save_map_geometry",
  "set_lot_price_override",
  "apply_lot_price_rules_2028",
  "transport-lifecycle",
  "weather-service",
  "send-push-notification",
  "send-transactional-email",
  "sql",
  "insert",
  "update",
  "delete",
  "create_user",
  "update_capabilities"
]);
export {
  executeWorkerTool,
  listWorkerTools,
  resolveWorkerAccess
};
