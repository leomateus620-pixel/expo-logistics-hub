-- Financial entry composer: additive catalogues, schedules and atomic batches.
-- No financial facts, legacy text, settlement or historical edition is backfilled.
CREATE OR REPLACE FUNCTION public.financial_normalize_name(_name text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT lower(regexp_replace(btrim(_name), '[[:space:]]+', ' ', 'g'));
$$;

CREATE TABLE IF NOT EXISTS public.financial_references (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id),
 kind text NOT NULL CHECK(kind IN ('counterparty','funding_source','payee')),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 200),
 normalized_name text GENERATED ALWAYS AS (public.financial_normalize_name(name)) STORED,
 funding_type text NOT NULL DEFAULT 'nao_identificado' CHECK(funding_type IN ('recurso_livre','lei_rouanet','prefeitura_plano_trabalho','misto','nao_identificado')),
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by uuid NOT NULL, updated_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), CHECK(kind='funding_source' OR funding_type='nao_identificado')
);
CREATE UNIQUE INDEX IF NOT EXISTS financial_references_active_name ON public.financial_references(org_id,kind,normalized_name) WHERE active;
CREATE UNIQUE INDEX IF NOT EXISTS financial_categories_active_normalized_name ON public.financial_categories(org_id,domain,public.financial_normalize_name(name)) WHERE active;
DROP INDEX IF EXISTS public.financial_categories_name_unique;

ALTER TABLE public.financial_revenues ADD COLUMN IF NOT EXISTS counterparty_reference_id uuid,
 ADD COLUMN IF NOT EXISTS funding_source_reference_id uuid;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS payee_reference_id uuid;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='financial_revenue_counterparty_reference_fk') THEN
 ALTER TABLE public.financial_revenues ADD CONSTRAINT financial_revenue_counterparty_reference_fk FOREIGN KEY(org_id,counterparty_reference_id) REFERENCES public.financial_references(org_id,id);
 ALTER TABLE public.financial_revenues ADD CONSTRAINT financial_revenue_funding_reference_fk FOREIGN KEY(org_id,funding_source_reference_id) REFERENCES public.financial_references(org_id,id);
 ALTER TABLE public.expenses ADD CONSTRAINT financial_expense_payee_reference_fk FOREIGN KEY(org_id,payee_reference_id) REFERENCES public.financial_references(org_id,id);
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.financial_payment_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, edition_id uuid NOT NULL,
 source_type text NOT NULL CHECK(source_type IN ('receita','despesa')), source_id uuid NOT NULL,
 obligation_id uuid, condition text NOT NULL CHECK(condition IN ('avista','parcelado')),
 default_method text CHECK(default_method IN ('pix','boleto','transferencia','dinheiro','cartao','outro')),
 total_cents bigint NOT NULL CHECK(total_cents BETWEEN 1 AND 9007199254740991),
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by uuid NOT NULL, updated_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(org_id,edition_id) REFERENCES public.financial_editions(org_id,id),
 FOREIGN KEY(org_id,obligation_id) REFERENCES public.financial_obligations(org_id,id),
 UNIQUE(org_id,edition_id,source_type,source_id), UNIQUE(org_id,id)
);
CREATE TABLE IF NOT EXISTS public.financial_payment_installments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, plan_id uuid NOT NULL,
 sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 360), due_date date NOT NULL,
 amount_cents bigint NOT NULL CHECK(amount_cents BETWEEN 1 AND 9007199254740991),
 method text CHECK(method IN ('pix','boleto','transferencia','dinheiro','cartao','outro')),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(org_id,plan_id) REFERENCES public.financial_payment_plans(org_id,id), UNIQUE(org_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS financial_installments_active_sequence ON public.financial_payment_installments(plan_id,sequence) WHERE active;
CREATE INDEX IF NOT EXISTS financial_installments_due ON public.financial_payment_installments(org_id,due_date) WHERE active;
-- Child details never contribute to cash a second time. The obligation allocation remains unique.
CREATE TABLE IF NOT EXISTS public.financial_installment_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL,
 allocation_id uuid NOT NULL REFERENCES public.financial_movement_allocations(id),
 installment_id uuid NOT NULL, amount_cents bigint NOT NULL CHECK(amount_cents<>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(org_id,installment_id) REFERENCES public.financial_payment_installments(org_id,id),
 UNIQUE(allocation_id,installment_id)
);

ALTER TABLE public.financial_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_payment_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_installment_allocations ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['financial_references','financial_payment_plans','financial_payment_installments','financial_installment_allocations'] LOOP
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 EXECUTE format('DROP POLICY IF EXISTS financial_entry_read ON public.%I',t);
 EXECUTE format('CREATE POLICY financial_entry_read ON public.%I FOR SELECT TO authenticated USING(org_id IN (SELECT public.financial_accessible_org_ids()))',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.financial_list_references(_org_id uuid,_kind text,_query text DEFAULT '',_include_archived boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.financial_require(_org_id,'financial_access');
 IF _kind NOT IN ('counterparty','funding_source','payee') THEN RAISE EXCEPTION 'FINANCIAL_REFERENCE_KIND_INVALID'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.updated_at DESC,r.id) FROM public.financial_references r
 WHERE r.org_id=_org_id AND r.kind=_kind AND (r.active OR _include_archived)
 AND r.normalized_name LIKE '%'||coalesce(public.financial_normalize_name(_query),'')||'%'),'[]');
END $$;

CREATE OR REPLACE FUNCTION public.financial_create_reference(_org_id uuid,_kind text,_name text,_funding_type text,_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid; replay jsonb; r public.financial_references; nm text;
BEGIN
 actor:=public.financial_require(_org_id,'financial_edit');
 nm:=regexp_replace(btrim(_name),'[[:space:]]+',' ','g');
 IF _kind NOT IN ('counterparty','funding_source','payee','expense_category') OR nm IS NULL OR length(nm) NOT BETWEEN 2 AND (CASE WHEN _kind='expense_category' THEN 80 ELSE 200 END) THEN RAISE EXCEPTION 'FINANCIAL_REFERENCE_INVALID'; END IF;
 replay:=public.financial_begin(_org_id,'create:reference',_request_id,jsonb_build_array(_kind,_name,_funding_type));
 IF replay IS NOT NULL THEN RETURN replay; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('financial-reference:'||_org_id||':'||_kind||':'||public.financial_normalize_name(nm),0));
 IF _kind='expense_category' THEN
   SELECT jsonb_build_object('id',id,'name',name,'active',active,'version',version) INTO replay FROM public.financial_categories
    WHERE org_id=_org_id AND domain='despesa' AND active AND public.financial_normalize_name(name)=public.financial_normalize_name(nm);
   IF replay IS NULL THEN
    INSERT INTO public.financial_categories(org_id,domain,name,created_by,updated_by) VALUES(_org_id,'despesa',nm,actor,actor) RETURNING to_jsonb(financial_categories) INTO replay;
    PERFORM public.financial_audit(_org_id,NULL,'category',(replay->>'id')::uuid,'create',NULL,replay,'Criação restrita durante lançamento');
   END IF;
 ELSE
   SELECT * INTO r FROM public.financial_references WHERE org_id=_org_id AND kind=_kind AND active AND normalized_name=public.financial_normalize_name(nm);
   IF NOT FOUND THEN
    INSERT INTO public.financial_references(org_id,kind,name,funding_type,created_by,updated_by)
    VALUES(_org_id,_kind,nm,CASE WHEN _kind='funding_source' THEN coalesce(_funding_type,'nao_identificado') ELSE 'nao_identificado' END,actor,actor) RETURNING * INTO r;
    PERFORM public.financial_audit(_org_id,NULL,'reference',r.id,'create',NULL,to_jsonb(r),NULL);
   END IF;
   replay:=to_jsonb(r);
 END IF;
 RETURN public.financial_finish(_org_id,'create:reference',_request_id,replay);
END $$;

CREATE OR REPLACE FUNCTION public.financial_update_reference(_org_id uuid,_id uuid,_name text,_active boolean,_expected_version integer,_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid; replay jsonb; r public.financial_references; before jsonb;
BEGIN
 actor:=public.financial_require(_org_id,'financial_admin');
 replay:=public.financial_begin(_org_id,'update:reference',_request_id,jsonb_build_array(_id,_name,_active,_expected_version));
 IF replay IS NOT NULL THEN RETURN replay; END IF;
 SELECT * INTO r FROM public.financial_references WHERE id=_id AND org_id=_org_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_REFERENCE_INVALID'; END IF;
 IF r.version IS DISTINCT FROM _expected_version THEN RAISE EXCEPTION 'FINANCIAL_CONFLICT' USING ERRCODE='40001'; END IF;
 before:=to_jsonb(r);
 UPDATE public.financial_references SET name=regexp_replace(btrim(_name),'[[:space:]]+',' ','g'),active=_active,version=version+1,updated_by=actor,updated_at=now() WHERE id=_id RETURNING * INTO r;
 PERFORM public.financial_audit(_org_id,NULL,'reference',r.id,'update',before,to_jsonb(r),NULL);
 RETURN public.financial_finish(_org_id,'update:reference',_request_id,to_jsonb(r));
END $$;

-- Internal resolver: no EXECUTE grant to clients. Archived identities may only remain on their original record.
CREATE OR REPLACE FUNCTION public.financial_reference(_org uuid,_id uuid,_kind text,_previous uuid)
RETURNS public.financial_references LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.financial_references;
BEGIN
 IF _id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.financial_references WHERE org_id=_org AND id=_id AND kind=_kind FOR SHARE;
 IF NOT FOUND OR (NOT r.active AND _id IS DISTINCT FROM _previous) THEN RAISE EXCEPTION 'FINANCIAL_REFERENCE_INVALID'; END IF;
 RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.financial_payment_plan(_org_id uuid,_edition_id uuid,_source_type text,_source_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.financial_payment_plans; settled bigint; attributed bigint; ob uuid;
BEGIN
 PERFORM public.financial_require(_org_id,'financial_access');
 IF NOT EXISTS(SELECT 1 FROM public.financial_editions WHERE id=_edition_id AND org_id=_org_id) THEN RAISE EXCEPTION 'FINANCIAL_EDITION_INVALID'; END IF;
 SELECT * INTO p FROM public.financial_payment_plans WHERE org_id=_org_id AND edition_id=_edition_id AND source_type=_source_type AND source_id=_source_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 ob:=coalesce(p.obligation_id,(SELECT id FROM public.financial_obligations WHERE org_id=_org_id AND source_type=_source_type AND source_id=_source_id));
 SELECT coalesce(sum(amount_cents),0) INTO settled FROM public.financial_movement_allocations WHERE obligation_id=ob;
 SELECT coalesce(sum(d.amount_cents),0) INTO attributed FROM public.financial_installment_allocations d JOIN public.financial_payment_installments i ON i.id=d.installment_id WHERE i.plan_id=p.id;
 RETURN to_jsonb(p)||jsonb_build_object('settled_cents',settled,'unassigned_settled_cents',settled-attributed,
 'installments',coalesce((SELECT jsonb_agg(to_jsonb(i)||jsonb_build_object('settled_cents',coalesce((SELECT sum(a.amount_cents) FROM public.financial_installment_allocations a WHERE a.installment_id=i.id),0)) ORDER BY i.sequence) FROM public.financial_payment_installments i WHERE i.plan_id=p.id AND i.active),'[]'),
 'movements',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'occurred_on',m.occurred_on,'method',m.method,'amount_cents',a.amount_cents,'allocation_id',a.id,'assigned',EXISTS(SELECT 1 FROM public.financial_installment_allocations d WHERE d.allocation_id=a.id),'reversed',EXISTS(SELECT 1 FROM public.financial_movements x WHERE x.reverses_movement_id=m.id)) ORDER BY m.created_at DESC) FROM public.financial_movement_allocations a JOIN public.financial_movements m ON m.id=a.movement_id WHERE a.obligation_id=ob),'[]'));
END $$;

-- Source and obligation are always locked before the schedule (same order as settlement).
CREATE OR REPLACE FUNCTION public.financial_save_payment_plan(_org uuid,_edition uuid,_type text,_source uuid,_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.financial_payment_plans; before jsonb; src jsonb; o uuid; total bigint;
 item jsonb; inst public.financial_payment_installments; iid uuid; seq integer:=0; amount bigint; due date; planned_method text;
 combined numeric:=0; settled bigint; keep_ids uuid[]:='{}'; actor uuid:=auth.uid();
BEGIN
 PERFORM public.financial_require(_org,'financial_access');
 IF NOT public.financial_can(_org,'financial_edit') AND NOT public.financial_can(_org,'financial_confirm') THEN RAISE EXCEPTION 'FINANCIAL_FORBIDDEN: financial_edit'; END IF;
 PERFORM public.financial_require_operational(_org,_edition);
 IF _type='receita' THEN
  SELECT jsonb_build_object('total',CASE WHEN status='confirmada' THEN confirmed_cents ELSE projected_cents END,'active',status<>'cancelada') INTO src
   FROM public.financial_revenues WHERE org_id=_org AND edition_id=_edition AND id=_source FOR UPDATE;
 ELSIF _type='despesa' THEN
  SELECT jsonb_build_object('total',CASE WHEN financial_status='realizada' THEN committed_cents ELSE planned_cents END,'active',financial_status<>'cancelada') INTO src
   FROM public.expenses WHERE org_id=_org AND financial_edition_id=_edition AND id=_source FOR UPDATE;
 END IF;
 IF src IS NULL OR NOT (src->>'active')::boolean THEN RAISE EXCEPTION 'FINANCIAL_PLAN_SOURCE_INVALID'; END IF;
 total:=(src->>'total')::bigint;
 SELECT id INTO o FROM public.financial_obligations WHERE org_id=_org AND edition_id=_edition AND source_type=_type AND source_id=_source AND status='aberta' FOR UPDATE;
 SELECT * INTO p FROM public.financial_payment_plans WHERE org_id=_org AND edition_id=_edition AND source_type=_type AND source_id=_source FOR UPDATE;
 IF p.id IS NOT NULL THEN
  IF p.version IS DISTINCT FROM (_payload->>'expected_version')::integer THEN RAISE EXCEPTION 'FINANCIAL_PLAN_CONFLICT' USING ERRCODE='40001'; END IF;
  before:=public.financial_payment_plan(_org,_edition,_type,_source);
 ELSIF _payload->>'expected_version' IS NOT NULL THEN RAISE EXCEPTION 'FINANCIAL_PLAN_CONFLICT' USING ERRCODE='40001';
 END IF;
 IF jsonb_typeof(_payload->'installments') IS DISTINCT FROM 'array' OR jsonb_array_length(_payload->'installments') NOT BETWEEN 1 AND 360
  OR _payload->>'condition' NOT IN ('avista','parcelado') OR (_payload->>'condition'='avista' AND jsonb_array_length(_payload->'installments')<>1)
  OR total IS NULL OR total<1 THEN RAISE EXCEPTION 'FINANCIAL_PLAN_INVALID'; END IF;
 IF p.id IS NULL THEN
  INSERT INTO public.financial_payment_plans(org_id,edition_id,source_type,source_id,obligation_id,condition,default_method,total_cents,created_by,updated_by)
   VALUES(_org,_edition,_type,_source,o,_payload->>'condition',nullif(_payload->>'default_method',''),total,actor,actor) RETURNING * INTO p;
 ELSE
  UPDATE public.financial_payment_plans SET obligation_id=o,condition=_payload->>'condition',default_method=nullif(_payload->>'default_method',''),total_cents=total,
   active=true,version=version+1,updated_by=actor,updated_at=now() WHERE id=p.id RETURNING * INTO p;
 END IF;
 -- Free the active sequence index without deleting any installment or settlement detail.
 UPDATE public.financial_payment_installments SET active=false WHERE plan_id=p.id AND active;
 FOR item IN SELECT value FROM jsonb_array_elements(_payload->'installments') LOOP
  seq:=seq+1;
  amount:=public.financial_cents(item->'amount_cents','amount_cents');
  due:=public.financial_date(item->'due_date','due_date');
  planned_method:=CASE WHEN item ? 'method' THEN nullif(item->>'method','') ELSE nullif(_payload->>'default_method','') END;
  IF amount IS NULL OR amount<1 OR due IS NULL THEN RAISE EXCEPTION 'FINANCIAL_INSTALLMENT_INVALID: %',seq; END IF;
  combined:=combined+amount;
  iid:=coalesce(nullif(item->>'id','')::uuid,gen_random_uuid());
  IF iid=ANY(keep_ids) THEN RAISE EXCEPTION 'FINANCIAL_INSTALLMENT_DUPLICATE'; END IF;
  SELECT * INTO inst FROM public.financial_payment_installments WHERE id=iid FOR UPDATE;
  IF FOUND THEN
   IF inst.org_id<>_org OR inst.plan_id<>p.id THEN RAISE EXCEPTION 'FINANCIAL_INSTALLMENT_INVALID'; END IF;
   SELECT coalesce(sum(amount_cents),0) INTO settled FROM public.financial_installment_allocations WHERE installment_id=iid;
   IF settled>0 AND (inst.amount_cents<>amount OR inst.due_date<>due OR inst.sequence<>seq OR inst.method IS DISTINCT FROM planned_method) THEN RAISE EXCEPTION 'FINANCIAL_INSTALLMENT_SETTLED: %',seq; END IF;
   UPDATE public.financial_payment_installments SET sequence=seq,due_date=due,amount_cents=amount,method=planned_method,active=true,updated_at=now() WHERE id=iid;
  ELSE
   INSERT INTO public.financial_payment_installments(id,org_id,plan_id,sequence,due_date,amount_cents,method) VALUES(iid,_org,p.id,seq,due,amount,planned_method);
  END IF;
  keep_ids:=array_append(keep_ids,iid);
 END LOOP;
 IF combined<>total THEN RAISE EXCEPTION 'FINANCIAL_INSTALLMENT_SUM_MISMATCH: % <> %',combined,total; END IF;
 IF EXISTS(SELECT 1 FROM public.financial_payment_installments i WHERE i.plan_id=p.id AND NOT i.active
  AND (SELECT coalesce(sum(amount_cents),0) FROM public.financial_installment_allocations WHERE installment_id=i.id)>0) THEN
  RAISE EXCEPTION 'FINANCIAL_INSTALLMENT_SETTLED';
 END IF;
 PERFORM public.financial_audit(_org,_edition,'payment_plan',p.id,CASE WHEN before IS NULL THEN 'create' ELSE 'update' END,before,public.financial_payment_plan(_org,_edition,_type,_source),NULL);
 RETURN public.financial_payment_plan(_org,_edition,_type,_source);
END $$;

-- Refuse to wrap an uninspected financial contract. A later backend revision needs a new review.
DO $$ DECLARE item record; target regprocedure; actual text; BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('financial_save','uuid,text,jsonb,integer,uuid,text','33527985675fbefb627424ef2a084d0b'),
  ('financial_save_expense','uuid,jsonb,integer,uuid,text','bdb480d573f47fdc22d354d70c2e9860'),
  ('financial_record_movement','uuid,jsonb,jsonb,uuid','0fb3c604bcee2473f1d4fbce4a148f04'),
  ('financial_reverse_movement','uuid,uuid,text,date,uuid','cb9cccad8c7b5a63a44abf1e411fb9af'),
  ('financial_transition_expense','uuid,uuid,text,integer,jsonb,text,uuid','ffe2babf766277f41b1dec282b6e6c03')
 ) AS expected(name,args,hash) LOOP
  target:=coalesce(to_regprocedure('public.'||item.name||'_core_20261021('||item.args||')'),to_regprocedure('public.'||item.name||'('||item.args||')'));
  SELECT md5(prosrc) INTO actual FROM pg_proc WHERE oid=target;
  IF actual IS DISTINCT FROM item.hash THEN RAISE EXCEPTION 'FINANCIAL_BASE_CONTRACT_CHANGED: %',item.name; END IF;
 END LOOP;
END $$;

-- Public signatures stay compatible. Existing implementations remain private cores.
DO $$ BEGIN
 IF to_regprocedure('public.financial_save_core_20261021(uuid,text,jsonb,integer,uuid,text)') IS NULL THEN
  ALTER FUNCTION public.financial_save(uuid,text,jsonb,integer,uuid,text) RENAME TO financial_save_core_20261021;
  ALTER FUNCTION public.financial_save_expense(uuid,jsonb,integer,uuid,text) RENAME TO financial_save_expense_core_20261021;
  ALTER FUNCTION public.financial_record_movement(uuid,jsonb,jsonb,uuid) RENAME TO financial_record_movement_core_20261021;
  ALTER FUNCTION public.financial_reverse_movement(uuid,uuid,text,date,uuid) RENAME TO financial_reverse_movement_core_20261021;
 END IF;
 IF to_regprocedure('public.financial_transition_expense_core_20261021(uuid,uuid,text,integer,jsonb,text,uuid)') IS NULL THEN
  ALTER FUNCTION public.financial_transition_expense(uuid,uuid,text,integer,jsonb,text,uuid) RENAME TO financial_transition_expense_core_20261021;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.financial_save(_org_id uuid,_entity text,_payload jsonb,_expected_version integer,_request_id uuid,_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE replay jsonb; result jsonb; p jsonb:=_payload; old public.financial_revenues; ref public.financial_references; rid uuid; k text;
BEGIN
 IF _entity<>'revenue' THEN RETURN public.financial_save_core_20261021(_org_id,_entity,p,_expected_version,_request_id,_reason); END IF;
 PERFORM public.financial_require(_org_id,'financial_access');
 IF jsonb_typeof(p)<>'object' THEN RAISE EXCEPTION 'FINANCIAL_PAYLOAD_INVALID'; END IF;
 FOR k IN SELECT jsonb_object_keys(p) LOOP
  IF k NOT IN('id','edition_id','category_id','description','counterparty','responsible_name','funding_type','status','projected_cents','confirmed_cents','competence_date','due_date','notes','extra','counterparty_reference_id','funding_source_reference_id','payment_plan') THEN RAISE EXCEPTION 'FINANCIAL_PAYLOAD_INVALID: %',k; END IF;
 END LOOP;
 replay:=public.financial_begin(_org_id,'save:entry:revenue',_request_id,jsonb_build_array(p,_expected_version,_reason));
 IF replay IS NOT NULL THEN RETURN replay; END IF;
 IF p->>'id' IS NOT NULL THEN
  PERFORM 1 FROM public.financial_obligations WHERE org_id=_org_id AND source_type='receita' AND source_id=(p->>'id')::uuid ORDER BY id FOR UPDATE;
  SELECT * INTO old FROM public.financial_revenues WHERE org_id=_org_id AND id=(p->>'id')::uuid FOR UPDATE;
 END IF;
 IF p ? 'counterparty_reference_id' THEN
  ref:=public.financial_reference(_org_id,nullif(p->>'counterparty_reference_id','')::uuid,'counterparty',old.counterparty_reference_id);
  IF ref.id IS NOT NULL THEN p:=p||jsonb_build_object('counterparty',ref.name); END IF;
 END IF;
 IF p ? 'funding_source_reference_id' THEN
  ref:=public.financial_reference(_org_id,nullif(p->>'funding_source_reference_id','')::uuid,'funding_source',old.funding_source_reference_id);
  IF ref.id IS NOT NULL THEN p:=p||jsonb_build_object('funding_type',ref.funding_type); END IF;
 END IF;
 PERFORM set_config('financial.plan_write',CASE WHEN p ? 'payment_plan' THEN 'on' ELSE 'off' END,true);
 result:=public.financial_save_core_20261021(_org_id,_entity,p-'counterparty_reference_id'-'funding_source_reference_id'-'payment_plan',_expected_version,_request_id,_reason);
 rid:=(result->>'id')::uuid;
 UPDATE public.financial_revenues SET
  counterparty_reference_id=CASE WHEN p ? 'counterparty_reference_id' THEN nullif(p->>'counterparty_reference_id','')::uuid ELSE counterparty_reference_id END,
  funding_source_reference_id=CASE WHEN p ? 'funding_source_reference_id' THEN nullif(p->>'funding_source_reference_id','')::uuid ELSE funding_source_reference_id END
 WHERE id=rid AND org_id=_org_id RETURNING to_jsonb(financial_revenues) INTO result;
 IF old.counterparty_reference_id IS DISTINCT FROM nullif(result->>'counterparty_reference_id','')::uuid OR old.funding_source_reference_id IS DISTINCT FROM nullif(result->>'funding_source_reference_id','')::uuid THEN PERFORM public.financial_audit(_org_id,(result->>'edition_id')::uuid,'revenue',rid,'references',to_jsonb(old),result,_reason); END IF;
 IF p ? 'payment_plan' THEN PERFORM public.financial_save_payment_plan(_org_id,(result->>'edition_id')::uuid,'receita',rid,p->'payment_plan'); END IF;
 PERFORM set_config('financial.plan_write','off',true);
 RETURN public.financial_finish(_org_id,'save:entry:revenue',_request_id,result);
END $$;

CREATE OR REPLACE FUNCTION public.financial_save_expense(_org_id uuid,_payload jsonb,_expected_version integer,_request_id uuid,_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE replay jsonb; result jsonb; p jsonb:=_payload; old public.expenses; ref public.financial_references; rid uuid;
BEGIN
 PERFORM public.financial_require(_org_id,'financial_edit');
 replay:=public.financial_begin(_org_id,'save:entry:expense',_request_id,jsonb_build_array(p,_expected_version,_reason));
 IF replay IS NOT NULL THEN RETURN replay; END IF;
 IF p->>'id' IS NOT NULL THEN
  PERFORM 1 FROM public.financial_obligations WHERE org_id=_org_id AND source_type='despesa' AND source_id=(p->>'id')::uuid ORDER BY id FOR UPDATE;
  SELECT * INTO old FROM public.expenses WHERE org_id=_org_id AND id=(p->>'id')::uuid FOR UPDATE;
 END IF;
 IF p ? 'payee_reference_id' THEN
  ref:=public.financial_reference(_org_id,nullif(p->>'payee_reference_id','')::uuid,'payee',old.payee_reference_id);
  IF ref.id IS NOT NULL THEN p:=p||jsonb_build_object('payee_name',ref.name); END IF;
 END IF;
 PERFORM set_config('financial.plan_write',CASE WHEN p ? 'payment_plan' THEN 'on' ELSE 'off' END,true);
 result:=public.financial_save_expense_core_20261021(_org_id,p-'payee_reference_id'-'payment_plan',_expected_version,_request_id,_reason);
 rid:=(result->>'id')::uuid;
 PERFORM set_config('financial.rpc','on',true);
 UPDATE public.expenses SET payee_reference_id=CASE WHEN p ? 'payee_reference_id' THEN nullif(p->>'payee_reference_id','')::uuid ELSE payee_reference_id END WHERE id=rid AND org_id=_org_id;
 PERFORM set_config('financial.rpc','off',true);
 IF p ? 'payment_plan' THEN PERFORM public.financial_save_payment_plan(_org_id,(result->>'edition_id')::uuid,'despesa',rid,p->'payment_plan'); END IF;
 PERFORM set_config('financial.plan_write','off',true);
 SELECT public.financial_expense_json(e) INTO result FROM public.expenses e WHERE id=rid;
 IF old.payee_reference_id IS DISTINCT FROM nullif(result->>'payee_reference_id','')::uuid THEN PERFORM public.financial_audit(_org_id,(result->>'edition_id')::uuid,'expense',rid,'references',to_jsonb(old),result,_reason); END IF;
 RETURN public.financial_finish(_org_id,'save:entry:expense',_request_id,result);
END $$;

CREATE OR REPLACE FUNCTION public.financial_transition_expense(_org_id uuid,_expense_id uuid,_to text,_expected_version integer,_payload jsonb,_reason text,_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE replay jsonb; result jsonb;
BEGIN
 PERFORM public.financial_require(_org_id,'financial_edit');
 replay:=public.financial_begin(_org_id,'transition:entry',_request_id,jsonb_build_array(_expense_id,_to,_expected_version,_payload,_reason));
 IF replay IS NOT NULL THEN RETURN replay; END IF;
 PERFORM set_config('financial.plan_write',CASE WHEN _payload ? 'payment_plan' THEN 'on' ELSE 'off' END,true);
 result:=public.financial_transition_expense_core_20261021(_org_id,_expense_id,_to,_expected_version,_payload-'payment_plan',_reason,_request_id);
 IF _payload ? 'payment_plan' THEN PERFORM public.financial_save_payment_plan(_org_id,(result->>'edition_id')::uuid,'despesa',_expense_id,_payload->'payment_plan'); END IF;
 PERFORM set_config('financial.plan_write','off',true);
 RETURN public.financial_finish(_org_id,'transition:entry',_request_id,result);
END $$;

CREATE OR REPLACE FUNCTION public.financial_save_batch(_org_id uuid,_edition_id uuid,_kind text,_items jsonb,_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE replay jsonb; item jsonb; p jsonb; result jsonb; results jsonb:='[]'; ids uuid[]:='{}'; draft uuid; msg text; detail text;
BEGIN
 PERFORM public.financial_require(_org_id,'financial_access');
 PERFORM public.financial_require_operational(_org_id,_edition_id);
 IF _kind NOT IN ('revenue','expense') OR jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'FINANCIAL_BATCH_INVALID'; END IF;
 replay:=public.financial_begin(_org_id,'save:batch',_request_id,jsonb_build_array(_edition_id,_kind,_items));
 IF replay IS NOT NULL THEN RETURN replay; END IF;
 -- All existing obligations first, in fixed UUID order, including multi-record edits.
 PERFORM 1 FROM public.financial_obligations WHERE org_id=_org_id AND source_type=CASE WHEN _kind='revenue' THEN 'receita' ELSE 'despesa' END
  AND source_id IN(SELECT nullif(value->'payload'->>'id','')::uuid FROM jsonb_array_elements(_items)) ORDER BY id FOR UPDATE;
 IF (SELECT count(*) FROM jsonb_array_elements(_items) WHERE value->'payload'->>'id' IS NOT NULL) <>
    (SELECT count(DISTINCT value->'payload'->>'id') FROM jsonb_array_elements(_items) WHERE value->'payload'->>'id' IS NOT NULL) THEN RAISE EXCEPTION 'FINANCIAL_BATCH_DUPLICATE_SOURCE'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
  BEGIN
   draft:=(item->>'draft_id')::uuid;
   IF draft IS NULL OR draft=ANY(ids) THEN RAISE EXCEPTION 'FINANCIAL_BATCH_DUPLICATE_ITEM'; END IF;
   ids:=array_append(ids,draft); p:=item->'payload';
   IF p->>'edition_id' IS NOT NULL AND (p->>'edition_id')::uuid<>_edition_id THEN RAISE EXCEPTION 'FINANCIAL_EDITION_INVALID'; END IF;
   IF p->>'id' IS NOT NULL THEN
    IF _kind='revenue' AND NOT EXISTS(SELECT 1 FROM public.financial_revenues WHERE org_id=_org_id AND edition_id=_edition_id AND id=(p->>'id')::uuid) THEN RAISE EXCEPTION 'FINANCIAL_NOT_FOUND'; END IF;
    IF _kind='expense' AND NOT EXISTS(SELECT 1 FROM public.expenses WHERE org_id=_org_id AND financial_edition_id=_edition_id AND id=(p->>'id')::uuid) THEN RAISE EXCEPTION 'FINANCIAL_NOT_FOUND'; END IF;
   ELSE p:=p||jsonb_build_object('edition_id',_edition_id); END IF;
   -- Optional creations are explicit payload entries and roll back with the entire batch.
   IF item ? 'create_references' THEN
    IF jsonb_typeof(item->'create_references') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'FINANCIAL_REFERENCE_INVALID'; END IF;
    FOR detail,msg IN SELECT key,value #>> '{}' FROM jsonb_each(item->'create_references') LOOP
     IF (_kind='revenue' AND detail NOT IN ('counterparty','funding_source')) OR (_kind='expense' AND detail NOT IN ('payee','expense_category')) THEN RAISE EXCEPTION 'FINANCIAL_REFERENCE_INVALID'; END IF;
     result:=public.financial_create_reference(_org_id,detail,msg,CASE WHEN detail='funding_source' THEN p->>'funding_type' ELSE NULL END,gen_random_uuid());
     p:=p||jsonb_build_object(CASE detail WHEN 'counterparty' THEN 'counterparty_reference_id' WHEN 'funding_source' THEN 'funding_source_reference_id' WHEN 'payee' THEN 'payee_reference_id' ELSE 'category_id' END,result->>'id');
    END LOOP;
   END IF;
   IF _kind='revenue' THEN result:=public.financial_save(_org_id,'revenue',p,(item->>'expected_version')::integer,draft,item->>'reason');
   ELSE result:=public.financial_save_expense(_org_id,p,(item->>'expected_version')::integer,draft,item->>'reason'); END IF;
   results:=results||jsonb_build_array(jsonb_build_object('draft_id',draft,'record',result));
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT,detail=PG_EXCEPTION_DETAIL;
   RAISE EXCEPTION USING MESSAGE=msg,ERRCODE=SQLSTATE,DETAIL=jsonb_build_object('draft_id',item->>'draft_id','error',msg,'detail',detail)::text;
  END;
 END LOOP;
 RETURN public.financial_finish(_org_id,'save:batch',_request_id,jsonb_build_object('items',results,'count',jsonb_array_length(results)));
END $$;

CREATE OR REPLACE FUNCTION public.financial_write_installment_allocation(_org uuid,_allocation uuid,_details jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.financial_movement_allocations; item jsonb; i public.financial_payment_installments; p public.financial_payment_plans; n bigint; s integer; total numeric:=0;
BEGIN
 SELECT * INTO a FROM public.financial_movement_allocations WHERE id=_allocation AND org_id=_org;
 IF NOT FOUND OR jsonb_typeof(_details) IS DISTINCT FROM 'array' OR jsonb_array_length(_details) NOT BETWEEN 1 AND 360 THEN RAISE EXCEPTION 'FINANCIAL_INSTALLMENT_ALLOCATION_INVALID'; END IF;
 PERFORM 1 FROM public.financial_obligations WHERE id=a.obligation_id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.financial_installment_allocations WHERE allocation_id=a.id) THEN RAISE EXCEPTION 'FINANCIAL_INSTALLMENT_ALREADY_ASSIGNED'; END IF;
 s:=sign(a.amount_cents);
 FOR item IN SELECT value FROM jsonb_array_elements(_details) LOOP
  SELECT * INTO i FROM public.financial_payment_installments WHERE id=(item->>'installment_id')::uuid AND org_id=_org FOR UPDATE;
  SELECT * INTO p FROM public.financial_payment_plans WHERE id=i.plan_id AND org_id=_org FOR UPDATE;
  IF i.id IS NULL OR p.id IS NULL OR NOT i.active OR NOT p.active OR p.obligation_id IS DISTINCT FROM a.obligation_id THEN RAISE EXCEPTION 'FINANCIAL_INSTALLMENT_ALLOCATION_INVALID'; END IF;
  n:=public.financial_cents(item->'amount_cents','amount_cents');
  IF n IS NULL OR n<1 THEN RAISE EXCEPTION 'FINANCIAL_INSTALLMENT_ALLOCATION_INVALID'; END IF;
  INSERT INTO public.financial_installment_allocations(org_id,allocation_id,installment_id,amount_cents) VALUES(_org,a.id,i.id,s*n);
  IF (SELECT coalesce(sum(amount_cents),0) FROM public.financial_installment_allocations WHERE installment_id=i.id) NOT BETWEEN 0 AND i.amount_cents THEN RAISE EXCEPTION 'FINANCIAL_INSTALLMENT_OVER_SETTLEMENT'; END IF;
  total:=total+n;
 END LOOP;
 IF total<>abs(a.amount_cents) THEN RAISE EXCEPTION 'FINANCIAL_INSTALLMENT_ALLOCATION_MISMATCH'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.financial_assert_plan_settlement(_obligation uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE paid bigint; attributed bigint;
BEGIN
 SELECT coalesce(sum(amount_cents),0) INTO paid FROM public.financial_movement_allocations WHERE obligation_id=_obligation;
 SELECT coalesce(sum(d.amount_cents),0) INTO attributed FROM public.financial_installment_allocations d JOIN public.financial_movement_allocations a ON a.id=d.allocation_id WHERE a.obligation_id=_obligation;
 IF attributed<0 OR attributed>paid THEN RAISE EXCEPTION 'FINANCIAL_INSTALLMENT_DETAILS_REQUIRED'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.financial_record_movement(_org_id uuid,_payload jsonb,_allocations jsonb,_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE replay jsonb; result jsonb; item jsonb; a public.financial_movement_allocations;
BEGIN
 PERFORM public.financial_require(_org_id,'financial_settle');
 replay:=public.financial_begin(_org_id,'movement:installments',_request_id,jsonb_build_array(_payload,_allocations));
 IF replay IS NOT NULL THEN RETURN replay; END IF;
 result:=public.financial_record_movement_core_20261021(_org_id,_payload,_allocations,_request_id);
 FOR item IN SELECT value FROM jsonb_array_elements(_allocations) LOOP
  IF item ? 'installments' THEN
   IF (SELECT count(*) FROM jsonb_array_elements(_allocations) x WHERE x->>'obligation_id'=item->>'obligation_id')<>1 THEN RAISE EXCEPTION 'FINANCIAL_DETAILS_GROUP_BY_OBLIGATION'; END IF;
   SELECT * INTO a FROM public.financial_movement_allocations WHERE movement_id=(result->>'id')::uuid AND obligation_id=(item->>'obligation_id')::uuid;
   PERFORM public.financial_write_installment_allocation(_org_id,a.id,item->'installments');
  END IF;
 END LOOP;
 FOR a IN SELECT * FROM public.financial_movement_allocations WHERE movement_id=(result->>'id')::uuid LOOP
  PERFORM public.financial_assert_plan_settlement(a.obligation_id);
 END LOOP;
 RETURN public.financial_finish(_org_id,'movement:installments',_request_id,result);
END $$;

CREATE OR REPLACE FUNCTION public.financial_reverse_movement(_org_id uuid,_movement_id uuid,_reason text,_occurred_on date,_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE replay jsonb; result jsonb; a public.financial_movement_allocations;
BEGIN
 PERFORM public.financial_require(_org_id,'financial_settle');
 replay:=public.financial_begin(_org_id,'reverse:installments',_request_id,jsonb_build_array(_movement_id,_reason,_occurred_on));
 IF replay IS NOT NULL THEN RETURN replay; END IF;
 result:=public.financial_reverse_movement_core_20261021(_org_id,_movement_id,_reason,_occurred_on,_request_id);
 INSERT INTO public.financial_installment_allocations(org_id,allocation_id,installment_id,amount_cents)
 SELECT _org_id,n.id,d.installment_id,-d.amount_cents FROM public.financial_installment_allocations d
 JOIN public.financial_movement_allocations old ON old.id=d.allocation_id
 JOIN public.financial_movement_allocations n ON n.obligation_id=old.obligation_id AND n.movement_id=(result->>'id')::uuid
 WHERE old.movement_id=_movement_id;
 IF EXISTS(SELECT 1 FROM public.financial_payment_installments i WHERE i.id IN(SELECT d.installment_id FROM public.financial_installment_allocations d JOIN public.financial_movement_allocations alloc ON alloc.id=d.allocation_id WHERE alloc.movement_id=(result->>'id')::uuid)
  AND (SELECT coalesce(sum(d.amount_cents),0) FROM public.financial_installment_allocations d WHERE d.installment_id=i.id) NOT BETWEEN 0 AND i.amount_cents) THEN RAISE EXCEPTION 'FINANCIAL_INSTALLMENT_REVERSAL_EXCEEDS_NET'; END IF;
 FOR a IN SELECT * FROM public.financial_movement_allocations WHERE movement_id=(result->>'id')::uuid LOOP PERFORM public.financial_assert_plan_settlement(a.obligation_id); END LOOP;
 RETURN public.financial_finish(_org_id,'reverse:installments',_request_id,result);
END $$;

CREATE OR REPLACE FUNCTION public.financial_assign_installments(_org_id uuid,_allocation_id uuid,_details jsonb,_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE replay jsonb; a public.financial_movement_allocations; e uuid;
BEGIN
 PERFORM public.financial_require(_org_id,'financial_settle');
 replay:=public.financial_begin(_org_id,'assign:installments',_request_id,jsonb_build_array(_allocation_id,_details));
 IF replay IS NOT NULL THEN RETURN replay; END IF;
 SELECT * INTO a FROM public.financial_movement_allocations WHERE id=_allocation_id AND org_id=_org_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_ALLOCATION_INVALID'; END IF;
 SELECT edition_id INTO e FROM public.financial_movements WHERE id=a.movement_id AND org_id=_org_id AND kind<>'estorno';
 PERFORM public.financial_require_operational(_org_id,e);
 IF EXISTS(SELECT 1 FROM public.financial_movements WHERE reverses_movement_id=a.movement_id) THEN RAISE EXCEPTION 'FINANCIAL_ALREADY_REVERSED'; END IF;
 PERFORM public.financial_write_installment_allocation(_org_id,a.id,_details);
 PERFORM public.financial_assert_plan_settlement(a.obligation_id);
 PERFORM public.financial_audit(_org_id,e,'installment_allocation',a.id,'assign',NULL,_details,'Detalhamento de movimento existente; sem novo caixa');
 RETURN public.financial_finish(_org_id,'assign:installments',_request_id,jsonb_build_object('ok',true));
END $$;

CREATE OR REPLACE FUNCTION public.financial_source_plan_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE typ text; ed uuid; total bigint; source_active boolean; p public.financial_payment_plans; ob uuid; paid bigint;
BEGIN
 IF TG_TABLE_NAME='financial_revenues' THEN typ:='receita'; ed:=NEW.edition_id; source_active:=NEW.status<>'cancelada'; total:=CASE WHEN NEW.status='confirmada' THEN NEW.confirmed_cents ELSE NEW.projected_cents END;
 ELSE typ:='despesa'; ed:=NEW.financial_edition_id; source_active:=NEW.financial_status<>'cancelada'; total:=CASE WHEN NEW.financial_status='realizada' THEN NEW.committed_cents ELSE NEW.planned_cents END; END IF;
 SELECT * INTO p FROM public.financial_payment_plans WHERE org_id=NEW.org_id AND source_type=typ AND source_id=NEW.id FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT id INTO ob FROM public.financial_obligations WHERE org_id=NEW.org_id AND source_type=typ AND source_id=NEW.id AND status='aberta';
 SELECT coalesce(sum(amount_cents),0) INTO paid FROM public.financial_movement_allocations WHERE obligation_id=p.obligation_id;
 IF NOT source_active AND paid<>0 THEN RAISE EXCEPTION 'FINANCIAL_HAS_SETTLEMENT'; END IF;
 IF source_active AND total IS DISTINCT FROM p.total_cents AND coalesce(current_setting('financial.plan_write',true),'')<>'on' THEN RAISE EXCEPTION 'FINANCIAL_PLAN_REQUIRES_REVISION'; END IF;
 UPDATE public.financial_payment_plans SET obligation_id=ob,active=source_active WHERE id=p.id;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_financial_source_plan_guard ON public.financial_revenues;
CREATE TRIGGER zz_financial_source_plan_guard AFTER INSERT OR UPDATE ON public.financial_revenues FOR EACH ROW EXECUTE FUNCTION public.financial_source_plan_guard();
DROP TRIGGER IF EXISTS zz_financial_source_plan_guard ON public.expenses;
CREATE TRIGGER zz_financial_source_plan_guard AFTER INSERT OR UPDATE ON public.expenses FOR EACH ROW WHEN(NEW.financial_edition_id IS NOT NULL) EXECUTE FUNCTION public.financial_source_plan_guard();

CREATE OR REPLACE FUNCTION public.financial_list_revenues(_edition_id uuid,_limit integer DEFAULT 500,_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid;
BEGIN
 SELECT org_id INTO org FROM public.financial_editions WHERE id=_edition_id;
 PERFORM public.financial_require(org,'financial_access');
 RETURN jsonb_build_object('total',(SELECT count(*) FROM public.financial_revenues WHERE org_id=org AND edition_id=_edition_id),
 'items',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id) FROM(
 SELECT r.*,cp.name counterparty_reference_name,fs.name funding_source_name FROM public.financial_revenues r
 LEFT JOIN public.financial_references cp ON cp.id=r.counterparty_reference_id AND cp.org_id=r.org_id
 LEFT JOIN public.financial_references fs ON fs.id=r.funding_source_reference_id AND fs.org_id=r.org_id
 WHERE r.org_id=org AND r.edition_id=_edition_id ORDER BY r.created_at DESC,r.id LIMIT least(greatest(_limit,1),500) OFFSET greatest(_offset,0)) q),'[]'),
 'by_source',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM(SELECT coalesce(r.funding_source_reference_id::text,r.funding_type) key,max(fs.name) name,r.funding_type,
 sum(r.projected_cents) projected_cents,sum(CASE WHEN r.status='confirmada' THEN r.confirmed_cents ELSE 0 END) confirmed_cents,count(*) count
 FROM public.financial_revenues r LEFT JOIN public.financial_references fs ON fs.id=r.funding_source_reference_id AND fs.org_id=r.org_id
 WHERE r.org_id=org AND r.edition_id=_edition_id AND r.status<>'cancelada' GROUP BY 1,r.funding_type) q),'[]'));
END $$;

-- The existing expense scope still drives both pagination and complete server aggregates.
DO $$ BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.financial_expense_filtered(uuid,uuid,jsonb)'::regprocedure) NOT IN ('cbc4a7f51daf0627d162f42f2e2cbc2e','309897fe28e52f0b260b2cd3ebdf202a') THEN RAISE EXCEPTION 'FINANCIAL_BASE_CONTRACT_CHANGED: financial_expense_filtered'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.financial_expense_filtered(_org_id uuid, _edition_id uuid, _f jsonb)
 RETURNS SETOF expenses
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT e.* FROM public.expenses e
  WHERE e.org_id=_org_id AND e.financial_edition_id=_edition_id
    AND (nullif(_f->>'category_id','') IS NULL OR (CASE WHEN _f->>'category_id'='none' THEN e.financial_category_id IS NULL ELSE e.financial_category_id=(_f->>'category_id')::uuid END))
    AND (nullif(_f->>'commission_id','') IS NULL OR (CASE WHEN _f->>'commission_id'='none' THEN e.financial_commission_id IS NULL ELSE e.financial_commission_id=(_f->>'commission_id')::uuid END))
    AND (nullif(_f->>'status','') IS NULL OR e.financial_status=_f->>'status')
    AND (nullif(_f->>'q','') IS NULL OR e.title ILIKE '%'||(_f->>'q')||'%' OR e.payee_name ILIKE '%'||(_f->>'q')||'%' OR EXISTS(SELECT 1 FROM public.financial_references ref WHERE ref.id=e.payee_reference_id AND ref.org_id=e.org_id AND ref.kind='payee' AND ref.name ILIKE '%'||(_f->>'q')||'%'))
    AND (nullif(_f->>'from','') IS NULL OR (CASE coalesce(_f->>'date_field','committed_on')
          WHEN 'planned_on' THEN e.planned_on WHEN 'due_date' THEN e.financial_due_date ELSE e.committed_on END) >= (_f->>'from')::date)
    AND (nullif(_f->>'to','') IS NULL OR (CASE coalesce(_f->>'date_field','committed_on')
          WHEN 'planned_on' THEN e.planned_on WHEN 'due_date' THEN e.financial_due_date ELSE e.committed_on END) <= (_f->>'to')::date);
$function$
;

CREATE OR REPLACE FUNCTION public.financial_schedule_summary(_org_id uuid,_edition_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.financial_require(_org_id,'financial_access');
 IF NOT EXISTS(SELECT 1 FROM public.financial_editions WHERE id=_edition_id AND org_id=_org_id) THEN RAISE EXCEPTION 'FINANCIAL_EDITION_INVALID'; END IF;
 RETURN jsonb_build_object('months',coalesce((WITH entries AS(
 SELECT p.source_type,date_trunc('month',i.due_date)::date AS month,i.amount_cents scheduled,0::bigint executed,0::bigint cash
 FROM public.financial_payment_plans p JOIN public.financial_payment_installments i ON i.plan_id=p.id AND i.active WHERE p.org_id=_org_id AND p.edition_id=_edition_id AND p.active
 UNION ALL SELECT 'receita',date_trunc('month',r.due_date)::date,CASE WHEN r.status='confirmada' THEN r.confirmed_cents ELSE r.projected_cents END,0,0 FROM public.financial_revenues r WHERE r.org_id=_org_id AND r.edition_id=_edition_id AND r.status<>'cancelada' AND r.due_date IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.financial_payment_plans p WHERE p.org_id=r.org_id AND p.source_type='receita' AND p.source_id=r.id)
 UNION ALL SELECT 'despesa',date_trunc('month',e.financial_due_date)::date,CASE WHEN e.financial_status='realizada' THEN e.committed_cents ELSE e.planned_cents END,0,0 FROM public.expenses e WHERE e.org_id=_org_id AND e.financial_edition_id=_edition_id AND e.financial_status<>'cancelada' AND e.financial_due_date IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.financial_payment_plans p WHERE p.org_id=e.org_id AND p.source_type='despesa' AND p.source_id=e.id)
 UNION ALL SELECT 'receita',date_trunc('month',competence_date)::date,0,confirmed_cents,0 FROM public.financial_revenues WHERE org_id=_org_id AND edition_id=_edition_id AND status='confirmada'
 UNION ALL SELECT 'despesa',date_trunc('month',committed_on)::date,0,committed_cents,0 FROM public.expenses WHERE org_id=_org_id AND financial_edition_id=_edition_id AND financial_status='realizada'
 UNION ALL SELECT o.source_type,date_trunc('month',m.occurred_on)::date,0,0,a.amount_cents FROM public.financial_movement_allocations a
 JOIN public.financial_movements m ON m.id=a.movement_id JOIN public.financial_obligations o ON o.id=a.obligation_id
 WHERE m.org_id=_org_id AND m.edition_id=_edition_id AND o.source_type IN ('receita','despesa'))
 SELECT jsonb_agg(to_jsonb(q) ORDER BY q.month,q.source_type) FROM(SELECT month,source_type,sum(scheduled) scheduled_cents,sum(executed) executed_cents,sum(cash) cash_cents FROM entries GROUP BY month,source_type) q),'[]'),
 'unscheduled_sources',(SELECT count(*) FROM(SELECT id,'receita' t FROM public.financial_revenues WHERE org_id=_org_id AND edition_id=_edition_id AND status<>'cancelada' UNION ALL SELECT id,'despesa' FROM public.expenses WHERE org_id=_org_id AND financial_edition_id=_edition_id AND financial_status<>'cancelada') s
 WHERE NOT EXISTS(SELECT 1 FROM public.financial_payment_plans p WHERE p.org_id=_org_id AND p.source_type=s.t AND p.source_id=s.id AND p.active)));
END $$;

-- Newly created routines default to PUBLIC EXECUTE in PostgreSQL: close every internal entry point.
CREATE OR REPLACE FUNCTION public.financial_export_entries(_org_id uuid,_edition_id uuid,_kind text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.financial_require(_org_id,'financial_access');
 IF _kind NOT IN ('receita','despesa') OR NOT EXISTS(SELECT 1 FROM public.financial_editions WHERE org_id=_org_id AND id=_edition_id) THEN RAISE EXCEPTION 'FINANCIAL_EXPORT_SCOPE_INVALID'; END IF;
 RETURN coalesce((WITH sources AS(
 SELECT r.id,'receita' source_type,r.description,r.status,r.projected_cents,r.confirmed_cents executed_cents,r.competence_date,r.due_date,
 coalesce(cp.name,r.counterparty) related_name,coalesce(fs.name,r.funding_type) funding_source,r.counterparty_reference_id related_reference_id,r.funding_source_reference_id,r.funding_type,NULL::uuid category_id,NULL::text category_name
 FROM public.financial_revenues r LEFT JOIN public.financial_references cp ON cp.org_id=r.org_id AND cp.id=r.counterparty_reference_id
 LEFT JOIN public.financial_references fs ON fs.org_id=r.org_id AND fs.id=r.funding_source_reference_id WHERE r.org_id=_org_id AND r.edition_id=_edition_id AND _kind='receita'
 UNION ALL SELECT e.id,'despesa',e.title,e.financial_status,e.planned_cents,e.committed_cents,e.committed_on,e.financial_due_date,coalesce(pay.name,e.payee_name),NULL,e.payee_reference_id,NULL,NULL,e.financial_category_id,cat.name
 FROM public.expenses e LEFT JOIN public.financial_references pay ON pay.org_id=e.org_id AND pay.id=e.payee_reference_id LEFT JOIN public.financial_categories cat ON cat.org_id=e.org_id AND cat.id=e.financial_category_id
 WHERE e.org_id=_org_id AND e.financial_edition_id=_edition_id AND _kind='despesa')
 SELECT jsonb_agg(to_jsonb(s)||jsonb_build_object('settled_cents',coalesce((SELECT sum(a.amount_cents) FROM public.financial_movement_allocations a JOIN public.financial_obligations o ON o.id=a.obligation_id WHERE o.org_id=_org_id AND o.source_type=s.source_type AND o.source_id=s.id),0),
 'plan',CASE WHEN p.id IS NULL THEN NULL ELSE to_jsonb(p)||jsonb_build_object('installments',coalesce((SELECT jsonb_agg(to_jsonb(i)||jsonb_build_object('settled_cents',coalesce((SELECT sum(amount_cents) FROM public.financial_installment_allocations WHERE installment_id=i.id),0)) ORDER BY i.sequence) FROM public.financial_payment_installments i WHERE i.plan_id=p.id AND i.active),'[]')) END) ORDER BY s.id)
 FROM sources s LEFT JOIN public.financial_payment_plans p ON p.org_id=_org_id AND p.edition_id=_edition_id AND p.source_type=s.source_type AND p.source_id=s.id),'[]');
END $$;
REVOKE ALL ON FUNCTION public.financial_export_entries(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.financial_export_entries(uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.financial_reference_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF current_user NOT IN ('postgres','supabase_admin') AND coalesce(current_setting('financial.rpc',true),'')<>'on' THEN
  IF TG_OP='INSERT' THEN
   IF NEW.payee_reference_id IS NOT NULL THEN RAISE EXCEPTION 'FINANCIAL_EXPENSE_PROTECTED' USING ERRCODE='42501'; END IF;
  ELSIF NEW.payee_reference_id IS DISTINCT FROM OLD.payee_reference_id THEN RAISE EXCEPTION 'FINANCIAL_EXPENSE_PROTECTED' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS financial_reference_guard ON public.expenses;
CREATE TRIGGER financial_reference_guard BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.financial_reference_guard();
REVOKE ALL ON FUNCTION public.financial_reference_guard() FROM PUBLIC,anon,authenticated;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure sig,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND (p.proname IN('financial_normalize_name','financial_list_references','financial_create_reference','financial_update_reference','financial_reference','financial_payment_plan','financial_save_payment_plan','financial_save_batch','financial_write_installment_allocation','financial_assert_plan_settlement','financial_assign_installments','financial_source_plan_guard','financial_list_revenues','financial_schedule_summary','financial_save','financial_save_expense','financial_transition_expense','financial_record_movement','financial_reverse_movement') OR p.proname LIKE '%_core_20261021') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);
  IF f.proname IN('financial_list_references','financial_create_reference','financial_update_reference','financial_payment_plan','financial_save_batch','financial_assign_installments','financial_list_revenues','financial_schedule_summary','financial_save','financial_save_expense','financial_transition_expense','financial_record_movement','financial_reverse_movement') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig); END IF;
 END LOOP;
END $$;


CREATE OR REPLACE FUNCTION public.financial_expense_json(_e expenses)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id',_e.id,'org_id',_e.org_id,'edition_id',_e.financial_edition_id,'title',_e.title,'description',_e.description,
    'category_id',_e.financial_category_id,'category_name',(SELECT name FROM public.financial_categories WHERE id=_e.financial_category_id),
    'commission_id',_e.financial_commission_id,'commission_name',(SELECT nome FROM public.commissions WHERE id=_e.financial_commission_id),
    'budget_line_id',_e.financial_budget_line_id,'payee_name',_e.payee_name,
    'payee_reference_id',_e.payee_reference_id,'payee_reference_name',(SELECT name FROM public.financial_references WHERE id=_e.payee_reference_id AND org_id=_e.org_id),
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
$function$
;
