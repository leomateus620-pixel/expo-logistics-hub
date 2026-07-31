-- 1. Agenda operacional do Restaurante em venue_events
ALTER TABLE public.venue_events
  ADD COLUMN IF NOT EXISTS confirmation_status text NOT NULL DEFAULT 'nao_informado',
  ADD COLUMN IF NOT EXISTS contract_status text NOT NULL DEFAULT 'nao_informado',
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'nao_informado',
  ADD COLUMN IF NOT EXISTS shift text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS fee_type text,
  ADD COLUMN IF NOT EXISTS fee_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS fee_quantity numeric(10,2),
  ADD COLUMN IF NOT EXISTS cleaning_responsibility text,
  ADD COLUMN IF NOT EXISTS cleaning_fee numeric(14,2),
  ADD COLUMN IF NOT EXISTS electricity_fee text,
  ADD COLUMN IF NOT EXISTS preparation_notes text,
  ADD COLUMN IF NOT EXISTS preparation_start_date date,
  ADD COLUMN IF NOT EXISTS preparation_end_date date,
  ADD COLUMN IF NOT EXISTS teardown_deadline_note text,
  ADD COLUMN IF NOT EXISTS reservation_start_date date,
  ADD COLUMN IF NOT EXISTS reservation_end_date date,
  ADD COLUMN IF NOT EXISTS operational_notes text,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS requires_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reasons text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_document text,
  ADD COLUMN IF NOT EXISTS source_row integer,
  ADD COLUMN IF NOT EXISTS source_fingerprint text,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid;

ALTER TABLE public.venue_events
  DROP CONSTRAINT IF EXISTS venue_events_confirmation_status_check;
ALTER TABLE public.venue_events
  ADD CONSTRAINT venue_events_confirmation_status_check
  CHECK (confirmation_status = ANY (ARRAY['nao_informado','confirmado','nao_confirmado','a_acertar','cancelado']));

ALTER TABLE public.venue_events
  DROP CONSTRAINT IF EXISTS venue_events_contract_status_check;
ALTER TABLE public.venue_events
  ADD CONSTRAINT venue_events_contract_status_check
  CHECK (contract_status = ANY (ARRAY['nao_informado','sem_contrato','nao_enviado','enviado','assinado','a_acertar']));

ALTER TABLE public.venue_events
  DROP CONSTRAINT IF EXISTS venue_events_payment_status_check;
ALTER TABLE public.venue_events
  ADD CONSTRAINT venue_events_payment_status_check
  CHECK (payment_status = ANY (ARRAY['nao_informado','pago','parcial','pendente','isento','a_acertar']));

ALTER TABLE public.venue_events
  DROP CONSTRAINT IF EXISTS venue_events_shift_check;
ALTER TABLE public.venue_events
  ADD CONSTRAINT venue_events_shift_check
  CHECK (shift IS NULL OR shift = ANY (ARRAY['manha','meio_dia','tarde','noite','dia','dia_noite','integral']));

ALTER TABLE public.venue_events
  DROP CONSTRAINT IF EXISTS venue_events_cleaning_responsibility_check;
ALTER TABLE public.venue_events
  ADD CONSTRAINT venue_events_cleaning_responsibility_check
  CHECK (cleaning_responsibility IS NULL OR cleaning_responsibility = ANY (ARRAY['solicitante','fenasoja','taxa_limpeza','nao_informado']));

ALTER TABLE public.venue_events
  DROP CONSTRAINT IF EXISTS venue_events_preparation_range_check;
ALTER TABLE public.venue_events
  ADD CONSTRAINT venue_events_preparation_range_check
  CHECK (preparation_end_date IS NULL OR preparation_start_date IS NULL OR preparation_end_date >= preparation_start_date);

ALTER TABLE public.venue_events
  DROP CONSTRAINT IF EXISTS venue_events_reservation_range_check;
ALTER TABLE public.venue_events
  ADD CONSTRAINT venue_events_reservation_range_check
  CHECK (reservation_end_date IS NULL OR reservation_start_date IS NULL OR reservation_end_date >= reservation_start_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_venue_events_source_fingerprint
  ON public.venue_events (org_id, source_fingerprint)
  WHERE source_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_venue_events_requires_review
  ON public.venue_events (org_id, requires_review)
  WHERE requires_review;

-- 2. Lotes de importação
CREATE TABLE IF NOT EXISTS public.venue_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_document text NOT NULL,
  status text NOT NULL DEFAULT 'em_andamento',
  total_rows integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  merged_count integer NOT NULL DEFAULT 0,
  matched_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  review_count integer NOT NULL DEFAULT 0,
  not_event_count integer NOT NULL DEFAULT 0,
  error_message text,
  executed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_import_batches_status_check
    CHECK (status = ANY (ARRAY['em_andamento','concluido','falhou']))
);

GRANT SELECT ON public.venue_import_batches TO authenticated;
GRANT ALL ON public.venue_import_batches TO service_role;
ALTER TABLE public.venue_import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venue_import_batches_select ON public.venue_import_batches;
CREATE POLICY venue_import_batches_select ON public.venue_import_batches
  FOR SELECT TO authenticated
  USING (public.venue_has_capability(org_id, 'venue_events_access'));

-- 3. Linhas de importação (disposição final de cada linha do documento)
CREATE TABLE IF NOT EXISTS public.venue_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.venue_import_batches(id) ON DELETE CASCADE,
  source_document text NOT NULL,
  source_row integer NOT NULL,
  source_year integer,
  raw_text text NOT NULL,
  fingerprint text,
  disposition text NOT NULL,
  event_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_import_rows_disposition_check
    CHECK (disposition = ANY (ARRAY['created','merged','matched','skipped_duplicate','review_required','not_an_event','failed']))
);

CREATE INDEX IF NOT EXISTS idx_venue_import_rows_batch
  ON public.venue_import_rows (batch_id, source_row);

GRANT SELECT ON public.venue_import_rows TO authenticated;
GRANT ALL ON public.venue_import_rows TO service_role;
ALTER TABLE public.venue_import_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venue_import_rows_select ON public.venue_import_rows;
CREATE POLICY venue_import_rows_select ON public.venue_import_rows
  FOR SELECT TO authenticated
  USING (public.venue_has_capability(org_id, 'venue_events_access'));

DROP TRIGGER IF EXISTS trg_venue_import_batches_updated ON public.venue_import_batches;
CREATE TRIGGER trg_venue_import_batches_updated
  BEFORE UPDATE ON public.venue_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Persistência dos campos de agenda a partir do formulário
CREATE OR REPLACE FUNCTION public.venue_save_event_agenda(
  _org_id uuid,
  _event_id uuid,
  _payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid;
  updated public.venue_events%ROWTYPE;
BEGIN
  actor_id := public.venue_assert_capability(_org_id, 'venue_events_access');

  UPDATE public.venue_events SET
    confirmation_status = coalesce(nullif(trim(coalesce(_payload->>'confirmation_status','')),''), 'nao_informado'),
    contract_status = coalesce(nullif(trim(coalesce(_payload->>'contract_status','')),''), 'nao_informado'),
    payment_status = coalesce(nullif(trim(coalesce(_payload->>'payment_status','')),''), 'nao_informado'),
    shift = nullif(trim(coalesce(_payload->>'shift','')),''),
    contact_name = nullif(trim(coalesce(_payload->>'contact_name','')),''),
    contact_phone = nullif(trim(coalesce(_payload->>'contact_phone','')),''),
    fee_type = nullif(trim(coalesce(_payload->>'fee_type','')),''),
    fee_amount = nullif(_payload->>'fee_amount','')::numeric,
    fee_quantity = nullif(_payload->>'fee_quantity','')::numeric,
    cleaning_responsibility = nullif(trim(coalesce(_payload->>'cleaning_responsibility','')),''),
    cleaning_fee = nullif(_payload->>'cleaning_fee','')::numeric,
    electricity_fee = nullif(trim(coalesce(_payload->>'electricity_fee','')),''),
    preparation_notes = nullif(trim(coalesce(_payload->>'preparation_notes','')),''),
    preparation_start_date = nullif(_payload->>'preparation_start_date','')::date,
    preparation_end_date = nullif(_payload->>'preparation_end_date','')::date,
    teardown_deadline_note = nullif(trim(coalesce(_payload->>'teardown_deadline_note','')),''),
    reservation_start_date = nullif(_payload->>'reservation_start_date','')::date,
    reservation_end_date = nullif(_payload->>'reservation_end_date','')::date,
    operational_notes = nullif(trim(coalesce(_payload->>'operational_notes','')),''),
    internal_notes = nullif(trim(coalesce(_payload->>'internal_notes','')),''),
    requires_review = coalesce((_payload->>'requires_review')::boolean, false),
    updated_by = actor_id
  WHERE id = _event_id AND org_id = _org_id
  RETURNING * INTO updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VENUE_EVENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN to_jsonb(updated);
END;
$$;

REVOKE ALL ON FUNCTION public.venue_save_event_agenda(uuid, uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.venue_save_event_agenda(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.venue_save_event_agenda(uuid, uuid, jsonb) TO service_role;