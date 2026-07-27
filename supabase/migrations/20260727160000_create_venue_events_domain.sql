-- Eventos Restaurante e Arena
-- Independent, organization-scoped venue operations domain.
-- All authoritative writes are performed by SECURITY DEFINER RPCs created in
-- the following migration. Direct table mutations stay closed by RLS.

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.venue_normalize_name(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT trim(regexp_replace(lower(extensions.unaccent(coalesce(value, ''))), '[^a-z0-9]+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.venue_has_capability(_org_id uuid, _capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH membership AS (
    SELECT role::text AS role
    FROM public.org_members
    WHERE user_id = auth.uid()
      AND org_id = _org_id
      AND is_active = true
    LIMIT 1
  )
  SELECT EXISTS (
    SELECT 1
    FROM membership
    WHERE role = 'admin'
       OR (
         role = 'gestor'
         AND _capability IN (
           'venue_events_access',
           'venue_events_create',
           'venue_events_manage',
           'venue_events_cancel',
           'venue_venues_manage',
           'venue_operations_manage',
           'venue_reports_view',
           'venue_events_audit_view'
         )
       )
       OR (
         role = 'operador'
         AND _capability IN (
           'venue_events_access',
           'venue_events_create',
           'venue_operations_manage',
           'venue_reports_view'
         )
       )
       OR EXISTS (
         SELECT 1
         FROM public.user_capabilities capability
         WHERE capability.user_id = auth.uid()
           AND capability.org_id = _org_id
           AND capability.capability IN (_capability, 'venue_events_full_access')
       )
  );
$$;

REVOKE ALL ON FUNCTION public.venue_normalize_name(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_has_capability(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.venue_normalize_name(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.venue_has_capability(uuid, text) TO authenticated, service_role;

-- The legacy capability policies allow gestores to manage generic capabilities.
-- Keep that compatibility boundary, but prevent self-escalation inside this
-- domain's dedicated namespace.
DROP POLICY IF EXISTS venue_capability_insert_guard ON public.user_capabilities;
CREATE POLICY venue_capability_insert_guard ON public.user_capabilities
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    left(capability, 6) <> 'venue_'
    OR public.get_user_org_role(auth.uid(), org_id) = 'admin'
  );

DROP POLICY IF EXISTS venue_capability_update_guard ON public.user_capabilities;
CREATE POLICY venue_capability_update_guard ON public.user_capabilities
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (
    left(capability, 6) <> 'venue_'
    OR public.get_user_org_role(auth.uid(), org_id) = 'admin'
  )
  WITH CHECK (
    left(capability, 6) <> 'venue_'
    OR public.get_user_org_role(auth.uid(), org_id) = 'admin'
  );

DROP POLICY IF EXISTS venue_capability_delete_guard ON public.user_capabilities;
CREATE POLICY venue_capability_delete_guard ON public.user_capabilities
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (
    left(capability, 6) <> 'venue_'
    OR public.get_user_org_role(auth.uid(), org_id) = 'admin'
  );

CREATE TABLE IF NOT EXISTS public.venue_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_space_id uuid,
  slug text NOT NULL,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'espaco',
  description text,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  location text,
  available_areas text[] NOT NULL DEFAULT '{}',
  restrictions text[] NOT NULL DEFAULT '{}',
  allowed_event_types text[] NOT NULL DEFAULT '{}',
  standard_opening_hours jsonb NOT NULL DEFAULT '{"timezone":"America/Sao_Paulo","daily_start":"08:00","daily_end":"22:00"}'::jsonb,
  required_setup_minutes integer NOT NULL DEFAULT 60 CHECK (required_setup_minutes >= 0),
  required_teardown_minutes integer NOT NULL DEFAULT 60 CHECK (required_teardown_minutes >= 0),
  default_responsible_team text,
  available_resources text[] NOT NULL DEFAULT '{}',
  internal_notes text,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_spaces_org_slug_key UNIQUE (org_id, slug),
  CONSTRAINT venue_spaces_org_id_id_key UNIQUE (org_id, id),
  CONSTRAINT venue_spaces_parent_fk FOREIGN KEY (org_id, parent_space_id)
    REFERENCES public.venue_spaces(org_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.venue_stakeholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  legal_name text NOT NULL,
  trade_name text,
  normalized_name text GENERATED ALWAYS AS (public.venue_normalize_name(coalesce(trade_name, legal_name))) STORED,
  document_identifier text,
  contact_name text,
  email text,
  phone text,
  relationship_type text NOT NULL,
  contract_reference text,
  sponsor_category text,
  active_from date,
  active_until date,
  notes text,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_stakeholders_relationship_check CHECK (
    relationship_type IN ('patrocinador', 'parceiro', 'comissao', 'empresa', 'instituicao', 'externo')
  ),
  CONSTRAINT venue_stakeholders_period_check CHECK (
    active_until IS NULL OR active_from IS NULL OR active_until >= active_from
  ),
  CONSTRAINT venue_stakeholders_org_id_id_key UNIQUE (org_id, id)
);

CREATE TABLE IF NOT EXISTS public.venue_booking_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_booking_units_org_slug_key UNIQUE (org_id, slug),
  CONSTRAINT venue_booking_units_org_id_id_key UNIQUE (org_id, id)
);

CREATE TABLE IF NOT EXISTS public.venue_space_booking_units (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  space_id uuid NOT NULL,
  booking_unit_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, booking_unit_id),
  CONSTRAINT venue_space_booking_units_space_fk FOREIGN KEY (org_id, space_id)
    REFERENCES public.venue_spaces(org_id, id) ON DELETE CASCADE,
  CONSTRAINT venue_space_booking_units_unit_fk FOREIGN KEY (org_id, booking_unit_id)
    REFERENCES public.venue_booking_units(org_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_venue_stakeholders_normalized_active
  ON public.venue_stakeholders(org_id, normalized_name)
  WHERE active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_venue_stakeholders_document_active
  ON public.venue_stakeholders(org_id, regexp_replace(document_identifier, '[^0-9A-Za-z]', '', 'g'))
  WHERE active AND document_identifier IS NOT NULL AND document_identifier <> '';

CREATE TABLE IF NOT EXISTS public.venue_counterpart_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stakeholder_id uuid NOT NULL,
  space_id uuid,
  contract_reference text NOT NULL,
  valid_from date NOT NULL,
  valid_until date NOT NULL,
  benefit_type text NOT NULL,
  unit_type text NOT NULL,
  granted_quantity numeric(14,2) NOT NULL CHECK (granted_quantity > 0),
  value_per_excess_unit numeric(14,2) CHECK (value_per_excess_unit IS NULL OR value_per_excess_unit >= 0),
  requires_approval boolean NOT NULL DEFAULT true,
  no_show_consumes_allowance boolean NOT NULL DEFAULT false,
  allowed_event_types text[] NOT NULL DEFAULT '{}',
  restrictions text[] NOT NULL DEFAULT '{}',
  responsible_approver_id uuid,
  document_path text,
  notes text,
  status text NOT NULL DEFAULT 'ativo',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_counterpart_stakeholder_fk FOREIGN KEY (org_id, stakeholder_id)
    REFERENCES public.venue_stakeholders(org_id, id) ON DELETE RESTRICT,
  CONSTRAINT venue_counterpart_space_fk FOREIGN KEY (org_id, space_id)
    REFERENCES public.venue_spaces(org_id, id) ON DELETE RESTRICT,
  CONSTRAINT venue_counterpart_period_check CHECK (valid_until >= valid_from),
  CONSTRAINT venue_counterpart_unit_check CHECK (
    unit_type IN ('evento', 'dia', 'hora', 'turno', 'data_exclusiva', 'capacidade', 'monetario', 'outro')
  ),
  CONSTRAINT venue_counterpart_status_check CHECK (status IN ('rascunho', 'ativo', 'suspenso', 'encerrado')),
  CONSTRAINT venue_counterpart_org_contract_key UNIQUE (org_id, stakeholder_id, contract_reference, benefit_type),
  CONSTRAINT venue_counterpart_org_id_id_key UNIQUE (org_id, id)
);

CREATE TABLE IF NOT EXISTS public.venue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  executive_description text,
  event_type text NOT NULL,
  requested_area text,
  pending_date boolean NOT NULL DEFAULT false,
  start_at timestamptz,
  end_at timestamptz,
  setup_start_at timestamptz,
  teardown_end_at timestamptz,
  requester_name text NOT NULL,
  requester_user_id uuid,
  responsible_organization_id uuid,
  sponsor_id uuid,
  responsible_user_id uuid,
  estimated_audience integer CHECK (estimated_audience IS NULL OR estimated_audience >= 0),
  confirmed_audience integer CHECK (confirmed_audience IS NULL OR confirmed_audience >= 0),
  target_audience text,
  status text NOT NULL DEFAULT 'rascunho',
  approval_status text NOT NULL DEFAULT 'nao_solicitado',
  priority text NOT NULL DEFAULT 'media',
  visibility text NOT NULL DEFAULT 'institucional',
  counterpart_agreement_id uuid,
  counterpart_requested_quantity numeric(14,2) CHECK (
    counterpart_requested_quantity IS NULL OR counterpart_requested_quantity > 0
  ),
  observations text,
  event_result text,
  cancellation_reason text,
  conflict_status text NOT NULL DEFAULT 'nao_verificado',
  conflict_override_reason text,
  conflict_override_fingerprint text,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  completed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_events_responsible_org_fk FOREIGN KEY (org_id, responsible_organization_id)
    REFERENCES public.venue_stakeholders(org_id, id) ON DELETE RESTRICT,
  CONSTRAINT venue_events_sponsor_fk FOREIGN KEY (org_id, sponsor_id)
    REFERENCES public.venue_stakeholders(org_id, id) ON DELETE RESTRICT,
  CONSTRAINT venue_events_counterpart_fk FOREIGN KEY (org_id, counterpart_agreement_id)
    REFERENCES public.venue_counterpart_agreements(org_id, id) ON DELETE RESTRICT,
  CONSTRAINT venue_events_type_check CHECK (
    event_type IN (
      'institucional', 'patrocinador', 'comissao', 'corporativo', 'cultural', 'comercial',
      'cerimonial', 'reuniao', 'jantar', 'lancamento', 'show', 'externo', 'interno', 'outro'
    )
  ),
  CONSTRAINT venue_events_status_check CHECK (
    status IN (
      'rascunho', 'solicitado', 'em_analise', 'aprovado', 'confirmado', 'em_preparacao',
      'em_andamento', 'concluido', 'cancelado', 'reprogramado', 'recusado', 'bloqueado',
      'pendente_informacoes'
    )
  ),
  CONSTRAINT venue_events_approval_check CHECK (
    approval_status IN ('nao_solicitado', 'pendente', 'em_analise', 'aprovado', 'recusado')
  ),
  CONSTRAINT venue_events_priority_check CHECK (priority IN ('baixa', 'media', 'alta', 'critica')),
  CONSTRAINT venue_events_visibility_check CHECK (visibility IN ('institucional', 'restrita', 'publica')),
  CONSTRAINT venue_events_conflict_check CHECK (
    conflict_status IN ('nao_verificado', 'livre', 'conflito', 'excecao_autorizada')
  ),
  CONSTRAINT venue_events_conflict_override_evidence_check CHECK (
    conflict_status <> 'excecao_autorizada'
    OR (
      length(trim(coalesce(conflict_override_reason, ''))) >= 8
      AND length(coalesce(conflict_override_fingerprint, '')) = 32
    )
  ),
  CONSTRAINT venue_events_schedule_check CHECK (
    (pending_date AND start_at IS NULL AND end_at IS NULL AND setup_start_at IS NULL AND teardown_end_at IS NULL)
    OR (
      NOT pending_date
      AND start_at IS NOT NULL
      AND end_at IS NOT NULL
      AND setup_start_at IS NOT NULL
      AND teardown_end_at IS NOT NULL
      AND setup_start_at <= start_at
      AND start_at < end_at
      AND end_at <= teardown_end_at
    )
  ),
  CONSTRAINT venue_events_org_id_id_key UNIQUE (org_id, id)
);

CREATE TABLE IF NOT EXISTS public.venue_event_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  space_id uuid NOT NULL,
  requested_area text,
  start_at timestamptz,
  end_at timestamptz,
  setup_start_at timestamptz,
  teardown_end_at timestamptz,
  blocks_availability boolean NOT NULL DEFAULT false,
  conflict_override boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_event_spaces_event_fk FOREIGN KEY (org_id, event_id)
    REFERENCES public.venue_events(org_id, id) ON DELETE CASCADE,
  CONSTRAINT venue_event_spaces_space_fk FOREIGN KEY (org_id, space_id)
    REFERENCES public.venue_spaces(org_id, id) ON DELETE RESTRICT,
  CONSTRAINT venue_event_spaces_schedule_check CHECK (
    (start_at IS NULL AND end_at IS NULL AND setup_start_at IS NULL AND teardown_end_at IS NULL)
    OR (
      start_at IS NOT NULL
      AND end_at IS NOT NULL
      AND setup_start_at IS NOT NULL
      AND teardown_end_at IS NOT NULL
      AND setup_start_at <= start_at
      AND start_at < end_at
      AND end_at <= teardown_end_at
    )
  ),
  CONSTRAINT venue_event_spaces_event_space_key UNIQUE (event_id, space_id),
  CONSTRAINT venue_event_spaces_org_id_event_key UNIQUE (org_id, id, event_id)
);

CREATE TABLE IF NOT EXISTS public.venue_space_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  space_id uuid NOT NULL,
  block_type text NOT NULL,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  stakeholder_id uuid,
  reason text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_space_blocks_space_fk FOREIGN KEY (org_id, space_id)
    REFERENCES public.venue_spaces(org_id, id) ON DELETE CASCADE,
  CONSTRAINT venue_space_blocks_stakeholder_fk FOREIGN KEY (org_id, stakeholder_id)
    REFERENCES public.venue_stakeholders(org_id, id) ON DELETE RESTRICT,
  CONSTRAINT venue_space_blocks_type_check CHECK (
    block_type IN ('manutencao', 'indisponibilidade', 'data_exclusiva', 'bloqueio_operacional')
  ),
  CONSTRAINT venue_space_blocks_period_check CHECK (starts_at < ends_at)
);

CREATE TABLE IF NOT EXISTS public.venue_counterpart_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agreement_id uuid NOT NULL,
  event_id uuid NOT NULL,
  usage_state text NOT NULL DEFAULT 'pendente',
  requested_quantity numeric(14,2) NOT NULL DEFAULT 0 CHECK (requested_quantity >= 0),
  excess_quantity numeric(14,2) NOT NULL DEFAULT 0 CHECK (excess_quantity >= 0),
  approved_excess_quantity numeric(14,2) NOT NULL DEFAULT 0 CHECK (approved_excess_quantity >= 0),
  excess_approval_status text NOT NULL DEFAULT 'nao_necessario',
  approved_by uuid,
  approved_at timestamptz,
  observation text,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_counterpart_usage_agreement_fk FOREIGN KEY (org_id, agreement_id)
    REFERENCES public.venue_counterpart_agreements(org_id, id) ON DELETE RESTRICT,
  CONSTRAINT venue_counterpart_usage_event_fk FOREIGN KEY (org_id, event_id)
    REFERENCES public.venue_events(org_id, id) ON DELETE CASCADE,
  CONSTRAINT venue_counterpart_usage_state_check CHECK (
    usage_state IN ('pendente', 'reservado', 'consumido', 'cancelado', 'no_show')
  ),
  CONSTRAINT venue_counterpart_usage_approval_check CHECK (
    excess_approval_status IN (
      'nao_necessario', 'pendente', 'aprovado', 'recusado', 'cobranca_adicional', 'revisao_contrato'
    )
  ),
  CONSTRAINT venue_counterpart_usage_org_id_id_key UNIQUE (org_id, id),
  CONSTRAINT venue_counterpart_usage_integrity_key UNIQUE (org_id, id, agreement_id, event_id)
);

CREATE TABLE IF NOT EXISTS public.venue_counterpart_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agreement_id uuid NOT NULL,
  event_id uuid NOT NULL,
  usage_id uuid NOT NULL,
  movement_type text NOT NULL,
  reserved_delta numeric(14,2) NOT NULL DEFAULT 0,
  consumed_delta numeric(14,2) NOT NULL DEFAULT 0,
  excess_delta numeric(14,2) NOT NULL DEFAULT 0,
  reason text NOT NULL,
  request_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_counterpart_ledger_agreement_fk FOREIGN KEY (org_id, agreement_id)
    REFERENCES public.venue_counterpart_agreements(org_id, id) ON DELETE RESTRICT,
  CONSTRAINT venue_counterpart_ledger_event_fk FOREIGN KEY (org_id, event_id)
    REFERENCES public.venue_events(org_id, id) ON DELETE RESTRICT,
  CONSTRAINT venue_counterpart_ledger_usage_fk FOREIGN KEY (org_id, usage_id)
    REFERENCES public.venue_counterpart_usage(org_id, id) ON DELETE RESTRICT,
  CONSTRAINT venue_counterpart_ledger_integrity_fk FOREIGN KEY (org_id, usage_id, agreement_id, event_id)
    REFERENCES public.venue_counterpart_usage(org_id, id, agreement_id, event_id) ON DELETE RESTRICT,
  CONSTRAINT venue_counterpart_ledger_type_check CHECK (
    movement_type IN (
      'reserva', 'liberacao', 'consumo', 'estorno_consumo', 'excesso_autorizado',
      'excesso_cobravel', 'revisao_contrato', 'ajuste_manual'
    )
  ),
  CONSTRAINT venue_counterpart_ledger_nonzero_check CHECK (
    reserved_delta <> 0 OR consumed_delta <> 0 OR excess_delta <> 0
  ),
  CONSTRAINT venue_counterpart_ledger_request_key UNIQUE (org_id, request_id, movement_type, usage_id)
);

CREATE TABLE IF NOT EXISTS public.venue_occupancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  event_space_id uuid NOT NULL,
  booking_unit_id uuid NOT NULL,
  setup_start_at timestamptz NOT NULL,
  teardown_end_at timestamptz NOT NULL,
  occupied_during tstzrange GENERATED ALWAYS AS (
    tstzrange(setup_start_at, teardown_end_at, '[)')
  ) STORED,
  active boolean NOT NULL DEFAULT true,
  conflict_override boolean NOT NULL DEFAULT false,
  override_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_occupancies_event_fk FOREIGN KEY (org_id, event_id)
    REFERENCES public.venue_events(org_id, id) ON DELETE CASCADE,
  CONSTRAINT venue_occupancies_event_space_fk FOREIGN KEY (org_id, event_space_id, event_id)
    REFERENCES public.venue_event_spaces(org_id, id, event_id) ON DELETE CASCADE,
  CONSTRAINT venue_occupancies_unit_fk FOREIGN KEY (org_id, booking_unit_id)
    REFERENCES public.venue_booking_units(org_id, id) ON DELETE RESTRICT,
  CONSTRAINT venue_occupancies_period_check CHECK (setup_start_at < teardown_end_at),
  CONSTRAINT venue_occupancies_override_reason_check CHECK (
    NOT conflict_override OR length(trim(coalesce(override_reason, ''))) >= 8
  ),
  CONSTRAINT venue_occupancies_event_unit_key UNIQUE (event_id, booking_unit_id),
  CONSTRAINT venue_occupancies_no_overlap EXCLUDE USING gist (
    org_id WITH =,
    booking_unit_id WITH =,
    occupied_during WITH &&
  ) WHERE (active AND NOT conflict_override)
);

CREATE TABLE IF NOT EXISTS public.venue_event_responsibles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  user_id uuid NOT NULL,
  responsibility_role text NOT NULL DEFAULT 'apoio',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_event_responsibles_event_fk FOREIGN KEY (org_id, event_id)
    REFERENCES public.venue_events(org_id, id) ON DELETE CASCADE,
  CONSTRAINT venue_event_responsibles_key UNIQUE (event_id, user_id, responsibility_role)
);

CREATE TABLE IF NOT EXISTS public.venue_event_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  resource_type text NOT NULL,
  quantity numeric(12,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  responsible_team text,
  responsible_user_id uuid,
  required_at timestamptz,
  confirmation_status text NOT NULL DEFAULT 'solicitado',
  completion_status text NOT NULL DEFAULT 'pendente',
  notes text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_event_resources_event_fk FOREIGN KEY (org_id, event_id)
    REFERENCES public.venue_events(org_id, id) ON DELETE CASCADE,
  CONSTRAINT venue_event_resources_confirmation_check CHECK (
    confirmation_status IN ('solicitado', 'confirmado', 'indisponivel', 'dispensado')
  ),
  CONSTRAINT venue_event_resources_completion_check CHECK (
    completion_status IN ('pendente', 'em_andamento', 'concluido', 'nao_aplicavel')
  ),
  CONSTRAINT venue_event_resources_state_coherence_check CHECK (
    (confirmation_status = 'confirmado' AND completion_status IN ('pendente', 'em_andamento', 'concluido'))
    OR (confirmation_status = 'dispensado' AND completion_status = 'nao_aplicavel')
    OR (confirmation_status IN ('solicitado', 'indisponivel') AND completion_status = 'pendente')
  ),
  CONSTRAINT venue_event_resources_type_key UNIQUE (event_id, resource_type)
);

CREATE TABLE IF NOT EXISTS public.venue_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  space_id uuid,
  event_type text,
  title text NOT NULL,
  deadline_offset_hours integer,
  phase text NOT NULL DEFAULT 'pre_evento',
  required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_checklist_templates_space_fk FOREIGN KEY (org_id, space_id)
    REFERENCES public.venue_spaces(org_id, id) ON DELETE CASCADE,
  CONSTRAINT venue_checklist_templates_phase_check CHECK (phase IN ('pre_evento', 'pos_evento')),
  CONSTRAINT venue_checklist_templates_key UNIQUE NULLS NOT DISTINCT (org_id, space_id, event_type, title),
  CONSTRAINT venue_checklist_templates_org_id_id_key UNIQUE (org_id, id)
);

CREATE TABLE IF NOT EXISTS public.venue_event_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  template_id uuid,
  title text NOT NULL,
  responsible_user_id uuid,
  deadline timestamptz,
  status text NOT NULL DEFAULT 'pendente',
  note text,
  phase text NOT NULL DEFAULT 'pre_evento',
  required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  completed_by uuid,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_event_checklist_event_fk FOREIGN KEY (org_id, event_id)
    REFERENCES public.venue_events(org_id, id) ON DELETE CASCADE,
  CONSTRAINT venue_event_checklist_template_fk FOREIGN KEY (org_id, template_id)
    REFERENCES public.venue_checklist_templates(org_id, id) ON DELETE RESTRICT,
  CONSTRAINT venue_event_checklist_status_check CHECK (
    status IN ('pendente', 'em_andamento', 'concluido', 'dispensado', 'obsoleto')
  ),
  CONSTRAINT venue_event_checklist_phase_check CHECK (phase IN ('pre_evento', 'pos_evento')),
  CONSTRAINT venue_event_checklist_template_key UNIQUE (event_id, template_id)
);

CREATE TABLE IF NOT EXISTS public.venue_event_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20971520),
  document_type text NOT NULL,
  sensitive boolean NOT NULL DEFAULT false,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_event_documents_event_fk FOREIGN KEY (org_id, event_id)
    REFERENCES public.venue_events(org_id, id) ON DELETE CASCADE,
  CONSTRAINT venue_event_documents_path_key UNIQUE (storage_path)
);

CREATE TABLE IF NOT EXISTS public.venue_event_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  decision text NOT NULL,
  reason text,
  observation text,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  approver_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_event_approvals_event_fk FOREIGN KEY (org_id, event_id)
    REFERENCES public.venue_events(org_id, id) ON DELETE CASCADE,
  CONSTRAINT venue_event_approvals_decision_check CHECK (
    decision IN (
      'enviado', 'em_analise', 'aprovado', 'confirmado', 'recusado', 'cancelado', 'reprogramado',
      'alteracao_material', 'bloqueado', 'desbloqueado', 'no_show',
      'excesso_aprovado', 'cobranca_adicional', 'revisao_contrato', 'excecao_conflito',
      'preparacao_iniciada', 'evento_iniciado', 'concluido'
    )
  )
);

CREATE TABLE IF NOT EXISTS public.venue_mutation_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL,
  operation text NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_mutation_receipts_key UNIQUE (org_id, actor_user_id, operation, idempotency_key)
);

CREATE OR REPLACE FUNCTION public.venue_can_view_event(_org_id uuid, _event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.venue_events event
    WHERE event.org_id = _org_id
      AND event.id = _event_id
      AND public.venue_has_capability(_org_id, 'venue_events_access')
      AND (
        event.visibility <> 'restrita'
        OR event.created_by = auth.uid()
        OR event.responsible_user_id = auth.uid()
        OR public.venue_has_capability(_org_id, 'venue_events_manage')
        OR public.venue_has_capability(_org_id, 'venue_events_approve')
        OR public.venue_has_capability(_org_id, 'venue_events_cancel')
        OR public.venue_has_capability(_org_id, 'venue_excess_approve')
        OR public.venue_has_capability(_org_id, 'venue_operations_manage')
        OR public.venue_has_capability(_org_id, 'venue_documents_manage')
        OR public.venue_has_capability(_org_id, 'venue_documents_sensitive')
        OR public.venue_has_capability(_org_id, 'venue_events_audit_view')
        OR public.venue_has_capability(_org_id, 'venue_events_restricted_view')
        OR EXISTS (
          SELECT 1
          FROM public.venue_event_responsibles responsible
          WHERE responsible.org_id = _org_id
            AND responsible.event_id = _event_id
            AND responsible.user_id = auth.uid()
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.venue_can_view_event(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.venue_can_view_event(uuid, uuid) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_venue_spaces_org_active ON public.venue_spaces(org_id, active, name);
CREATE INDEX IF NOT EXISTS idx_venue_stakeholders_org_type ON public.venue_stakeholders(org_id, relationship_type, active);
CREATE INDEX IF NOT EXISTS idx_venue_booking_units_org_active ON public.venue_booking_units(org_id, active, name);
CREATE INDEX IF NOT EXISTS idx_venue_agreements_org_period ON public.venue_counterpart_agreements(org_id, valid_from, valid_until, status);
CREATE INDEX IF NOT EXISTS idx_venue_events_org_start ON public.venue_events(org_id, start_at);
CREATE INDEX IF NOT EXISTS idx_venue_events_org_status ON public.venue_events(org_id, status, approval_status);
CREATE INDEX IF NOT EXISTS idx_venue_events_org_sponsor ON public.venue_events(org_id, sponsor_id);
CREATE INDEX IF NOT EXISTS idx_venue_event_spaces_space_period ON public.venue_event_spaces(space_id, setup_start_at, teardown_end_at)
  WHERE blocks_availability;
CREATE INDEX IF NOT EXISTS idx_venue_space_blocks_period ON public.venue_space_blocks(space_id, starts_at, ends_at)
  WHERE active;
CREATE INDEX IF NOT EXISTS idx_venue_usage_agreement_state ON public.venue_counterpart_usage(agreement_id, usage_state);
CREATE UNIQUE INDEX IF NOT EXISTS idx_venue_usage_current_event
  ON public.venue_counterpart_usage(event_id)
  WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venue_ledger_agreement_created ON public.venue_counterpart_ledger(agreement_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_venue_ledger_event_created ON public.venue_counterpart_ledger(event_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_venue_occupancies_unit_period ON public.venue_occupancies(booking_unit_id, setup_start_at, teardown_end_at)
  WHERE active;
CREATE INDEX IF NOT EXISTS idx_venue_resources_event ON public.venue_event_resources(event_id);
CREATE INDEX IF NOT EXISTS idx_venue_checklist_event ON public.venue_event_checklist_items(event_id, status, deadline);
CREATE INDEX IF NOT EXISTS idx_venue_documents_event ON public.venue_event_documents(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_venue_approvals_event ON public.venue_event_approvals(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_venue_receipts_created ON public.venue_mutation_receipts(created_at);

ALTER TABLE public.venue_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_stakeholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_booking_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_space_booking_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_counterpart_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_event_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_space_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_counterpart_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_counterpart_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_occupancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_event_responsibles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_event_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_event_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_event_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_event_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_mutation_receipts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'venue_spaces',
    'venue_stakeholders',
    'venue_booking_units',
    'venue_space_booking_units',
    'venue_counterpart_agreements',
    'venue_events',
    'venue_event_spaces',
    'venue_space_blocks',
    'venue_counterpart_usage',
    'venue_counterpart_ledger',
    'venue_occupancies',
    'venue_event_responsibles',
    'venue_event_resources',
    'venue_checklist_templates',
    'venue_event_checklist_items',
    'venue_event_documents',
    'venue_event_approvals',
    'venue_mutation_receipts'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS venue_domain_select ON public.%I', table_name);
    IF table_name <> 'venue_mutation_receipts' THEN
      EXECUTE format(
        'CREATE POLICY venue_domain_select ON public.%I FOR SELECT TO authenticated USING (public.venue_has_capability(org_id, %L))',
        table_name,
        'venue_events_access'
      );
    END IF;
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS venue_event_visibility_select ON public.venue_events;
CREATE POLICY venue_event_visibility_select ON public.venue_events
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (public.venue_can_view_event(org_id, id));

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'venue_event_spaces',
    'venue_counterpart_usage',
    'venue_counterpart_ledger',
    'venue_occupancies',
    'venue_event_responsibles',
    'venue_event_resources',
    'venue_event_checklist_items',
    'venue_event_documents',
    'venue_event_approvals'
  ]
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS venue_event_visibility_select ON public.%I',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY venue_event_visibility_select ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.venue_can_view_event(org_id, event_id))',
      table_name
    );
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS venue_domain_select ON public.venue_stakeholders;
CREATE POLICY venue_domain_select ON public.venue_stakeholders
  FOR SELECT TO authenticated
  USING (public.venue_has_capability(org_id, 'venue_sponsors_manage'));

DROP POLICY IF EXISTS venue_domain_select ON public.venue_counterpart_agreements;
CREATE POLICY venue_domain_select ON public.venue_counterpart_agreements
  FOR SELECT TO authenticated
  USING (
    public.venue_has_capability(org_id, 'venue_counterparts_manage')
    OR public.venue_has_capability(org_id, 'venue_reports_view')
  );

DROP POLICY IF EXISTS venue_domain_select ON public.venue_counterpart_usage;
CREATE POLICY venue_domain_select ON public.venue_counterpart_usage
  FOR SELECT TO authenticated
  USING (
    public.venue_has_capability(org_id, 'venue_counterparts_manage')
    OR public.venue_has_capability(org_id, 'venue_reports_view')
  );

DROP POLICY IF EXISTS venue_domain_select ON public.venue_counterpart_ledger;
CREATE POLICY venue_domain_select ON public.venue_counterpart_ledger
  FOR SELECT TO authenticated
  USING (
    public.venue_has_capability(org_id, 'venue_counterparts_manage')
    OR public.venue_has_capability(org_id, 'venue_reports_view')
  );

DROP POLICY IF EXISTS venue_domain_select ON public.venue_event_documents;
CREATE POLICY venue_domain_select ON public.venue_event_documents
  FOR SELECT TO authenticated
  USING (
    public.venue_has_capability(org_id, 'venue_events_access')
    AND (
      NOT sensitive
      OR public.venue_has_capability(org_id, 'venue_documents_sensitive')
    )
  );

DROP POLICY IF EXISTS venue_domain_select ON public.venue_event_approvals;
CREATE POLICY venue_domain_select ON public.venue_event_approvals
  FOR SELECT TO authenticated
  USING (
    public.venue_has_capability(org_id, 'venue_events_approve')
    OR public.venue_has_capability(org_id, 'venue_events_audit_view')
    OR EXISTS (
      SELECT 1 FROM public.venue_events event
      WHERE event.id = venue_event_approvals.event_id
        AND event.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS venue_audit_select ON public.audit_log;
CREATE POLICY venue_audit_select ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    entity LIKE 'venue_%'
    AND public.venue_has_capability(org_id, 'venue_events_audit_view')
  );

DROP POLICY IF EXISTS venue_audit_raw_guard ON public.audit_log;
CREATE POLICY venue_audit_raw_guard ON public.audit_log
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    entity NOT LIKE 'venue_%'
    OR public.get_user_org_role(auth.uid(), org_id) = 'admin'
  );

DROP POLICY IF EXISTS venue_audit_insert_guard ON public.audit_log;
CREATE POLICY venue_audit_insert_guard ON public.audit_log
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (entity NOT LIKE 'venue_%');

REVOKE INSERT, UPDATE, DELETE ON public.venue_spaces FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.venue_stakeholders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.venue_booking_units FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.venue_space_booking_units FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.venue_counterpart_agreements FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.venue_events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.venue_event_spaces FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.venue_space_blocks FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.venue_counterpart_usage FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.venue_counterpart_ledger FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.venue_occupancies FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.venue_event_responsibles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.venue_event_resources FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.venue_checklist_templates FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.venue_event_checklist_items FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.venue_event_documents FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.venue_event_approvals FROM authenticated;
REVOKE ALL ON public.venue_mutation_receipts FROM authenticated;

GRANT SELECT ON public.venue_spaces TO authenticated;
GRANT SELECT ON public.venue_stakeholders TO authenticated;
GRANT SELECT ON public.venue_booking_units TO authenticated;
GRANT SELECT ON public.venue_space_booking_units TO authenticated;
GRANT SELECT ON public.venue_counterpart_agreements TO authenticated;
GRANT SELECT ON public.venue_events TO authenticated;
GRANT SELECT ON public.venue_event_spaces TO authenticated;
GRANT SELECT ON public.venue_space_blocks TO authenticated;
GRANT SELECT ON public.venue_counterpart_usage TO authenticated;
GRANT SELECT ON public.venue_counterpart_ledger TO authenticated;
GRANT SELECT ON public.venue_occupancies TO authenticated;
GRANT SELECT ON public.venue_event_responsibles TO authenticated;
GRANT SELECT ON public.venue_event_resources TO authenticated;
GRANT SELECT ON public.venue_checklist_templates TO authenticated;
GRANT SELECT ON public.venue_event_checklist_items TO authenticated;
GRANT SELECT ON public.venue_event_documents TO authenticated;
GRANT SELECT ON public.venue_event_approvals TO authenticated;

CREATE OR REPLACE VIEW public.venue_stakeholder_directory
WITH (security_barrier = true)
AS
SELECT
  stakeholder.id,
  stakeholder.org_id,
  stakeholder.legal_name,
  stakeholder.trade_name,
  stakeholder.normalized_name,
  CASE
    WHEN public.venue_has_capability(stakeholder.org_id, 'venue_sponsors_manage')
      THEN stakeholder.document_identifier
    ELSE NULL
  END AS document_identifier,
  stakeholder.contact_name,
  CASE
    WHEN public.venue_has_capability(stakeholder.org_id, 'venue_sponsors_manage')
      THEN stakeholder.email
    ELSE NULL
  END AS email,
  CASE
    WHEN public.venue_has_capability(stakeholder.org_id, 'venue_sponsors_manage')
      THEN stakeholder.phone
    ELSE NULL
  END AS phone,
  stakeholder.relationship_type,
  CASE
    WHEN public.venue_has_capability(stakeholder.org_id, 'venue_sponsors_manage')
      THEN stakeholder.contract_reference
    ELSE NULL
  END AS contract_reference,
  stakeholder.sponsor_category,
  stakeholder.active_from,
  stakeholder.active_until,
  CASE
    WHEN public.venue_has_capability(stakeholder.org_id, 'venue_sponsors_manage')
      THEN stakeholder.notes
    ELSE NULL
  END AS notes,
  stakeholder.active,
  stakeholder.version,
  stakeholder.created_at,
  stakeholder.updated_at
FROM public.venue_stakeholders stakeholder
WHERE public.venue_has_capability(stakeholder.org_id, 'venue_events_access');

GRANT SELECT ON public.venue_stakeholder_directory TO authenticated;

CREATE OR REPLACE FUNCTION public.venue_seed_org_defaults(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  restaurant_id uuid;
  arena_id uuid;
  restaurant_unit_id uuid;
  arena_unit_id uuid;
BEGIN
  INSERT INTO public.venue_spaces (
    org_id,
    slug,
    name,
    type,
    description,
    capacity,
    location,
    available_areas,
    restrictions,
    allowed_event_types,
    required_setup_minutes,
    required_teardown_minutes,
    default_responsible_team,
    available_resources,
    created_by,
    updated_by
  ) VALUES (
    _org_id,
    'restaurante-fenasoja',
    'Restaurante Fenasoja',
    'restaurante',
    'Espaço gastronômico e institucional da Fenasoja.',
    600,
    'Parque de Exposições Alfredo Leandro Carlson',
    ARRAY['Salão principal', 'Cozinha', 'Área de apoio'],
    ARRAY['Respeitar capacidade e plano de segurança', 'Uso de cozinha sujeito à confirmação operacional'],
    ARRAY['institucional', 'patrocinador', 'comissao', 'corporativo', 'cultural', 'comercial', 'cerimonial', 'reuniao', 'jantar', 'lancamento', 'externo', 'interno', 'outro'],
    120,
    90,
    'Operação Restaurante',
    ARRAY['mesas', 'cadeiras', 'som', 'iluminacao', 'energia', 'limpeza', 'seguranca', 'recepcao', 'catering', 'cozinha', 'audiovisual', 'estacionamento', 'acessibilidade', 'sinalizacao'],
    auth.uid(),
    auth.uid()
  )
  ON CONFLICT (org_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    updated_at = now()
  RETURNING id INTO restaurant_id;

  INSERT INTO public.venue_spaces (
    org_id,
    slug,
    name,
    type,
    description,
    capacity,
    location,
    available_areas,
    restrictions,
    allowed_event_types,
    required_setup_minutes,
    required_teardown_minutes,
    default_responsible_team,
    available_resources,
    created_by,
    updated_by
  ) VALUES (
    _org_id,
    'arena-fenasoja',
    'Arena Fenasoja',
    'arena',
    'Arena multiuso para apresentações, shows e encontros de grande público.',
    5000,
    'Parque de Exposições Alfredo Leandro Carlson',
    ARRAY['Arena principal', 'Palco', 'Backstage', 'Área técnica'],
    ARRAY['Plano de segurança obrigatório para grande público', 'Som e estruturas sujeitos à vistoria técnica'],
    ARRAY['institucional', 'patrocinador', 'corporativo', 'cultural', 'comercial', 'cerimonial', 'lancamento', 'show', 'externo', 'interno', 'outro'],
    240,
    180,
    'Operação Arena',
    ARRAY['cadeiras', 'palco', 'som', 'iluminacao', 'energia', 'limpeza', 'seguranca', 'recepcao', 'catering', 'audiovisual', 'estacionamento', 'acessibilidade', 'sinalizacao', 'equipe_tecnica'],
    auth.uid(),
    auth.uid()
  )
  ON CONFLICT (org_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    updated_at = now()
  RETURNING id INTO arena_id;

  INSERT INTO public.venue_booking_units (org_id, slug, name)
  VALUES (_org_id, 'restaurante-integral', 'Restaurante Fenasoja — ocupação integral')
  ON CONFLICT (org_id, slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO restaurant_unit_id;

  INSERT INTO public.venue_booking_units (org_id, slug, name)
  VALUES (_org_id, 'arena-integral', 'Arena Fenasoja — ocupação integral')
  ON CONFLICT (org_id, slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO arena_unit_id;

  INSERT INTO public.venue_space_booking_units (org_id, space_id, booking_unit_id)
  VALUES
    (_org_id, restaurant_id, restaurant_unit_id),
    (_org_id, arena_id, arena_unit_id)
  ON CONFLICT (space_id, booking_unit_id) DO NOTHING;

  INSERT INTO public.venue_checklist_templates (
    org_id,
    space_id,
    event_type,
    title,
    deadline_offset_hours,
    phase,
    required,
    sort_order,
    created_by,
    updated_by
  ) VALUES
    (_org_id, NULL, NULL, 'Confirmar espaço e período', -168, 'pre_evento', true, 10, auth.uid(), auth.uid()),
    (_org_id, NULL, NULL, 'Validar responsável Fenasoja', -120, 'pre_evento', true, 20, auth.uid(), auth.uid()),
    (_org_id, NULL, NULL, 'Verificar documentos e autorizações', -96, 'pre_evento', true, 30, auth.uid(), auth.uid()),
    (_org_id, NULL, NULL, 'Confirmar limpeza e segurança', -48, 'pre_evento', true, 40, auth.uid(), auth.uid()),
    (_org_id, NULL, NULL, 'Inspecionar o espaço', -4, 'pre_evento', true, 50, auth.uid(), auth.uid()),
    (_org_id, NULL, NULL, 'Registrar avaliação pós-evento', 24, 'pos_evento', true, 60, auth.uid(), auth.uid())
  ON CONFLICT (org_id, space_id, event_type, title) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.venue_seed_org_defaults(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.venue_seed_org_defaults(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.venue_seed_new_org_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.venue_seed_org_defaults(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venue_seed_new_org_defaults ON public.organizations;
CREATE TRIGGER trg_venue_seed_new_org_defaults
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.venue_seed_new_org_defaults();

SELECT public.venue_seed_org_defaults(id)
FROM public.organizations;

DROP TRIGGER IF EXISTS trg_venue_spaces_updated ON public.venue_spaces;
CREATE TRIGGER trg_venue_spaces_updated BEFORE UPDATE ON public.venue_spaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_venue_stakeholders_updated ON public.venue_stakeholders;
CREATE TRIGGER trg_venue_stakeholders_updated BEFORE UPDATE ON public.venue_stakeholders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_venue_agreements_updated ON public.venue_counterpart_agreements;
CREATE TRIGGER trg_venue_agreements_updated BEFORE UPDATE ON public.venue_counterpart_agreements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_venue_events_updated ON public.venue_events;
CREATE TRIGGER trg_venue_events_updated BEFORE UPDATE ON public.venue_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_venue_event_spaces_updated ON public.venue_event_spaces;
CREATE TRIGGER trg_venue_event_spaces_updated BEFORE UPDATE ON public.venue_event_spaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_venue_space_blocks_updated ON public.venue_space_blocks;
CREATE TRIGGER trg_venue_space_blocks_updated BEFORE UPDATE ON public.venue_space_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_venue_usage_updated ON public.venue_counterpart_usage;
CREATE TRIGGER trg_venue_usage_updated BEFORE UPDATE ON public.venue_counterpart_usage
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_venue_resources_updated ON public.venue_event_resources;
CREATE TRIGGER trg_venue_resources_updated BEFORE UPDATE ON public.venue_event_resources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_venue_checklist_templates_updated ON public.venue_checklist_templates;
CREATE TRIGGER trg_venue_checklist_templates_updated BEFORE UPDATE ON public.venue_checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_venue_checklist_items_updated ON public.venue_event_checklist_items;
CREATE TRIGGER trg_venue_checklist_items_updated BEFORE UPDATE ON public.venue_event_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE VIEW public.venue_counterpart_balances
WITH (security_barrier = true)
AS
SELECT
  agreement.id,
  agreement.org_id,
  agreement.stakeholder_id,
  agreement.space_id,
  agreement.contract_reference,
  agreement.unit_type,
  agreement.granted_quantity,
  coalesce(ledger.consumed_quantity, 0)::numeric(14,2) AS consumed_quantity,
  coalesce(ledger.reserved_quantity, 0)::numeric(14,2) AS reserved_quantity,
  coalesce(usage.pending_quantity, 0)::numeric(14,2) AS pending_quantity,
  greatest(
    agreement.granted_quantity
      - coalesce(ledger.consumed_quantity, 0)
      - coalesce(ledger.reserved_quantity, 0),
    0
  )::numeric(14,2) AS remaining_quantity,
  greatest(
    coalesce(ledger.consumed_quantity, 0)
      + coalesce(ledger.reserved_quantity, 0)
      + coalesce(usage.pending_quantity, 0)
      - agreement.granted_quantity,
    0
  )::numeric(14,2) AS projected_excess_quantity,
  greatest(
    coalesce(ledger.consumed_quantity, 0)
      + coalesce(ledger.reserved_quantity, 0)
      - agreement.granted_quantity,
    0
  )::numeric(14,2) AS confirmed_excess_quantity
FROM public.venue_counterpart_agreements agreement
LEFT JOIN LATERAL (
  SELECT
    coalesce(sum(entry.consumed_delta), 0) AS consumed_quantity,
    coalesce(sum(entry.reserved_delta), 0) AS reserved_quantity
  FROM public.venue_counterpart_ledger entry
  WHERE entry.agreement_id = agreement.id
) ledger ON true
LEFT JOIN LATERAL (
  SELECT coalesce(sum(item.requested_quantity), 0) AS pending_quantity
  FROM public.venue_counterpart_usage item
  WHERE item.agreement_id = agreement.id
    AND item.usage_state = 'pendente'
    AND item.superseded_at IS NULL
) usage ON true
WHERE public.venue_has_capability(agreement.org_id, 'venue_counterparts_manage')
   OR public.venue_has_capability(agreement.org_id, 'venue_reports_view');

GRANT SELECT ON public.venue_counterpart_balances TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'venue-event-documents',
  'venue-event-documents',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.venue_can_delete_orphan_storage_object(_object_name text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  folders text[] := storage.foldername(coalesce(_object_name, ''));
  object_org_id uuid;
  object_event_id uuid;
BEGIN
  IF auth.uid() IS NULL
    OR array_length(folders, 1) < 2
    OR folders[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR folders[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RETURN false;
  END IF;

  object_org_id := folders[1]::uuid;
  object_event_id := folders[2]::uuid;
  -- Serialize orphan deletion with venue_register_document. Whichever
  -- transaction acquires this lock first establishes the authoritative state:
  -- a committed document reference or a confirmed orphan deletion.
  PERFORM pg_advisory_xact_lock(hashtextextended(object_org_id::text, 28701));

  RETURN EXISTS (
    SELECT 1
    FROM public.venue_events event
    WHERE event.org_id = object_org_id
      AND event.id = object_event_id
      AND public.venue_can_view_event(event.org_id, event.id)
      AND (
        event.created_by = auth.uid()
        OR public.venue_has_capability(event.org_id, 'venue_documents_manage')
        OR public.venue_has_capability(event.org_id, 'venue_events_manage')
      )
      AND NOT EXISTS (
        -- This function runs as its owner so registered sensitive documents are
        -- still visible here. A caller must never be able to turn RLS
        -- invisibility into permission to delete the underlying object.
        SELECT 1
        FROM public.venue_event_documents document
        WHERE document.storage_path = _object_name
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.venue_can_delete_orphan_storage_object(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.venue_can_delete_orphan_storage_object(text) TO authenticated;

DROP POLICY IF EXISTS venue_documents_storage_select ON storage.objects;
CREATE POLICY venue_documents_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'venue-event-documents'
    AND EXISTS (
      SELECT 1
      FROM public.venue_event_documents document
      WHERE document.storage_path = name
        AND public.venue_has_capability(document.org_id, 'venue_events_access')
        AND public.venue_can_view_event(document.org_id, document.event_id)
        AND (
          NOT document.sensitive
          OR public.venue_has_capability(document.org_id, 'venue_documents_sensitive')
        )
    )
  );

DROP POLICY IF EXISTS venue_documents_storage_insert ON storage.objects;
CREATE POLICY venue_documents_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'venue-event-documents'
    AND array_length(storage.foldername(name), 1) >= 2
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN EXISTS (
        SELECT 1
        FROM public.venue_events event
        WHERE event.org_id = ((storage.foldername(name))[1])::uuid
          AND event.id = ((storage.foldername(name))[2])::uuid
          AND (
            event.created_by = auth.uid()
            OR public.venue_has_capability(event.org_id, 'venue_documents_manage')
            OR public.venue_has_capability(event.org_id, 'venue_events_manage')
          )
      )
      ELSE false
    END
  );

DROP POLICY IF EXISTS venue_documents_storage_delete ON storage.objects;
CREATE POLICY venue_documents_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'venue-event-documents'
    AND public.venue_can_delete_orphan_storage_object(name)
  );

COMMENT ON FUNCTION public.venue_has_capability(uuid, text) IS
  'Strict venue-domain permission helper. Unlike the legacy generic helper, operator does not inherit approval, counterpart, venue or sensitive-document capabilities.';
COMMENT ON TABLE public.venue_mutation_receipts IS
  'Server-only idempotency ledger. A repeated key with the same canonical payload returns the original transactional result.';
COMMENT ON VIEW public.venue_counterpart_balances IS
  'Canonical granted, consumed, reserved, pending, remaining and excess calculation for venue counterpart agreements.';
