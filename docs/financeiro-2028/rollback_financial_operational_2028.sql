-- Recuperação do Financeiro 2028. Executar SOMENTE com pedido explícito.
-- Remove apenas objetos criados pela migration financial_operational_2028 e
-- recusa rodar se houver qualquer cadastro/lançamento financeiro (edições sem valores são permitidas).
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.financial_categories) OR EXISTS (SELECT 1 FROM public.financial_custom_fields)
    OR EXISTS (SELECT 1 FROM public.financial_budgets) OR EXISTS (SELECT 1 FROM public.financial_budget_lines)
    OR EXISTS (SELECT 1 FROM public.financial_revenues) OR EXISTS (SELECT 1 FROM public.financial_sponsorships)
    OR EXISTS (SELECT 1 FROM public.financial_obligations) OR EXISTS (SELECT 1 FROM public.financial_movements)
    OR EXISTS (SELECT 1 FROM public.financial_scenarios) OR EXISTS (SELECT 1 FROM public.financial_mutation_receipts)
    OR EXISTS (SELECT 1 FROM public.expenses WHERE financial_edition_id IS NOT NULL OR planned_cents IS NOT NULL
      OR committed_cents IS NOT NULL OR financial_status IS NOT NULL) THEN
    RAISE EXCEPTION 'ROLLBACK_BLOCKED: existem dados financeiros; recuperação exige decisão explícita';
  END IF;
END $$;
DROP TRIGGER IF EXISTS financial_expense_obligation ON public.expenses;
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_financial_values_chk,
  DROP CONSTRAINT IF EXISTS expenses_financial_edition_fk, DROP CONSTRAINT IF EXISTS expenses_financial_line_fk;
DROP TABLE IF EXISTS public.financial_movement_allocations, public.financial_movements, public.financial_obligations,
  public.financial_scenarios, public.financial_audit_events, public.financial_mutation_receipts,
  public.financial_sponsorships, public.financial_revenues, public.financial_budget_lines, public.financial_budgets,
  public.financial_custom_fields, public.financial_categories;
ALTER TABLE public.expenses DROP COLUMN IF EXISTS financial_edition_id, DROP COLUMN IF EXISTS financial_commission_id,
  DROP COLUMN IF EXISTS financial_budget_line_id, DROP COLUMN IF EXISTS planned_cents, DROP COLUMN IF EXISTS committed_cents,
  DROP COLUMN IF EXISTS committed_on, DROP COLUMN IF EXISTS financial_due_date, DROP COLUMN IF EXISTS financial_status,
  DROP COLUMN IF EXISTS financial_version;
DROP TABLE IF EXISTS public.financial_editions;
DROP FUNCTION IF EXISTS public.financial_save(uuid,text,jsonb,integer,uuid,text), public.financial_save_expense(uuid,jsonb,integer,uuid,text),
  public.financial_record_movement(uuid,jsonb,jsonb,uuid), public.financial_reverse_movement(uuid,uuid,text,date,uuid),
  public.financial_save_scenario(uuid,uuid,text,jsonb,text,uuid), public.financial_edition_summary(uuid,uuid),
  public.financial_budget_execution(uuid,uuid), public.financial_resolve_source(uuid,uuid,text,uuid),
  public.financial_reconcile_obligation(uuid,uuid), public.financial_sync_source_obligation(uuid,uuid,text,text,uuid,text,bigint,date,boolean,uuid),
  public.financial_expense_obligation_trg(), public.financial_revenue_obligation_trg(), public.financial_sponsorship_obligation_trg(),
  public.financial_validate_extra(uuid,text,jsonb), public.financial_audit(uuid,uuid,text,uuid,text,jsonb,jsonb,text),
  public.financial_finish(uuid,text,uuid,jsonb), public.financial_begin(uuid,text,uuid,jsonb),
  public.financial_require_operational(uuid,uuid), public.financial_require(uuid,text);
DROP FUNCTION IF EXISTS public.financial_can(uuid,text);
COMMIT;
