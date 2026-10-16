-- Isolated synthetic PostgreSQL 16 fixture only. Native RPC bodies are loaded by
-- actions-qa.mjs from their existing migrations, not reimplemented as mocks.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF; END $$;
ALTER TABLE public.map_projects ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
CREATE TABLE public.map_entities(id uuid PRIMARY KEY,project_id uuid NOT NULL REFERENCES public.map_projects(id),is_archived boolean NOT NULL DEFAULT false);
CREATE TABLE public.commercial_lots(id uuid PRIMARY KEY,project_id uuid NOT NULL REFERENCES public.map_projects(id),entity_id uuid NOT NULL REFERENCES public.map_entities(id),
  display_name text NOT NULL,status text NOT NULL DEFAULT 'AVAILABLE',archived_at timestamptz,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_by uuid);
CREATE TABLE public.lot_reservations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lot_id uuid NOT NULL REFERENCES public.commercial_lots(id),
  company_name text NOT NULL,document_number text,contact_name text NOT NULL,phone text,email text,expires_at timestamptz NOT NULL,
  responsible_user_id uuid NOT NULL,notes text,status text NOT NULL DEFAULT 'ACTIVE',cancelled_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX test_one_active_reservation ON public.lot_reservations(lot_id) WHERE status='ACTIVE';
CREATE TABLE public.lot_negotiations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lot_id uuid NOT NULL REFERENCES public.commercial_lots(id),company_name text NOT NULL,
  document_number text,contact_name text,proposed_value numeric,notes text,responsible_user_id uuid NOT NULL,status text NOT NULL DEFAULT 'ACTIVE',updated_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX test_one_active_negotiation ON public.lot_negotiations(lot_id) WHERE status='ACTIVE';
CREATE TABLE public.lot_sales(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lot_id uuid NOT NULL REFERENCES public.commercial_lots(id),status text);
CREATE TABLE public.lot_contracts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lot_id uuid REFERENCES public.commercial_lots(id),is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.lot_contract_lots(contract_id uuid NOT NULL REFERENCES public.lot_contracts(id),lot_id uuid NOT NULL REFERENCES public.commercial_lots(id));
CREATE TABLE public.lot_status_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lot_id uuid NOT NULL,previous_status text,new_status text,reason text,changed_by uuid);
CREATE TABLE public.map_activity_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid,project_id uuid,entity_id uuid,lot_id uuid,action text,before_state jsonb,after_state jsonb,reason text,actor_user_id uuid);
CREATE TABLE public.venue_events(id uuid PRIMARY KEY,org_id uuid NOT NULL,title text NOT NULL,status text NOT NULL DEFAULT 'confirmado',
  version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),visibility text NOT NULL DEFAULT 'restrita',created_by uuid,responsible_user_id uuid);
CREATE TABLE public.venue_event_responsibles(org_id uuid,event_id uuid,user_id uuid);
CREATE TABLE public.venue_spaces(id uuid PRIMARY KEY,org_id uuid NOT NULL,parent_space_id uuid,type text NOT NULL,slug text NOT NULL);
CREATE TABLE public.venue_event_spaces(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,event_id uuid NOT NULL,space_id uuid NOT NULL);
CREATE TABLE public.audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid,actor_user_id uuid,entity text,entity_id uuid,action text,before_data jsonb,after_data jsonb);
CREATE TABLE public.actions_test_external_effects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),target_id uuid);
CREATE FUNCTION public.actions_test_parent_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO public.actions_test_external_effects(target_id) VALUES(NEW.id); RETURN NEW; END $$;
-- A spy models an external-effect trigger boundary. It is not a mock assertion
-- that live FCM/Google integration was exercised; native note SQL must not touch its parent.
CREATE TRIGGER actions_test_parent_effect AFTER UPDATE ON public.venue_events FOR EACH ROW EXECUTE FUNCTION public.actions_test_parent_changed();

INSERT INTO public.map_entities(id,project_id) SELECT ('40000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid FROM generate_series(1,30)n;
INSERT INTO public.commercial_lots(id,project_id,entity_id,display_name) SELECT ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,('40000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Espaço persistido '||n FROM generate_series(1,30)n;
INSERT INTO public.map_entities VALUES('40000000-0000-4000-8000-000000000099','20000000-0000-4000-8000-000000000002',false);
INSERT INTO public.commercial_lots(id,project_id,entity_id,display_name) VALUES('50000000-0000-4000-8000-000000000099','20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000099','Espaço outra organização');
INSERT INTO public.venue_events(id,org_id,title,created_by) VALUES
  ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Evento operacional fixture','00000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Evento de outra organização','00000000-0000-4000-8000-000000000006');
INSERT INTO public.venue_spaces VALUES('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',NULL,'arena','slug-diferente-da-rota'),
  ('80000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','subespaco','subespaco');
INSERT INTO public.venue_event_spaces(org_id,event_id,space_id) VALUES('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002');

INSERT INTO public.ai_conversations(id,org_id,user_id,title,worker_id)
  SELECT ('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001'::uuid,
    ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Conversa sintética','arena' FROM generate_series(1,5)n;
INSERT INTO public.ai_conversations VALUES('70000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000006','Conversa outra org','mapa',now(),now());
INSERT INTO public.ai_conversations VALUES('70000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000007','Leitura com sales sem view','mapa',now(),now());

-- Synthetic business RLS is deliberately deny-all for direct access. The tested
-- native SECURITY DEFINER RPCs must enforce their own caller-scoped authorization.
ALTER TABLE public.venue_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_negotiations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.venue_events,public.commercial_lots,public.lot_reservations,public.lot_negotiations TO authenticated;

CREATE FUNCTION public.actions_test_force_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.event='executed' AND EXISTS(SELECT 1 FROM public.ai_actions a WHERE a.id=NEW.action_id AND a.target_id='50000000-0000-4000-8000-000000000019') THEN
    RAISE EXCEPTION 'synthetic failure: secret-must-not-escape';
  END IF;
  RETURN NEW;
END $$;
