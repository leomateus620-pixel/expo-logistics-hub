// @ts-self-types="./read-tools.d.ts"
// AUTO-GENERATED. Do not edit; canonical source: src/lib/workers/index.ts.
// Regenerate: node scripts/workers/build-edge-registry.mjs
// Verify without writing: node scripts/workers/build-edge-registry.mjs --check
// Source inputs + generator SHA256: 9697c621f7a9ae1af22cac5daaa0d7313f791b5a133d9a1ed2de7358312c6383
// esbuild: 0.21.5; ESM JavaScript; external runtime dependency: zod.
// Input src/lib/workers/access.ts SHA256 e831e76d097707346be3b82114890dc5608aa95532255847c76ab46d77aa0aea
// Input src/lib/workers/analytics.ts SHA256 d6c3fa36d36347ef5a7d3200615ed933dbd4095727cd45c0f7671edad65fc6a2
// Input src/lib/workers/auth-failure.ts SHA256 468a11683d18687c7d3d92753ed8a2e0866532e5b5a7dec797051f7990b6a687
// Input src/lib/workers/catalog.ts SHA256 b7a40864279ee0f1308651b42b0c9fafc66e4e311390732e8411f449b3dd52af
// Input src/lib/workers/commercial-report-preview.ts SHA256 0438b7342e956ce1df8efb31a720b18891dac57e753dc56172c6448733c62ef2
// Input src/lib/workers/commercial-report.ts SHA256 54f42eaab40a18f298cf503e5928c0edacb5950d81b8d88179926be1295bc1a9
// Input src/lib/workers/index.ts SHA256 658986def892b6cd32d73c89a1a94ea6877a623694bc151d46af8ba651e80a7c
// Input src/lib/workers/inventory.ts SHA256 68e24327d4120f412fcac87ede4721163c405b93be2a42ed56bb5d784bdbea82
// Input src/lib/workers/privacy.ts SHA256 92eae6d36abb1f3cdaef896b2a6152ff2c8c037ab011f8d22b3b05b31e6b6c2e
// Input src/lib/workers/question-analytics.ts SHA256 8fac26f8def1e20ac6ffa33bc841c4e980169d09af7c11c5d6038100a5ed1bbe
// Input src/lib/workers/registry.ts SHA256 c7987365ed728853f1fe467a0514d111d9790fb20016f2d18bc36e4fc599be62
// Input src/lib/workers/schema.ts SHA256 574d426897d572da11ae8675153894f9a61fe793f426933b54b8ddbd59e19353
// Input src/lib/workers/sources.ts SHA256 1a5b30f62a054db9119e0af3564eccd6a402ca94bcf5e3ce8881356ba30df173
// Input src/lib/workers/tools/agenda/index.ts SHA256 bc70e2a6d38c63f1b146f60aa2ee87e60aadfe72b8d9e249ccdbe222b3b29c59
// Input src/lib/workers/tools/arena/index.ts SHA256 200c83ae297c0fc81c6b11d0b04c7f4442bd3f71c298d7000c63c40cd551c29e
// Input src/lib/workers/tools/caixa/index.ts SHA256 38a118eb2924901d1695fea37e1b7dd6fd889860e22f8836dd6aed3f5d857c4a
// Input src/lib/workers/tools/comissao/index.ts SHA256 b3f38078138b02993d5b1bc6dda18a03a24a3833505b3270e75ed1bc3050d1ad
// Input src/lib/workers/tools/definition.ts SHA256 a6b7ca50a6c33e22ad28fea8422b7333a73fc5021f4fdada53e6a3c33ee5dd69
// Input src/lib/workers/tools/interesse/index.ts SHA256 a7786eab88fca2eed15c896cc677c581245f0ad2cbdfd97bb4a511204cda21be
// Input src/lib/workers/tools/logistica/index.ts SHA256 368ec161b47faf07bf5966f264c14b529e16a04fac4290ade7674236eb92538c
// Input src/lib/workers/tools/mapa/index.ts SHA256 8f869f76d4bcac414f9e039e929f7fce9a2e8277e15781e0b26ec05b7e505292
// Input src/lib/workers/types.ts SHA256 d17e25c77c64705405b2d8f59035190870a88a5eb01eedd4bf71968ecfdf1316

// src/lib/workers/types.ts
var WorkerToolError = class extends Error {
  constructor(code, message, diagnostic) {
    super(message);
    this.code = code;
    this.diagnostic = diagnostic;
    this.name = "WorkerToolError";
  }
};
function workerDataError(error, stage = "query") {
  const technicalCode = /^[A-Z0-9_]{1,40}$/i.test(error.code ?? "") ? error.code : void 0;
  const code = error.code === "42501" ? "PERMISSION_DENIED" : ["PGRST202", "PGRST203", "42883", "42703"].includes(error.code ?? "") ? "RPC_INCOMPATIBLE" : error.code === "57014" || /timeout|timed out/i.test(error.message ?? "") ? "TIMEOUT" : /^(?:08|PGRST00)/.test(error.code ?? "") || /fetch failed|failed to fetch|network/i.test(error.message ?? "") ? "NETWORK_ERROR" : error.code ? "SQL_ERROR" : "DATA_UNAVAILABLE";
  return new WorkerToolError(code, "Não foi possível concluir a consulta.", { stage, technicalCode });
}

// src/lib/workers/auth-failure.ts
function workerAuthFailureCode(error) {
  const value = error && typeof error === "object" ? error : {};
  const status = typeof value.status === "number" ? value.status : void 0;
  const name = typeof value.name === "string" ? value.name : "";
  const message = typeof value.message === "string" ? value.message : "";
  if (status === 408 || status === 504 || /timeout|timed out/i.test(message)) return "timeout";
  if (name === "AuthRetryableFetchError" || status === 0 || status !== void 0 && status >= 500 || /fetch failed|failed to fetch|network|connection|load failed/i.test(message)) return "network_error";
  if (status === 401 || status === 403 || /AuthSessionMissingError|AuthInvalidJwtError/.test(name) || /session.*missing|no session|invalid.*(?:jwt|token)|jwt.*expired/i.test(message)) return "forbidden";
  return "query_failed";
}

// src/lib/workers/access.ts
var roles = ["admin", "gestor", "operador", "leitura"];
async function resolveWorkerAccess(client, userId, orgId) {
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError) {
    const cause = workerAuthFailureCode(authError);
    const technicalCode = /^[A-Z0-9_]{1,40}$/i.test(authError.code ?? "") ? authError.code : void 0;
    throw new WorkerToolError(cause === "network_error" ? "NETWORK_ERROR" : cause === "timeout" ? "TIMEOUT" : cause === "forbidden" ? "AUTH_REQUIRED" : "DATA_UNAVAILABLE", "Não foi possível verificar a sessão.", { stage: "authentication", technicalCode });
  }
  if (!auth?.user || auth.user.id !== userId || auth.user.role === "service_role") {
    throw new WorkerToolError("AUTH_REQUIRED", "Sessão de usuário necessária.");
  }
  const { data: member, error: memberError } = await client.from("org_members").select("role,org_id,user_id").eq("user_id", userId).eq("org_id", orgId).eq("is_active", true).maybeSingle();
  if (memberError) throw workerDataError(memberError, "authorization");
  if (!member || member.org_id !== orgId || member.user_id !== userId || !roles.includes(member.role)) {
    throw new WorkerToolError("PERMISSION_DENIED", "Organização sem vínculo ativo.");
  }
  const { data: grants, error: grantsError } = await client.from("user_capabilities").select("capability").eq("user_id", userId).eq("org_id", orgId);
  if (grantsError) throw workerDataError(grantsError, "authorization");
  return { userId, orgId, role: member.role, capabilities: new Set((grants ?? []).map((item) => item.capability)), supabase: client };
}
function hasWorkerPolicy(policy, ctx) {
  const caps = ctx.capabilities;
  const elevated = ctx.role === "admin" || ctx.role === "gestor";
  const operator = ctx.role === "operador" && !caps.has("restricted_scope");
  const full = elevated || operator || caps.has("full_access");
  const map2 = (cap) => elevated || caps.has(cap) || caps.has("map.admin") || caps.has("full_access");
  switch (policy) {
    case "member":
      return true;
    case "commission":
      return true;
    case "map":
      return operator || map2("map.view");
    case "map_sales":
      return map2("map.manage_sales");
    case "map_contracts":
      return map2("map.manage_sales") && map2("map.manage_contracts");
    case "analytics":
      return (full || caps.has("map.analytics.view")) && map2("map.manage_sales");
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
    if (error) throw workerDataError(error, "authorization");
    return data === true;
  }
  if (policy === "venue" || policy === "venue_reports") {
    const { data, error } = await ctx.supabase.rpc("venue_get_permissions", { _org_id: ctx.orgId });
    if (error) throw workerDataError(error, "authorization");
    if (!data || typeof data !== "object") return false;
    const permissions = data;
    return permissions.venue_events_access === true && (policy !== "venue_reports" || permissions.venue_reports_view === true || permissions.venue_counterparts_manage === true);
  }
  if (policy === "map_sales" || policy === "map_contracts" || policy === "analytics") {
    const { data, error } = await ctx.supabase.rpc("map_has_explicit_capability", { _org_id: ctx.orgId, _capability: "map.manage_sales" });
    if (error) throw workerDataError(error, "authorization");
    if (data !== true) return false;
    if (policy === "map_contracts") {
      const result = await ctx.supabase.rpc("map_has_explicit_capability", { _org_id: ctx.orgId, _capability: "map.manage_contracts" });
      if (result.error) throw workerDataError(result.error, "authorization");
      return result.data === true;
    }
  }
  return true;
}

// src/lib/workers/tools/agenda/index.ts
import { z as z3 } from "zod";

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
  if (schema instanceof z.ZodLiteral && ["string", "number", "boolean"].includes(typeof schema.value)) return { type: typeof schema.value, enum: [schema.value] };
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
  tool("agenda_resolve_identity", "agenda", "Identidades da Agenda", "Resolve pessoa ou comissão entre identidades autorizadas. Nunca substitui a pessoa mencionada pela conta autenticada; homônimos exigem escolha por identidade.", input({ kind: z3.enum(["person", "commission"]), search: z3.string().trim().min(1).max(120) }), "member", "/cronograma-eventos", ["workers_agenda_resolve_identity"]),
  tool("agenda_person_events", "agenda", "Eventos de uma pessoa", "Conta eventos distintos vinculados ao UUID persistido e autorizado da pessoa, incluindo vínculos de subeventos no pai; não infere presença nem criação como participação.", input({ person_id: uuid(), date_from: date(), date_to: date() }), "member", "/cronograma-eventos", ["workers_agenda_person_events"]),
  tool("agenda_commission_ranking", "agenda", "Comissões com mais eventos", "Ranking completo no servidor por comissão persistida. Conta o evento uma vez por comissão, incluindo vínculos principais, adicionais e de subeventos; um evento pode pertencer a várias comissões.", input({ date_from: date(), date_to: date(), limit: z3.number().int().min(1).max(30).default(10) }), "member", "/cronograma-eventos", ["workers_agenda_commission_ranking"]),
  tool("agenda_query", "agenda", "Consulta analítica da Agenda", "Consulta todos os eventos autorizados do período, agrega antes de limitar os detalhes e aceita variações de pergunta. Filtra título/local/categoria/prioridade/situação, vínculos autenticados e comissão persistida. Agrupamentos completos permitem pizza, barras, tabela e comparação entre duas consultas. Vínculo e duração prevista não comprovam presença.", input({ date_from: date(), date_to: date(), group_by: z3.enum(["status", "location", "category", "weekday", "day"]).default("status"), relationship: z3.enum(["all", "linked", "created", "responsible"]).default("all"), status: z3.enum(["planejado", "em_andamento", "aguardando_definicao", "aguardando_responsavel", "concluido", "cancelado"]).optional(), search: z3.string().max(120).optional(), location: z3.string().max(120).optional(), category: z3.string().max(120).optional(), priority: z3.enum(["baixa", "media", "alta", "critica"]).optional(), weekday: z3.number().int().min(0).max(6).optional(), commission_id: uuid().optional(), missing_time: z3.boolean().optional(), missing_location: z3.boolean().optional(), missing_category: z3.boolean().optional(), cross_midnight: z3.boolean().optional(), cross_period: z3.boolean().optional(), start_in_period: z3.boolean().optional() }), "member", "/cronograma-eventos", ["workers_agenda_query"]),
  tool("agenda_personal_summary", "agenda", "Sua Agenda no período", "Calcula todos os eventos autorizados vinculados à conta autenticada, sem duplicar vínculos ou subeventos. Distingue criação, responsabilidade, situação concluída e duração agendada; não comprova presença.", input({ date_from: date(), date_to: date(), relationship: z3.enum(["linked", "created", "responsible"]).optional() }), "member", "/cronograma-eventos", ["workers_agenda_personal_summary"]),
  tool("agenda_people_ranking", "agenda", "Pessoas com mais eventos", "Ranking agregado no servidor sobre o período autorizado completo. Conta eventos distintos por identidade persistida; limite visual não limita a agregação.", input({ date_from: date(), date_to: date(), limit: z3.number().int().min(1).max(30).default(10) }), "member", "/cronograma-eventos", ["workers_agenda_people_ranking"]),
  tool("list_events", "agenda", "Agenda Fenasoja", "Consulta eventos visíveis no período. Descrições privadas e contatos são omitidos.", listEventsInput, "member", "/cronograma-eventos", ["cronograma_eventos_full"]),
  tool("get_event", "agenda", "Detalhe do evento", "Consulta dados operacionais seguros de um evento visível.", getEventInput, "member", "/cronograma-eventos", ["cronograma_eventos_full"]),
  tool("list_subevents", "agenda", "Subeventos", "Consulta subeventos visíveis do evento informado.", input({ event_id: uuid(), limit: limit() }), "member", "/cronograma-eventos", ["cronograma_eventos_full", "cronograma_subeventos"]),
  tool("commission_agenda", "agenda", "Agenda por comissão", "Consulta agenda da comissão persistida, sob RLS.", input(commission()), "member", "/cronograma-eventos", ["commissions", "cronograma_unit_agenda"]),
  tool("commission_metrics", "agenda", "Métricas por comissão", "Retorna métricas calculadas da comissão, sob RLS.", input({ commission_id: uuid() }), "member", "/cronograma-eventos", ["commissions", "cronograma_unit_metrics"])
];

// src/lib/workers/tools/arena/index.ts
import { z as z4 } from "zod";
var arenaTools = [
  tool("list_venue_events", "arena", "Eventos da Arena e Restaurante", "Consulta datas, estado e público de eventos; omite notas internas, contatos e pagamentos.", input({ from_datetime: timestamp().optional(), to_datetime: timestamp().optional(), limit: limit() }), "venue", "/eventos-restaurante-arena", ["venue_events"]),
  tool("venue_availability", "arena", "Disponibilidade de espaços", "Consulta conflitos em espaços persistidos; não reserva nem altera ocupações.", input({ space_ids: z4.array(uuid()).min(1).max(10), setup_start_at: timestamp(), teardown_end_at: timestamp() }), "venue", "/eventos-restaurante-arena", ["venue_spaces", "venue_check_availability"]),
  tool("venue_occupancy", "arena", "Ocupação", "Consulta períodos de ocupações ativas.", input({ limit: limit() }), "venue", "/eventos-restaurante-arena", ["venue_occupancies"]),
  tool("venue_counterparts", "arena", "Saldos de contrapartida", "Consulta somente quantidades agregadas autorizadas.", input({ limit: limit() }), "venue_reports", "/eventos-restaurante-arena", ["venue_counterpart_balances"]),
  tool("restaurant_alert", "arena", "Conflitos Restaurante × Agenda", "Consulta alerta de conflito no intervalo. Não altera agenda nem reservas.", input({ from_date: date(), to_date: date() }), "venue", "/cronograma-eventos", ["cronograma_restaurant_alert"])
];

// src/lib/workers/tools/mapa/index.ts
import { z as z6 } from "zod";

// src/lib/workers/commercial-report.ts
import { z as z5 } from "zod";

// src/lib/workers/privacy.ts
var PRIVATE_KEYS = /(?:token|secret|password|authorization|document(?:number|_number)?|cpf|cnpj|telefone|phone|email|e_mail|pix|renavam|storage.?path|raw_payload|internal.?notes|observa[cç][oõ]es|description|descricao|evidence|contact|buyer_?name|buyer_?trade_?name|responsible_?text)/i;
function maskWorkerText(text3) {
  return text3.replace(/\b(?:Bearer\s+)?eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gi, "[token protegido]").replace(/\b(?:sb_secret_|sb_publishable_|sk-)[A-Za-z0-9_-]+\b/g, "[chave protegida]").replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[e-mail protegido]").replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF protegido]").replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[documento protegido]").replace(/(?:\+?55[\s.-]*)?\(?\b\d{2}\)?[\s.-]*9?\d{4}[\s.-]*\d{4}\b/g, "[telefone protegido]").replace(/\b(?:PIX|chave\s+pix)\s*[:=]\s*[^\s,;]+/gi, "PIX: [protegido]").replace(/https?:\/\/[^\s]+/gi, "[link externo omitido]");
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
      if (key === "document_count") {
        if (item === null || typeof item === "number" && Number.isSafeInteger(item) && item >= 0) result[key] = item;
        continue;
      }
      if (PRIVATE_KEYS.test(key) || key === "__proto__" || key === "constructor" || key === "prototype") continue;
      if (/^(?:id|.*_id|.*Id|lot_ids)$/.test(key) && (typeof item === "string" || Array.isArray(item))) {
        const ids = Array.isArray(item) ? item : [item];
        result[key] = ids.every((id2) => typeof id2 === "string" && /^[0-9a-f-]{36}$/i.test(id2)) ? item : sanitizeWorkerData(item, depth + 1);
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

// src/lib/workers/commercial-report.ts
var id = z5.string().uuid();
var count = z5.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
var cents = count.nullable();
var area = z5.number().finite().min(0).nullable();
var date2 = z5.string().regex(/^\d{4}-\d{2}-\d{2}$/);
var commercialReportSpecSchema = z5.object({
  schemaVersion: z5.literal(1).default(1),
  projectId: id,
  editionYear: z5.number().int().min(2e3).max(2200).optional(),
  scopes: z5.array(z5.object({ kind: z5.enum(["pavilion", "segment", "block", "lot"]), id }).strict()).max(100).default([]),
  scopeSearch: z5.array(z5.string().trim().min(1).max(120)).max(20).default([]),
  geography: z5.enum(["all", "internal", "external"]).default("all"),
  saleStates: z5.array(z5.enum(["pending", "signed", "partial", "legacy", "cancelled"])).max(5).default([]),
  inventoryStates: z5.array(z5.enum(["AVAILABLE", "BLOCKED", "RESERVED", "IN_NEGOTIATION", "SALE_OPEN", "SOLD", "UNAVAILABLE"])).max(7).default([]),
  contractFilter: z5.enum(["any", "with_document", "without_document"]).default("any"),
  exhibitorIds: z5.array(id).max(100).default([]),
  companySearch: z5.string().trim().min(1).max(180).optional(),
  orderIds: z5.array(id).max(100).default([]),
  contractIds: z5.array(id).max(100).default([]),
  orderSearch: z5.string().trim().min(1).max(160).optional(),
  contractSearch: z5.string().trim().min(1).max(160).optional(),
  issuesOnly: z5.boolean().default(false),
  documentStates: z5.enum(["all", "active", "inactive"]).default("all"),
  period: z5.object({ from: date2, to: date2, basis: z5.enum(["created", "signed"]) }).strict().optional(),
  comparisonPeriod: z5.object({ from: date2, to: date2, basis: z5.enum(["created", "signed"]) }).strict().optional(),
  reportFocus: z5.enum(["sales", "exhibitors", "contracts", "inventory"]).default("sales"),
  documentFilter: z5.enum(["any", "multi_lot", "with_prior_versions"]).default("any"),
  minArea: z5.number().finite().min(0).max(1e9).optional(),
  maxArea: z5.number().finite().min(0).max(1e9).optional(),
  minValueCents: count.optional(),
  maxValueCents: count.optional(),
  missingArea: z5.boolean().default(false),
  missingCompany: z5.boolean().default(false),
  monetaryBasis: z5.enum(["principal", "principal_and_fees"]).default("principal"),
  groupBy: z5.enum(["scope", "exhibitor", "status", "none"]).default("scope"),
  sortBy: z5.enum(["scope", "exhibitor", "area", "value", "created", "signed", "lots"]).default("scope"),
  sortDirection: z5.enum(["asc", "desc"]).default("asc"),
  sections: z5.array(z5.enum(["summary", "sales", "exhibitors", "contracts", "charts", "plan_2d"])).max(6).default(["summary", "sales", "charts"]),
  presentation: z5.enum(["executive", "detailed"]).default("executive")
}).strict();
var commercialReportRowSchema = z5.object({
  id,
  orderId: id.nullable(),
  saleId: id.nullable(),
  lotId: id,
  exhibitorId: id.nullable(),
  reference: z5.string().max(160),
  displayName: z5.string().max(300).nullable(),
  historicalDisplayName: z5.string().max(300).nullable().default(null),
  lotLabel: z5.string().max(300),
  historicalLotLabel: z5.string().max(300).nullable(),
  lotNumber: z5.string().max(120).nullable(),
  block: z5.string().max(120).nullable(),
  pavilionId: id.nullable(),
  pavilionName: z5.string().max(300).nullable(),
  segmentId: id.nullable(),
  segmentName: z5.string().max(300).nullable(),
  category: z5.enum(["internal", "external", "unclassified"]),
  mapStatus: z5.string().max(40),
  state: z5.enum(["pending", "signed", "legacy", "cancelled", "inconsistent"]),
  partialOrder: z5.boolean(),
  historicalArea: area,
  currentArea: area,
  principalCents: cents,
  feesCents: cents,
  totalCents: cents,
  createdAt: z5.string().datetime({ offset: true }),
  signedAt: z5.string().datetime({ offset: true }).nullable(),
  documentCount: count.nullable(),
  contractIds: z5.array(id).max(200).nullable(),
  issues: z5.array(z5.string().max(80)).max(20)
}).strict();
var commercialReportInventorySchema = z5.object({
  lotId: id,
  entityId: id,
  lotLabel: z5.string().max(300),
  lotNumber: z5.string().max(120).nullable(),
  block: z5.string().max(120).nullable(),
  pavilionId: id.nullable(),
  pavilionName: z5.string().max(300).nullable(),
  segmentId: id.nullable(),
  segmentName: z5.string().max(300).nullable(),
  category: z5.enum(["internal", "external", "unclassified"]),
  status: z5.string().max(40),
  currentArea: area,
  labelAnchor: z5.array(z5.number().finite()).length(2).nullable(),
  geometry: z5.object({ type: z5.literal("Polygon"), coordinates: z5.array(z5.array(z5.array(z5.number().finite()).min(2).max(3)).min(4).max(2e4)).min(1).max(100) }).strict().nullable(),
  associations: z5.array(z5.object({ rowId: id, exhibitorId: id.nullable(), displayName: z5.string().max(300).nullable(), state: z5.string().max(40) }).strict()).max(100),
  issues: z5.array(z5.string().max(80)).max(20)
}).strict();
var commercialReportContractSchema = z5.object({
  id,
  reference: z5.string().max(160).nullable(),
  scope: z5.enum(["LOT", "ORDER_ITEMS"]),
  orderId: id.nullable(),
  lotIds: z5.array(id).max(2e4),
  active: z5.boolean(),
  activeVersion: count,
  versionCount: count,
  orderCoverage: z5.object({ totalLots: count, coveredLots: count, missingLotIds: z5.array(id).max(1e5), complete: z5.boolean() }).strict().nullable().default(null),
  createdAt: z5.string().datetime({ offset: true }),
  updatedAt: z5.string().datetime({ offset: true })
}).strict();
var commercialReportTotalsSchema = z5.object({
  orders: count,
  signedLots: count,
  pendingLots: count,
  legacyLots: count,
  cancelledItems: count,
  partialOrders: count,
  exhibitors: count,
  documents: count.nullable(),
  soldMapLots: count,
  availableLots: count,
  inventoryLots: count,
  principalCents: cents,
  signedPrincipalCents: cents,
  pendingPrincipalCents: cents,
  legacyPrincipalCents: cents,
  feesCents: cents,
  totalCents: cents,
  historicalArea: area,
  currentArea: area
}).strict();
var commercialReportSnapshotSchema = z5.object({
  schemaVersion: z5.literal(1),
  snapshotId: id,
  generatedAt: z5.string().datetime({ offset: true }),
  generation: z5.string().regex(/^[a-f0-9]{32,64}$/),
  spec: commercialReportSpecSchema,
  scope: z5.object({ projectId: id, projectName: z5.string().max(300), editionYear: z5.number().int().nullable(), timezone: z5.literal("America/Sao_Paulo") }).strict(),
  totals: commercialReportTotalsSchema,
  comparison: z5.object({ period: z5.object({ from: date2, to: date2, basis: z5.enum(["created", "signed"]) }).strict(), totals: commercialReportTotalsSchema }).strict().optional(),
  coverage: z5.object({ complete: z5.boolean(), excludedRows: count, issues: z5.array(z5.object({ code: z5.string().max(80), count }).strict()).max(100) }).strict(),
  capabilities: z5.object({ companyNames: z5.boolean(), monetaryValues: z5.boolean(), contractReferences: z5.boolean() }).strict(),
  rows: z5.array(commercialReportRowSchema).max(1e5),
  inventory: z5.array(commercialReportInventorySchema).max(1e5),
  contracts: z5.array(commercialReportContractSchema).max(1e5),
  groups: z5.array(z5.object({ key: z5.string().max(180), label: z5.string().max(300), lots: count, orders: count, exhibitors: count, principalCents: cents, feesCents: cents, historicalArea: area }).strict()).max(1e5),
  planOutlines: z5.array(z5.object({ id, label: z5.string().max(300), kind: z5.enum(["segment", "block", "pavilion", "support"]), lotIds: z5.array(id).max(1e5).default([]), geometry: z5.object({ type: z5.literal("Polygon"), coordinates: z5.array(z5.array(z5.array(z5.number().finite()).min(2).max(3)).min(4).max(2e4)).min(1).max(100) }).strict() }).strict()).max(1e5),
  calibration: z5.object({ mapUnitsPerMeter: z5.number().finite().positive(), status: z5.literal("VALIDATED") }).strict().nullable(),
  notes: z5.array(z5.string().max(2e3)).max(30)
}).strict();
function parseCommercialReportSpec(value) {
  const spec = commercialReportSpecSchema.parse(value);
  for (const period of [spec.period, spec.comparisonPeriod]) {
    if (!period) continue;
    const valid = (value2) => (/* @__PURE__ */ new Date(`${value2}T12:00:00Z`)).toISOString().slice(0, 10) === value2;
    if (!valid(period.from) || !valid(period.to) || period.from > period.to) throw new Error("Período inválido.");
  }
  if (spec.comparisonPeriod && (!spec.period || spec.period.basis !== spec.comparisonPeriod.basis)) throw new Error("Comparação exige períodos com a mesma base temporal.");
  if (spec.minArea !== void 0 && spec.maxArea !== void 0 && spec.minArea > spec.maxArea || spec.minValueCents !== void 0 && spec.maxValueCents !== void 0 && spec.minValueCents > spec.maxValueCents) throw new Error("Faixa inválida.");
  return spec;
}
function parseCommercialReportSnapshot(value) {
  const snapshot = commercialReportSnapshotSchema.parse(value);
  parseCommercialReportSpec(snapshot.spec);
  if (snapshot.spec.projectId !== snapshot.scope.projectId) throw new Error("Projeto divergente.");
  const unique = (ids) => new Set(ids).size === ids.length;
  if (!unique(snapshot.rows.map((row) => row.id)) || !unique(snapshot.inventory.map((lot) => lot.lotId)) || !unique(snapshot.contracts.map((contract) => contract.id))) throw new Error("Identidades duplicadas.");
  const rowById = new Map(snapshot.rows.map((row) => [row.id, row]));
  for (const lot of snapshot.inventory) for (const association of lot.associations) {
    const row = rowById.get(association.rowId);
    if (!row || row.lotId !== lot.lotId || row.exhibitorId !== association.exhibitorId) throw new Error("Associação de planta divergente.");
  }
  const sanitize = (name) => name === null ? null : maskWorkerText(name).slice(0, 300);
  for (const row of snapshot.rows) {
    row.displayName = snapshot.capabilities.companyNames ? sanitize(row.displayName) : null;
    row.historicalDisplayName = snapshot.capabilities.companyNames ? sanitize(row.historicalDisplayName) : null;
    if (!snapshot.capabilities.monetaryValues && [row.principalCents, row.feesCents, row.totalCents].some((n) => n !== null)) throw new Error("Projeção monetária não autorizada.");
    if (!snapshot.capabilities.contractReferences && (row.documentCount !== null || row.contractIds !== null)) throw new Error("Projeção contratual não autorizada.");
  }
  for (const lot of snapshot.inventory) for (const association of lot.associations) association.displayName = snapshot.capabilities.companyNames ? sanitize(association.displayName) : null;
  if (!snapshot.capabilities.monetaryValues && ([snapshot.totals.principalCents, snapshot.totals.signedPrincipalCents, snapshot.totals.pendingPrincipalCents, snapshot.totals.legacyPrincipalCents, snapshot.totals.feesCents, snapshot.totals.totalCents].some((n) => n !== null) || snapshot.groups.some((group) => group.principalCents !== null || group.feesCents !== null))) throw new Error("Totais monetários não autorizados.");
  if (!snapshot.capabilities.monetaryValues && snapshot.comparison && [snapshot.comparison.totals.principalCents, snapshot.comparison.totals.signedPrincipalCents, snapshot.comparison.totals.pendingPrincipalCents, snapshot.comparison.totals.legacyPrincipalCents, snapshot.comparison.totals.feesCents, snapshot.comparison.totals.totalCents].some((n) => n !== null)) throw new Error("Comparação monetária não autorizada.");
  if (!snapshot.capabilities.contractReferences && snapshot.comparison?.totals.documents != null) throw new Error("Comparação contratual não autorizada.");
  if (!snapshot.capabilities.contractReferences && snapshot.totals.documents !== null) throw new Error("Total de documentos não autorizado.");
  if (!snapshot.capabilities.contractReferences && snapshot.contracts.length) throw new Error("Contratos não autorizados.");
  return snapshot;
}

// src/lib/workers/tools/mapa/index.ts
var mapaTools = [
  tool("map_commercial_report_query", "mapa", "Consulta comercial por recorte", "Consulta transacional completa de vendas, empresas, assinatura, contratos e ocupação. Resolve pavilhões físicos, segmentos, quadras e lotes persistidos; preserve spec nas continuações. Valores e referências de documentos dependem de autorização no servidor. Retorna prévia de até 25 linhas e totais do conjunto inteiro; documento não comprova assinatura, principal e taxas são separados. Não gera arquivo nem altera fatos comerciais.", input({ project_id: uuid().optional(), spec: commercialReportSpecSchema.omit({ projectId: true }) }), "map_sales", "/mapa-comercial", ["map_projects", "workers_map_commercial_report"]),
  tool("map_sales_records_summary", "mapa", "Contratos e registros comerciais", "Reutiliza exatamente os totais da API da Dashboard: total global, PENDING (inclui parciais) e SIGNED. Unidade é agrupamento/registro comercial, não lote, documento ou recebimento. A API não filtra edição: peça escopo de projeto inteiro quando uma edição for solicitada.", input({ project_id: uuid().optional(), edition_year: z6.number().int().min(2e3).max(2200).optional(), date_from: date().optional(), date_to: date().optional() }), "map_sales", "/mapa-comercial", ["map_projects", "list_commercial_sale_orders"]),
  tool("map_inventory_summary", "mapa", "Espaços e infraestrutura", "Calcula sobre todos os lotes ativos autorizados do projeto. Filtra situação, quadra, área oficial e infraestrutura persistida. Agrupa por situação ou quadra, com Outros calculado no servidor se necessário. Não confundir disponibilidade com vendas, preços ou recebimentos. Projeto/edição ambíguos pedem esclarecimento.", input({ project_id: uuid().optional(), edition_year: z6.number().int().min(2e3).max(2200).optional(), status: z6.enum(["AVAILABLE", "BLOCKED", "RESERVED", "IN_NEGOTIATION", "SALE_OPEN", "SOLD"]).optional(), block: z6.string().max(120).optional(), min_area: z6.number().min(0).max(1e9).optional(), max_area: z6.number().min(0).max(1e9).optional(), covered: z6.boolean().optional(), electricity: z6.boolean().optional(), water: z6.boolean().optional(), internet: z6.boolean().optional(), group_by: z6.enum(["status", "block"]).default("status"), missing_number: z6.boolean().optional(), missing_area: z6.boolean().optional() }), "map", "/mapa-comercial", ["workers_map_inventory_summary"]),
  tool("map_sales_overview", "mapa", "Panorama de vendas comerciais", "Agrega todo o conjunto autorizado por projeto/edição persistidos. Período opcional exige as duas datas: confirmados usam assinatura; itens atualmente em aberto usam criação. Não representa posição histórica nem recebimentos.", input({ project_id: uuid().optional(), edition_year: z6.number().int().min(2e3).max(2200).optional(), date_from: date().optional(), date_to: date().optional() }), "map_sales", "/mapa-comercial", ["workers_map_sales_overview"]),
  tool("map_projects", "mapa", "Projetos comerciais", "Lista projetos ativos visíveis.", input({ limit: limit() }), "map", "/mapa-comercial", ["map_projects"]),
  tool("map_segments", "mapa", "Segmentos do mapa", "Consulta segmentos ativos do projeto autorizado.", input(project()), "map", "/mapa-comercial", ["map_projects", "map_segments"]),
  tool("map_entities", "mapa", "Identificação de pavilhões", "Consulta entidades persistidas para relacionar lote, pavilhão e segmento. Não retorna geometria.", input({ ...project(), segment_id: uuid().optional() }), "map", "/mapa-comercial", ["map_projects", "map_entities"]),
  tool("map_inventory", "mapa", "Inventário comercial", "Lista lotes ativos com identidade persistida; distingue SALE_OPEN de SOLD. Total refere-se ao filtro e registros podem ser parciais.", input({ ...project(), status: z6.enum(["AVAILABLE", "BLOCKED", "RESERVED", "IN_NEGOTIATION", "SALE_OPEN", "SOLD"]).optional() }), "map", "/mapa-comercial", ["map_projects", "commercial_lots"]),
  tool("map_prices", "mapa", "Preços autorizados", "Consulta preços oficiais sob RLS; nunca altera valores.", input({ ...project(), pavilion: z6.string().max(80).optional() }), "map", "/mapa-comercial", ["map_projects", "commercial_lot_pricing_2028"]),
  tool("map_segment_inventory", "mapa", "Completude do segmento", "Retorna contagens estruturais, sem inferir inventário comercial.", input({ project_id: uuid(), segment_id: uuid() }), "map", "/mapa-comercial", ["map_projects", "map_segments", "get_commission_map_segment_inventory"]),
  tool("list_sale_orders", "mapa", "Vendas em aberto e confirmadas", "Consulta estados e quantidade de itens; omite comprador, contatos, valores e pagamentos.", input({ ...project(), status: z6.enum(["PENDING", "SIGNED", "PARTIAL", "CANCELLED_PARTIAL", "LEGACY"]).optional(), has_document: z6.boolean().optional() }), "map_sales", "/mapa-comercial", ["map_projects", "list_commercial_sale_orders"]),
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
  "workers_public_links_overview",
  "workers_map_sales_overview",
  "workers_agenda_personal_summary",
  "workers_agenda_people_ranking",
  "workers_agenda_query",
  "workers_map_inventory_summary",
  "workers_map_commercial_report",
  "workers_agenda_resolve_identity",
  "workers_agenda_person_events",
  "workers_agenda_commission_ranking"
];
async function requireProject(ctx, id2) {
  const { data, error } = await ctx.supabase.from("map_projects").select("id,org_id,is_archived").eq("org_id", ctx.orgId).eq("id", id2).eq("is_archived", false).maybeSingle();
  if (error) throw workerDataError(error, "authorization");
  if (!data || data.org_id !== ctx.orgId) throw new WorkerToolError("NOT_FOUND", "Projeto não encontrado ou sem acesso.");
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
  const { data, error, count: count4 } = await query.limit(size + 1);
  if (error) throw workerDataError(error);
  const rows2 = data ?? [];
  return { records: rows2.slice(0, size).map((row) => pickWorkerFields(row, spec.fields)), total: count4 ?? rows2.length, truncated: count4 != null ? count4 > size : rows2.length > size };
}
async function readRpc(ctx, rpc, args) {
  if (!READ_RPCS.includes(rpc)) throw new WorkerToolError("TOOL_NOT_ALLOWED", "RPC fora da allowlist de leitura.");
  if ("_org_id" in args && args._org_id !== ctx.orgId) throw new WorkerToolError("PERMISSION_DENIED", "Organização inválida.");
  const { data, error } = await ctx.supabase.rpc(rpc, args);
  if (error) throw workerDataError(error);
  return data;
}

// src/lib/workers/analytics.ts
import { z as z7 } from "zod";
var count2 = z7.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
var finite = z7.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
var text = z7.string().min(1).max(500);
var scope = z7.object({
  timezone: z7.literal("America/Sao_Paulo"),
  complete: z7.literal(true),
  as_of: z7.string().datetime({ offset: true }),
  period: z7.object({ from: z7.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z7.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().optional(),
  project_id: z7.string().uuid().optional(),
  project_name: text.optional(),
  edition_year: z7.number().int().min(2e3).max(2200).optional(),
  edition_label: text.optional(),
  unit: z7.enum(["BRL_cents", "events"]).optional(),
  relationship: z7.enum(["linked", "created", "responsible"]).optional(),
  duration_basis: z7.literal("full_scheduled_event").optional(),
  subevents: z7.literal("deduplicated_parent").optional(),
  cancelled: z7.literal("excluded").optional()
}).strict();
var notes = z7.array(text).max(8);
var map = z7.object({ scope, notes, metrics: z7.object({
  confirmed_value_cents: count2,
  open_value_cents: count2,
  confirmed_orders: count2,
  open_orders: count2,
  confirmed_lots: count2,
  open_lots: count2,
  legacy_lots: count2,
  cancelled_lots: count2,
  unverified_lots: count2,
  missing_value_lots: count2,
  unallocated_lots: count2,
  unknown_period_lots: count2
}).strict() }).strict();
var personal = z7.object({ scope, notes, metrics: z7.object({
  events: count2,
  created_events: count2,
  responsible_events: count2,
  linked_events: count2,
  completed_events: count2,
  past_events: count2,
  scheduled_events: count2,
  valid_duration_events: count2,
  average_duration_minutes: finite.nullable(),
  weekday_counts: z7.array(z7.object({ weekday: z7.number().int().min(0).max(6), events: count2 }).strict()).max(7)
}).strict() }).strict();
var ranking = z7.object({
  scope,
  notes,
  metrics: z7.object({
    people_count: count2,
    event_count: count2,
    unidentified_links: count2,
    shown_people: z7.number().int().min(1).max(30),
    tie_break: z7.literal("name_then_id")
  }).strict(),
  people: z7.array(z7.object({ person_id: z7.string().uuid(), name: text, events: count2, position: count2 }).strict()).max(30)
}).strict();
var identity = z7.object({ id: z7.string().uuid(), name: text, kind: z7.enum(["person", "commission"]), visual_key: z7.string().regex(/^[a-z0-9_-]{1,100}$/).optional() }).strict();
var identities = z7.object({ complete: z7.literal(true), identities: z7.array(identity) }).strict();
var personEvents = z7.object({ scope, notes, person: identity.extend({ kind: z7.literal("person") }), metrics: z7.object({ events: count2 }).strict() }).strict();
var commissionRanking = z7.object({
  scope,
  notes,
  metrics: z7.object({
    commission_count: count2,
    event_count: count2,
    shown_commissions: z7.number().int().min(1).max(30),
    tie_break: z7.literal("name_then_id")
  }).strict(),
  commissions: z7.array(z7.object({ commission_id: z7.string().uuid(), name: text, slug: z7.string().regex(/^[a-z0-9_-]{1,100}$/), events: count2, position: count2 }).strict()).max(30)
}).strict();
var clarification = z7.object({ needs_clarification: z7.literal(true), question: text, options: z7.array(text).max(100) }).strict();
function parseWorkerAnalytics(tool2, value) {
  const schema = tool2 === "map_sales_overview" ? z7.union([map, clarification]) : tool2 === "agenda_personal_summary" ? personal : tool2 === "agenda_people_ranking" ? ranking : tool2 === "agenda_commission_ranking" ? commissionRanking : tool2 === "agenda_resolve_identity" ? identities : tool2 === "agenda_person_events" ? personEvents : void 0;
  if (!schema) throw new WorkerToolError("INVALID_RESPONSE", "Resultado de consulta não reconhecido.", { stage: "validation" });
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new WorkerToolError("INVALID_RESPONSE", "Não foi possível verificar o resultado desta consulta.", { stage: "validation" });
  if (tool2 === "map_sales_overview" && "metrics" in parsed.data) {
    const result = map.parse(parsed.data);
    if (!result.scope.project_id || !result.scope.edition_year || !result.scope.edition_label || !result.scope.project_name)
      throw new WorkerToolError("INVALID_RESPONSE", "Não foi possível verificar a edição deste resultado.", { stage: "validation" });
  }
  if (tool2 === "agenda_personal_summary") {
    const result = personal.parse(parsed.data), metrics = result.metrics;
    const selected = result.scope.relationship === "created" ? metrics.created_events : result.scope.relationship === "responsible" ? metrics.responsible_events : metrics.linked_events;
    if (!result.scope.period || metrics.events !== selected || metrics.valid_duration_events > metrics.events || metrics.completed_events > metrics.events || metrics.past_events > metrics.events || metrics.scheduled_events > metrics.events || metrics.valid_duration_events === 0 !== (metrics.average_duration_minutes === null) || metrics.weekday_counts.reduce((sum, row) => sum + row.events, 0) !== metrics.events || new Set(metrics.weekday_counts.map((row) => row.weekday)).size !== metrics.weekday_counts.length)
      throw new WorkerToolError("INVALID_RESPONSE", "Não foi possível verificar os totais da sua Agenda.", { stage: "validation" });
  }
  if (tool2 === "agenda_people_ranking" && "people" in parsed.data) {
    const result = ranking.parse(parsed.data), people = result.people;
    if (!result.scope.period || result.metrics.people_count < people.length || people.length > result.metrics.shown_people || people.some((person, index) => person.position !== index + 1 || person.events > result.metrics.event_count || index > 0 && person.events > people[index - 1].events) || new Set(people.map((person) => person.person_id)).size !== people.length)
      throw new WorkerToolError("INVALID_RESPONSE", "Não foi possível distinguir as pessoas deste resultado.", { stage: "validation" });
  }
  if (tool2 === "agenda_commission_ranking") {
    const result = commissionRanking.parse(parsed.data), rows2 = result.commissions;
    if (!result.scope.period || result.metrics.commission_count < rows2.length || rows2.length > result.metrics.shown_commissions || new Set(rows2.map((row) => row.commission_id)).size !== rows2.length || rows2.some((row, index) => row.position !== index + 1 || row.events > result.metrics.event_count || index > 0 && row.events > rows2[index - 1].events))
      throw new WorkerToolError("INVALID_RESPONSE", "Não foi possível verificar o ranking das comissões.", { stage: "validation" });
  }
  if (tool2 === "agenda_person_events" && !personEvents.parse(parsed.data).scope.period)
    throw new WorkerToolError("INVALID_RESPONSE", "Não foi possível verificar o período da consulta.", { stage: "validation" });
  if (tool2 === "agenda_resolve_identity") {
    const result = identities.parse(parsed.data);
    if (new Set(result.identities.map((row) => row.id)).size !== result.identities.length)
      throw new WorkerToolError("INVALID_RESPONSE", "Identidades duplicadas no resultado.", { stage: "validation" });
  }
  return parsed.data;
}

// src/lib/workers/question-analytics.ts
import { z as z8 } from "zod";
var count3 = z8.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
var amount = z8.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
var text2 = z8.string().max(500);
var filters = z8.object({ relationship: z8.enum(["all", "linked", "created", "responsible"]).optional(), status: text2.optional(), search: text2.optional(), location: text2.optional(), category: text2.optional(), priority: text2.optional(), weekday: z8.number().int().min(0).max(6).optional(), commission_id: z8.string().uuid().optional(), block: text2.optional(), min_area: amount.optional(), max_area: amount.optional(), covered: z8.boolean().optional(), electricity: z8.boolean().optional(), water: z8.boolean().optional(), internet: z8.boolean().optional(), missing_number: z8.boolean().optional(), missing_area: z8.boolean().optional(), missing_time: z8.boolean().optional(), missing_location: z8.boolean().optional(), missing_category: z8.boolean().optional(), cross_midnight: z8.boolean().optional(), cross_period: z8.boolean().optional(), start_in_period: z8.boolean().optional() }).strict();
var scope2 = z8.object({ complete: z8.literal(true), as_of: z8.string().datetime({ offset: true }), timezone: z8.literal("America/Sao_Paulo"), period: z8.object({ from: text2, to: text2 }).strict().optional(), project_id: z8.string().uuid().optional(), project_name: text2.optional(), edition_year: z8.number().int().optional(), edition_label: text2.optional(), group_by: z8.enum(["status", "block", "location", "category", "weekday", "day"]), filters }).strict();
var common = { scope: scope2, groups: z8.array(z8.object({ label: z8.string().min(1).max(180), count: count3 }).strict()).max(20) };
var inventory = z8.object({ ...common, metrics: z8.object({ total: count3, area_sqm: amount, missing_area: count3 }).strict(), rows: z8.array(z8.object({ name: text2, number: text2.nullable(), block: text2.nullable(), status: text2, area_sqm: amount.nullable(), covered: z8.boolean(), electricity: z8.boolean(), water: z8.boolean(), internet: z8.boolean() }).strict()).max(20) }).strict();
var agenda = z8.object({ ...common, metrics: z8.object({ total: count3, valid_duration_events: count3, average_duration_minutes: amount.nullable() }).strict(), rows: z8.array(z8.object({ title: text2, status: text2, start_date: text2.nullable(), end_date: text2.nullable(), start_time: text2.nullable(), end_time: text2.nullable(), location: text2.nullable(), category: text2, priority: text2 }).strict()).max(20) }).strict();
var clarification2 = z8.object({ needs_clarification: z8.literal(true), question: text2, options: z8.array(text2).max(100) }).strict();
function parseQuestionAnalytics(tool2, value) {
  const parsed = (tool2 === "map_inventory_summary" ? z8.union([inventory, clarification2]) : agenda).safeParse(value);
  if (!parsed.success) throw new WorkerToolError("DATA_UNAVAILABLE", "Não foi possível verificar os dados solicitados.");
  if ("metrics" in parsed.data) {
    const data = parsed.data;
    if (data.groups.reduce((sum, group) => sum + group.count, 0) !== data.metrics.total || new Set(data.groups.map((group) => group.label)).size !== data.groups.length || data.rows.length > data.metrics.total || "valid_duration_events" in data.metrics && (data.metrics.valid_duration_events > data.metrics.total || data.metrics.valid_duration_events === 0 !== (data.metrics.average_duration_minutes === null))) throw new WorkerToolError("DATA_UNAVAILABLE", "Não foi possível verificar a abrangência da consulta.");
  }
  return parsed.data;
}

// src/lib/workers/commercial-report-preview.ts
function commercialReportContracts(snapshot) {
  return snapshot.contracts.filter((contract) => snapshot.spec.documentFilter === "multi_lot" ? contract.lotIds.length > 1 : snapshot.spec.documentFilter === "with_prior_versions" ? contract.versionCount > 1 : true).map((contract) => ({ ...contract, exhibitors: [...new Map(snapshot.rows.filter((row) => contract.lotIds.includes(row.lotId) && (contract.scope === "LOT" || row.orderId === contract.orderId)).map((row) => [row.exhibitorId ?? `missing:${row.id}`, { id: row.exhibitorId, displayName: row.displayName }])).values()] })).sort((a, b) => b.lotIds.length - a.lotIds.length || a.id.localeCompare(b.id));
}
function commercialReportGroups(snapshot) {
  const spec = snapshot.spec;
  const inventoryGroups = /* @__PURE__ */ new Map();
  if (spec.reportFocus === "inventory") for (const lot of snapshot.inventory) {
    const key = spec.groupBy === "status" ? lot.status : lot.pavilionId ?? lot.segmentId ?? "unclassified";
    const label = spec.groupBy === "status" ? lot.status : lot.pavilionName ?? lot.segmentName ?? "Área sem classificação";
    const group = inventoryGroups.get(key) ?? { key, label, lots: 0, orders: 0, exhibitors: 0, principalCents: null, feesCents: null, historicalArea: null, availableLots: 0, soldMapLots: 0, saleOpenLots: 0, blockedLots: 0 };
    group.lots++;
    if (lot.status === "AVAILABLE") group.availableLots++;
    if (lot.status === "SOLD") group.soldMapLots++;
    if (lot.status === "SALE_OPEN") group.saleOpenLots++;
    if (lot.status === "BLOCKED") group.blockedLots++;
    inventoryGroups.set(key, group);
  }
  const contractGroups = /* @__PURE__ */ new Map();
  if (spec.reportFocus === "contracts") for (const contract of commercialReportContracts(snapshot)) {
    const linked = snapshot.inventory.filter((lot) => contract.lotIds.includes(lot.lotId));
    const identities2 = spec.groupBy === "exhibitor" ? contract.exhibitors.length ? contract.exhibitors.map((exhibitor) => ({ key: exhibitor.id ?? `missing:${contract.id}`, label: exhibitor.displayName ?? "Identidade não comprovada", lotId: null })) : [{ key: `missing:${contract.id}`, label: "Identidade não comprovada", lotId: null }] : linked.length ? linked.map((lot) => ({ key: lot.pavilionId ?? lot.segmentId ?? "unclassified", label: lot.pavilionName ?? lot.segmentName ?? "Área sem classificação", lotId: lot.lotId })) : [{ key: "unclassified", label: "Área sem classificação", lotId: null }];
    for (const identity2 of identities2) {
      const key = spec.groupBy === "status" ? contract.active ? "active" : "inactive" : spec.groupBy === "none" ? "all" : identity2.key;
      const label = spec.groupBy === "status" ? contract.active ? "Ativos" : "Inativos" : spec.groupBy === "none" ? "Todos os documentos" : identity2.label;
      const entry = contractGroups.get(key) ?? { group: { key, label, lots: 0, orders: 0, exhibitors: 0, principalCents: null, feesCents: null, historicalArea: null, documents: 0 }, documents: /* @__PURE__ */ new Set(), lots: /* @__PURE__ */ new Set(), orders: /* @__PURE__ */ new Set() };
      entry.documents.add(contract.id);
      if (identity2.lotId) entry.lots.add(identity2.lotId);
      if (contract.orderId) entry.orders.add(contract.orderId);
      entry.group.documents = entry.documents.size;
      entry.group.lots = entry.lots.size;
      entry.group.orders = entry.orders.size;
      contractGroups.set(key, entry);
    }
  }
  const compare = (a, b) => {
    const field = spec.sortBy === "area" ? "historicalArea" : spec.sortBy === "value" ? "principalCents" : spec.sortBy === "lots" ? "lots" : void 0;
    if (field) {
      const left = a[field], right = b[field];
      if (left === null && right !== null) return 1;
      if (right === null && left !== null) return -1;
      const delta = Number(left) - Number(right);
      if (delta) return spec.sortDirection === "desc" ? -delta : delta;
    }
    return a.label.localeCompare(b.label, "pt-BR") || a.key.localeCompare(b.key);
  };
  const groups = [...spec.reportFocus === "inventory" ? inventoryGroups.values() : spec.reportFocus === "contracts" ? [...contractGroups.values()].map((entry) => entry.group) : snapshot.groups].sort(compare);
  return groups;
}
function commercialReportPreview(snapshot) {
  const spec = snapshot.spec, groups = commercialReportGroups(snapshot);
  const monetary = !["inventory", "contracts"].includes(spec.reportFocus) && snapshot.capabilities.monetaryValues && spec.sortBy !== "lots" && groups.every((group) => group.principalCents !== null);
  const fullChart = groups.map((group) => ({ label: group.label, value: monetary ? group.principalCents : spec.reportFocus === "contracts" ? group.documents ?? 0 : group.lots }));
  const chart = fullChart.slice(0, fullChart.length > 20 ? 19 : 20);
  if (fullChart.length > 20) {
    const remaining = fullChart.slice(19).reduce((sum, group) => sum + group.value, 0);
    if (!Number.isSafeInteger(remaining)) throw new Error("Agregado fora da faixa numérica.");
    chart.push({ label: fullChart.some((group) => group.label === "Outros") ? "Demais grupos" : "Outros", value: remaining });
  }
  const contracts = commercialReportContracts(snapshot);
  const inventory2 = snapshot.inventory.map((lot) => ({
    lotId: lot.lotId,
    lotLabel: lot.lotLabel,
    block: lot.block,
    pavilionName: lot.pavilionName,
    segmentName: lot.segmentName,
    status: lot.status,
    currentArea: lot.currentArea,
    hasGeometry: lot.geometry !== null,
    associationCount: lot.associations.length
  }));
  const inventorySummary = [...new Set(inventory2.map((lot) => lot.status))].sort().map((status) => ({ status, lots: inventory2.filter((lot) => lot.status === status).length }));
  const contractSummary = {
    total: contracts.length,
    active: contracts.filter((contract) => contract.active).length,
    inactive: contracts.filter((contract) => !contract.active).length,
    versions: contracts.reduce((sum, contract) => sum + contract.versionCount, 0),
    multiLot: contracts.filter((contract) => contract.lotIds.length > 1).length,
    withPriorVersions: contracts.filter((contract) => contract.versionCount > 1).length
  };
  const focus = spec.reportFocus;
  const inventoryGrouped = focus === "inventory" && spec.groupBy !== "none";
  const rowCount = focus === "contracts" ? contracts.length : inventoryGrouped ? groups.length : focus === "inventory" ? inventory2.length : focus === "exhibitors" ? groups.length : snapshot.rows.length;
  return {
    schemaVersion: snapshot.schemaVersion,
    snapshotId: snapshot.snapshotId,
    generatedAt: snapshot.generatedAt,
    generation: snapshot.generation,
    spec: snapshot.spec,
    scope: snapshot.scope,
    totals: snapshot.totals,
    coverage: snapshot.coverage,
    capabilities: snapshot.capabilities,
    rows: focus === "sales" ? snapshot.rows.slice(0, 25) : [],
    groups: groups.slice(0, 20),
    groupCount: groups.length,
    chart: { unit: monetary ? "BRL" : "count", data: chart.map((group) => ({ ...group, value: monetary ? group.value / 100 : group.value })), population: chart.length, sourceGroups: groups.length },
    contracts: focus === "contracts" ? contracts.slice(0, 25) : [],
    contractCount: contracts.length,
    contractSummary,
    inventory: focus === "inventory" ? inventory2.slice(0, 25) : [],
    inventoryCount: inventory2.length,
    inventorySummary,
    rowCount,
    previewCount: Math.min(focus === "exhibitors" || inventoryGrouped ? 20 : 25, rowCount),
    plan: { lotCount: snapshot.inventory.length, missingGeometryCount: snapshot.inventory.filter((lot) => !lot.geometry).length },
    notes: snapshot.notes.slice(0, 8),
    ...snapshot.comparison ? { comparison: snapshot.comparison } : {}
  };
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
async function requireCommission(ctx, id2, ownOnly = false) {
  const { data, error } = await ctx.supabase.from("commissions").select("id,org_id").eq("org_id", ctx.orgId).eq("id", id2).eq("is_active", true).maybeSingle();
  if (error) throw workerDataError(error, "authorization");
  if (!data || data.org_id !== ctx.orgId) throw new WorkerToolError("NOT_FOUND", "Comissão não encontrada ou sem acesso.");
  if (ownOnly && ctx.role !== "admin" && !(await ownCommissionIds(ctx)).includes(id2)) throw new WorkerToolError("PERMISSION_DENIED", "Comissão fora do seu vínculo.");
}
async function ownCommissionIds(ctx) {
  const [memberResult, responsibleResult] = await Promise.all([
    ctx.supabase.from("org_members").select("commission_id").eq("org_id", ctx.orgId).eq("user_id", ctx.userId).eq("is_active", true).maybeSingle(),
    ctx.supabase.from("commission_responsibles").select("commission_id").eq("org_id", ctx.orgId).eq("user_id", ctx.userId).eq("active", true).limit(100)
  ]);
  if (memberResult.error || responsibleResult.error) throw workerDataError(memberResult.error ?? responsibleResult.error, "authorization");
  return [...new Set([memberResult.data?.commission_id, ...(responsibleResult.data ?? []).map((row) => row.commission_id)].filter((id2) => typeof id2 === "string"))];
}
async function requireEvent(ctx, id2) {
  const result = await readRows(ctx, "cronograma_eventos_full", { filters: [["id", "eq", id2]], limit: 1 });
  if (!result.records.length) throw new WorkerToolError("NOT_FOUND", "Evento não encontrado ou sem acesso.");
  return result.records[0];
}
async function requireEdition(ctx, id2) {
  const result = await readRows(ctx, "financial_editions", { filters: [["id", "eq", id2]], limit: 1 });
  if (!result.records.length) throw new WorkerToolError("NOT_FOUND", "Edição não encontrada ou sem acesso.");
  return pickWorkerFields(result.records[0], ["id", "code", "label", "period_start", "period_end"]);
}
var moneyFields = ["count", "cap_cents", "uncapped_count", "planned_cents", "line_count", "committed_cents", "projected_cents", "confirmed_cents", "declared_cents", "in_kind_cents", "paid_cents", "payable_open_cents", "overdue_count", "received_cents", "receivable_open_cents", "inconsistent_count", "inflow_cents", "outflow_cents", "expense_planned_cents", "open_cents", "deviation_cents", "deviation_pct", "comparison_state", "overdue_cents", "realized_without_plan_count"];
async function dispatch(def, input2, ctx) {
  const size = Number(input2.limit ?? 20);
  const text3 = (key) => String(input2[key]);
  switch (def.name) {
    case "map_commercial_report_query": {
      let projectId = input2.project_id;
      if (!projectId) {
        const projects = await readRows(ctx, "map_projects", { limit: 100, filters: [["is_archived", "eq", false]] });
        if (projects.truncated || projects.records.length !== 1) return output(def, [{
          needs_clarification: true,
          question: projects.records.length ? "Qual projeto comercial deseja consultar?" : "Não encontrei um projeto comercial autorizado para este relatório.",
          options: projects.records.slice(0, 8).map((project2) => String(project2.name)),
          ...projects.records.length ? { choices: projects.records.slice(0, 8).map((project2) => ({ id: String(project2.id), name: String(project2.name) })) } : {}
        }]);
        projectId = String(projects.records[0].id);
      }
      await requireProject(ctx, projectId);
      let spec;
      try {
        const filters2 = object(input2.spec);
        spec = parseCommercialReportSpec({ ...filters2, ...filters2.reportFocus === "exhibitors" ? { groupBy: "exhibitor" } : {}, projectId });
      } catch {
        throw new WorkerToolError("INVALID_INPUT", "Filtros inválidos para o relatório comercial.");
      }
      const rpcResult = await ctx.supabase.rpc("workers_map_commercial_report", { p_project_id: projectId, p_spec: spec });
      if (rpcResult.error) {
        const reason = typeof rpcResult.error.message === "string" ? rpcResult.error.message.split(":", 1)[0] : "";
        const question = { REPORT_SCOPE_UNRESOLVED: "Não encontrei uma única área autorizada com essa identificação. Informe o pavilhão físico, segmento ou quadra do projeto.", REPORT_COMPANY_UNRESOLVED_OR_AMBIGUOUS: "Não encontrei uma identidade empresarial única com esse nome. Informe o nome empresarial exato ou selecione o expositor no módulo.", REPORT_CONTRACT_UNRESOLVED_OR_AMBIGUOUS: "Não encontrei um único documento com essa referência no projeto autorizado. Informe a referência contratual exata ou selecione o documento no módulo.", REPORT_ORDER_UNRESOLVED_OR_AMBIGUOUS: "Não encontrei um único pedido com essa referência persistida. Informe a referência exata ou selecione o pedido no módulo.", REPORT_EDITION_NOT_PROVEN: "A edição solicitada não está comprovada no cadastro desse projeto. Deseja consultar o projeto inteiro?" };
        if (question[reason]) return output(def, [{ needs_clarification: true, question: question[reason], ...reason === "REPORT_EDITION_NOT_PROVEN" ? { options: ["Consultar o projeto inteiro"] } : {} }]);
        throw workerDataError(rpcResult.error, "query");
      }
      const response = object(rpcResult.data);
      if (response.needs_clarification === true || response.needsClarification === true) return output(def, [response]);
      let snapshot;
      try {
        snapshot = parseCommercialReportSnapshot(response);
      } catch {
        throw new WorkerToolError("INVALID_RESPONSE", "Não foi possível validar a fotografia comercial.", { stage: "validation" });
      }
      if (snapshot.scope.projectId !== projectId || snapshot.spec.projectId !== projectId) throw new WorkerToolError("PERMISSION_DENIED", "Fotografia fora do projeto autorizado.");
      const preview = commercialReportPreview(snapshot);
      return {
        summary: "Fotografia comercial consultada sobre todo o conjunto autorizado; a tabela do chat é uma prévia.",
        records: [preview],
        citations: [{ label: def.title, url: def.deepLink, source: "app" }],
        total: snapshot.rows.length,
        truncated: false,
        commercialSnapshot: snapshot
      };
    }
    case "agenda_resolve_identity": {
      const response = await readRpc(ctx, "workers_agenda_resolve_identity", { _org_id: ctx.orgId, _kind: input2.kind, _search: input2.search });
      return output(def, [parseWorkerAnalytics(def.name, response)], { summary: "Identidades persistidas visíveis para esta consulta." });
    }
    case "agenda_person_events":
    case "agenda_commission_ranking": {
      const response = await readRpc(ctx, def.name === "agenda_person_events" ? "workers_agenda_person_events" : "workers_agenda_commission_ranking", {
        _org_id: ctx.orgId,
        _from_date: input2.date_from,
        _to_date: input2.date_to,
        ...def.name === "agenda_person_events" ? { _person_id: input2.person_id } : { _limit: input2.limit ?? 10 }
      });
      return output(def, [parseWorkerAnalytics(def.name, response)], { summary: "Eventos distintos agregados no servidor sobre todos os vínculos autorizados do período." });
    }
    case "map_sales_records_summary": {
      if (Boolean(input2.date_from) !== Boolean(input2.date_to)) throw new WorkerToolError("INVALID_INPUT", "Informe o início e o fim do período.");
      if (input2.edition_year) return output(def, [{ needs_clarification: true, question: "A API da Dashboard conta os registros do projeto inteiro e não filtra pela edição. Deseja consultar o projeto inteiro?", options: ["Consultar o projeto inteiro"] }]);
      let projectId = input2.project_id;
      let projectName;
      if (!projectId) {
        const projects = await readRows(ctx, "map_projects", { limit: 100, filters: [["is_archived", "eq", false]] });
        if (projects.truncated || projects.records.length !== 1) return output(def, [{
          needs_clarification: true,
          question: projects.records.length ? "Qual projeto comercial deseja consultar?" : "Não encontrei um projeto comercial autorizado. Qual projeto deseja consultar?",
          options: projects.records.map((project2) => String(project2.name)).slice(0, 8)
        }]);
        projectId = String(projects.records[0].id);
        projectName = String(projects.records[0].name);
      }
      await requireProject(ctx, projectId);
      const pages = await Promise.all([null, "PENDING", "SIGNED"].map((status) => readRpc(ctx, "list_commercial_sale_orders", {
        p_project_id: projectId,
        p_search: null,
        p_status: status,
        p_has_document: null,
        p_payment_method: null,
        p_from: input2.date_from ?? null,
        p_to: input2.date_to ?? null,
        p_limit: 1,
        p_offset: 0
      })));
      const totals = pages.map((page) => {
        const value = object(page).total;
        const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
        if (!Number.isSafeInteger(number) || number < 0) throw new WorkerToolError("INVALID_RESPONSE", "A API comercial não retornou um total verificável.", { stage: "validation" });
        return number;
      });
      return output(
        def,
        [{ scope: {
          project_id: projectId,
          ...projectName ? { project_name: projectName } : {},
          complete: true,
          as_of: (/* @__PURE__ */ new Date()).toISOString(),
          timezone: "America/Sao_Paulo",
          ...input2.date_from ? { period: { from: input2.date_from, to: input2.date_to } } : {}
        }, metrics: { total_records: totals[0], pending_records: totals[1], signed_records: totals[2] }, notes: [] }],
        { summary: "Totais oficiais da Dashboard por classificação de assinatura do agrupamento comercial." }
      );
    }
    case "agenda_query":
    case "map_inventory_summary": {
      const args = { _org_id: ctx.orgId };
      for (const [key, value] of Object.entries(input2)) args[`_${key === "date_from" ? "from_date" : key === "date_to" ? "to_date" : key}`] = value;
      const rpc = def.name === "agenda_query" ? "workers_agenda_query" : "workers_map_inventory_summary";
      return output(def, [parseQuestionAnalytics(def.name, await readRpc(ctx, rpc, args))], { summary: "Consulta atual calculada sobre todos os registros autorizados, antes do limite visual dos detalhes." });
    }
    case "map_sales_overview": {
      if (Boolean(input2.date_from) !== Boolean(input2.date_to)) throw new WorkerToolError("INVALID_INPUT", "Informe o início e o fim do período.");
      const response = await readRpc(ctx, "workers_map_sales_overview", {
        _org_id: ctx.orgId,
        _project_id: input2.project_id ?? null,
        _edition_year: input2.edition_year ?? null,
        _from_date: input2.date_from ?? null,
        _to_date: input2.date_to ?? null
      });
      return output(def, [parseWorkerAnalytics(def.name, response)], { summary: "Panorama calculado sobre todos os registros autorizados da edição e do projeto." });
    }
    case "agenda_personal_summary":
    case "agenda_people_ranking": {
      const rpc = def.name === "agenda_personal_summary" ? "workers_agenda_personal_summary" : "workers_agenda_people_ranking";
      const response = await readRpc(ctx, rpc, {
        _org_id: ctx.orgId,
        _from_date: input2.date_from,
        _to_date: input2.date_to,
        ...def.name === "agenda_personal_summary" ? { _relationship: input2.relationship ?? "linked" } : { _limit: input2.limit }
      });
      return output(def, [parseWorkerAnalytics(def.name, response)], { summary: "Resultado calculado sobre todo o período autorizado; vínculos não comprovam presença." });
    }
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
      return output(def, [await requireEvent(ctx, text3("event_id"))], { link: `/cronograma-eventos?event=${encodeURIComponent(text3("event_id"))}` });
    case "list_subevents": {
      await requireEvent(ctx, text3("event_id"));
      const result = await readRows(ctx, "cronograma_subeventos", { limit: size, order: "sort_order", filters: [["parent_event_id", "eq", input2.event_id]] });
      return output(def, result.records, result);
    }
    case "commission_agenda":
    case "commission_metrics": {
      await requireCommission(ctx, text3("commission_id"));
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
      if (text3("teardown_end_at") <= text3("setup_start_at")) throw new WorkerToolError("INVALID_INPUT", "O fim precisa ocorrer após o início.");
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
      const result = await readRows(ctx, table, { projectId: text3("project_id"), limit: size, filters: [
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
      const segment = await readRows(ctx, "map_segments", { projectId: text3("project_id"), limit: 1, filters: [["id", "eq", input2.segment_id], ["is_active", "eq", true]] });
      if (!segment.records.length) throw new WorkerToolError("NOT_FOUND", "Segmento fora do projeto autorizado.");
      const result = rows(await readRpc(ctx, "get_commission_map_segment_inventory", { p_segment_id: input2.segment_id }));
      return output(def, result.map((row) => pickWorkerFields(row, ["expected_entity_count", "expected_lot_count", "lineage_delta"])));
    }
    case "list_sale_orders": {
      await requireProject(ctx, text3("project_id"));
      if (input2.has_document !== void 0 && !await authorizeWorkerPolicy("map_contracts", ctx)) throw new WorkerToolError("PERMISSION_DENIED", "Consulta de contratos requer permissão de contratos.");
      const response = object(await readRpc(ctx, "list_commercial_sale_orders", { p_project_id: input2.project_id, p_limit: size, ...input2.status ? { p_status: input2.status } : {}, ...input2.has_document !== void 0 ? { p_has_document: input2.has_document } : {} }));
      const canReadDocuments = response.documentsAccessible === true && await authorizeWorkerPolicy("map_contracts", ctx);
      const result = rows(response.rows).map((row) => pickWorkerFields(row, ["record_id", "kind", "order_id", "sale_id", "reference", "created_at", "status", "item_count", "active_count", "signed_count", "pending_count", "cancelled_count", "legacy_count", "lot_ids", ...canReadDocuments ? ["document_count"] : []]));
      return output(def, result, { total: Number(response.total ?? result.length), truncated: Number(response.total ?? 0) > size });
    }
    case "sale_order_detail":
    case "sale_order_contract_summary": {
      const order = await readRows(ctx, "lot_sale_orders", { projectId: text3("project_id"), limit: 1, filters: [["id", "eq", input2.order_id]] });
      if (!order.records.length) throw new WorkerToolError("NOT_FOUND", "Pedido fora do projeto autorizado.");
      const response = object(await readRpc(ctx, "get_commercial_sale_order_detail", { p_order_id: input2.order_id }));
      const header = object(response.header);
      if (header.projectId !== input2.project_id || header.orderId !== input2.order_id) throw new WorkerToolError("PERMISSION_DENIED", "Pedido fora do projeto autorizado.");
      if (def.name === "sale_order_contract_summary") {
        if (response.documentsAccessible !== true) throw new WorkerToolError("PERMISSION_DENIED", "Contratos sem permissão de leitura.");
        const contracts = rows(response.contracts);
        return output(def, contracts.slice(0, 100).map((row) => ({
          ...pickWorkerFields(row, ["contractId", "scope", "lotIds", "activeVersion"]),
          ...Array.isArray(row.versions) ? { version_count: row.versions.length } : {}
        })), { total: contracts.length, truncated: contracts.length > 100 });
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
      await requireCommission(ctx, text3("commission_id"), true);
      const result = await readRows(ctx, "commission_responsibles", { limit: size, filters: [["commission_id", "eq", input2.commission_id], ["active", "eq", true]] });
      return output(def, result.records, result);
    }
    case "meeting_sessions":
    case "meeting_actions": {
      await requireCommission(ctx, text3("commission_id"), true);
      await requireEvent(ctx, text3("event_id"));
      const { data: link, error: linkError } = await ctx.supabase.from("cronograma_evento_comissoes").select("event_id").eq("org_id", ctx.orgId).eq("event_id", input2.event_id).eq("commission_id", input2.commission_id).limit(1).maybeSingle();
      if (linkError || !link) throw new WorkerToolError("NOT_FOUND", "Evento não vinculado à comissão.");
      if (def.name === "meeting_sessions") {
        const result2 = await readRows(ctx, "agenda_meeting_sessions", { limit: size, order: "started_at", filters: [["event_id", "eq", input2.event_id], ["consent_confirmed", "eq", true], ["deleted_at", "is", null]] });
        return output(def, result2.records, { ...result2, link: `/cronograma-eventos?event=${encodeURIComponent(text3("event_id"))}` });
      }
      const { data: session, error } = await ctx.supabase.from("agenda_meeting_sessions").select("id,consent_confirmed").eq("org_id", ctx.orgId).eq("event_id", input2.event_id).eq("id", input2.session_id).eq("consent_confirmed", true).is("deleted_at", null).maybeSingle();
      if (error || !session?.consent_confirmed) throw new WorkerToolError("PERMISSION_DENIED", "Sessão sem acesso ou consentimento confirmado.");
      const result = await readRows(ctx, "agenda_meeting_action_items", { limit: size, filters: [["session_id", "eq", input2.session_id], ["event_id", "eq", input2.event_id]] });
      return output(def, result.records, { ...result, link: `/cronograma-eventos?event=${encodeURIComponent(text3("event_id"))}` });
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
      const edition = await requireEdition(ctx, text3("edition_id"));
      const response = object(await readRpc(ctx, def.name, { _org_id: ctx.orgId, _edition_id: input2.edition_id }));
      if (def.name === "financial_edition_summary") {
        const result = { edition };
        for (const group of ["budget", "revenue", "sponsorship", "expenses", "revenues", "obligations", "movements"]) result[group] = pickWorkerFields(response[group], moneyFields);
        return output(def, [result]);
      }
      if (def.name === "financial_budget_execution") {
        return output(def, [{ edition, budgets: rows(response.budgets).slice(0, 100).map((row) => pickWorkerFields(row, ["budget_id", ...moneyFields])), lines: rows(response.lines).slice(0, 100).map((row) => pickWorkerFields(row, ["line_id", ...moneyFields])) }], { truncated: rows(response.budgets).length > 100 || rows(response.lines).length > 100 });
      }
      return output(def, [{ edition, totals: pickWorkerFields(response.totals, moneyFields), by_category: rows(response.by_category).slice(0, 100).map((row) => pickWorkerFields(row, ["id", "name", ...moneyFields])), by_commission: rows(response.by_commission).slice(0, 100).map((row) => pickWorkerFields(row, ["id", "name", ...moneyFields])) }], { truncated: rows(response.by_category).length > 100 || rows(response.by_commission).length > 100 });
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
