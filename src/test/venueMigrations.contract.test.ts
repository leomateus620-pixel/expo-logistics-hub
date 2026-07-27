// @vitest-environment ./src/test/venueSqlNode.environment.ts

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const domainMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260727160000_create_venue_events_domain.sql",
  ),
  "utf8",
);
const transactionMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260727160100_create_venue_events_transactions.sql",
  ),
  "utf8",
);

const normalizeSql = (sql: string) => sql.replace(/\s+/g, " ").toLowerCase();
const domain = normalizeSql(domainMigration);
const transactions = normalizeSql(transactionMigration);

const venueTables = [
  "venue_spaces",
  "venue_stakeholders",
  "venue_booking_units",
  "venue_space_booking_units",
  "venue_counterpart_agreements",
  "venue_events",
  "venue_event_spaces",
  "venue_space_blocks",
  "venue_counterpart_usage",
  "venue_counterpart_ledger",
  "venue_occupancies",
  "venue_event_responsibles",
  "venue_event_resources",
  "venue_checklist_templates",
  "venue_event_checklist_items",
  "venue_event_documents",
  "venue_event_approvals",
  "venue_mutation_receipts",
] as const;

describe("contrato SQL do domínio de Restaurante e Arena", () => {
  it("mantém RLS em todas as tabelas e bloqueia escrita direta autenticada", () => {
    venueTables.forEach((table) => {
      expect(domain).toContain(
        `alter table public.${table} enable row level security`,
      );
    });

    venueTables
      .filter((table) => table !== "venue_mutation_receipts")
      .forEach((table) => {
        expect(domain).toContain(
          `revoke insert, update, delete on public.${table} from authenticated`,
        );
      });
    expect(domain).toContain(
      "revoke all on public.venue_mutation_receipts from authenticated",
    );
    expect(domain).toContain(
      "create policy venue_domain_select on public.%i for select to authenticated using (public.venue_has_capability(org_id, %l))",
    );
  });

  it("garante exclusão transacional sobre a ocupação completa", () => {
    expect(domain).toContain(
      "occupied_during tstzrange generated always as ( tstzrange(setup_start_at, teardown_end_at, '[)') ) stored",
    );
    expect(domain).toContain(
      "constraint venue_occupancies_no_overlap exclude using gist ( org_id with =, booking_unit_id with =, occupied_during with && ) where (active and not conflict_override)",
    );
    expect(transactions).toContain(
      "perform pg_advisory_xact_lock(hashtextextended(_org_id::text, 28701))",
    );
    expect(transactions).toContain(
      "perform public.venue_refresh_occupancies(event_row.id)",
    );
  });

  it("preserva idempotência com recibo único, hash canônico e replay", () => {
    expect(domain).toContain(
      "constraint venue_mutation_receipts_key unique (org_id, actor_user_id, operation, idempotency_key)",
    );
    expect(transactions).toContain(
      "payload_hash text := md5(coalesce(_payload, '{}'::jsonb)::text)",
    );
    expect(transactions).toContain("venue_idempotency_mismatch");
    expect(transactions).toContain("'replayed', true");
    expect(transactions).toContain(
      "public.venue_begin_mutation(_org_id, operation_name, _idempotency_key, request_payload)",
    );
    expect(transactions).toContain(
      "public.venue_finish_mutation(_org_id, operation_name, _idempotency_key, result)",
    );
  });

  it("mantém trilha append-only e auditoria de todas as mutações operacionais", () => {
    expect(domain).toContain(
      "create policy venue_audit_insert_guard on public.audit_log as restrictive for insert to authenticated with check (entity not like 'venue_%')",
    );
    expect(domain).toContain(
      "revoke insert, update, delete on public.venue_counterpart_ledger from authenticated",
    );
    expect(transactions).toContain(
      "create or replace function public.venue_log_audit(",
    );
    expect(transactions).toContain("insert into public.audit_log");
    [
      "'venue_event'",
      "'venue_counterpart_usage'",
      "'venue_stakeholder'",
      "'venue_counterpart_agreement'",
      "'venue_space_block'",
      "'venue_checklist_item'",
      "'venue_event_resource'",
      "'venue_event_document'",
    ].forEach((entity) => expect(transactions).toContain(entity));
  });

  it("reverte aprovação de excesso por lançamento compensatório append-only", () => {
    expect(transactions).toContain(
      "create or replace function public.venue_clear_usage_excess_approval(",
    );
    expect(transactions).toContain(
      "'revisao_contrato', 0, 0, -usage_row.approved_excess_quantity",
    );
    expect(transactions).toContain(
      "approved_excess_quantity = 0, excess_approval_status = case when excess_quantity > 0 then 'pendente' else 'nao_necessario' end, approved_by = null, approved_at = null",
    );
    expect(transactions).toContain("'excess_approval_reversed'");
    expect(transactions).not.toMatch(
      /(?:update|delete from|truncate(?: table)?) public\.venue_counterpart_ledger/,
    );
  });

  it("impõe capabilities no backend e não concede funções ao PUBLIC", () => {
    expect(domain).toContain(
      "create or replace function public.venue_has_capability(_org_id uuid, _capability text)",
    );
    expect(transactions).toContain(
      "actor_id := public.venue_assert_capability(",
    );
    [
      "venue_events_create",
      "venue_events_approve",
      "venue_events_conflict_override",
      "venue_events_cancel",
      "venue_operations_manage",
      "venue_counterparts_manage",
      "venue_sponsors_manage",
      "venue_documents_sensitive",
    ].forEach((capability) => expect(transactions).toContain(capability));
    expect(transactions).toContain(
      "revoke all on function public.venue_save_event(uuid, uuid, integer, uuid, jsonb) from public",
    );
    expect(transactions).toContain(
      "grant execute on function public.venue_save_event(uuid, uuid, integer, uuid, jsonb) to authenticated",
    );
  });

  it("exige justificativa e fingerprint da evidência de conflito", () => {
    expect(domain).toContain(
      "constraint venue_events_conflict_override_evidence_check check",
    );
    expect(domain).toContain(
      "length(trim(coalesce(conflict_override_reason, ''))) >= 8",
    );
    expect(domain).toContain(
      "length(coalesce(conflict_override_fingerprint, '')) = 32",
    );
    expect(transactions).toContain(
      "when conflict_count > 0 and conflict_override_value then conflict_fingerprint",
    );
    expect(transactions).toContain(
      "event_row.conflict_override_fingerprint is distinct from conflict_fingerprint",
    );
    expect(transactions).toContain(
      "raise exception 'venue_conflict' using errcode = '23p01', detail = conflicts::text",
    );
  });

  it("mascara identidade e título de conflitos de eventos restritos", () => {
    expect(domain).toContain(
      "create or replace function public.venue_can_view_event(_org_id uuid, _event_id uuid)",
    );
    expect(domain).toContain(
      "create policy venue_event_visibility_select on public.venue_events as restrictive for select to authenticated using (public.venue_can_view_event(org_id, id))",
    );
    expect(transactions).toContain(
      "case when public.venue_can_view_event(_org_id, occupancy.event_id) then occupancy.event_id else null::uuid end",
    );
    expect(transactions).toContain(
      "case when public.venue_can_view_event(_org_id, occupancy.event_id) then event.title else 'ocupação restrita' end",
    );
    expect(transactions).toContain(
      "'a ocupação se sobrepõe ao período solicitado, incluindo montagem ou desmontagem.'::text",
    );
    expect(transactions).toContain(
      "jsonb_build_object( 'conflict_kind', conflict_item.value->>'conflict_kind', 'space_id', conflict_item.value->>'space_id', 'starts_at', conflict_item.value->>'starts_at', 'ends_at', conflict_item.value->>'ends_at' )",
    );
  });

  it("preserva bloqueio, desbloqueio e no-show como transições auditáveis", () => {
    expect(transactions).toContain("when 'block_request' then");
    expect(transactions).toContain("venue_block_reason_required");
    expect(transactions).toContain("to_status := 'bloqueado'");
    expect(transactions).toContain("decision_value := 'bloqueado'");

    expect(transactions).toContain("when 'unblock_request' then");
    expect(transactions).toContain(
      "select approval.previous_status into blocked_from_status",
    );
    expect(transactions).toContain("decision_value := 'desbloqueado'");

    expect(transactions).toContain("when 'mark_no_show' then");
    expect(transactions).toContain("venue_no_show_reason_required");
    expect(transactions).toContain("venue_no_show_too_early");
    expect(transactions).toContain(
      "if _transition = 'mark_no_show' and usage_row.id is not null then",
    );
    expect(transactions).toContain(
      "if no_show_consumes then insert into public.venue_counterpart_ledger",
    );
    expect(transactions).toContain(
      "update public.venue_counterpart_usage set usage_state = 'no_show', observation = reason_value",
    );
    expect(transactions).toContain("'mark_no_show'");
    expect(domain).toContain(
      "'alteracao_material', 'bloqueado', 'desbloqueado', 'no_show'",
    );
  });

  it("torna a política de no-show imutável após o primeiro uso", () => {
    expect(domain).toContain(
      "no_show_consumes_allowance boolean not null default false",
    );
    expect(transactions).toContain(
      "if agreement_row.no_show_consumes_allowance is distinct from no_show_consumes_value and exists ( select 1 from public.venue_counterpart_usage usage where usage.agreement_id = agreement_row.id and usage.usage_state = 'no_show' ) then raise exception 'venue_counterpart_no_show_policy_immutable'",
    );
  });

  it("rateia a franquia por compromisso estÃ¡vel no ledger e preserva o invariant", () => {
    const recalculateStart = transactions.indexOf(
      "create or replace function public.venue_recalculate_agreement_excess(",
    );
    const recalculateEnd = transactions.indexOf(
      "create or replace function public.venue_sync_event_counterpart(",
    );
    const recalculate = transactions.slice(recalculateStart, recalculateEnd);

    expect(recalculateStart).toBeGreaterThan(-1);
    expect(recalculateEnd).toBeGreaterThan(recalculateStart);
    expect(recalculate).toContain(
      "sum(ledger.reserved_delta + ledger.consumed_delta) over",
    );
    expect(recalculate).toContain(
      "commitment_anchor.created_at nulls last, commitment_anchor.id nulls last",
    );
    expect(recalculate).not.toContain("event.start_at nulls last");
    expect(recalculate).toContain(
      "when usage.usage_state in ('reservado', 'consumido') or (usage.usage_state = 'no_show' and no_show_consumes) then 0",
    );
    expect(recalculate).toContain("when usage.usage_state = 'pendente' then 1");
    expect(recalculate).toContain(
      "usage_row.usage_state = 'no_show' and not no_show_consumes",
    );
    expect(recalculate).toContain("if approval_required and exists");
    expect(recalculate).toContain("venue_committed_excess_unapproved");
    expect(recalculate).toContain(
      "when not approval_required then 'nao_necessario'",
    );
  });

  it("impede que stakeholders ativos sejam incompatibilizados com eventos abertos", () => {
    const stakeholderStart = transactions.indexOf(
      "create or replace function public.venue_upsert_stakeholder(",
    );
    const stakeholderEnd = transactions.indexOf(
      "create or replace function public.venue_upsert_agreement(",
    );
    const stakeholder = transactions.slice(stakeholderStart, stakeholderEnd);

    expect(stakeholder).toContain(
      "event.status not in ('concluido', 'cancelado', 'recusado')",
    );
    expect(stakeholder).toContain(
      "event.responsible_organization_id = stakeholder_row.id",
    );
    expect(stakeholder).toContain("event.sponsor_id = stakeholder_row.id");
    expect(stakeholder).toContain("venue_stakeholder_active_events");
  });

  it("bloqueia alteraÃ§Ãµes materiais de espaÃ§o com reservas nÃ£o terminais", () => {
    const spaceStart = transactions.indexOf(
      "create or replace function public.venue_upsert_space(",
    );
    const spaceEnd = transactions.indexOf(
      "create or replace function public.venue_upsert_space_block(",
    );
    const space = transactions.slice(spaceStart, spaceEnd);

    expect(space).toContain(
      "space_row.capacity is distinct from capacity_value",
    );
    expect(space).toContain(
      "space_row.standard_opening_hours is distinct from opening_hours_value",
    );
    expect(space).toContain(
      "event.status not in ('concluido', 'cancelado', 'recusado')",
    );
    expect(space).toContain("venue_space_active_reservations");
    expect(space).not.toContain("occupancy.teardown_end_at > now()");
  });

  it("nÃ£o aceita full_access genÃ©rico como aprovaÃ§Ã£o de contrapartida", () => {
    const agreementStart = transactions.indexOf(
      "create or replace function public.venue_upsert_agreement(",
    );
    const agreementEnd = transactions.indexOf(
      "create or replace function public.venue_upsert_space(",
    );
    const agreement = transactions.slice(agreementStart, agreementEnd);

    expect(agreement).toContain(
      "capability.capability in ('venue_events_approve', 'venue_events_full_access')",
    );
    expect(agreement).toContain(
      "capability.capability in ('venue_excess_approve', 'venue_events_full_access')",
    );
    expect(agreement).not.toContain(
      "'venue_events_full_access', 'full_access'",
    );
  });

  it("fecha a autoelevação de capabilities do domínio para gestores", () => {
    expect(domain).toContain(
      "capability.capability in (_capability, 'venue_events_full_access')",
    );
    expect(domain).not.toContain(
      "capability.capability in (_capability, 'venue_events_full_access', 'full_access')",
    );
    expect(domain).toContain(
      "create policy venue_capability_insert_guard on public.user_capabilities as restrictive for insert to authenticated",
    );
    expect(domain).toContain(
      "create policy venue_capability_update_guard on public.user_capabilities as restrictive for update to authenticated",
    );
    expect(domain).toContain(
      "create policy venue_capability_delete_guard on public.user_capabilities as restrictive for delete to authenticated",
    );
    expect(domain).toContain(
      "or public.get_user_org_role(auth.uid(), org_id) = 'admin'",
    );
    expect(domain).toContain(
      "entity not like 'venue_%' or public.get_user_org_role(auth.uid(), org_id) = 'admin'",
    );
  });

  it("entrega histórico paginado sem vazar eventos ou documentos restritos", () => {
    const auditStart = transactions.indexOf(
      "create or replace function public.venue_get_audit_history(",
    );
    const auditEnd = transactions.indexOf(
      "create or replace function public.venue_calculate_usage_quantity(",
    );
    const audit = transactions.slice(auditStart, auditEnd);

    expect(auditStart).toBeGreaterThan(-1);
    expect(auditEnd).toBeGreaterThan(auditStart);
    expect(audit).toContain(
      "or (audit.created_at, audit.id) < (_before, _before_id)",
    );
    expect(audit).toContain(
      "public.venue_can_view_event(_org_id, audit.entity_id)",
    );
    expect(audit).toContain(
      "public.venue_redact_document_snapshot(audit.before_data)",
    );
    expect(audit).toContain(
      "public.venue_redact_document_snapshot(audit.after_data)",
    );
    expect(transactions).toContain(
      "create or replace function public.venue_redact_document_snapshot(_snapshot jsonb)",
    );
    expect(transactions).toContain(
      "jsonb_build_object('protected_document', true)",
    );
  });

  it("serializa a exclusão de upload órfão com o registro documental", () => {
    const helperStart = domain.indexOf(
      "create or replace function public.venue_can_delete_orphan_storage_object(",
    );
    const helperEnd = domain.indexOf(
      "revoke all on function public.venue_can_delete_orphan_storage_object",
    );
    const helper = domain.slice(helperStart, helperEnd);

    expect(helperStart).toBeGreaterThan(-1);
    expect(helperEnd).toBeGreaterThan(helperStart);
    expect(helper).toContain("language plpgsql volatile security definer");
    expect(helper).toContain(
      "perform pg_advisory_xact_lock(hashtextextended(object_org_id::text, 28701))",
    );
    expect(transactions).toContain(
      "perform pg_advisory_xact_lock(hashtextextended(_org_id::text, 28701))",
    );
  });
});
