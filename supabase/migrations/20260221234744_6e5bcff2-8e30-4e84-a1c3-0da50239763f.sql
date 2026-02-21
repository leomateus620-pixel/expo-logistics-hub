
-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE public.org_role AS ENUM ('admin', 'gestor', 'operador', 'leitura');
CREATE TYPE public.vehicle_status AS ENUM ('disponivel', 'em_uso', 'manutencao', 'inativo');
CREATE TYPE public.cart_status AS ENUM ('disponivel', 'em_uso', 'manutencao', 'inativo');
CREATE TYPE public.transport_status AS ENUM ('pendente', 'em_andamento', 'concluido', 'cancelado');
CREATE TYPE public.priority_level AS ENUM ('baixa', 'media', 'alta', 'urgente');
CREATE TYPE public.task_status_enum AS ENUM ('pendente', 'concluida');
CREATE TYPE public.task_recurrence AS ENUM ('nenhuma', 'diaria', 'semanal', 'mensal');
CREATE TYPE public.schedule_status AS ENUM ('rascunho', 'ativa', 'encerrada');
CREATE TYPE public.assignment_status AS ENUM ('confirmado', 'pendente', 'cancelado');
CREATE TYPE public.audit_action AS ENUM ('create', 'update', 'delete', 'status_change', 'import');
CREATE TYPE public.cart_action AS ENUM ('retirada', 'devolucao', 'mudanca_status', 'nota');

-- ============================================================
-- TABLES FIRST (no RLS yet)
-- ============================================================

-- A) ORGANIZATIONS
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- B) ORG_MEMBERS
CREATE TABLE public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.org_role NOT NULL DEFAULT 'operador',
  nome_exibicao text,
  cargo text,
  telefone text,
  avatar_color text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- C) VEHICLES
CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  placa text NOT NULL,
  renavam text,
  marca text,
  modelo text,
  ano integer,
  cor text,
  categoria text DEFAULT 'outro',
  km_atual numeric DEFAULT 0,
  status public.vehicle_status NOT NULL DEFAULT 'disponivel',
  responsavel_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, placa)
);

-- D) ELECTRIC_CARTS
CREATE TABLE public.electric_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nome text,
  status public.cart_status NOT NULL DEFAULT 'disponivel',
  responsavel_user_id uuid,
  retirada_em timestamptz,
  devolucao_prevista_em timestamptz,
  devolucao_em timestamptz,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, codigo)
);

-- E) CART_HISTORY
CREATE TABLE public.cart_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  cart_id uuid NOT NULL REFERENCES public.electric_carts(id) ON DELETE CASCADE,
  action public.cart_action NOT NULL,
  before_data jsonb,
  after_data jsonb,
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- F) GUESTS
CREATE TABLE public.guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text DEFAULT 'outro',
  prioridade public.priority_level,
  hotel_nome text,
  checkin_em timestamptz,
  checkout_em timestamptz,
  telefone text,
  email text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- G) TRANSPORTS
CREATE TABLE public.transports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  titulo text,
  guest_id uuid REFERENCES public.guests(id) ON DELETE SET NULL,
  tipo text DEFAULT 'outro',
  origem text NOT NULL,
  destino text NOT NULL,
  inicio_em timestamptz NOT NULL,
  fim_em timestamptz,
  status public.transport_status NOT NULL DEFAULT 'pendente',
  prioridade public.priority_level DEFAULT 'media',
  passageiros_qtd integer,
  motorista_user_id uuid,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- H) EVENTS
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  inicio_em timestamptz NOT NULL,
  fim_em timestamptz NOT NULL,
  local text,
  tipo_tag text,
  descricao text,
  origem text DEFAULT 'manual',
  external_id text,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- I) TASKS
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descricao text,
  prioridade public.priority_level DEFAULT 'media',
  due_em timestamptz,
  status public.task_status_enum NOT NULL DEFAULT 'pendente',
  recorrencia public.task_recurrence DEFAULT 'nenhuma',
  recorrencia_regra jsonb,
  assignee_user_id uuid,
  created_by_user_id uuid NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- J) SCHEDULES
CREATE TABLE public.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  nome text NOT NULL,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  status public.schedule_status NOT NULL DEFAULT 'rascunho',
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- K) SCHEDULE_SHIFTS
CREATE TABLE public.schedule_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  inicio_em timestamptz NOT NULL,
  fim_em timestamptz NOT NULL,
  local text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- L) SHIFT_ASSIGNMENTS
CREATE TABLE public.shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  schedule_shift_id uuid NOT NULL REFERENCES public.schedule_shifts(id) ON DELETE CASCADE,
  member_user_id uuid NOT NULL,
  funcao text,
  status public.assignment_status NOT NULL DEFAULT 'pendente',
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, schedule_shift_id, member_user_id)
);

-- M) AUDIT_LOG
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  action public.audit_action NOT NULL,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDICES
-- ============================================================
CREATE INDEX idx_vehicles_org_status ON public.vehicles(org_id, status);
CREATE INDEX idx_transports_org_status ON public.transports(org_id, status);
CREATE INDEX idx_transports_vehicle_status ON public.transports(vehicle_id, status);
CREATE INDEX idx_tasks_org_assignee_status ON public.tasks(org_id, assignee_user_id, status);
CREATE INDEX idx_shifts_schedule ON public.schedule_shifts(schedule_id);
CREATE INDEX idx_assignments_shift ON public.shift_assignments(schedule_shift_id);
CREATE INDEX idx_audit_org_entity ON public.audit_log(org_id, entity, entity_id);
CREATE INDEX idx_cart_history_cart ON public.cart_history(cart_id);
CREATE UNIQUE INDEX idx_events_external ON public.events(org_id, origem, external_id) WHERE external_id IS NOT NULL;

-- ============================================================
-- HELPER FUNCTIONS (SECURITY DEFINER) — tables exist now
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_org_ids(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(array_agg(org_id), '{}')
  FROM public.org_members
  WHERE user_id = _user_id AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.get_user_org_role(_user_id uuid, _org_id uuid)
RETURNS public.org_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.org_members
  WHERE user_id = _user_id AND org_id = _org_id AND is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = _user_id AND org_id = _org_id AND is_active = true
  );
$$;

-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.electric_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- organizations
CREATE POLICY "org_select" ON public.organizations FOR SELECT TO authenticated
  USING (id = ANY(public.get_user_org_ids(auth.uid())));
CREATE POLICY "org_insert" ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "org_update" ON public.organizations FOR UPDATE TO authenticated
  USING (public.get_user_org_role(auth.uid(), id) = 'admin');
CREATE POLICY "org_delete" ON public.organizations FOR DELETE TO authenticated
  USING (public.get_user_org_role(auth.uid(), id) = 'admin');

-- org_members
CREATE POLICY "members_select" ON public.org_members FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "members_insert" ON public.org_members FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor')
    OR (user_id = auth.uid())
  );
CREATE POLICY "members_update" ON public.org_members FOR UPDATE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));
CREATE POLICY "members_delete" ON public.org_members FOR DELETE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) = 'admin');

-- vehicles
CREATE POLICY "vehicles_select" ON public.vehicles FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "vehicles_insert" ON public.vehicles FOR INSERT TO authenticated
  WITH CHECK (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));
CREATE POLICY "vehicles_update" ON public.vehicles FOR UPDATE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));
CREATE POLICY "vehicles_delete" ON public.vehicles FOR DELETE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));

-- electric_carts
CREATE POLICY "carts_select" ON public.electric_carts FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "carts_insert" ON public.electric_carts FOR INSERT TO authenticated
  WITH CHECK (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));
CREATE POLICY "carts_update" ON public.electric_carts FOR UPDATE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor', 'operador'));
CREATE POLICY "carts_delete" ON public.electric_carts FOR DELETE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));

-- cart_history
CREATE POLICY "cart_history_select" ON public.cart_history FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "cart_history_insert" ON public.cart_history FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id));

-- guests
CREATE POLICY "guests_select" ON public.guests FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "guests_insert" ON public.guests FOR INSERT TO authenticated
  WITH CHECK (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor', 'operador'));
CREATE POLICY "guests_update" ON public.guests FOR UPDATE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor', 'operador'));
CREATE POLICY "guests_delete" ON public.guests FOR DELETE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));

-- transports
CREATE POLICY "transports_select" ON public.transports FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "transports_insert" ON public.transports FOR INSERT TO authenticated
  WITH CHECK (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor', 'operador'));
CREATE POLICY "transports_update" ON public.transports FOR UPDATE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor', 'operador'));
CREATE POLICY "transports_delete" ON public.transports FOR DELETE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));

-- events
CREATE POLICY "events_select" ON public.events FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "events_insert" ON public.events FOR INSERT TO authenticated
  WITH CHECK (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor', 'operador'));
CREATE POLICY "events_update" ON public.events FOR UPDATE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor', 'operador'));
CREATE POLICY "events_delete" ON public.events FOR DELETE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));

-- tasks
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor', 'operador'));
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor', 'operador'));
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));

-- schedules
CREATE POLICY "schedules_select" ON public.schedules FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "schedules_insert" ON public.schedules FOR INSERT TO authenticated
  WITH CHECK (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));
CREATE POLICY "schedules_update" ON public.schedules FOR UPDATE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));
CREATE POLICY "schedules_delete" ON public.schedules FOR DELETE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));

-- schedule_shifts
CREATE POLICY "shifts_select" ON public.schedule_shifts FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "shifts_insert" ON public.schedule_shifts FOR INSERT TO authenticated
  WITH CHECK (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));
CREATE POLICY "shifts_update" ON public.schedule_shifts FOR UPDATE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));
CREATE POLICY "shifts_delete" ON public.schedule_shifts FOR DELETE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));

-- shift_assignments
CREATE POLICY "assignments_select" ON public.shift_assignments FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "assignments_insert" ON public.shift_assignments FOR INSERT TO authenticated
  WITH CHECK (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor', 'operador'));
CREATE POLICY "assignments_update" ON public.shift_assignments FOR UPDATE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor', 'operador'));
CREATE POLICY "assignments_delete" ON public.shift_assignments FOR DELETE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));

-- audit_log
CREATE POLICY "audit_insert" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "audit_select" ON public.audit_log FOR SELECT TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));

-- ============================================================
-- REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.electric_carts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.guests;

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_org_members_updated BEFORE UPDATE ON public.org_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_vehicles_updated BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_electric_carts_updated BEFORE UPDATE ON public.electric_carts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_guests_updated BEFORE UPDATE ON public.guests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_transports_updated BEFORE UPDATE ON public.transports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_events_updated BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_schedules_updated BEFORE UPDATE ON public.schedules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_schedule_shifts_updated BEFORE UPDATE ON public.schedule_shifts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_shift_assignments_updated BEFORE UPDATE ON public.shift_assignments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
