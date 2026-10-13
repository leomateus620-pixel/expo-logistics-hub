-- Despesas 2028 — Etapa 1. Incremental sobre 20261006200356. Rollback: docs/financeiro-2028/rollback_expenses_2028.sql
-- 1) Estrutura
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS financial_category_id uuid,
  ADD COLUMN IF NOT EXISTS payee_name text,
  ADD COLUMN IF NOT EXISTS planned_on date,
  ADD COLUMN IF NOT EXISTS financial_notes text,
  ADD COLUMN IF NOT EXISTS financial_cancel_reason text,
  ADD COLUMN IF NOT EXISTS financial_updated_by uuid,
  ADD COLUMN IF NOT EXISTS financial_updated_at timestamptz;
DO $$ BEGIN
  ALTER TABLE public.expenses ADD CONSTRAINT expenses_financial_category_fk
    FOREIGN KEY (org_id, financial_category_id) REFERENCES public.financial_categories(org_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.expenses ADD CONSTRAINT expenses_financial_commission_fk
    FOREIGN KEY (financial_commission_id, org_id) REFERENCES public.commissions(id, org_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.expenses ADD CONSTRAINT expenses_financial_text_chk CHECK (
    (payee_name IS NULL OR length(payee_name) <= 200)
    AND (financial_notes IS NULL OR length(financial_notes) <= 2000)
    AND (financial_cancel_reason IS NULL OR length(financial_cancel_reason) <= 500)
    AND (financial_status IS DISTINCT FROM 'cancelada' OR length(btrim(coalesce(financial_cancel_reason,''))) >= 3)
    AND (financial_status IS DISTINCT FROM 'prevista' OR planned_cents IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS expenses_financial_category_idx ON public.expenses(financial_category_id) WHERE financial_category_id IS NOT NULL;

ALTER TABLE public.financial_categories
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS color text;
DO $$ BEGIN
  ALTER TABLE public.financial_categories ADD CONSTRAINT financial_categories_visual_chk CHECK (
    (icon IS NULL OR icon ~ '^[a-z0-9-]{1,40}$') AND (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Conjunto de organizações com acesso financeiro (calculado uma vez por consulta)
CREATE OR REPLACE FUNCTION public.financial_accessible_org_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.org_id FROM public.org_members m
  WHERE m.user_id = auth.uid() AND m.is_active
    AND (m.role = 'admin' OR EXISTS (SELECT 1 FROM public.user_capabilities c
      WHERE c.org_id = m.org_id AND c.user_id = auth.uid()
        AND c.capability IN ('financial_access','financial_edit','financial_confirm','financial_settle','financial_admin')));
$$;
REVOKE ALL ON FUNCTION public.financial_accessible_org_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_accessible_org_ids() TO authenticated;

DROP POLICY IF EXISTS exp_select ON public.expenses;
CREATE POLICY exp_select ON public.expenses FOR SELECT USING (
  is_org_member(auth.uid(), org_id)
  AND (financial_edition_id IS NULL OR org_id IN (SELECT public.financial_accessible_org_ids())));

-- 3) Guarda: colunas financeiras só mudam pelas RPCs; despesas financeiras não são alteradas/apagadas por caminhos logísticos
CREATE OR REPLACE FUNCTION public.financial_expense_guard_trg() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE via_rpc boolean := coalesce(current_setting('financial.rpc', true), '') = 'on';
BEGIN
  IF via_rpc OR current_user IN ('postgres','supabase_admin') THEN RETURN coalesce(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.financial_edition_id IS NOT NULL THEN RAISE EXCEPTION 'FINANCIAL_EXPENSE_PROTECTED' USING ERRCODE='42501'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF (NEW.financial_edition_id, NEW.financial_commission_id, NEW.financial_budget_line_id, NEW.planned_cents, NEW.committed_cents,
        NEW.committed_on, NEW.financial_due_date, NEW.financial_status, NEW.financial_category_id, NEW.payee_name, NEW.planned_on,
        NEW.financial_notes, NEW.financial_cancel_reason) IS DISTINCT FROM
       (NULL::uuid, NULL::uuid, NULL::uuid, NULL::bigint, NULL::bigint, NULL::date, NULL::date, NULL::text, NULL::uuid, NULL::text, NULL::date, NULL::text, NULL::text) THEN
      RAISE EXCEPTION 'FINANCIAL_EXPENSE_PROTECTED' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.financial_edition_id IS NOT NULL THEN RAISE EXCEPTION 'FINANCIAL_EXPENSE_PROTECTED' USING ERRCODE='42501'; END IF;
  IF (NEW.financial_edition_id, NEW.financial_commission_id, NEW.financial_budget_line_id, NEW.planned_cents, NEW.committed_cents,
      NEW.committed_on, NEW.financial_due_date, NEW.financial_status, NEW.financial_version, NEW.financial_category_id, NEW.payee_name,
      NEW.planned_on, NEW.financial_notes, NEW.financial_cancel_reason, NEW.financial_updated_by, NEW.financial_updated_at)
     IS DISTINCT FROM
     (OLD.financial_edition_id, OLD.financial_commission_id, OLD.financial_budget_line_id, OLD.planned_cents, OLD.committed_cents,
      OLD.committed_on, OLD.financial_due_date, OLD.financial_status, OLD.financial_version, OLD.financial_category_id, OLD.payee_name,
      OLD.planned_on, OLD.financial_notes, OLD.financial_cancel_reason, OLD.financial_updated_by, OLD.financial_updated_at) THEN
    RAISE EXCEPTION 'FINANCIAL_EXPENSE_PROTECTED' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS financial_expense_guard ON public.expenses;
CREATE TRIGGER financial_expense_guard BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.financial_expense_guard_trg();

-- 4) Helpers
CREATE OR REPLACE FUNCTION public.financial_cents(_v jsonb, _field text) RETURNS bigint LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE n numeric;
BEGIN
  IF _v IS NULL OR jsonb_typeof(_v) = 'null' THEN RETURN NULL; END IF;
  IF jsonb_typeof(_v) <> 'number' THEN RAISE EXCEPTION 'FINANCIAL_AMOUNT_INVALID: %', _field USING ERRCODE='22023'; END IF;
  n := (_v #>> '{}')::numeric;
  IF n <> trunc(n) OR n < 0 OR n > 9007199254740991 THEN RAISE EXCEPTION 'FINANCIAL_AMOUNT_INVALID: %', _field USING ERRCODE='22023'; END IF;
  RETURN n::bigint;
END $$;

CREATE OR REPLACE FUNCTION public.financial_date(_v jsonb, _field text) RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF _v IS NULL OR jsonb_typeof(_v) = 'null' OR (_v #>> '{}') = '' THEN RETURN NULL; END IF;
  IF (_v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'FINANCIAL_DATE_INVALID: %', _field USING ERRCODE='22023'; END IF;
  RETURN (_v #>> '{}')::date;
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
  RAISE EXCEPTION 'FINANCIAL_DATE_INVALID: %', _field USING ERRCODE='22023';
END $$;

CREATE OR REPLACE FUNCTION public.financial_expense_settled(_expense_id uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(a.amount_cents),0)::bigint FROM public.financial_obligations o
  JOIN public.financial_movement_allocations a ON a.obligation_id = o.id
  WHERE o.source_type='despesa' AND o.source_id=_expense_id;
$$;

CREATE OR REPLACE FUNCTION public.financial_expense_json(_e public.expenses) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id',_e.id,'org_id',_e.org_id,'edition_id',_e.financial_edition_id,'title',_e.title,'description',_e.description,
    'category_id',_e.financial_category_id,'category_name',(SELECT name FROM public.financial_categories WHERE id=_e.financial_category_id),
    'commission_id',_e.financial_commission_id,'commission_name',(SELECT nome FROM public.commissions WHERE id=_e.financial_commission_id),
    'budget_line_id',_e.financial_budget_line_id,'payee_name',_e.payee_name,
    'planned_cents',_e.planned_cents,'planned_on',_e.planned_on,'committed_cents',_e.committed_cents,'committed_on',_e.committed_on,
    'due_date',_e.financial_due_date,'status',_e.financial_status,'notes',_e.financial_notes,'cancel_reason',_e.financial_cancel_reason,
    'version',_e.financial_version,'created_by',_e.created_by_user_id,'created_at',_e.created_at,
    'updated_by',_e.financial_updated_by,'updated_at',coalesce(_e.financial_updated_at,_e.updated_at),
    'obligation_id',o.id,'paid_cents',coalesce(s.v,0),
    'open_cents',CASE WHEN _e.financial_status='realizada' THEN greatest(coalesce(o.amount_cents,0)-coalesce(s.v,0),0) ELSE 0 END,
    'settlement_inconsistent',coalesce(o.settlement_inconsistent,false))
  FROM (SELECT 1) one
  LEFT JOIN public.financial_obligations o ON o.source_type='despesa' AND o.source_id=_e.id
  LEFT JOIN LATERAL (SELECT sum(amount_cents) v FROM public.financial_movement_allocations WHERE obligation_id=o.id) s ON true;
$$;

-- Valida vínculos (organização, edição, domínio, ativo, compatibilidade comissão × linha)
CREATE OR REPLACE FUNCTION public.financial_validate_expense_links(_org_id uuid, _edition uuid, _category uuid, _old_category uuid,
  _commission uuid, _line uuid) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.financial_categories; line_commission uuid; line_edition uuid;
BEGIN
  IF _category IS NOT NULL THEN
    SELECT * INTO c FROM public.financial_categories WHERE id=_category AND org_id=_org_id;
    IF NOT FOUND OR c.domain <> 'despesa' THEN RAISE EXCEPTION 'FINANCIAL_CATEGORY_INVALID' USING ERRCODE='22023'; END IF;
    IF NOT c.active AND _category IS DISTINCT FROM _old_category THEN RAISE EXCEPTION 'FINANCIAL_CATEGORY_ARCHIVED' USING ERRCODE='22023'; END IF;
  END IF;
  IF _commission IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.commissions WHERE id=_commission AND org_id=_org_id) THEN
    RAISE EXCEPTION 'FINANCIAL_COMMISSION_INVALID' USING ERRCODE='22023';
  END IF;
  IF _line IS NOT NULL THEN
    SELECT b.commission_id, l.edition_id INTO line_commission, line_edition
      FROM public.financial_budget_lines l JOIN public.financial_budgets b ON b.id=l.budget_id
      WHERE l.id=_line AND l.org_id=_org_id;
    IF NOT FOUND OR line_edition IS DISTINCT FROM _edition THEN RAISE EXCEPTION 'FINANCIAL_BUDGET_INVALID' USING ERRCODE='22023'; END IF;
    IF _commission IS NOT NULL AND line_commission IS DISTINCT FROM _commission THEN
      RAISE EXCEPTION 'FINANCIAL_BUDGET_COMMISSION_MISMATCH' USING ERRCODE='22023';
    END IF;
  END IF;
END $$;

-- 5) Cadastro / edição (sem transição de estado em edições; pago e saldo nunca aceitos)
CREATE OR REPLACE FUNCTION public.financial_save_expense(_org_id uuid, _payload jsonb, _expected_version integer, _request_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid; replay jsonb; rec_id uuid; e public.expenses; before jsonb; edition uuid; status text;
  title text; planned bigint; committed bigint; committed_date date; result jsonb; k text;
  cat uuid; com uuid; line uuid; locked_obl uuid;
BEGIN
  actor := public.financial_require(_org_id, 'financial_edit');
  IF jsonb_typeof(_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'FINANCIAL_PAYLOAD_INVALID' USING ERRCODE='22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(_payload) LOOP
    IF k NOT IN ('id','edition_id','title','description','category_id','commission_id','budget_line_id','payee_name','planned_cents',
                 'planned_on','committed_cents','committed_on','due_date','notes','status') THEN
      RAISE EXCEPTION 'FINANCIAL_FIELD_NOT_ALLOWED: %', k USING ERRCODE='22023';
    END IF;
  END LOOP;
  replay := public.financial_begin(_org_id, 'save:expense', _request_id, jsonb_build_object('p',_payload,'v',_expected_version,'r',_reason));
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  PERFORM set_config('financial.rpc','on',true);
  rec_id := nullif(_payload->>'id','')::uuid;

  IF rec_id IS NOT NULL THEN
    SELECT id INTO locked_obl FROM public.financial_obligations WHERE source_type='despesa' AND source_id=rec_id FOR UPDATE;
    SELECT * INTO e FROM public.expenses WHERE org_id=_org_id AND id=rec_id FOR UPDATE;
    IF NOT FOUND OR e.financial_edition_id IS NULL THEN RAISE EXCEPTION 'FINANCIAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    IF _expected_version IS DISTINCT FROM e.financial_version THEN RAISE EXCEPTION 'FINANCIAL_CONFLICT' USING ERRCODE='40001'; END IF;
    IF _payload ? 'edition_id' AND nullif(_payload->>'edition_id','')::uuid IS DISTINCT FROM e.financial_edition_id THEN
      RAISE EXCEPTION 'FINANCIAL_EDITION_IMMUTABLE' USING ERRCODE='22023'; END IF;
    IF _payload ? 'status' AND _payload->>'status' IS DISTINCT FROM e.financial_status THEN
      RAISE EXCEPTION 'FINANCIAL_USE_TRANSITION' USING ERRCODE='22023'; END IF;
    IF e.financial_status = 'cancelada' THEN RAISE EXCEPTION 'FINANCIAL_EXPENSE_CANCELLED' USING ERRCODE='22023'; END IF;
    edition := e.financial_edition_id; status := e.financial_status; before := public.financial_expense_json(e);
  ELSE
    edition := nullif(_payload->>'edition_id','')::uuid;
    status := coalesce(_payload->>'status','prevista');
    IF status NOT IN ('prevista','realizada') THEN RAISE EXCEPTION 'FINANCIAL_STATUS_INVALID' USING ERRCODE='22023'; END IF;
  END IF;
  PERFORM public.financial_require_operational(_org_id, edition);

  title := CASE WHEN _payload ? 'title' THEN btrim(_payload->>'title') ELSE e.title END;
  IF title IS NULL OR length(title) NOT BETWEEN 2 AND 240 THEN RAISE EXCEPTION 'FINANCIAL_TITLE_INVALID' USING ERRCODE='22023'; END IF;
  planned := CASE WHEN _payload ? 'planned_cents' THEN public.financial_cents(_payload->'planned_cents','planned_cents') ELSE e.planned_cents END;
  committed := CASE WHEN _payload ? 'committed_cents' THEN public.financial_cents(_payload->'committed_cents','committed_cents') ELSE e.committed_cents END;
  committed_date := CASE WHEN _payload ? 'committed_on' THEN public.financial_date(_payload->'committed_on','committed_on') ELSE e.committed_on END;
  cat := CASE WHEN _payload ? 'category_id' THEN nullif(_payload->>'category_id','')::uuid ELSE e.financial_category_id END;
  com := CASE WHEN _payload ? 'commission_id' THEN nullif(_payload->>'commission_id','')::uuid ELSE e.financial_commission_id END;
  line := CASE WHEN _payload ? 'budget_line_id' THEN nullif(_payload->>'budget_line_id','')::uuid ELSE e.financial_budget_line_id END;
  PERFORM public.financial_validate_expense_links(_org_id, edition, cat, e.financial_category_id, com, line);

  IF status = 'prevista' THEN
    IF planned IS NULL THEN RAISE EXCEPTION 'FINANCIAL_PLANNED_REQUIRED' USING ERRCODE='22023'; END IF;
    IF committed IS NOT NULL OR committed_date IS NOT NULL THEN RAISE EXCEPTION 'FINANCIAL_USE_TRANSITION' USING ERRCODE='22023'; END IF;
  ELSE
    IF NOT public.financial_can(_org_id,'financial_confirm') AND (rec_id IS NULL OR committed IS DISTINCT FROM e.committed_cents OR committed_date IS DISTINCT FROM e.committed_on) THEN
      RAISE EXCEPTION 'FINANCIAL_FORBIDDEN: financial_confirm' USING ERRCODE='42501';
    END IF;
    IF coalesce(committed,0) <= 0 OR committed_date IS NULL THEN RAISE EXCEPTION 'FINANCIAL_COMMITTED_REQUIRED' USING ERRCODE='22023'; END IF;
    IF rec_id IS NOT NULL AND committed < public.financial_expense_settled(rec_id) THEN
      RAISE EXCEPTION 'FINANCIAL_OBLIGATION_BELOW_SETTLED' USING ERRCODE='23514'; END IF;
  END IF;

  IF rec_id IS NULL THEN
    INSERT INTO public.expenses(org_id,title,description,amount,status,created_by_user_id,origem_lancamento,cycle_year,expense_date,
      financial_edition_id,financial_commission_id,financial_budget_line_id,financial_category_id,payee_name,planned_cents,planned_on,
      committed_cents,committed_on,financial_due_date,financial_status,financial_notes,financial_updated_by,financial_updated_at)
    VALUES(_org_id,title,nullif(btrim(_payload->>'description'),''),coalesce(committed,planned,0)/100.0,'rascunho',actor,'financeiro',
      (SELECT code FROM public.financial_editions WHERE id=edition),
      coalesce(committed_date, public.financial_date(_payload->'planned_on','planned_on'), current_date)::timestamptz,
      edition,com,line,cat,nullif(btrim(_payload->>'payee_name'),''),planned,public.financial_date(_payload->'planned_on','planned_on'),
      committed,committed_date,public.financial_date(_payload->'due_date','due_date'),status,nullif(btrim(_payload->>'notes'),''),actor,now())
    RETURNING * INTO e;
  ELSE
    UPDATE public.expenses SET
      title = title_v.t,
      description = CASE WHEN _payload ? 'description' THEN nullif(btrim(_payload->>'description'),'') ELSE description END,
      financial_category_id = cat, financial_commission_id = com, financial_budget_line_id = line,
      payee_name = CASE WHEN _payload ? 'payee_name' THEN nullif(btrim(_payload->>'payee_name'),'') ELSE payee_name END,
      planned_cents = planned,
      planned_on = CASE WHEN _payload ? 'planned_on' THEN public.financial_date(_payload->'planned_on','planned_on') ELSE planned_on END,
      committed_cents = committed, committed_on = committed_date,
      financial_due_date = CASE WHEN _payload ? 'due_date' THEN public.financial_date(_payload->'due_date','due_date') ELSE financial_due_date END,
      financial_notes = CASE WHEN _payload ? 'notes' THEN nullif(btrim(_payload->>'notes'),'') ELSE financial_notes END,
      amount = coalesce(committed, planned, 0)/100.0,
      financial_version = financial_version + 1, financial_updated_by = actor, financial_updated_at = now(), updated_at = now()
    FROM (SELECT title AS t) title_v
    WHERE expenses.id = rec_id RETURNING expenses.* INTO e;
  END IF;
  result := public.financial_expense_json(e);
  PERFORM public.financial_audit(_org_id, edition, 'expense', e.id, CASE WHEN before IS NULL THEN 'create' ELSE 'update' END, before, result, _reason);
  PERFORM set_config('financial.rpc','off',true);
  RETURN public.financial_finish(_org_id, 'save:expense', _request_id, result);
END $$;

-- 6) Transições: realizar, reverter para prevista, cancelar
CREATE OR REPLACE FUNCTION public.financial_transition_expense(_org_id uuid, _expense_id uuid, _to text, _expected_version integer,
  _payload jsonb, _reason text, _request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid; replay jsonb; e public.expenses; before jsonb; result jsonb; settled bigint; amt bigint; on_date date; locked_obl uuid;
BEGIN
  actor := public.financial_require(_org_id, 'financial_edit');
  IF _to NOT IN ('realizada','prevista','cancelada') THEN RAISE EXCEPTION 'FINANCIAL_STATUS_INVALID' USING ERRCODE='22023'; END IF;
  _payload := coalesce(_payload, '{}'::jsonb);
  replay := public.financial_begin(_org_id, 'transition:expense', _request_id,
    jsonb_build_object('id',_expense_id,'to',_to,'v',_expected_version,'p',_payload,'r',_reason));
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  PERFORM set_config('financial.rpc','on',true);
  SELECT id INTO locked_obl FROM public.financial_obligations WHERE source_type='despesa' AND source_id=_expense_id FOR UPDATE;
  SELECT * INTO e FROM public.expenses WHERE org_id=_org_id AND id=_expense_id FOR UPDATE;
  IF NOT FOUND OR e.financial_edition_id IS NULL THEN RAISE EXCEPTION 'FINANCIAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF _expected_version IS DISTINCT FROM e.financial_version THEN RAISE EXCEPTION 'FINANCIAL_CONFLICT' USING ERRCODE='40001'; END IF;
  PERFORM public.financial_require_operational(_org_id, e.financial_edition_id);
  before := public.financial_expense_json(e);
  settled := public.financial_expense_settled(e.id);

  IF _to = 'realizada' THEN
    IF e.financial_status <> 'prevista' THEN RAISE EXCEPTION 'FINANCIAL_TRANSITION_INVALID' USING ERRCODE='22023'; END IF;
    PERFORM public.financial_require(_org_id, 'financial_confirm');
    amt := public.financial_cents(_payload->'committed_cents','committed_cents');
    on_date := public.financial_date(_payload->'committed_on','committed_on');
    IF coalesce(amt,0) <= 0 OR on_date IS NULL THEN RAISE EXCEPTION 'FINANCIAL_COMMITTED_REQUIRED' USING ERRCODE='22023'; END IF;
    UPDATE public.expenses SET financial_status='realizada', committed_cents=amt, committed_on=on_date,
      financial_due_date = CASE WHEN _payload ? 'due_date' THEN public.financial_date(_payload->'due_date','due_date') ELSE financial_due_date END,
      amount = amt/100.0, financial_version=financial_version+1, financial_updated_by=actor, financial_updated_at=now(), updated_at=now()
      WHERE id=e.id RETURNING * INTO e;
  ELSIF _to = 'prevista' THEN
    IF e.financial_status <> 'realizada' THEN RAISE EXCEPTION 'FINANCIAL_TRANSITION_INVALID' USING ERRCODE='22023'; END IF;
    PERFORM public.financial_require(_org_id, 'financial_confirm');
    IF length(btrim(coalesce(_reason,''))) < 3 THEN RAISE EXCEPTION 'FINANCIAL_REASON_REQUIRED' USING ERRCODE='22023'; END IF;
    IF e.planned_cents IS NULL THEN RAISE EXCEPTION 'FINANCIAL_NO_PROJECTION' USING ERRCODE='22023'; END IF;
    IF settled <> 0 THEN RAISE EXCEPTION 'FINANCIAL_HAS_SETTLEMENT' USING ERRCODE='23514'; END IF;
    UPDATE public.expenses SET financial_status='prevista', committed_cents=NULL, committed_on=NULL, amount=coalesce(planned_cents,0)/100.0,
      financial_version=financial_version+1, financial_updated_by=actor, financial_updated_at=now(), updated_at=now()
      WHERE id=e.id RETURNING * INTO e;
  ELSE
    IF e.financial_status = 'cancelada' THEN RAISE EXCEPTION 'FINANCIAL_TRANSITION_INVALID' USING ERRCODE='22023'; END IF;
    IF e.financial_status = 'realizada' THEN PERFORM public.financial_require(_org_id, 'financial_confirm'); END IF;
    IF length(btrim(coalesce(_reason,''))) < 3 THEN RAISE EXCEPTION 'FINANCIAL_REASON_REQUIRED' USING ERRCODE='22023'; END IF;
    IF settled <> 0 THEN RAISE EXCEPTION 'FINANCIAL_HAS_SETTLEMENT' USING ERRCODE='23514'; END IF;
    UPDATE public.expenses SET financial_status='cancelada', financial_cancel_reason=left(btrim(_reason),500),
      financial_version=financial_version+1, financial_updated_by=actor, financial_updated_at=now(), updated_at=now()
      WHERE id=e.id RETURNING * INTO e;
  END IF;
  result := public.financial_expense_json(e);
  PERFORM public.financial_audit(_org_id, e.financial_edition_id, 'expense', e.id, 'status_'||_to, before, result, _reason);
  PERFORM set_config('financial.rpc','off',true);
  RETURN public.financial_finish(_org_id, 'transition:expense', _request_id, result);
END $$;

-- 7) Consultas
CREATE OR REPLACE FUNCTION public.financial_expense_filtered(_org_id uuid, _edition_id uuid, _f jsonb)
RETURNS SETOF public.expenses LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.* FROM public.expenses e
  WHERE e.org_id=_org_id AND e.financial_edition_id=_edition_id
    AND (nullif(_f->>'category_id','') IS NULL OR (CASE WHEN _f->>'category_id'='none' THEN e.financial_category_id IS NULL ELSE e.financial_category_id=(_f->>'category_id')::uuid END))
    AND (nullif(_f->>'commission_id','') IS NULL OR (CASE WHEN _f->>'commission_id'='none' THEN e.financial_commission_id IS NULL ELSE e.financial_commission_id=(_f->>'commission_id')::uuid END))
    AND (nullif(_f->>'status','') IS NULL OR e.financial_status=_f->>'status')
    AND (nullif(_f->>'q','') IS NULL OR e.title ILIKE '%'||(_f->>'q')||'%' OR e.payee_name ILIKE '%'||(_f->>'q')||'%')
    AND (nullif(_f->>'from','') IS NULL OR (CASE coalesce(_f->>'date_field','committed_on')
          WHEN 'planned_on' THEN e.planned_on WHEN 'due_date' THEN e.financial_due_date ELSE e.committed_on END) >= (_f->>'from')::date)
    AND (nullif(_f->>'to','') IS NULL OR (CASE coalesce(_f->>'date_field','committed_on')
          WHEN 'planned_on' THEN e.planned_on WHEN 'due_date' THEN e.financial_due_date ELSE e.committed_on END) <= (_f->>'to')::date);
$$;

CREATE OR REPLACE FUNCTION public.financial_list_expenses(_org_id uuid, _edition_id uuid, _filters jsonb DEFAULT '{}'::jsonb,
  _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE total bigint; items jsonb;
BEGIN
  PERFORM public.financial_require(_org_id, 'financial_access');
  _filters := coalesce(_filters,'{}'::jsonb);
  IF coalesce(_filters->>'date_field','committed_on') NOT IN ('planned_on','committed_on','due_date') THEN
    RAISE EXCEPTION 'FINANCIAL_FILTER_INVALID' USING ERRCODE='22023'; END IF;
  _limit := least(greatest(coalesce(_limit,50),1),200); _offset := greatest(coalesce(_offset,0),0);
  SELECT count(*) INTO total FROM public.financial_expense_filtered(_org_id,_edition_id,_filters);
  SELECT coalesce(jsonb_agg(public.financial_expense_json(x) ORDER BY x.created_at DESC, x.id), '[]'::jsonb) INTO items
    FROM (SELECT * FROM public.financial_expense_filtered(_org_id,_edition_id,_filters) f ORDER BY f.created_at DESC, f.id LIMIT _limit OFFSET _offset) x;
  RETURN jsonb_build_object('total', total, 'limit', _limit, 'offset', _offset, 'items', items);
END $$;

CREATE OR REPLACE FUNCTION public.financial_expense_detail(_org_id uuid, _expense_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.expenses; ob uuid;
BEGIN
  PERFORM public.financial_require(_org_id, 'financial_access');
  SELECT * INTO e FROM public.expenses WHERE org_id=_org_id AND id=_expense_id AND financial_edition_id IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT id INTO ob FROM public.financial_obligations WHERE source_type='despesa' AND source_id=e.id;
  RETURN jsonb_build_object('expense', public.financial_expense_json(e),
    'obligation', (SELECT to_jsonb(o) FROM public.financial_obligations o WHERE o.id=ob),
    'movements', coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'direction',m.direction,'occurred_on',m.occurred_on,
        'allocated_cents',a.amount_cents,'reverses_movement_id',m.reverses_movement_id,'reference',m.reference,'created_at',m.created_at) ORDER BY m.occurred_on, m.created_at)
      FROM public.financial_movement_allocations a JOIN public.financial_movements m ON m.id=a.movement_id WHERE a.obligation_id=ob),'[]'::jsonb),
    'history', coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.created_at DESC) FROM
      (SELECT * FROM public.financial_audit_events WHERE org_id=_org_id AND entity='expense' AND entity_id=e.id ORDER BY created_at DESC LIMIT 100) h),'[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.financial_expense_comparison(_org_id uuid, _edition_id uuid, _filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.financial_require(_org_id, 'financial_access');
  _filters := coalesce(_filters,'{}'::jsonb);
  IF coalesce(_filters->>'date_field','committed_on') NOT IN ('planned_on','committed_on','due_date') THEN
    RAISE EXCEPTION 'FINANCIAL_FILTER_INVALID' USING ERRCODE='22023'; END IF;
  WITH base AS (
    SELECT e.id, e.financial_category_id cat, e.financial_commission_id com, e.financial_status st,
      CASE WHEN e.financial_status <> 'cancelada' THEN e.planned_cents END planned,
      CASE WHEN e.financial_status = 'realizada' THEN e.committed_cents END committed,
      e.financial_due_date due
    FROM public.financial_expense_filtered(_org_id,_edition_id,_filters) e
  ), settle AS (  -- pré-agregado por obrigação: sem duplicação por movimentos/alocações
    SELECT o.source_id, o.amount_cents, o.status, sum(a.amount_cents) paid
    FROM public.financial_obligations o LEFT JOIN public.financial_movement_allocations a ON a.obligation_id=o.id
    WHERE o.org_id=_org_id AND o.edition_id=_edition_id AND o.source_type='despesa'
    GROUP BY o.source_id, o.amount_cents, o.status
  ), rows AS (
    SELECT b.*, coalesce(s.paid,0) paid,
      CASE WHEN b.st='realizada' THEN greatest(coalesce(s.amount_cents,0)-coalesce(s.paid,0),0) ELSE 0 END open_amt
    FROM base b LEFT JOIN settle s ON s.source_id=b.id
  ), grp AS (
    SELECT 'category' dim, cat key, sum(planned) p, sum(committed) c, sum(paid) pd, count(*) n FROM rows GROUP BY cat
    UNION ALL
    SELECT 'commission', com, sum(planned), sum(committed), sum(paid), count(*) FROM rows GROUP BY com
  )
  SELECT jsonb_build_object(
    'definitions', jsonb_build_object('deviation','realizado - projetado; positivo = acima da previsão',
      'date_field', coalesce(_filters->>'date_field','committed_on'),
      'paid_scope','pagamentos líquidos alocados (todas as datas de pagamento) às despesas filtradas'),
    'totals', (SELECT jsonb_build_object(
      'count', count(*),
      'planned_cents', coalesce(sum(planned),0), 'committed_cents', coalesce(sum(committed),0),
      'paid_cents', coalesce(sum(paid),0), 'open_cents', coalesce(sum(open_amt),0),
      'deviation_cents', coalesce(sum(committed),0) - coalesce(sum(planned),0),
      'deviation_pct', CASE WHEN coalesce(sum(planned),0) > 0 THEN round((coalesce(sum(committed),0)-sum(planned))*100.0/sum(planned),2) END,
      'comparison_state', CASE WHEN coalesce(sum(planned),0) > 0 THEN 'comparavel' ELSE 'sem_previsao' END,
      'overdue_count', count(*) FILTER (WHERE st='realizada' AND open_amt>0 AND due < current_date),
      'overdue_cents', coalesce(sum(open_amt) FILTER (WHERE st='realizada' AND due < current_date),0),
      'realized_without_plan_count', count(*) FILTER (WHERE st='realizada' AND planned IS NULL),
      'by_status', jsonb_build_object('prevista',count(*) FILTER (WHERE st='prevista'),'realizada',count(*) FILTER (WHERE st='realizada'),'cancelada',count(*) FILTER (WHERE st='cancelada')))
      FROM rows),
    'by_category', coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.key,'name',coalesce(fc.name,'Sem categoria'),'count',g.n,
        'planned_cents',coalesce(g.p,0),'committed_cents',coalesce(g.c,0),'paid_cents',coalesce(g.pd,0),
        'deviation_cents',coalesce(g.c,0)-coalesce(g.p,0),
        'deviation_pct',CASE WHEN coalesce(g.p,0)>0 THEN round((coalesce(g.c,0)-g.p)*100.0/g.p,2) END,
        'comparison_state',CASE WHEN coalesce(g.p,0)>0 THEN 'comparavel' ELSE 'sem_previsao' END)
        ORDER BY greatest(coalesce(g.p,0),coalesce(g.c,0)) DESC)
      FROM grp g LEFT JOIN public.financial_categories fc ON fc.id=g.key WHERE g.dim='category'),'[]'::jsonb),
    'by_commission', coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.key,'name',coalesce(cm.nome,'Sem comissão'),'count',g.n,
        'planned_cents',coalesce(g.p,0),'committed_cents',coalesce(g.c,0),'paid_cents',coalesce(g.pd,0),
        'deviation_cents',coalesce(g.c,0)-coalesce(g.p,0),
        'deviation_pct',CASE WHEN coalesce(g.p,0)>0 THEN round((coalesce(g.c,0)-g.p)*100.0/g.p,2) END,
        'comparison_state',CASE WHEN coalesce(g.p,0)>0 THEN 'comparavel' ELSE 'sem_previsao' END)
        ORDER BY greatest(coalesce(g.p,0),coalesce(g.c,0)) DESC)
      FROM grp g LEFT JOIN public.commissions cm ON cm.id=g.key WHERE g.dim='commission'),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

-- 8) Categorias
CREATE OR REPLACE FUNCTION public.financial_list_categories(_org_id uuid, _domain text DEFAULT 'despesa', _include_archived boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.financial_require(_org_id, 'financial_access');
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'domain',c.domain,'parent_id',c.parent_id,'name',c.name,'active',c.active,
      'sort_order',c.sort_order,'icon',c.icon,'color',c.color,'version',c.version,
      'usage_count',(SELECT count(*) FROM public.expenses e WHERE e.financial_category_id=c.id)) ORDER BY c.sort_order, c.name)
    FROM public.financial_categories c WHERE c.org_id=_org_id AND c.domain=_domain AND (_include_archived OR c.active)),'[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.financial_save_category(_org_id uuid, _payload jsonb, _expected_version integer, _request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid; replay jsonb; rec_id uuid := nullif(_payload->>'id','')::uuid; c public.financial_categories; before jsonb;
  parent uuid; p public.financial_categories; cur uuid; depth int := 0; dom text; nm text;
BEGIN
  actor := public.financial_require(_org_id, 'financial_admin');
  replay := public.financial_begin(_org_id, 'save:category', _request_id, jsonb_build_object('p',_payload,'v',_expected_version));
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF rec_id IS NOT NULL THEN
    SELECT * INTO c FROM public.financial_categories WHERE org_id=_org_id AND id=rec_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    IF _expected_version IS DISTINCT FROM c.version THEN RAISE EXCEPTION 'FINANCIAL_CONFLICT' USING ERRCODE='40001'; END IF;
    before := to_jsonb(c); dom := c.domain;
  ELSE
    dom := coalesce(_payload->>'domain','despesa');
  END IF;
  IF dom NOT IN ('despesa','receita') THEN RAISE EXCEPTION 'FINANCIAL_CATEGORY_INVALID' USING ERRCODE='22023'; END IF;
  nm := CASE WHEN _payload ? 'name' THEN btrim(_payload->>'name') ELSE c.name END;
  IF nm IS NULL OR length(nm) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'FINANCIAL_CATEGORY_NAME_INVALID' USING ERRCODE='22023'; END IF;
  parent := CASE WHEN _payload ? 'parent_id' THEN nullif(_payload->>'parent_id','')::uuid ELSE c.parent_id END;
  IF parent IS NOT NULL THEN
    SELECT * INTO p FROM public.financial_categories WHERE id=parent AND org_id=_org_id;
    IF NOT FOUND OR p.domain <> dom THEN RAISE EXCEPTION 'FINANCIAL_CATEGORY_PARENT_INVALID' USING ERRCODE='22023'; END IF;
    cur := parent;
    WHILE cur IS NOT NULL LOOP
      IF cur = rec_id THEN RAISE EXCEPTION 'FINANCIAL_CATEGORY_CYCLE' USING ERRCODE='22023'; END IF;
      depth := depth + 1; IF depth > 10 THEN RAISE EXCEPTION 'FINANCIAL_CATEGORY_CYCLE' USING ERRCODE='22023'; END IF;
      SELECT parent_id INTO cur FROM public.financial_categories WHERE id=cur;
    END LOOP;
  END IF;
  IF EXISTS (SELECT 1 FROM public.financial_categories WHERE org_id=_org_id AND domain=dom AND active
      AND lower(btrim(name))=lower(nm) AND id IS DISTINCT FROM rec_id) THEN
    RAISE EXCEPTION 'FINANCIAL_CATEGORY_DUPLICATE' USING ERRCODE='23505';
  END IF;
  IF rec_id IS NULL THEN
    INSERT INTO public.financial_categories(org_id,domain,parent_id,name,sort_order,icon,color,created_by,updated_by)
    VALUES(_org_id,dom,parent,nm,coalesce((_payload->>'sort_order')::int,(SELECT coalesce(max(sort_order),0)+10 FROM public.financial_categories WHERE org_id=_org_id AND domain=dom)),
      nullif(_payload->>'icon',''),nullif(_payload->>'color',''),actor,actor) RETURNING * INTO c;
  ELSE
    UPDATE public.financial_categories SET name=nm, parent_id=parent,
      sort_order=coalesce((_payload->>'sort_order')::int, sort_order),
      icon=CASE WHEN _payload ? 'icon' THEN nullif(_payload->>'icon','') ELSE icon END,
      color=CASE WHEN _payload ? 'color' THEN nullif(_payload->>'color','') ELSE color END,
      active=CASE WHEN _payload ? 'active' THEN (_payload->>'active')::boolean ELSE active END,
      version=version+1, updated_by=actor, updated_at=now() WHERE id=rec_id RETURNING * INTO c;
  END IF;
  PERFORM public.financial_audit(_org_id, NULL, 'category', c.id, CASE WHEN before IS NULL THEN 'create' ELSE 'update' END, before, to_jsonb(c), NULL);
  RETURN public.financial_finish(_org_id, 'save:category', _request_id, to_jsonb(c));
END $$;

CREATE OR REPLACE FUNCTION public.financial_reorder_categories(_org_id uuid, _ordered_ids uuid[], _request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid; replay jsonb; i int;
BEGIN
  actor := public.financial_require(_org_id, 'financial_admin');
  replay := public.financial_begin(_org_id, 'reorder:category', _request_id, to_jsonb(_ordered_ids));
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF EXISTS (SELECT 1 FROM unnest(_ordered_ids) x WHERE NOT EXISTS (SELECT 1 FROM public.financial_categories WHERE id=x AND org_id=_org_id)) THEN
    RAISE EXCEPTION 'FINANCIAL_CATEGORY_INVALID' USING ERRCODE='22023'; END IF;
  FOR i IN 1..coalesce(array_length(_ordered_ids,1),0) LOOP
    UPDATE public.financial_categories SET sort_order=i*10, version=version+1, updated_by=actor, updated_at=now()
      WHERE id=_ordered_ids[i] AND sort_order <> i*10;
  END LOOP;
  PERFORM public.financial_audit(_org_id, NULL, 'category', NULL, 'reorder', NULL, to_jsonb(_ordered_ids), NULL);
  RETURN public.financial_finish(_org_id, 'reorder:category', _request_id, jsonb_build_object('ok',true));
END $$;

CREATE OR REPLACE FUNCTION public.financial_seed_expense_categories(_org_id uuid, _request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid; replay jsonb; n int := 0; nm text; i int := 0;
BEGIN
  actor := public.financial_require(_org_id, 'financial_admin');
  replay := public.financial_begin(_org_id, 'seed:expense_categories', _request_id, '{}'::jsonb);
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  FOREACH nm IN ARRAY ARRAY['Infraestrutura e Obras','Eventos e Produção','Marketing e Comunicação','Alimentação e Hospitalidade',
    'Logística e Transporte','Pessoal e Equipes','Segurança','Serviços Operacionais','Equipamentos e Materiais',
    'Taxas, Seguros e Licenças','Obrigações de Edições Anteriores','Reservas'] LOOP
    i := i + 1;
    IF NOT EXISTS (SELECT 1 FROM public.financial_categories WHERE org_id=_org_id AND domain='despesa' AND lower(btrim(name))=lower(nm)) THEN
      INSERT INTO public.financial_categories(org_id,domain,name,sort_order,created_by,updated_by) VALUES(_org_id,'despesa',nm,i*10,actor,actor);
      n := n + 1;
    END IF;
  END LOOP;
  PERFORM public.financial_audit(_org_id, NULL, 'category', NULL, 'seed', NULL, jsonb_build_object('created',n), NULL);
  RETURN public.financial_finish(_org_id, 'seed:expense_categories', _request_id, jsonb_build_object('created',n));
END $$;

-- 9) Privilégios
REVOKE ALL ON FUNCTION public.financial_expense_guard_trg(), public.financial_cents(jsonb,text), public.financial_date(jsonb,text),
  public.financial_expense_settled(uuid), public.financial_expense_json(public.expenses),
  public.financial_validate_expense_links(uuid,uuid,uuid,uuid,uuid,uuid), public.financial_expense_filtered(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financial_save_expense(uuid,jsonb,integer,uuid,text), public.financial_transition_expense(uuid,uuid,text,integer,jsonb,text,uuid),
  public.financial_list_expenses(uuid,uuid,jsonb,integer,integer), public.financial_expense_detail(uuid,uuid),
  public.financial_expense_comparison(uuid,uuid,jsonb), public.financial_list_categories(uuid,text,boolean),
  public.financial_save_category(uuid,jsonb,integer,uuid), public.financial_reorder_categories(uuid,uuid[],uuid),
  public.financial_seed_expense_categories(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_save_expense(uuid,jsonb,integer,uuid,text), public.financial_transition_expense(uuid,uuid,text,integer,jsonb,text,uuid),
  public.financial_list_expenses(uuid,uuid,jsonb,integer,integer), public.financial_expense_detail(uuid,uuid),
  public.financial_expense_comparison(uuid,uuid,jsonb), public.financial_list_categories(uuid,text,boolean),
  public.financial_save_category(uuid,jsonb,integer,uuid), public.financial_reorder_categories(uuid,uuid[],uuid),
  public.financial_seed_expense_categories(uuid,uuid) TO authenticated;