ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS unit_type text NOT NULL DEFAULT 'comissao',
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 999,
  ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_legacy boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS normalized_name text GENERATED ALWAYS AS (public.venue_normalize_name(nome)) STORED;

DO $$ BEGIN
  ALTER TABLE public.commissions ADD CONSTRAINT commissions_unit_type_check CHECK (unit_type IN ('comissao','assessoria'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS commissions_org_normalized_uidx ON public.commissions (org_id, normalized_name);

CREATE TABLE IF NOT EXISTS public.commission_responsibles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  commission_id uuid NOT NULL,
  user_id uuid,
  display_name text NOT NULL,
  normalized_name text GENERATED ALWAYS AS (public.venue_normalize_name(display_name)) STORED,
  responsible_type text NOT NULL DEFAULT 'pessoa',
  relationship_role text NOT NULL DEFAULT 'principal',
  is_primary boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_responsibles_commission_org_fkey FOREIGN KEY (commission_id, org_id) REFERENCES public.commissions(id, org_id) ON DELETE CASCADE,
  CONSTRAINT commission_responsibles_type_check CHECK (responsible_type IN ('pessoa','equipe')),
  CONSTRAINT commission_responsibles_role_check CHECK (relationship_role IN ('principal','corresponsavel','copresidente','equipe_apoio'))
);

CREATE UNIQUE INDEX IF NOT EXISTS commission_responsibles_unique_person
  ON public.commission_responsibles (commission_id, normalized_name);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_responsibles TO authenticated;
GRANT ALL ON public.commission_responsibles TO service_role;

ALTER TABLE public.commission_responsibles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commission_responsibles_select ON public.commission_responsibles;
CREATE POLICY commission_responsibles_select ON public.commission_responsibles
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

DROP POLICY IF EXISTS commission_responsibles_insert ON public.commission_responsibles;
CREATE POLICY commission_responsibles_insert ON public.commission_responsibles
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role,'gestor'::org_role]));

DROP POLICY IF EXISTS commission_responsibles_update ON public.commission_responsibles;
CREATE POLICY commission_responsibles_update ON public.commission_responsibles
  FOR UPDATE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role,'gestor'::org_role]))
  WITH CHECK (public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role,'gestor'::org_role]));

DROP POLICY IF EXISTS commission_responsibles_delete ON public.commission_responsibles;
CREATE POLICY commission_responsibles_delete ON public.commission_responsibles
  FOR DELETE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role,'gestor'::org_role]));

DROP TRIGGER IF EXISTS commission_responsibles_set_updated_at ON public.commission_responsibles;
CREATE TRIGGER commission_responsibles_set_updated_at
  BEFORE UPDATE ON public.commission_responsibles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.sync_official_units_2028(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  rec record;
  v_commission_id uuid;
  v_actor uuid;
  v_created int := 0;
  v_renamed int := 0;
  v_resp int := 0;
  v_stake int := 0;
  v_slug text;
  v_norm text;
  v_person text;
  v_order int;
  units jsonb := '[
    {"t":"assessoria","o":1,"n":"Assessoria de Sistemas","r":["Jeferson Araújo"],"c":[]},
    {"t":"assessoria","o":2,"n":"Assessoria de Sustentabilidade","r":["Estela Zamberlan Schwerz"],"c":[]},
    {"t":"assessoria","o":3,"n":"Assessoria de Imprensa","r":["Deise Anelise Froelich"],"c":["Francine Boijink"]},
    {"t":"assessoria","o":4,"n":"Assessoria de Projetos e Captações","r":["Jardel Hillesheim"],"c":["Equipe do EP"]},
    {"t":"assessoria","o":5,"n":"Assessoria Jurídica","r":["José Mauro Barbieri"],"c":["Sandra Lameira"]},
    {"t":"assessoria","o":6,"n":"Assessoria de Relações Internacionais","r":["Julio Bravo","Roberto Racho","Sara Kirchhof"],"c":[]},
    {"t":"assessoria","o":7,"n":"Assessoria de Protocolo","r":["Jorge Luiz Viana"],"c":[]},
    {"t":"comissao","o":1,"n":"Agricultura, Soja e Derivados","r":["Vanessa Matraszek Gnoatto"],"c":[]},
    {"t":"comissao","o":2,"n":"Soy Summit","r":["Cassio Feltes"],"c":[]},
    {"t":"comissao","o":3,"n":"Inovação e Tecnologia","r":["Felipe Carpenedo"],"c":[]},
    {"t":"comissao","o":4,"n":"Arte e Cultura","r":["Leonardo Chitolina"],"c":[]},
    {"t":"comissao","o":5,"n":"Bilheteria","r":["José Fernando Borella"],"c":[]},
    {"t":"comissao","o":6,"n":"Credenciamento","r":["Larissa Dallalba"],"c":[]},
    {"t":"comissao","o":7,"n":"Cooperativismo","r":["Alexandre Dall''Agnese"],"c":[]},
    {"t":"comissao","o":8,"n":"Espaço do Automóvel","r":["Elton Walker"],"c":[]},
    {"t":"comissao","o":9,"n":"Exporural","r":["Germano Tessmer Büttuow"],"c":[]},
    {"t":"comissao","o":10,"n":"Indústria, Comércio e Serviços","r":["Felipe Bortoli"],"c":[]},
    {"t":"comissao","o":11,"n":"Infraestrutura e Segurança do Trabalho","r":["Roberto Steffen"],"c":[]},
    {"t":"comissao","o":12,"n":"Relacionamento e Experiência","r":["Fernanda Mataruco"],"c":[]},
    {"t":"comissao","o":13,"n":"Logística, Hotelaria e Turismo","r":["Eduardo Santos"],"c":[]},
    {"t":"comissao","o":14,"n":"Novas Gerações","r":["Josyane Cristina Heck"],"c":[]},
    {"t":"comissao","o":15,"n":"Pecuária","r":["Elisandra Simão Reis"],"c":[]},
    {"t":"comissao","o":16,"n":"Prevenção e Combate a Incêndio","r":["Cap. Leonardo Ruy Dambroz"],"c":[]},
    {"t":"comissao","o":17,"n":"Recepção e Eventos","r":["Taís Broglio"],"c":[]},
    {"t":"comissao","o":18,"n":"Relações Estratégicas","r":["Miguel Nedel"],"c":["Diana Nedel"]},
    {"t":"comissao","o":19,"n":"Saúde, Bem-Estar e Acessibilidade","r":["Rosa Zorzan de Paula"],"c":[]},
    {"t":"comissao","o":20,"n":"Segurança","r":["Ten. Cel. Vanessa Peripolli"],"c":[]},
    {"t":"comissao","o":21,"n":"Mercosul","r":["Dario Ñunes"],"c":[]},
    {"t":"comissao","o":22,"n":"Serviços","r":["Valtair Dorneles"],"c":[]},
    {"t":"comissao","o":23,"n":"Soja Store","r":["Tina Manjabosco"],"c":[]},
    {"t":"comissao","o":24,"n":"Shows","r":["Daniel Ribeiro"],"c":[]},
    {"t":"comissao","o":25,"n":"Gastronomia","r":["Rodrigo Calixto"],"c":[]},
    {"t":"comissao","o":26,"n":"Acolhimento e Bem Comum","r":["Bruna Pacheco de Quadros"],"c":[]}
  ]'::jsonb;
  aliases jsonb := '{
    "recepcao e cerimonial":"Recepção e Eventos",
    "inovacao e experiencia":"Inovação e Tecnologia",
    "assessoria projetos e captacoes institucionais":"Assessoria de Projetos e Captações",
    "saude bem estar e acessibilidade":"Saúde, Bem-Estar e Acessibilidade",
    "logistica":"Logística, Hotelaria e Turismo",
    "infraestrutura":"Infraestrutura e Segurança do Trabalho",
    "acessibilidade e inclusao":"Saúde, Bem-Estar e Acessibilidade"
  }'::jsonb;
  alias_key text;
BEGIN
  SELECT user_id INTO v_actor FROM public.org_members
   WHERE org_id = _org_id AND is_active AND role = 'admin'::org_role
   ORDER BY created_at LIMIT 1;
  IF v_actor IS NULL THEN
    SELECT user_id INTO v_actor FROM public.org_members WHERE org_id = _org_id AND is_active ORDER BY created_at LIMIT 1;
  END IF;

  -- rename legacy equivalents to official naming (preserves ids and event links)
  FOR alias_key IN SELECT jsonb_object_keys(aliases) LOOP
    UPDATE public.commissions c
       SET nome = aliases->>alias_key
     WHERE c.org_id = _org_id
       AND c.normalized_name = alias_key
       AND public.venue_normalize_name(aliases->>alias_key) <> alias_key
       AND NOT EXISTS (
         SELECT 1 FROM public.commissions d
          WHERE d.org_id = _org_id AND d.id <> c.id
            AND d.normalized_name = public.venue_normalize_name(aliases->>alias_key));
    IF FOUND THEN v_renamed := v_renamed + 1; END IF;
  END LOOP;

  FOR rec IN SELECT * FROM jsonb_array_elements(units) AS u(v) LOOP
    v_norm := public.venue_normalize_name(rec.v->>'n');
    v_slug := regexp_replace(v_norm, ' ', '-', 'g');

    SELECT id INTO v_commission_id FROM public.commissions
      WHERE org_id = _org_id AND normalized_name = v_norm LIMIT 1;

    IF v_commission_id IS NULL THEN
      INSERT INTO public.commissions (org_id, nome, slug, unit_type, display_order, is_official, is_active, is_legacy)
      VALUES (_org_id, rec.v->>'n', v_slug, rec.v->>'t', (rec.v->>'o')::int, true, true, false)
      ON CONFLICT (org_id, slug) DO UPDATE SET nome = EXCLUDED.nome
      RETURNING id INTO v_commission_id;
      v_created := v_created + 1;
    ELSE
      UPDATE public.commissions
         SET nome = rec.v->>'n',
             unit_type = rec.v->>'t',
             display_order = (rec.v->>'o')::int,
             is_official = true,
             is_legacy = false,
             is_active = true
       WHERE id = v_commission_id;
    END IF;

    v_order := 0;
    FOR v_person IN SELECT jsonb_array_elements_text(rec.v->'r') LOOP
      v_order := v_order + 1;
      INSERT INTO public.commission_responsibles (org_id, commission_id, display_name, responsible_type, relationship_role, is_primary, display_order)
      VALUES (_org_id, v_commission_id, v_person, 'pessoa', CASE WHEN v_order = 1 THEN 'principal' ELSE 'corresponsavel' END, v_order = 1, v_order)
      ON CONFLICT (commission_id, normalized_name) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            relationship_role = EXCLUDED.relationship_role,
            is_primary = EXCLUDED.is_primary,
            display_order = EXCLUDED.display_order,
            active = true;
      v_resp := v_resp + 1;
    END LOOP;

    FOR v_person IN SELECT jsonb_array_elements_text(rec.v->'c') LOOP
      v_order := v_order + 1;
      INSERT INTO public.commission_responsibles (org_id, commission_id, display_name, responsible_type, relationship_role, is_primary, display_order)
      VALUES (
        _org_id, v_commission_id, v_person,
        CASE WHEN v_person ILIKE 'equipe%' THEN 'equipe' ELSE 'pessoa' END,
        CASE WHEN v_person ILIKE 'equipe%' THEN 'equipe_apoio' ELSE 'copresidente' END,
        false, v_order)
      ON CONFLICT (commission_id, normalized_name) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            responsible_type = EXCLUDED.responsible_type,
            relationship_role = EXCLUDED.relationship_role,
            display_order = EXCLUDED.display_order,
            active = true;
      v_resp := v_resp + 1;
    END LOOP;

    -- link responsibles to existing users when the name matches an org member
    UPDATE public.commission_responsibles cr
       SET user_id = m.user_id
      FROM public.org_members m
     WHERE cr.commission_id = v_commission_id
       AND cr.user_id IS NULL
       AND m.org_id = _org_id
       AND m.is_active
       AND public.venue_normalize_name(m.nome_exibicao) = cr.normalized_name;

    -- mirror as venue stakeholder (requester option in Restaurante e Arena)
    IF v_actor IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.venue_stakeholders s
       WHERE s.org_id = _org_id AND s.active AND s.normalized_name = v_norm
    ) THEN
      INSERT INTO public.venue_stakeholders (org_id, legal_name, relationship_type, created_by, updated_by)
      VALUES (_org_id, rec.v->>'n', 'comissao', v_actor, v_actor)
      ON CONFLICT DO NOTHING;
      v_stake := v_stake + 1;
    END IF;
  END LOOP;

  -- units not in the official list stay available but flagged as legacy
  UPDATE public.commissions
     SET is_legacy = true
   WHERE org_id = _org_id AND is_official = false;

  RETURN jsonb_build_object('created', v_created, 'renamed', v_renamed, 'responsibles', v_resp, 'stakeholders', v_stake);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_official_units_2028(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.sync_official_units_2028(uuid) TO authenticated, service_role;