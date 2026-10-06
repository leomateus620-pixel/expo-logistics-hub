-- RASCUNHO NÃO APLICADO. Financeiro Operacional por edição (Fenasoja 2028).
-- Só aplicar no backend com autorização explícita (o preview e a produção usam o mesmo backend).
-- Nenhuma linha real é importada; 2026 permanece histórico e somente leitura.
-- Escritas acontecem exclusivamente por RPCs transacionais, idempotentes e auditadas.

-- ---------------------------------------------------------------- autorização
-- Não usa has_capability(): ela concede tudo a gestor/operador. O financeiro exige
-- administrador da organização ou capacidade financeira explícita.
CREATE OR REPLACE FUNCTION public.financial_can(_org_id uuid, _capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.org_id = _org_id AND m.user_id = auth.uid() AND m.is_active
      AND (m.role = 'admin' OR EXISTS (
        SELECT 1 FROM public.user_capabilities c
        WHERE c.org_id = _org_id AND c.user_id = auth.uid()
          AND (c.capability = _capability
            OR (_capability = 'financial_access' AND c.capability IN
              ('financial_edit','financial_confirm','financial_settle','financial_admin'))))));
$$;
REVOKE ALL ON FUNCTION public.financial_can(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_can(uuid,text) TO authenticated;

-- ---------------------------------------------------------------- edições
CREATE TABLE IF NOT EXISTS public.financial_editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code integer NOT NULL CHECK (code BETWEEN 2000 AND 2100),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 3 AND 80),
  status text NOT NULL CHECK (status IN ('historico','operacional')),
  period_start date NOT NULL,
  period_end date NOT NULL CHECK (period_end >= period_start),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code),
  UNIQUE (org_id, id)
);

-- ---------------------------------------------------------------- classificações
CREATE TABLE IF NOT EXISTS public.financial_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  domain text NOT NULL CHECK (domain IN ('despesa','receita')),
  parent_id uuid,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL, updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, parent_id) REFERENCES public.financial_categories(org_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS financial_categories_name_unique
  ON public.financial_categories(org_id, domain, coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)));

-- Campos complementares: metadados validados, nunca colunas criadas pelo navegador.
CREATE TABLE IF NOT EXISTS public.financial_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity text NOT NULL CHECK (entity IN ('budget_line','revenue','sponsorship')),
  field_key text NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9_]{1,39}$'),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 2 AND 80),
  field_type text NOT NULL CHECK (field_type IN ('texto','data','numero','moeda','selecao')),
  required boolean NOT NULL DEFAULT false,
  options jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array'),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL, updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, entity, field_key)
);

-- ---------------------------------------------------------------- orçamento
CREATE TABLE IF NOT EXISTS public.financial_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL, edition_id uuid NOT NULL,
  commission_id uuid NOT NULL REFERENCES public.commissions(id),
  responsible_name text CHECK (responsible_name IS NULL OR length(responsible_name) <= 160),
  budget_cap_cents bigint CHECK (budget_cap_cents IS NULL OR budget_cap_cents >= 0),
  period_start date, period_end date,
  notes text CHECK (notes IS NULL OR length(notes) <= 2000),
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL, updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, edition_id) REFERENCES public.financial_editions(org_id, id),
  UNIQUE (edition_id, commission_id),
  UNIQUE (org_id, id),
  CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);
CREATE TABLE IF NOT EXISTS public.financial_budget_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL, edition_id uuid NOT NULL, budget_id uuid NOT NULL,
  category_id uuid,
  kind text NOT NULL DEFAULT 'operacional' CHECK (kind IN ('operacional','obrigacao_anterior','investimento')),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 2 AND 240),
  planned_cents bigint NOT NULL CHECK (planned_cents >= 0),
  period_start date, period_end date,
  notes text CHECK (notes IS NULL OR length(notes) <= 2000),
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL, updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, budget_id) REFERENCES public.financial_budgets(org_id, id),
  FOREIGN KEY (org_id, category_id) REFERENCES public.financial_categories(org_id, id)
);
CREATE INDEX IF NOT EXISTS financial_budget_lines_budget_idx ON public.financial_budget_lines(budget_id);

-- ---------------------------------------------------------------- receitas e patrocínios
CREATE TABLE IF NOT EXISTS public.financial_revenues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL, edition_id uuid NOT NULL,
  category_id uuid,
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 2 AND 240),
  counterparty text CHECK (counterparty IS NULL OR length(counterparty) <= 200),
  responsible_name text CHECK (responsible_name IS NULL OR length(responsible_name) <= 160),
  funding_type text NOT NULL DEFAULT 'nao_identificado'
    CHECK (funding_type IN ('recurso_livre','lei_rouanet','prefeitura_plano_trabalho','misto','nao_identificado')),
  status text NOT NULL DEFAULT 'projetada' CHECK (status IN ('projetada','confirmada','cancelada')),
  projected_cents bigint NOT NULL CHECK (projected_cents >= 0),
  confirmed_cents bigint CHECK (confirmed_cents IS NULL OR confirmed_cents >= 0),
  competence_date date, due_date date,
  notes text CHECK (notes IS NULL OR length(notes) <= 2000),
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL, updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, edition_id) REFERENCES public.financial_editions(org_id, id),
  FOREIGN KEY (org_id, category_id) REFERENCES public.financial_categories(org_id, id),
  CHECK (status = 'cancelada' OR (status = 'confirmada') = (confirmed_cents IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.financial_sponsorships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL, edition_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 200),
  tier text NOT NULL DEFAULT 'nao_classificado'
    CHECK (tier IN ('grao_de_ouro','ouro','prata','bronze','soy_summit','outros_apoios','nao_classificado')),
  negotiation_status text NOT NULL DEFAULT 'prospeccao'
    CHECK (negotiation_status IN ('prospeccao','negociacao','confirmado','cancelado')),
  responsible_name text CHECK (responsible_name IS NULL OR length(responsible_name) <= 160),
  declared_cents bigint CHECK (declared_cents IS NULL OR declared_cents >= 0),
  projected_free_cents bigint NOT NULL DEFAULT 0 CHECK (projected_free_cents >= 0),
  projected_rouanet_cents bigint NOT NULL DEFAULT 0 CHECK (projected_rouanet_cents >= 0),
  confirmed_free_cents bigint NOT NULL DEFAULT 0 CHECK (confirmed_free_cents >= 0),
  confirmed_rouanet_cents bigint NOT NULL DEFAULT 0 CHECK (confirmed_rouanet_cents >= 0),
  in_kind_description text CHECK (in_kind_description IS NULL OR length(in_kind_description) <= 1000),
  in_kind_value_cents bigint CHECK (in_kind_value_cents IS NULL OR in_kind_value_cents >= 0),
  vehicle_credentials integer NOT NULL DEFAULT 0 CHECK (vehicle_credentials >= 0),
  summit_credentials integer NOT NULL DEFAULT 0 CHECK (summit_credentials >= 0),
  signed_on date, due_date date,
  notes text CHECK (notes IS NULL OR length(notes) <= 2000),
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL, updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, edition_id) REFERENCES public.financial_editions(org_id, id)
);

-- ---------------------------------------------------------------- obrigações e movimentos
CREATE TABLE IF NOT EXISTS public.financial_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL, edition_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('receber','pagar')),
  source_type text NOT NULL CHECK (source_type IN ('receita','patrocinio','despesa','parcela_comercial','manual')),
  source_id uuid,
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 2 AND 240),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  due_date date,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','cancelada')),
  cancel_reason text,
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL, updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, edition_id) REFERENCES public.financial_editions(org_id, id),
  UNIQUE (org_id, id),
  CHECK (source_type = 'manual' OR source_id IS NOT NULL),
  CHECK (status <> 'cancelada' OR length(btrim(coalesce(cancel_reason,''))) >= 3)
);
-- Movimentos são fatos já ocorridos e imutáveis: correções geram movimentos vinculados.
CREATE TABLE IF NOT EXISTS public.financial_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL, edition_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('recebimento','pagamento','adiantamento','estorno','devolucao','ajuste')),
  direction text NOT NULL CHECK (direction IN ('entrada','saida')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  occurred_on date NOT NULL,
  method text CHECK (method IS NULL OR length(method) <= 60),
  reference text CHECK (reference IS NULL OR length(reference) <= 160),
  responsible_name text CHECK (responsible_name IS NULL OR length(responsible_name) <= 160),
  document_path text CHECK (document_path IS NULL OR length(document_path) <= 500),
  reverses_movement_id uuid,
  notes text CHECK (notes IS NULL OR length(notes) <= 2000),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, edition_id) REFERENCES public.financial_editions(org_id, id),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, reverses_movement_id) REFERENCES public.financial_movements(org_id, id),
  CHECK ((kind = 'estorno') = (reverses_movement_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS financial_movements_single_reversal
  ON public.financial_movements(reverses_movement_id) WHERE reverses_movement_id IS NOT NULL;
-- Alocação assinada: estornos e devoluções reduzem a quitação da mesma obrigação.
CREATE TABLE IF NOT EXISTS public.financial_movement_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  movement_id uuid NOT NULL, obligation_id uuid NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents <> 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, movement_id) REFERENCES public.financial_movements(org_id, id),
  FOREIGN KEY (org_id, obligation_id) REFERENCES public.financial_obligations(org_id, id),
  UNIQUE (movement_id, obligation_id)
);
CREATE INDEX IF NOT EXISTS financial_allocations_obligation_idx ON public.financial_movement_allocations(obligation_id);

-- ---------------------------------------------------------------- cenários versionados
CREATE TABLE IF NOT EXISTS public.financial_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL, edition_id uuid NOT NULL,
  scenario_key text NOT NULL CHECK (scenario_key IN ('realistic','pessimistic','optimistic')),
  version integer NOT NULL CHECK (version > 0),
  assumptions jsonb NOT NULL CHECK (jsonb_typeof(assumptions) = 'object'),
  notes text CHECK (notes IS NULL OR length(notes) <= 2000),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, edition_id) REFERENCES public.financial_editions(org_id, id),
  UNIQUE (edition_id, scenario_key, version)
);

-- ---------------------------------------------------------------- auditoria e recibos
CREATE TABLE IF NOT EXISTS public.financial_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL, edition_id uuid,
  entity text NOT NULL, entity_id uuid NOT NULL,
  action text NOT NULL,
  before_data jsonb, after_data jsonb,
  reason text,
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS financial_audit_entity_idx ON public.financial_audit_events(org_id, entity, entity_id, created_at DESC);
CREATE TABLE IF NOT EXISTS public.financial_mutation_receipts (
  org_id uuid NOT NULL, actor_user_id uuid NOT NULL,
  operation text NOT NULL, idempotency_key uuid NOT NULL,
  request_hash text NOT NULL, result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, actor_user_id, operation, idempotency_key)
);

-- ---------------------------------------------------------------- grants e RLS
-- Leitura direta autorizada; nenhuma escrita direta pelo cliente.
GRANT SELECT ON public.financial_editions, public.financial_categories, public.financial_custom_fields,
  public.financial_budgets, public.financial_budget_lines, public.financial_revenues, public.financial_sponsorships,
  public.financial_obligations, public.financial_movements, public.financial_movement_allocations,
  public.financial_scenarios, public.financial_audit_events TO authenticated;
GRANT ALL ON public.financial_editions, public.financial_categories, public.financial_custom_fields,
  public.financial_budgets, public.financial_budget_lines, public.financial_revenues, public.financial_sponsorships,
  public.financial_obligations, public.financial_movements, public.financial_movement_allocations,
  public.financial_scenarios, public.financial_audit_events, public.financial_mutation_receipts TO service_role;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['financial_editions','financial_categories','financial_custom_fields','financial_budgets',
    'financial_budget_lines','financial_revenues','financial_sponsorships','financial_obligations','financial_movements',
    'financial_movement_allocations','financial_scenarios','financial_audit_events','financial_mutation_receipts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF t <> 'financial_mutation_receipts' THEN
      EXECUTE format('DROP POLICY IF EXISTS financial_read ON public.%I', t);
      EXECUTE format('CREATE POLICY financial_read ON public.%I FOR SELECT TO authenticated USING (public.financial_can(org_id, ''financial_access''))', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------- utilitários privados
CREATE OR REPLACE FUNCTION public.financial_require(_org_id uuid, _capability text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FINANCIAL_AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF NOT public.financial_can(_org_id, _capability) THEN
    RAISE EXCEPTION 'FINANCIAL_FORBIDDEN: %', _capability USING ERRCODE = '42501';
  END IF;
  RETURN auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.financial_require_operational(_org_id uuid, _edition_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.financial_editions WHERE org_id = _org_id AND id = _edition_id AND status = 'operacional') THEN
    RAISE EXCEPTION 'FINANCIAL_EDITION_READ_ONLY' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.financial_begin(_org_id uuid, _operation text, _key uuid, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.financial_mutation_receipts; inserted integer;
BEGIN
  IF _key IS NULL THEN RAISE EXCEPTION 'FINANCIAL_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.financial_mutation_receipts(org_id, actor_user_id, operation, idempotency_key, request_hash)
  VALUES (_org_id, auth.uid(), _operation, _key, md5(_payload::text)) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted = 1 THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.financial_mutation_receipts
    WHERE org_id = _org_id AND actor_user_id = auth.uid() AND operation = _operation AND idempotency_key = _key FOR UPDATE;
  IF r.request_hash <> md5(_payload::text) THEN RAISE EXCEPTION 'FINANCIAL_IDEMPOTENCY_CONFLICT' USING ERRCODE = '22023'; END IF;
  IF r.result IS NULL THEN RAISE EXCEPTION 'FINANCIAL_REQUEST_IN_PROGRESS' USING ERRCODE = '40001'; END IF;
  RETURN r.result;
END $$;

CREATE OR REPLACE FUNCTION public.financial_finish(_org_id uuid, _operation text, _key uuid, _result jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.financial_mutation_receipts SET result = _result
   WHERE org_id = _org_id AND actor_user_id = auth.uid() AND operation = _operation AND idempotency_key = _key
  RETURNING result;
$$;

CREATE OR REPLACE FUNCTION public.financial_audit(_org uuid, _edition uuid, _entity text, _id uuid, _action text, _before jsonb, _after jsonb, _reason text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.financial_audit_events(org_id, edition_id, entity, entity_id, action, before_data, after_data, reason, actor_user_id)
  VALUES (_org, _edition, _entity, _id, _action, _before, _after, nullif(btrim(coalesce(_reason,'')),''), auth.uid());
$$;

-- Campos complementares: só chaves conhecidas da entidade, com tipo e obrigatoriedade.
CREATE OR REPLACE FUNCTION public.financial_validate_extra(_org uuid, _entity text, _extra jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.financial_custom_fields; v jsonb; k text;
BEGIN
  _extra := coalesce(_extra, '{}'::jsonb);
  IF jsonb_typeof(_extra) <> 'object' THEN RAISE EXCEPTION 'FINANCIAL_EXTRA_INVALID' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(_extra) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.financial_custom_fields WHERE org_id = _org AND entity = _entity AND field_key = k) THEN
      RAISE EXCEPTION 'FINANCIAL_EXTRA_UNKNOWN_FIELD: %', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOR f IN SELECT * FROM public.financial_custom_fields WHERE org_id = _org AND entity = _entity AND active LOOP
    v := _extra -> f.field_key;
    IF v IS NULL OR v = 'null'::jsonb OR v = '""'::jsonb THEN
      IF f.required THEN RAISE EXCEPTION 'FINANCIAL_EXTRA_REQUIRED: %', f.label USING ERRCODE = '22023'; END IF;
      CONTINUE;
    END IF;
    IF (f.field_type IN ('texto','selecao','data') AND jsonb_typeof(v) <> 'string')
      OR (f.field_type IN ('numero','moeda') AND jsonb_typeof(v) <> 'number') THEN
      RAISE EXCEPTION 'FINANCIAL_EXTRA_TYPE: %', f.label USING ERRCODE = '22023';
    END IF;
    IF (f.field_type = 'moeda' AND (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric))
      OR (f.field_type = 'data' AND (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$')
      OR (f.field_type = 'selecao' AND NOT f.options ? (v #>> '{}'))
      OR (f.field_type = 'texto' AND length(v #>> '{}') > 1000) THEN
      RAISE EXCEPTION 'FINANCIAL_EXTRA_TYPE: %', f.label USING ERRCODE = '22023';
    END IF;
  END LOOP;
  RETURN _extra;
END $$;

-- ---------------------------------------------------------------- gravação de cadastros
-- Um único ponto transacional por entidade; identidade, autoria, versão e totais
-- derivados nunca vêm do payload.
CREATE OR REPLACE FUNCTION public.financial_save(_org_id uuid, _entity text, _payload jsonb, _expected_version integer, _request_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor uuid; replay jsonb; rec_id uuid := nullif(_payload->>'id','')::uuid;
  edition uuid := nullif(_payload->>'edition_id','')::uuid;
  before jsonb; after jsonb; cap text := 'financial_edit';
  b public.financial_budgets; l public.financial_budget_lines; r public.financial_revenues;
  s public.financial_sponsorships; c public.financial_categories; f public.financial_custom_fields;
  o public.financial_obligations; current_version integer;
BEGIN
  IF _entity NOT IN ('budget','budget_line','revenue','sponsorship','category','custom_field','obligation') THEN
    RAISE EXCEPTION 'FINANCIAL_ENTITY_INVALID' USING ERRCODE = '22023';
  END IF;
  IF _entity IN ('category','custom_field') THEN cap := 'financial_admin'; END IF;
  IF _entity = 'revenue' AND _payload->>'status' = 'confirmada' THEN cap := 'financial_confirm'; END IF;
  IF _entity = 'sponsorship' AND (coalesce((_payload->>'confirmed_free_cents')::bigint,0) > 0
      OR coalesce((_payload->>'confirmed_rouanet_cents')::bigint,0) > 0 OR _payload->>'negotiation_status' = 'confirmado') THEN
    cap := 'financial_confirm';
  END IF;
  actor := public.financial_require(_org_id, cap);
  replay := public.financial_begin(_org_id, 'save:'||_entity, _request_id,
    jsonb_build_object('p',_payload,'v',_expected_version,'r',_reason));
  IF replay IS NOT NULL THEN RETURN replay; END IF;

  IF _entity = 'budget' THEN
    IF rec_id IS NOT NULL THEN
      SELECT * INTO b FROM public.financial_budgets WHERE org_id=_org_id AND id=rec_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
      edition := b.edition_id; current_version := b.version; before := to_jsonb(b);
    END IF;
    PERFORM public.financial_require_operational(_org_id, edition);
    IF rec_id IS NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.commissions WHERE id = (_payload->>'commission_id')::uuid AND org_id = _org_id) THEN
        RAISE EXCEPTION 'FINANCIAL_COMMISSION_INVALID' USING ERRCODE='22023';
      END IF;
      INSERT INTO public.financial_budgets(org_id,edition_id,commission_id,responsible_name,budget_cap_cents,period_start,period_end,notes,created_by,updated_by)
      VALUES(_org_id,edition,(_payload->>'commission_id')::uuid,nullif(btrim(_payload->>'responsible_name'),''),
        (_payload->>'budget_cap_cents')::bigint,(_payload->>'period_start')::date,(_payload->>'period_end')::date,
        nullif(btrim(_payload->>'notes'),''),actor,actor) RETURNING * INTO b;
    ELSE
      IF _expected_version IS DISTINCT FROM current_version THEN RAISE EXCEPTION 'FINANCIAL_CONFLICT' USING ERRCODE='40001'; END IF;
      IF (_payload ? 'budget_cap_cents') AND (_payload->>'budget_cap_cents')::bigint IS DISTINCT FROM b.budget_cap_cents
        AND length(btrim(coalesce(_reason,''))) < 3 THEN
        RAISE EXCEPTION 'FINANCIAL_REASON_REQUIRED' USING ERRCODE='22023';
      END IF;
      UPDATE public.financial_budgets SET
        responsible_name = CASE WHEN _payload ? 'responsible_name' THEN nullif(btrim(_payload->>'responsible_name'),'') ELSE responsible_name END,
        budget_cap_cents = CASE WHEN _payload ? 'budget_cap_cents' THEN (_payload->>'budget_cap_cents')::bigint ELSE budget_cap_cents END,
        period_start = CASE WHEN _payload ? 'period_start' THEN (_payload->>'period_start')::date ELSE period_start END,
        period_end = CASE WHEN _payload ? 'period_end' THEN (_payload->>'period_end')::date ELSE period_end END,
        notes = CASE WHEN _payload ? 'notes' THEN nullif(btrim(_payload->>'notes'),'') ELSE notes END,
        version = version + 1, updated_by = actor, updated_at = now()
      WHERE id = rec_id RETURNING * INTO b;
    END IF;
    rec_id := b.id; after := to_jsonb(b);

  ELSIF _entity = 'budget_line' THEN
    IF rec_id IS NOT NULL THEN
      SELECT * INTO l FROM public.financial_budget_lines WHERE org_id=_org_id AND id=rec_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
      current_version := l.version; before := to_jsonb(l); edition := l.edition_id;
    ELSE
      SELECT * INTO b FROM public.financial_budgets WHERE org_id=_org_id AND id=(_payload->>'budget_id')::uuid FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_BUDGET_INVALID' USING ERRCODE='22023'; END IF;
      edition := b.edition_id;
    END IF;
    PERFORM public.financial_require_operational(_org_id, edition);
    IF rec_id IS NULL THEN
      INSERT INTO public.financial_budget_lines(org_id,edition_id,budget_id,category_id,kind,description,planned_cents,period_start,period_end,notes,extra,created_by,updated_by)
      VALUES(_org_id,edition,b.id,nullif(_payload->>'category_id','')::uuid,coalesce(_payload->>'kind','operacional'),
        btrim(_payload->>'description'),(_payload->>'planned_cents')::bigint,(_payload->>'period_start')::date,(_payload->>'period_end')::date,
        nullif(btrim(_payload->>'notes'),''),public.financial_validate_extra(_org_id,'budget_line',_payload->'extra'),actor,actor) RETURNING * INTO l;
    ELSE
      IF _expected_version IS DISTINCT FROM current_version THEN RAISE EXCEPTION 'FINANCIAL_CONFLICT' USING ERRCODE='40001'; END IF;
      IF (_payload ? 'planned_cents') AND (_payload->>'planned_cents')::bigint IS DISTINCT FROM l.planned_cents
        AND length(btrim(coalesce(_reason,''))) < 3 THEN
        RAISE EXCEPTION 'FINANCIAL_REASON_REQUIRED' USING ERRCODE='22023';
      END IF;
      UPDATE public.financial_budget_lines SET
        category_id = CASE WHEN _payload ? 'category_id' THEN nullif(_payload->>'category_id','')::uuid ELSE category_id END,
        kind = coalesce(_payload->>'kind', kind),
        description = coalesce(btrim(_payload->>'description'), description),
        planned_cents = coalesce((_payload->>'planned_cents')::bigint, planned_cents),
        period_start = CASE WHEN _payload ? 'period_start' THEN (_payload->>'period_start')::date ELSE period_start END,
        period_end = CASE WHEN _payload ? 'period_end' THEN (_payload->>'period_end')::date ELSE period_end END,
        notes = CASE WHEN _payload ? 'notes' THEN nullif(btrim(_payload->>'notes'),'') ELSE notes END,
        extra = CASE WHEN _payload ? 'extra' THEN public.financial_validate_extra(_org_id,'budget_line',_payload->'extra') ELSE extra END,
        active = coalesce((_payload->>'active')::boolean, active),
        version = version + 1, updated_by = actor, updated_at = now()
      WHERE id = rec_id RETURNING * INTO l;
    END IF;
    rec_id := l.id; after := to_jsonb(l);

  ELSIF _entity = 'revenue' THEN
    IF rec_id IS NOT NULL THEN
      SELECT * INTO r FROM public.financial_revenues WHERE org_id=_org_id AND id=rec_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
      edition := r.edition_id; current_version := r.version; before := to_jsonb(r);
      IF r.status = 'confirmada' AND NOT public.financial_can(_org_id,'financial_confirm') THEN
        RAISE EXCEPTION 'FINANCIAL_FORBIDDEN: financial_confirm' USING ERRCODE='42501';
      END IF;
    END IF;
    PERFORM public.financial_require_operational(_org_id, edition);
    IF rec_id IS NULL THEN
      INSERT INTO public.financial_revenues(org_id,edition_id,category_id,description,counterparty,responsible_name,funding_type,status,
        projected_cents,confirmed_cents,competence_date,due_date,notes,extra,created_by,updated_by)
      VALUES(_org_id,edition,nullif(_payload->>'category_id','')::uuid,btrim(_payload->>'description'),nullif(btrim(_payload->>'counterparty'),''),
        nullif(btrim(_payload->>'responsible_name'),''),coalesce(_payload->>'funding_type','nao_identificado'),coalesce(_payload->>'status','projetada'),
        (_payload->>'projected_cents')::bigint,(_payload->>'confirmed_cents')::bigint,(_payload->>'competence_date')::date,(_payload->>'due_date')::date,
        nullif(btrim(_payload->>'notes'),''),public.financial_validate_extra(_org_id,'revenue',_payload->'extra'),actor,actor) RETURNING * INTO r;
    ELSE
      IF _expected_version IS DISTINCT FROM current_version THEN RAISE EXCEPTION 'FINANCIAL_CONFLICT' USING ERRCODE='40001'; END IF;
      IF coalesce(_payload->>'status', r.status) = 'cancelada' AND r.status <> 'cancelada' AND length(btrim(coalesce(_reason,''))) < 3 THEN
        RAISE EXCEPTION 'FINANCIAL_REASON_REQUIRED' USING ERRCODE='22023';
      END IF;
      UPDATE public.financial_revenues SET
        category_id = CASE WHEN _payload ? 'category_id' THEN nullif(_payload->>'category_id','')::uuid ELSE category_id END,
        description = coalesce(btrim(_payload->>'description'), description),
        counterparty = CASE WHEN _payload ? 'counterparty' THEN nullif(btrim(_payload->>'counterparty'),'') ELSE counterparty END,
        responsible_name = CASE WHEN _payload ? 'responsible_name' THEN nullif(btrim(_payload->>'responsible_name'),'') ELSE responsible_name END,
        funding_type = coalesce(_payload->>'funding_type', funding_type),
        status = coalesce(_payload->>'status', status),
        projected_cents = coalesce((_payload->>'projected_cents')::bigint, projected_cents),
        confirmed_cents = CASE WHEN _payload ? 'confirmed_cents' THEN (_payload->>'confirmed_cents')::bigint ELSE confirmed_cents END,
        competence_date = CASE WHEN _payload ? 'competence_date' THEN (_payload->>'competence_date')::date ELSE competence_date END,
        due_date = CASE WHEN _payload ? 'due_date' THEN (_payload->>'due_date')::date ELSE due_date END,
        notes = CASE WHEN _payload ? 'notes' THEN nullif(btrim(_payload->>'notes'),'') ELSE notes END,
        extra = CASE WHEN _payload ? 'extra' THEN public.financial_validate_extra(_org_id,'revenue',_payload->'extra') ELSE extra END,
        version = version + 1, updated_by = actor, updated_at = now()
      WHERE id = rec_id RETURNING * INTO r;
    END IF;
    rec_id := r.id; after := to_jsonb(r);

  ELSIF _entity = 'sponsorship' THEN
    IF rec_id IS NOT NULL THEN
      SELECT * INTO s FROM public.financial_sponsorships WHERE org_id=_org_id AND id=rec_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
      edition := s.edition_id; current_version := s.version; before := to_jsonb(s);
      IF (s.confirmed_free_cents + s.confirmed_rouanet_cents > 0 OR s.negotiation_status = 'confirmado')
        AND NOT public.financial_can(_org_id,'financial_confirm') THEN
        RAISE EXCEPTION 'FINANCIAL_FORBIDDEN: financial_confirm' USING ERRCODE='42501';
      END IF;
    END IF;
    PERFORM public.financial_require_operational(_org_id, edition);
    IF rec_id IS NULL THEN
      INSERT INTO public.financial_sponsorships(org_id,edition_id,name,tier,negotiation_status,responsible_name,declared_cents,
        projected_free_cents,projected_rouanet_cents,confirmed_free_cents,confirmed_rouanet_cents,in_kind_description,in_kind_value_cents,
        vehicle_credentials,summit_credentials,signed_on,due_date,notes,extra,created_by,updated_by)
      VALUES(_org_id,edition,btrim(_payload->>'name'),coalesce(_payload->>'tier','nao_classificado'),coalesce(_payload->>'negotiation_status','prospeccao'),
        nullif(btrim(_payload->>'responsible_name'),''),(_payload->>'declared_cents')::bigint,
        coalesce((_payload->>'projected_free_cents')::bigint,0),coalesce((_payload->>'projected_rouanet_cents')::bigint,0),
        coalesce((_payload->>'confirmed_free_cents')::bigint,0),coalesce((_payload->>'confirmed_rouanet_cents')::bigint,0),
        nullif(btrim(_payload->>'in_kind_description'),''),(_payload->>'in_kind_value_cents')::bigint,
        coalesce((_payload->>'vehicle_credentials')::int,0),coalesce((_payload->>'summit_credentials')::int,0),
        (_payload->>'signed_on')::date,(_payload->>'due_date')::date,nullif(btrim(_payload->>'notes'),''),
        public.financial_validate_extra(_org_id,'sponsorship',_payload->'extra'),actor,actor) RETURNING * INTO s;
    ELSE
      IF _expected_version IS DISTINCT FROM current_version THEN RAISE EXCEPTION 'FINANCIAL_CONFLICT' USING ERRCODE='40001'; END IF;
      UPDATE public.financial_sponsorships SET
        name = coalesce(btrim(_payload->>'name'), name),
        tier = coalesce(_payload->>'tier', tier),
        negotiation_status = coalesce(_payload->>'negotiation_status', negotiation_status),
        responsible_name = CASE WHEN _payload ? 'responsible_name' THEN nullif(btrim(_payload->>'responsible_name'),'') ELSE responsible_name END,
        declared_cents = CASE WHEN _payload ? 'declared_cents' THEN (_payload->>'declared_cents')::bigint ELSE declared_cents END,
        projected_free_cents = coalesce((_payload->>'projected_free_cents')::bigint, projected_free_cents),
        projected_rouanet_cents = coalesce((_payload->>'projected_rouanet_cents')::bigint, projected_rouanet_cents),
        confirmed_free_cents = coalesce((_payload->>'confirmed_free_cents')::bigint, confirmed_free_cents),
        confirmed_rouanet_cents = coalesce((_payload->>'confirmed_rouanet_cents')::bigint, confirmed_rouanet_cents),
        in_kind_description = CASE WHEN _payload ? 'in_kind_description' THEN nullif(btrim(_payload->>'in_kind_description'),'') ELSE in_kind_description END,
        in_kind_value_cents = CASE WHEN _payload ? 'in_kind_value_cents' THEN (_payload->>'in_kind_value_cents')::bigint ELSE in_kind_value_cents END,
        vehicle_credentials = coalesce((_payload->>'vehicle_credentials')::int, vehicle_credentials),
        summit_credentials = coalesce((_payload->>'summit_credentials')::int, summit_credentials),
        signed_on = CASE WHEN _payload ? 'signed_on' THEN (_payload->>'signed_on')::date ELSE signed_on END,
        due_date = CASE WHEN _payload ? 'due_date' THEN (_payload->>'due_date')::date ELSE due_date END,
        notes = CASE WHEN _payload ? 'notes' THEN nullif(btrim(_payload->>'notes'),'') ELSE notes END,
        extra = CASE WHEN _payload ? 'extra' THEN public.financial_validate_extra(_org_id,'sponsorship',_payload->'extra') ELSE extra END,
        version = version + 1, updated_by = actor, updated_at = now()
      WHERE id = rec_id RETURNING * INTO s;
    END IF;
    rec_id := s.id; after := to_jsonb(s);

  ELSIF _entity = 'category' THEN
    edition := NULL;
    IF rec_id IS NULL THEN
      INSERT INTO public.financial_categories(org_id,domain,parent_id,name,sort_order,created_by,updated_by)
      VALUES(_org_id,_payload->>'domain',nullif(_payload->>'parent_id','')::uuid,btrim(_payload->>'name'),
        coalesce((_payload->>'sort_order')::int,0),actor,actor) RETURNING * INTO c;
    ELSE
      SELECT * INTO c FROM public.financial_categories WHERE org_id=_org_id AND id=rec_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
      IF _expected_version IS DISTINCT FROM c.version THEN RAISE EXCEPTION 'FINANCIAL_CONFLICT' USING ERRCODE='40001'; END IF;
      before := to_jsonb(c);
      -- Desativar preserva os vínculos; não existe exclusão de classificação.
      UPDATE public.financial_categories SET name = coalesce(btrim(_payload->>'name'), name),
        sort_order = coalesce((_payload->>'sort_order')::int, sort_order), active = coalesce((_payload->>'active')::boolean, active),
        version = version + 1, updated_by = actor, updated_at = now() WHERE id = rec_id RETURNING * INTO c;
    END IF;
    rec_id := c.id; after := to_jsonb(c);

  ELSIF _entity = 'custom_field' THEN
    edition := NULL;
    IF rec_id IS NULL THEN
      INSERT INTO public.financial_custom_fields(org_id,entity,field_key,label,field_type,required,options,sort_order,created_by,updated_by)
      VALUES(_org_id,_payload->>'entity',_payload->>'field_key',btrim(_payload->>'label'),_payload->>'field_type',
        coalesce((_payload->>'required')::boolean,false),coalesce(_payload->'options','[]'::jsonb),coalesce((_payload->>'sort_order')::int,0),actor,actor)
      RETURNING * INTO f;
    ELSE
      SELECT * INTO f FROM public.financial_custom_fields WHERE org_id=_org_id AND id=rec_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
      IF _expected_version IS DISTINCT FROM f.version THEN RAISE EXCEPTION 'FINANCIAL_CONFLICT' USING ERRCODE='40001'; END IF;
      before := to_jsonb(f);
      -- Tipo e chave são imutáveis para não reinterpretar valores já gravados.
      UPDATE public.financial_custom_fields SET label = coalesce(btrim(_payload->>'label'), label),
        required = coalesce((_payload->>'required')::boolean, required), options = coalesce(_payload->'options', options),
        sort_order = coalesce((_payload->>'sort_order')::int, sort_order), active = coalesce((_payload->>'active')::boolean, active),
        version = version + 1, updated_by = actor, updated_at = now() WHERE id = rec_id RETURNING * INTO f;
    END IF;
    rec_id := f.id; after := to_jsonb(f);

  ELSE -- obligation
    IF rec_id IS NOT NULL THEN
      SELECT * INTO o FROM public.financial_obligations WHERE org_id=_org_id AND id=rec_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
      edition := o.edition_id; before := to_jsonb(o);
    END IF;
    PERFORM public.financial_require_operational(_org_id, edition);
    IF rec_id IS NULL THEN
      INSERT INTO public.financial_obligations(org_id,edition_id,direction,source_type,source_id,description,amount_cents,due_date,created_by,updated_by)
      VALUES(_org_id,edition,_payload->>'direction',coalesce(_payload->>'source_type','manual'),nullif(_payload->>'source_id','')::uuid,
        btrim(_payload->>'description'),(_payload->>'amount_cents')::bigint,(_payload->>'due_date')::date,actor,actor) RETURNING * INTO o;
    ELSE
      IF _expected_version IS DISTINCT FROM o.version THEN RAISE EXCEPTION 'FINANCIAL_CONFLICT' USING ERRCODE='40001'; END IF;
      IF (_payload ? 'amount_cents') AND (_payload->>'amount_cents')::bigint <
        coalesce((SELECT sum(amount_cents) FROM public.financial_movement_allocations WHERE obligation_id = o.id),0) THEN
        RAISE EXCEPTION 'FINANCIAL_OBLIGATION_BELOW_SETTLED' USING ERRCODE='23514';
      END IF;
      IF _payload->>'status' = 'cancelada' AND length(btrim(coalesce(_reason,''))) < 3 THEN
        RAISE EXCEPTION 'FINANCIAL_REASON_REQUIRED' USING ERRCODE='22023';
      END IF;
      UPDATE public.financial_obligations SET
        description = coalesce(btrim(_payload->>'description'), description),
        amount_cents = coalesce((_payload->>'amount_cents')::bigint, amount_cents),
        due_date = CASE WHEN _payload ? 'due_date' THEN (_payload->>'due_date')::date ELSE due_date END,
        status = coalesce(_payload->>'status', status),
        cancel_reason = CASE WHEN _payload->>'status' = 'cancelada' THEN btrim(_reason) ELSE cancel_reason END,
        version = version + 1, updated_by = actor, updated_at = now()
      WHERE id = rec_id RETURNING * INTO o;
    END IF;
    rec_id := o.id; after := to_jsonb(o);
  END IF;

  PERFORM public.financial_audit(_org_id, edition, _entity, rec_id,
    CASE WHEN before IS NULL THEN 'create' ELSE 'update' END, before, after, _reason);
  RETURN public.financial_finish(_org_id, 'save:'||_entity, _request_id, after);
END $$;

-- ---------------------------------------------------------------- movimentos
-- Registra fato já ocorrido (não executa transferência). A soma das alocações é
-- exatamente o valor do movimento e nenhuma obrigação fica acima do seu valor.
CREATE OR REPLACE FUNCTION public.financial_record_movement(_org_id uuid, _payload jsonb, _allocations jsonb, _request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid; replay jsonb; m public.financial_movements; item jsonb; o public.financial_obligations;
  allocated bigint := 0; settled bigint; edition uuid := (_payload->>'edition_id')::uuid; expected_direction text;
BEGIN
  actor := public.financial_require(_org_id, 'financial_settle');
  replay := public.financial_begin(_org_id, 'movement', _request_id, jsonb_build_object('p',_payload,'a',_allocations));
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  PERFORM public.financial_require_operational(_org_id, edition);
  IF _payload->>'kind' = 'estorno' THEN RAISE EXCEPTION 'FINANCIAL_USE_REVERSAL' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(_allocations) <> 'array' OR jsonb_array_length(_allocations) = 0 THEN
    RAISE EXCEPTION 'FINANCIAL_ALLOCATION_REQUIRED' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.financial_movements(org_id,edition_id,kind,direction,amount_cents,occurred_on,method,reference,responsible_name,document_path,notes,created_by)
  VALUES(_org_id,edition,_payload->>'kind',_payload->>'direction',(_payload->>'amount_cents')::bigint,(_payload->>'occurred_on')::date,
    nullif(btrim(_payload->>'method'),''),nullif(btrim(_payload->>'reference'),''),nullif(btrim(_payload->>'responsible_name'),''),
    nullif(btrim(_payload->>'document_path'),''),nullif(btrim(_payload->>'notes'),''),actor) RETURNING * INTO m;
  -- Devolução é o movimento oposto aplicado à mesma obrigação (reduz a quitação).
  expected_direction := CASE m.direction WHEN 'entrada' THEN 'receber' ELSE 'pagar' END;
  IF m.kind = 'devolucao' THEN expected_direction := CASE m.direction WHEN 'saida' THEN 'receber' ELSE 'pagar' END; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
    SELECT * INTO o FROM public.financial_obligations WHERE org_id=_org_id AND id=(item->>'obligation_id')::uuid FOR UPDATE;
    IF NOT FOUND OR o.edition_id <> edition THEN RAISE EXCEPTION 'FINANCIAL_OBLIGATION_INVALID' USING ERRCODE='22023'; END IF;
    IF o.status <> 'aberta' THEN RAISE EXCEPTION 'FINANCIAL_OBLIGATION_CLOSED' USING ERRCODE='23514'; END IF;
    IF o.direction <> expected_direction THEN RAISE EXCEPTION 'FINANCIAL_DIRECTION_MISMATCH' USING ERRCODE='22023'; END IF;
    IF (item->>'amount_cents')::bigint <= 0 THEN RAISE EXCEPTION 'FINANCIAL_ALLOCATION_INVALID' USING ERRCODE='22023'; END IF;
    INSERT INTO public.financial_movement_allocations(org_id,movement_id,obligation_id,amount_cents)
    VALUES(_org_id,m.id,o.id,CASE WHEN m.kind = 'devolucao' THEN -1 ELSE 1 END * (item->>'amount_cents')::bigint);
    SELECT coalesce(sum(amount_cents),0) INTO settled FROM public.financial_movement_allocations WHERE obligation_id = o.id;
    IF settled > o.amount_cents OR settled < 0 THEN RAISE EXCEPTION 'FINANCIAL_OVER_SETTLEMENT' USING ERRCODE='23514'; END IF;
    allocated := allocated + (item->>'amount_cents')::bigint;
  END LOOP;
  IF allocated <> m.amount_cents THEN RAISE EXCEPTION 'FINANCIAL_ALLOCATION_MISMATCH' USING ERRCODE='23514'; END IF;
  PERFORM public.financial_audit(_org_id, edition, 'movement', m.id, 'create', NULL,
    to_jsonb(m) || jsonb_build_object('allocations', _allocations), NULL);
  RETURN public.financial_finish(_org_id, 'movement', _request_id, to_jsonb(m));
END $$;

-- Estorno integral e vinculado; o movimento original permanece como evidência.
CREATE OR REPLACE FUNCTION public.financial_reverse_movement(_org_id uuid, _movement_id uuid, _reason text, _occurred_on date, _request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid; replay jsonb; original public.financial_movements; m public.financial_movements;
BEGIN
  actor := public.financial_require(_org_id, 'financial_settle');
  replay := public.financial_begin(_org_id, 'reverse', _request_id, jsonb_build_object('m',_movement_id,'r',_reason,'d',_occurred_on));
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF length(btrim(coalesce(_reason,''))) < 3 THEN RAISE EXCEPTION 'FINANCIAL_REASON_REQUIRED' USING ERRCODE='22023'; END IF;
  SELECT * INTO original FROM public.financial_movements WHERE org_id=_org_id AND id=_movement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF original.kind = 'estorno' THEN RAISE EXCEPTION 'FINANCIAL_REVERSAL_OF_REVERSAL' USING ERRCODE='23514'; END IF;
  PERFORM public.financial_require_operational(_org_id, original.edition_id);
  INSERT INTO public.financial_movements(org_id,edition_id,kind,direction,amount_cents,occurred_on,reference,reverses_movement_id,notes,created_by)
  VALUES(_org_id,original.edition_id,'estorno',CASE original.direction WHEN 'entrada' THEN 'saida' ELSE 'entrada' END,
    original.amount_cents,coalesce(_occurred_on,current_date),original.reference,original.id,btrim(_reason),actor) RETURNING * INTO m;
  INSERT INTO public.financial_movement_allocations(org_id,movement_id,obligation_id,amount_cents)
    SELECT _org_id, m.id, a.obligation_id, -a.amount_cents FROM public.financial_movement_allocations a WHERE a.movement_id = original.id;
  PERFORM public.financial_audit(_org_id, original.edition_id, 'movement', m.id, 'reverse', to_jsonb(original), to_jsonb(m), _reason);
  RETURN public.financial_finish(_org_id, 'reverse', _request_id, to_jsonb(m));
END $$;

-- ---------------------------------------------------------------- cenários
CREATE OR REPLACE FUNCTION public.financial_save_scenario(_org_id uuid, _edition_id uuid, _key text, _assumptions jsonb, _notes text, _request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid; replay jsonb; s public.financial_scenarios; k text;
BEGIN
  actor := public.financial_require(_org_id, 'financial_edit');
  replay := public.financial_begin(_org_id, 'scenario', _request_id, jsonb_build_object('e',_edition_id,'k',_key,'a',_assumptions,'n',_notes));
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  PERFORM public.financial_require_operational(_org_id, _edition_id);
  FOR k IN SELECT jsonb_object_keys(_assumptions) LOOP
    IF k NOT IN ('commercialization','exporural','externalArea','agroindustryPavilion','foodPoints','parking','freeSponsorship',
      'rouanetSponsorship','operatingExecution','historicalObligations','reserve') OR jsonb_typeof(_assumptions->k) <> 'number' THEN
      RAISE EXCEPTION 'FINANCIAL_SCENARIO_ASSUMPTION_INVALID: %', k USING ERRCODE='22023';
    END IF;
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended(_edition_id::text || _key, 31028));
  INSERT INTO public.financial_scenarios(org_id,edition_id,scenario_key,version,assumptions,notes,created_by)
  VALUES(_org_id,_edition_id,_key,coalesce((SELECT max(version) FROM public.financial_scenarios WHERE edition_id=_edition_id AND scenario_key=_key),0)+1,
    _assumptions,nullif(btrim(_notes),''),actor) RETURNING * INTO s;
  PERFORM public.financial_audit(_org_id, _edition_id, 'scenario', s.id, 'create', NULL, to_jsonb(s), NULL);
  RETURN public.financial_finish(_org_id, 'scenario', _request_id, to_jsonb(s));
END $$;

-- ---------------------------------------------------------------- consolidação
-- Totais agregados no servidor, sem paginação e sem joins com anexos.
CREATE OR REPLACE FUNCTION public.financial_edition_summary(_org_id uuid, _edition_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb; edition public.financial_editions;
BEGIN
  PERFORM public.financial_require(_org_id, 'financial_access');
  SELECT * INTO edition FROM public.financial_editions WHERE org_id=_org_id AND id=_edition_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  WITH budgets AS (
    SELECT count(*) n, coalesce(sum(budget_cap_cents),0) cap, count(*) FILTER (WHERE budget_cap_cents IS NULL) uncapped
    FROM public.financial_budgets WHERE edition_id=_edition_id
  ), lines AS (
    SELECT coalesce(sum(planned_cents),0) planned, count(*) n FROM public.financial_budget_lines WHERE edition_id=_edition_id AND active
  ), revenues AS (
    SELECT coalesce(sum(projected_cents) FILTER (WHERE status <> 'cancelada'),0) projected,
      coalesce(sum(confirmed_cents) FILTER (WHERE status = 'confirmada'),0) confirmed, count(*) n
    FROM public.financial_revenues WHERE edition_id=_edition_id
  ), sponsors AS (
    SELECT coalesce(sum(projected_free_cents+projected_rouanet_cents) FILTER (WHERE negotiation_status <> 'cancelado'),0) projected,
      coalesce(sum(confirmed_free_cents+confirmed_rouanet_cents) FILTER (WHERE negotiation_status <> 'cancelado'),0) confirmed,
      coalesce(sum(declared_cents) FILTER (WHERE negotiation_status <> 'cancelado'),0) declared,
      coalesce(sum(in_kind_value_cents) FILTER (WHERE negotiation_status <> 'cancelado'),0) in_kind, count(*) n
    FROM public.financial_sponsorships WHERE edition_id=_edition_id
  ), settled AS (
    SELECT a.obligation_id, sum(a.amount_cents) settled FROM public.financial_movement_allocations a
    JOIN public.financial_obligations o ON o.id = a.obligation_id AND o.edition_id = _edition_id GROUP BY a.obligation_id
  ), obligations AS (
    SELECT
      coalesce(sum(o.amount_cents - coalesce(s.settled,0)) FILTER (WHERE o.direction='receber' AND o.status='aberta'),0) receivable,
      coalesce(sum(coalesce(s.settled,0)) FILTER (WHERE o.direction='receber'),0) received,
      coalesce(sum(o.amount_cents - coalesce(s.settled,0)) FILTER (WHERE o.direction='pagar' AND o.status='aberta'),0) payable,
      coalesce(sum(coalesce(s.settled,0)) FILTER (WHERE o.direction='pagar'),0) paid,
      count(*) FILTER (WHERE o.status='aberta' AND o.due_date < current_date AND o.amount_cents > coalesce(s.settled,0)) overdue
    FROM public.financial_obligations o LEFT JOIN settled s ON s.obligation_id = o.id WHERE o.edition_id=_edition_id
  ), movements AS (
    SELECT coalesce(sum(amount_cents) FILTER (WHERE direction='entrada'),0) inflow,
      coalesce(sum(amount_cents) FILTER (WHERE direction='saida'),0) outflow, count(*) n
    FROM public.financial_movements WHERE edition_id=_edition_id
  )
  SELECT jsonb_build_object(
    'edition', to_jsonb(edition),
    'budget', jsonb_build_object('count',b.n,'cap_cents',b.cap,'uncapped_count',b.uncapped,'planned_cents',l.planned,'line_count',l.n),
    'revenue', jsonb_build_object('count',r.n,'projected_cents',r.projected,'confirmed_cents',r.confirmed),
    'sponsorship', jsonb_build_object('count',sp.n,'declared_cents',sp.declared,'projected_cents',sp.projected,'confirmed_cents',sp.confirmed,'in_kind_cents',sp.in_kind),
    'obligations', jsonb_build_object('receivable_open_cents',o.receivable,'received_cents',o.received,'payable_open_cents',o.payable,'paid_cents',o.paid,'overdue_count',o.overdue),
    'movements', jsonb_build_object('count',m.n,'inflow_cents',m.inflow,'outflow_cents',m.outflow)
  ) INTO result FROM budgets b, lines l, revenues r, sponsors sp, obligations o, movements m;
  RETURN result;
END $$;

-- ---------------------------------------------------------------- permissões de execução
REVOKE ALL ON FUNCTION public.financial_require(uuid,text), public.financial_require_operational(uuid,uuid),
  public.financial_begin(uuid,text,uuid,jsonb), public.financial_finish(uuid,text,uuid,jsonb),
  public.financial_audit(uuid,uuid,text,uuid,text,jsonb,jsonb,text), public.financial_validate_extra(uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financial_save(uuid,text,jsonb,integer,uuid,text), public.financial_record_movement(uuid,jsonb,jsonb,uuid),
  public.financial_reverse_movement(uuid,uuid,text,date,uuid), public.financial_save_scenario(uuid,uuid,text,jsonb,text,uuid),
  public.financial_edition_summary(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_save(uuid,text,jsonb,integer,uuid,text), public.financial_record_movement(uuid,jsonb,jsonb,uuid),
  public.financial_reverse_movement(uuid,uuid,text,date,uuid), public.financial_save_scenario(uuid,uuid,text,jsonb,text,uuid),
  public.financial_edition_summary(uuid,uuid) TO authenticated;

-- ---------------------------------------------------------------- edições iniciais
-- Apenas os registros de edição: nenhum valor, saldo ou patrocinador é copiado.
INSERT INTO public.financial_editions(org_id, code, label, status, period_start, period_end)
SELECT o.id, 2026, 'Fenasoja 2026 · Histórico', 'historico', DATE '2025-06-01', DATE '2026-06-30' FROM public.organizations o
ON CONFLICT (org_id, code) DO NOTHING;
INSERT INTO public.financial_editions(org_id, code, label, status, period_start, period_end)
SELECT o.id, 2028, 'Fenasoja 2028', 'operacional', DATE '2026-06-04', DATE '2028-06-20' FROM public.organizations o
ON CONFLICT (org_id, code) DO NOTHING;

-- ================================================================ execução × liquidação
-- Cada registro tem quatro estágios independentes: previsto, executado
-- (realizado/comprometido ou confirmado), liquidado (pago/recebido, só por
-- alocação de movimentos) e saldo em aberto. Execução orçamentária usa o
-- executado; caixa usa o liquidado. Nunca se deduz um do outro.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS financial_edition_id uuid,
  ADD COLUMN IF NOT EXISTS financial_commission_id uuid,
  ADD COLUMN IF NOT EXISTS financial_budget_line_id uuid,
  ADD COLUMN IF NOT EXISTS planned_cents bigint,
  ADD COLUMN IF NOT EXISTS committed_cents bigint,
  ADD COLUMN IF NOT EXISTS committed_on date,
  ADD COLUMN IF NOT EXISTS financial_due_date date,
  ADD COLUMN IF NOT EXISTS financial_status text,
  ADD COLUMN IF NOT EXISTS financial_version integer NOT NULL DEFAULT 1;
DO $$ BEGIN
  ALTER TABLE public.expenses ADD CONSTRAINT expenses_financial_values_chk CHECK (
    (planned_cents IS NULL OR planned_cents >= 0) AND (committed_cents IS NULL OR committed_cents >= 0)
    AND (financial_status IS NULL OR financial_status IN ('prevista','realizada','cancelada'))
    AND ((financial_edition_id IS NULL) = (financial_status IS NULL))
    AND (financial_status IS DISTINCT FROM 'realizada' OR (committed_cents > 0 AND committed_on IS NOT NULL)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.expenses ADD CONSTRAINT expenses_financial_edition_fk
    FOREIGN KEY (org_id, financial_edition_id) REFERENCES public.financial_editions(org_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.expenses ADD CONSTRAINT expenses_financial_line_fk
    FOREIGN KEY (financial_budget_line_id) REFERENCES public.financial_budget_lines(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS expenses_financial_edition_idx ON public.expenses(financial_edition_id) WHERE financial_edition_id IS NOT NULL;

ALTER TABLE public.financial_obligations ADD COLUMN IF NOT EXISTS settlement_inconsistent boolean NOT NULL DEFAULT false;
-- Uma obrigação por origem: a ponte única entre execução e caixa.
CREATE UNIQUE INDEX IF NOT EXISTS financial_obligations_source_uidx
  ON public.financial_obligations(source_type, source_id) WHERE source_type <> 'manual';

-- Cria/ajusta a obrigação vinculada à origem na mesma transação do cadastro.
CREATE OR REPLACE FUNCTION public.financial_sync_source_obligation(_org_id uuid, _edition_id uuid, _direction text,
  _source_type text, _source_id uuid, _description text, _amount_cents bigint, _due_date date, _active boolean, _actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.financial_obligations; settled bigint := 0;
BEGIN
  SELECT * INTO o FROM public.financial_obligations WHERE source_type=_source_type AND source_id=_source_id FOR UPDATE;
  IF FOUND THEN
    SELECT coalesce(sum(amount_cents),0) INTO settled FROM public.financial_movement_allocations WHERE obligation_id = o.id;
  END IF;
  IF _active AND coalesce(_amount_cents,0) > 0 THEN
    IF o.id IS NULL THEN
      INSERT INTO public.financial_obligations(org_id,edition_id,direction,source_type,source_id,description,amount_cents,due_date,created_by,updated_by)
      VALUES(_org_id,_edition_id,_direction,_source_type,_source_id,left(btrim(_description),240),_amount_cents,_due_date,_actor,_actor);
    ELSE
      IF _amount_cents < settled THEN RAISE EXCEPTION 'FINANCIAL_OBLIGATION_BELOW_SETTLED' USING ERRCODE='23514'; END IF;
      UPDATE public.financial_obligations SET amount_cents=_amount_cents, due_date=_due_date, description=left(btrim(_description),240),
        status='aberta', cancel_reason=NULL, settlement_inconsistent=false, version=version+1, updated_by=_actor, updated_at=now()
      WHERE id=o.id;
    END IF;
  ELSIF o.id IS NOT NULL AND o.status = 'aberta' THEN
    IF settled = 0 THEN
      UPDATE public.financial_obligations SET status='cancelada', cancel_reason='Origem cancelada ou não executada',
        version=version+1, updated_by=_actor, updated_at=now() WHERE id=o.id;
    ELSE
      -- Liquidação já registrada não é apagada: exige estorno/devolução explícito.
      UPDATE public.financial_obligations SET settlement_inconsistent=true, version=version+1, updated_by=_actor, updated_at=now()
      WHERE id=o.id;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.financial_revenue_obligation_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.financial_sync_source_obligation(NEW.org_id, NEW.edition_id, 'receber', 'receita', NEW.id, NEW.description,
    NEW.confirmed_cents, NEW.due_date, NEW.status = 'confirmada', NEW.updated_by);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS financial_revenue_obligation ON public.financial_revenues;
CREATE TRIGGER financial_revenue_obligation AFTER INSERT OR UPDATE ON public.financial_revenues
  FOR EACH ROW EXECUTE FUNCTION public.financial_revenue_obligation_trg();

CREATE OR REPLACE FUNCTION public.financial_sponsorship_obligation_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.financial_sync_source_obligation(NEW.org_id, NEW.edition_id, 'receber', 'patrocinio', NEW.id, 'Patrocínio · '||NEW.name,
    NEW.confirmed_free_cents + NEW.confirmed_rouanet_cents, NEW.due_date, NEW.negotiation_status <> 'cancelado', NEW.updated_by);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS financial_sponsorship_obligation ON public.financial_sponsorships;
CREATE TRIGGER financial_sponsorship_obligation AFTER INSERT OR UPDATE ON public.financial_sponsorships
  FOR EACH ROW EXECUTE FUNCTION public.financial_sponsorship_obligation_trg();

CREATE OR REPLACE FUNCTION public.financial_expense_obligation_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.financial_edition_id IS NULL THEN RETURN NEW; END IF; -- despesas logísticas sem edição ficam fora
  PERFORM public.financial_sync_source_obligation(NEW.org_id, NEW.financial_edition_id, 'pagar', 'despesa', NEW.id, NEW.title,
    NEW.committed_cents, NEW.financial_due_date, NEW.financial_status = 'realizada', coalesce(auth.uid(), NEW.created_by_user_id));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS financial_expense_obligation ON public.expenses;
CREATE TRIGGER financial_expense_obligation AFTER INSERT OR UPDATE OF financial_edition_id, committed_cents, financial_due_date, financial_status, title
  ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.financial_expense_obligation_trg();

-- Cadastro financeiro de despesa 2028: previsto e realizado são informados;
-- pago e saldo nunca vêm do payload.
CREATE OR REPLACE FUNCTION public.financial_save_expense(_org_id uuid, _payload jsonb, _expected_version integer, _request_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid; replay jsonb; rec_id uuid := nullif(_payload->>'id','')::uuid; e public.expenses; before jsonb;
  edition uuid := nullif(_payload->>'edition_id','')::uuid; line public.financial_budget_lines; next_status text;
BEGIN
  actor := public.financial_require(_org_id, 'financial_edit');
  replay := public.financial_begin(_org_id, 'save:expense', _request_id, jsonb_build_object('p',_payload,'v',_expected_version,'r',_reason));
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF rec_id IS NOT NULL THEN
    SELECT * INTO e FROM public.expenses WHERE org_id=_org_id AND id=rec_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    IF e.financial_edition_id IS NOT NULL THEN
      edition := e.financial_edition_id;
      IF _expected_version IS DISTINCT FROM e.financial_version THEN RAISE EXCEPTION 'FINANCIAL_CONFLICT' USING ERRCODE='40001'; END IF;
    END IF;
    before := to_jsonb(e);
  END IF;
  PERFORM public.financial_require_operational(_org_id, edition);
  next_status := coalesce(_payload->>'financial_status', e.financial_status, 'prevista');
  IF next_status = 'realizada' AND NOT public.financial_can(_org_id,'financial_confirm') THEN
    RAISE EXCEPTION 'FINANCIAL_FORBIDDEN: financial_confirm' USING ERRCODE='42501';
  END IF;
  IF next_status = 'cancelada' AND e.financial_status IS DISTINCT FROM 'cancelada' AND length(btrim(coalesce(_reason,''))) < 3 THEN
    RAISE EXCEPTION 'FINANCIAL_REASON_REQUIRED' USING ERRCODE='22023';
  END IF;
  IF nullif(_payload->>'budget_line_id','') IS NOT NULL THEN
    SELECT * INTO line FROM public.financial_budget_lines WHERE org_id=_org_id AND id=(_payload->>'budget_line_id')::uuid;
    IF NOT FOUND OR line.edition_id <> edition THEN RAISE EXCEPTION 'FINANCIAL_BUDGET_INVALID' USING ERRCODE='22023'; END IF;
  END IF;
  IF nullif(_payload->>'commission_id','') IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM public.commissions WHERE id=(_payload->>'commission_id')::uuid AND org_id=_org_id) THEN
    RAISE EXCEPTION 'FINANCIAL_COMMISSION_INVALID' USING ERRCODE='22023';
  END IF;
  IF rec_id IS NULL THEN
    INSERT INTO public.expenses(org_id,title,description,amount,status,created_by_user_id,origem_lancamento,cycle_year,
      financial_edition_id,financial_commission_id,financial_budget_line_id,planned_cents,committed_cents,committed_on,financial_due_date,financial_status)
    VALUES(_org_id,btrim(_payload->>'title'),nullif(btrim(_payload->>'description'),''),
      coalesce((_payload->>'committed_cents')::bigint,(_payload->>'planned_cents')::bigint,0)/100.0,'rascunho',actor,'financeiro',2028,
      edition,nullif(_payload->>'commission_id','')::uuid,nullif(_payload->>'budget_line_id','')::uuid,
      (_payload->>'planned_cents')::bigint,(_payload->>'committed_cents')::bigint,(_payload->>'committed_on')::date,(_payload->>'due_date')::date,next_status)
    RETURNING * INTO e;
  ELSE
    -- Vincular uma despesa logística existente não muda seus campos logísticos (amount/status).
    UPDATE public.expenses SET
      title = coalesce(btrim(_payload->>'title'), title),
      financial_edition_id = edition,
      financial_commission_id = CASE WHEN _payload ? 'commission_id' THEN nullif(_payload->>'commission_id','')::uuid ELSE financial_commission_id END,
      financial_budget_line_id = CASE WHEN _payload ? 'budget_line_id' THEN nullif(_payload->>'budget_line_id','')::uuid ELSE financial_budget_line_id END,
      planned_cents = CASE WHEN _payload ? 'planned_cents' THEN (_payload->>'planned_cents')::bigint ELSE planned_cents END,
      committed_cents = CASE WHEN _payload ? 'committed_cents' THEN (_payload->>'committed_cents')::bigint ELSE committed_cents END,
      committed_on = CASE WHEN _payload ? 'committed_on' THEN (_payload->>'committed_on')::date ELSE committed_on END,
      financial_due_date = CASE WHEN _payload ? 'due_date' THEN (_payload->>'due_date')::date ELSE financial_due_date END,
      financial_status = next_status,
      financial_version = financial_version + 1, updated_at = now()
    WHERE id = rec_id RETURNING * INTO e;
  END IF;
  PERFORM public.financial_audit(_org_id, edition, 'expense', e.id, CASE WHEN before IS NULL THEN 'create' ELSE 'update' END, before, to_jsonb(e), _reason);
  RETURN public.financial_finish(_org_id, 'save:expense', _request_id, to_jsonb(e));
END $$;

-- Execução por comissão e linha: previsto, realizado, pago e saldo a pagar.
CREATE OR REPLACE FUNCTION public.financial_budget_execution(_org_id uuid, _edition_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.financial_require(_org_id, 'financial_access');
  WITH settled AS (
    SELECT a.obligation_id, sum(a.amount_cents) v FROM public.financial_movement_allocations a GROUP BY a.obligation_id
  ), exp AS (
    SELECT e.financial_budget_line_id line_id, coalesce(l.budget_id, b2.id) budget_id,
      CASE WHEN e.financial_status <> 'cancelada' THEN coalesce(e.planned_cents,0) ELSE 0 END planned,
      CASE WHEN e.financial_status = 'realizada' THEN e.committed_cents ELSE 0 END committed,
      coalesce(s.v,0) paid
    FROM public.expenses e
    LEFT JOIN public.financial_budget_lines l ON l.id = e.financial_budget_line_id
    LEFT JOIN public.financial_budgets b2 ON b2.edition_id = _edition_id AND b2.commission_id = e.financial_commission_id
    LEFT JOIN public.financial_obligations o ON o.source_type='despesa' AND o.source_id=e.id
    LEFT JOIN settled s ON s.obligation_id = o.id
    WHERE e.org_id=_org_id AND e.financial_edition_id=_edition_id
  )
  SELECT jsonb_build_object(
    'budgets', coalesce((SELECT jsonb_agg(jsonb_build_object('budget_id',budget_id,'expense_planned_cents',sum_p,'committed_cents',sum_c,
        'paid_cents',sum_paid,'payable_open_cents',greatest(sum_c-sum_paid,0)))
      FROM (SELECT budget_id, sum(planned) sum_p, sum(committed) sum_c, sum(paid) sum_paid FROM exp WHERE budget_id IS NOT NULL GROUP BY budget_id) x),'[]'::jsonb),
    'lines', coalesce((SELECT jsonb_agg(jsonb_build_object('line_id',line_id,'expense_planned_cents',sum_p,'committed_cents',sum_c,
        'paid_cents',sum_paid,'payable_open_cents',greatest(sum_c-sum_paid,0)))
      FROM (SELECT line_id, sum(planned) sum_p, sum(committed) sum_c, sum(paid) sum_paid FROM exp WHERE line_id IS NOT NULL GROUP BY line_id) y),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

-- Consolidação com estágios separados (substitui a versão anterior).
CREATE OR REPLACE FUNCTION public.financial_edition_summary(_org_id uuid, _edition_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb; edition public.financial_editions;
BEGIN
  PERFORM public.financial_require(_org_id, 'financial_access');
  SELECT * INTO edition FROM public.financial_editions WHERE org_id=_org_id AND id=_edition_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  WITH budgets AS (
    SELECT count(*) n, coalesce(sum(budget_cap_cents),0) cap, count(*) FILTER (WHERE budget_cap_cents IS NULL) uncapped
    FROM public.financial_budgets WHERE edition_id=_edition_id
  ), lines AS (
    SELECT coalesce(sum(planned_cents),0) planned, count(*) n FROM public.financial_budget_lines WHERE edition_id=_edition_id AND active
  ), revenues AS (
    SELECT coalesce(sum(projected_cents) FILTER (WHERE status <> 'cancelada'),0) projected,
      coalesce(sum(confirmed_cents) FILTER (WHERE status = 'confirmada'),0) confirmed, count(*) n
    FROM public.financial_revenues WHERE edition_id=_edition_id
  ), sponsors AS (
    SELECT coalesce(sum(projected_free_cents+projected_rouanet_cents) FILTER (WHERE negotiation_status <> 'cancelado'),0) projected,
      coalesce(sum(confirmed_free_cents+confirmed_rouanet_cents) FILTER (WHERE negotiation_status <> 'cancelado'),0) confirmed,
      coalesce(sum(declared_cents) FILTER (WHERE negotiation_status <> 'cancelado'),0) declared,
      coalesce(sum(in_kind_value_cents) FILTER (WHERE negotiation_status <> 'cancelado'),0) in_kind, count(*) n
    FROM public.financial_sponsorships WHERE edition_id=_edition_id
  ), expenses_exec AS (
    SELECT coalesce(sum(planned_cents) FILTER (WHERE financial_status <> 'cancelada'),0) planned,
      coalesce(sum(committed_cents) FILTER (WHERE financial_status = 'realizada'),0) committed, count(*) n
    FROM public.expenses WHERE org_id=_org_id AND financial_edition_id=_edition_id
  ), settled AS (
    SELECT a.obligation_id, sum(a.amount_cents) settled FROM public.financial_movement_allocations a
    JOIN public.financial_obligations o ON o.id = a.obligation_id AND o.edition_id = _edition_id GROUP BY a.obligation_id
  ), obligations AS (
    SELECT
      coalesce(sum(o.amount_cents - coalesce(s.settled,0)) FILTER (WHERE o.direction='receber' AND o.status='aberta' AND NOT o.settlement_inconsistent),0) receivable,
      coalesce(sum(coalesce(s.settled,0)) FILTER (WHERE o.direction='receber'),0) received,
      coalesce(sum(o.amount_cents - coalesce(s.settled,0)) FILTER (WHERE o.direction='pagar' AND o.status='aberta' AND NOT o.settlement_inconsistent),0) payable,
      coalesce(sum(coalesce(s.settled,0)) FILTER (WHERE o.direction='pagar'),0) paid,
      count(*) FILTER (WHERE o.direction='receber' AND o.status='aberta' AND o.due_date < current_date AND o.amount_cents > coalesce(s.settled,0)) overdue_receivable,
      count(*) FILTER (WHERE o.direction='pagar' AND o.status='aberta' AND o.due_date < current_date AND o.amount_cents > coalesce(s.settled,0)) overdue_payable,
      count(*) FILTER (WHERE o.settlement_inconsistent) inconsistent
    FROM public.financial_obligations o LEFT JOIN settled s ON s.obligation_id = o.id WHERE o.edition_id=_edition_id
  ), movements AS (
    SELECT coalesce(sum(amount_cents) FILTER (WHERE direction='entrada'),0) inflow,
      coalesce(sum(amount_cents) FILTER (WHERE direction='saida'),0) outflow, count(*) n
    FROM public.financial_movements WHERE edition_id=_edition_id
  )
  SELECT jsonb_build_object(
    'edition', to_jsonb(edition),
    'budget', jsonb_build_object('count',b.n,'cap_cents',b.cap,'uncapped_count',b.uncapped,'planned_cents',l.planned,'line_count',l.n,
      'committed_cents',x.committed),
    'revenue', jsonb_build_object('count',r.n,'projected_cents',r.projected,'confirmed_cents',r.confirmed),
    'sponsorship', jsonb_build_object('count',sp.n,'declared_cents',sp.declared,'projected_cents',sp.projected,'confirmed_cents',sp.confirmed,'in_kind_cents',sp.in_kind),
    'expenses', jsonb_build_object('count',x.n,'planned_cents',x.planned,'committed_cents',x.committed,'paid_cents',o.paid,
      'payable_open_cents',o.payable,'overdue_count',o.overdue_payable),
    'revenues', jsonb_build_object('projected_cents',r.projected+sp.projected,'confirmed_cents',r.confirmed+sp.confirmed,
      'received_cents',o.received,'receivable_open_cents',o.receivable,'overdue_count',o.overdue_receivable),
    'obligations', jsonb_build_object('receivable_open_cents',o.receivable,'received_cents',o.received,'payable_open_cents',o.payable,
      'paid_cents',o.paid,'overdue_count',o.overdue_receivable+o.overdue_payable,'inconsistent_count',o.inconsistent),
    'movements', jsonb_build_object('count',m.n,'inflow_cents',m.inflow,'outflow_cents',m.outflow)
  ) INTO result FROM budgets b, lines l, revenues r, sponsors sp, expenses_exec x, obligations o, movements m;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.financial_sync_source_obligation(uuid,uuid,text,text,uuid,text,bigint,date,boolean,uuid),
  public.financial_revenue_obligation_trg(), public.financial_sponsorship_obligation_trg(), public.financial_expense_obligation_trg()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financial_save_expense(uuid,jsonb,integer,uuid,text), public.financial_budget_execution(uuid,uuid),
  public.financial_edition_summary(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_save_expense(uuid,jsonb,integer,uuid,text), public.financial_budget_execution(uuid,uuid),
  public.financial_edition_summary(uuid,uuid) TO authenticated;
