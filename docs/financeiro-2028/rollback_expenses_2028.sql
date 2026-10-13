-- Rollback Despesas 2028 — Etapa 1 (só com pedido explícito; verificar antes que não existam despesas financeiras gravadas).
-- Restaura a política de leitura anterior e remove guarda/RPCs novas. Colunas novas ficam (são nullable e vazias).
DROP TRIGGER IF EXISTS financial_expense_guard ON public.expenses;
DROP POLICY IF EXISTS exp_select ON public.expenses;
CREATE POLICY exp_select ON public.expenses FOR SELECT USING (is_org_member(auth.uid(), org_id));
DROP FUNCTION IF EXISTS public.financial_transition_expense(uuid,uuid,text,integer,jsonb,text,uuid);
DROP FUNCTION IF EXISTS public.financial_list_expenses(uuid,uuid,jsonb,integer,integer);
DROP FUNCTION IF EXISTS public.financial_expense_detail(uuid,uuid);
DROP FUNCTION IF EXISTS public.financial_expense_comparison(uuid,uuid,jsonb);
DROP FUNCTION IF EXISTS public.financial_expense_filtered(uuid,uuid,jsonb);
DROP FUNCTION IF EXISTS public.financial_list_categories(uuid,text,boolean);
DROP FUNCTION IF EXISTS public.financial_save_category(uuid,jsonb,integer,uuid);
DROP FUNCTION IF EXISTS public.financial_reorder_categories(uuid,uuid[],uuid);
DROP FUNCTION IF EXISTS public.financial_seed_expense_categories(uuid,uuid);
DROP FUNCTION IF EXISTS public.financial_expense_guard_trg();
-- financial_save_expense: reaplicar a definição da migration 20261006200356 (linhas 923-980).
