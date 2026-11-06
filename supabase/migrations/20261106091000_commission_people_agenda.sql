-- Stable institutional guests, including people without accounts. Historical snapshots stay intact.
ALTER TABLE public.cronograma_evento_responsaveis ADD COLUMN person_id uuid;
ALTER TABLE public.cronograma_subevento_responsaveis ADD COLUMN person_id uuid;

ALTER TABLE public.cronograma_evento_responsaveis ADD CONSTRAINT cronograma_evento_responsaveis_person_org_fk FOREIGN KEY(person_id,org_id) REFERENCES public.commission_people(id,org_id);
-- Preserve timestamps and suppress notification/sync side effects during identity backfill.
-- Foreign-key triggers remain active; all application trigger modes are restored atomically.
DO $backfill$
DECLARE triggers jsonb; t record;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',tgname,'mode',tgenabled)),'[]'::jsonb) INTO triggers
 FROM pg_trigger WHERE tgrelid='public.cronograma_evento_responsaveis'::regclass AND NOT tgisinternal AND tgenabled IN ('O','A');
 FOR t IN SELECT * FROM jsonb_to_recordset(triggers) AS x(name text,mode text) LOOP
  EXECUTE format('ALTER TABLE public.cronograma_evento_responsaveis DISABLE TRIGGER %I',t.name);
 END LOOP;
 UPDATE public.cronograma_evento_responsaveis r SET person_id=p.id FROM public.commission_people p
 WHERE p.org_id=r.org_id AND p.user_id=r.org_member_user_id;
 FOR t IN SELECT * FROM jsonb_to_recordset(triggers) AS x(name text,mode text) LOOP
  EXECUTE format('ALTER TABLE public.cronograma_evento_responsaveis ENABLE %s TRIGGER %I',CASE WHEN t.mode='A' THEN 'ALWAYS' ELSE '' END,t.name);
 END LOOP;
END $backfill$;
CREATE INDEX cronograma_evento_responsaveis_person_idx ON public.cronograma_evento_responsaveis(org_id,person_id);
CREATE OR REPLACE FUNCTION public._cronograma_apply_event_responsibles(_event_id uuid,_org_id uuid,_items jsonb)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item jsonb; v_id uuid; v_person uuid; v_user uuid; v_name text; keep_ids uuid[]:='{}';
BEGIN
 IF _items IS NULL THEN RETURN; END IF;
 IF jsonb_typeof(_items)<>'array' OR jsonb_array_length(_items)>500 THEN RAISE EXCEPTION 'Lista de convidados inválida.'; END IF;
 UPDATE public.cronograma_evento_responsaveis SET is_primary=false WHERE event_id=_event_id AND is_primary;
 FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
  v_person:=nullif(item->>'person_id','')::uuid;
  v_user:=nullif(item->>'user_id','')::uuid;
  v_name:=item->>'name';
  v_id:=NULL;
  IF v_person IS NOT NULL THEN
   SELECT display_name INTO v_name FROM public.commission_people WHERE id=v_person AND org_id=_org_id;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Pessoa indisponível.'; END IF;
   -- Selection of a person never creates a user/account or grants event visibility.
   v_user:=NULL;
   SELECT id INTO v_id FROM public.cronograma_evento_responsaveis WHERE event_id=_event_id AND person_id=v_person LIMIT 1;
   IF v_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.commission_responsibles r JOIN public.commissions c ON c.id=r.commission_id
      WHERE r.person_id=v_person AND r.org_id=_org_id AND r.active AND c.is_active) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Pessoa inativa para novos convites.';
   END IF;
  ELSIF v_user IS NOT NULL THEN
   SELECT id INTO v_id FROM public.cronograma_evento_responsaveis WHERE event_id=_event_id AND org_member_user_id=v_user LIMIT 1;
  ELSE
   -- Preserve existing free-text history; new institutional selections always have person_id.
   SELECT id INTO v_id FROM public.cronograma_evento_responsaveis WHERE event_id=_event_id AND person_id IS NULL AND org_member_user_id IS NULL AND name_snapshot=v_name AND NOT(id=ANY(keep_ids)) LIMIT 1;
  END IF;
  IF v_id IS NULL THEN
   INSERT INTO public.cronograma_evento_responsaveis(event_id,org_id,person_id,org_member_user_id,name_snapshot,role,is_primary,responsible_type)
   VALUES(_event_id,_org_id,v_person,v_user,v_name,item->>'role',coalesce((item->>'is_primary')::boolean,false),CASE WHEN v_user IS NULL THEN 'external' ELSE 'member' END)
   RETURNING id INTO v_id;
  ELSE
   -- Do not remove the verified user_id of a historic link, and do not re-send assignment notifications.
   UPDATE public.cronograma_evento_responsaveis SET person_id=coalesce(v_person,person_id),name_snapshot=v_name,role=item->>'role',
    is_primary=coalesce((item->>'is_primary')::boolean,false),updated_at=now() WHERE id=v_id;
  END IF;
  keep_ids:=array_append(keep_ids,v_id);
 END LOOP;
 DELETE FROM public.cronograma_evento_responsaveis WHERE event_id=_event_id AND NOT(id=ANY(keep_ids));
END; $$;

ALTER TABLE public.cronograma_subevento_responsaveis ADD CONSTRAINT cronograma_subevento_responsaveis_person_org_fk FOREIGN KEY(person_id,org_id) REFERENCES public.commission_people(id,org_id);
-- Preserve timestamps and suppress notification/sync side effects during identity backfill.
-- Foreign-key triggers remain active; all application trigger modes are restored atomically.
DO $backfill$
DECLARE triggers jsonb; t record;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',tgname,'mode',tgenabled)),'[]'::jsonb) INTO triggers
 FROM pg_trigger WHERE tgrelid='public.cronograma_subevento_responsaveis'::regclass AND NOT tgisinternal AND tgenabled IN ('O','A');
 FOR t IN SELECT * FROM jsonb_to_recordset(triggers) AS x(name text,mode text) LOOP
  EXECUTE format('ALTER TABLE public.cronograma_subevento_responsaveis DISABLE TRIGGER %I',t.name);
 END LOOP;
 UPDATE public.cronograma_subevento_responsaveis r SET person_id=p.id FROM public.commission_people p
 WHERE p.org_id=r.org_id AND p.user_id=r.org_member_user_id;
 FOR t IN SELECT * FROM jsonb_to_recordset(triggers) AS x(name text,mode text) LOOP
  EXECUTE format('ALTER TABLE public.cronograma_subevento_responsaveis ENABLE %s TRIGGER %I',CASE WHEN t.mode='A' THEN 'ALWAYS' ELSE '' END,t.name);
 END LOOP;
END $backfill$;
CREATE INDEX cronograma_subevento_responsaveis_person_idx ON public.cronograma_subevento_responsaveis(org_id,person_id);
CREATE OR REPLACE FUNCTION public._cronograma_apply_subevent_responsibles(_subevent_id uuid,_org_id uuid,_items jsonb)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item jsonb; v_id uuid; v_person uuid; v_user uuid; v_name text; keep_ids uuid[]:='{}';
BEGIN
 IF _items IS NULL THEN RETURN; END IF;
 IF jsonb_typeof(_items)<>'array' OR jsonb_array_length(_items)>500 THEN RAISE EXCEPTION 'Lista de convidados inválida.'; END IF;
 UPDATE public.cronograma_subevento_responsaveis SET is_primary=false WHERE subevent_id=_subevent_id AND is_primary;
 FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
  v_person:=nullif(item->>'person_id','')::uuid;
  v_user:=nullif(item->>'user_id','')::uuid;
  v_name:=item->>'name';
  v_id:=NULL;
  IF v_person IS NOT NULL THEN
   SELECT display_name INTO v_name FROM public.commission_people WHERE id=v_person AND org_id=_org_id;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Pessoa indisponível.'; END IF;
   -- Selection of a person never creates a user/account or grants event visibility.
   v_user:=NULL;
   SELECT id INTO v_id FROM public.cronograma_subevento_responsaveis WHERE subevent_id=_subevent_id AND person_id=v_person LIMIT 1;
   IF v_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.commission_responsibles r JOIN public.commissions c ON c.id=r.commission_id
      WHERE r.person_id=v_person AND r.org_id=_org_id AND r.active AND c.is_active) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Pessoa inativa para novos convites.';
   END IF;
  ELSIF v_user IS NOT NULL THEN
   SELECT id INTO v_id FROM public.cronograma_subevento_responsaveis WHERE subevent_id=_subevent_id AND org_member_user_id=v_user LIMIT 1;
  ELSE
   -- Preserve existing free-text history; new institutional selections always have person_id.
   SELECT id INTO v_id FROM public.cronograma_subevento_responsaveis WHERE subevent_id=_subevent_id AND person_id IS NULL AND org_member_user_id IS NULL AND name_snapshot=v_name AND NOT(id=ANY(keep_ids)) LIMIT 1;
  END IF;
  IF v_id IS NULL THEN
   INSERT INTO public.cronograma_subevento_responsaveis(subevent_id,org_id,person_id,org_member_user_id,name_snapshot,role,is_primary,responsible_type)
   VALUES(_subevent_id,_org_id,v_person,v_user,v_name,item->>'role',coalesce((item->>'is_primary')::boolean,false),CASE WHEN v_user IS NULL THEN 'external' ELSE 'member' END)
   RETURNING id INTO v_id;
  ELSE
   -- Do not remove the verified user_id of a historic link, and do not re-send assignment notifications.
   UPDATE public.cronograma_subevento_responsaveis SET person_id=coalesce(v_person,person_id),name_snapshot=v_name,role=item->>'role',
    is_primary=coalesce((item->>'is_primary')::boolean,false),updated_at=now() WHERE id=v_id;
  END IF;
  keep_ids:=array_append(keep_ids,v_id);
 END LOOP;
 DELETE FROM public.cronograma_subevento_responsaveis WHERE subevent_id=_subevent_id AND NOT(id=ANY(keep_ids));
END; $$;

-- Validate direct table writes too. A forged JSON/RPC payload cannot cross organizations.
CREATE FUNCTION team_private.validate_event_person() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid;
BEGIN
 IF TG_TABLE_NAME='cronograma_evento_responsaveis' THEN
  SELECT org_id INTO v_org FROM public.cronograma_eventos WHERE id=NEW.event_id;
 ELSE SELECT org_id INTO v_org FROM public.cronograma_subeventos WHERE id=NEW.subevent_id;
 END IF;
 IF NEW.org_id IS DISTINCT FROM v_org THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Escopo do evento inválido.'; END IF;
 IF NEW.person_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.person_id IS DISTINCT FROM OLD.person_id) AND NOT EXISTS(
  SELECT 1 FROM public.commission_responsibles r JOIN public.commissions c ON c.id=r.commission_id
  WHERE r.person_id=NEW.person_id AND r.org_id=NEW.org_id AND r.active AND c.is_active
 ) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Pessoa indisponível para novos convites.'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER team_event_person_validate BEFORE INSERT OR UPDATE ON public.cronograma_evento_responsaveis FOR EACH ROW EXECUTE FUNCTION team_private.validate_event_person();
CREATE TRIGGER team_subevent_person_validate BEFORE INSERT OR UPDATE ON public.cronograma_subevento_responsaveis FOR EACH ROW EXECUTE FUNCTION team_private.validate_event_person();

CREATE OR REPLACE VIEW public.cronograma_eventos_full WITH(security_invoker=true) AS  SELECT id,
    org_id,
    source_key,
    title,
    description,
    category,
    event_type,
    source_year,
    start_date,
    end_date,
    month_label,
    week_label,
    status,
    priority,
    location,
    event_time,
    days_remaining,
    commission_slug,
    commission_name,
    responsible_name,
    source_sheet,
    source_row,
    source_cell,
    source_note,
    is_official_seed,
    has_exact_date,
    linked_commissions,
    subevents,
    created_by_user_id,
    created_at,
    updated_at,
    category_key,
    start_time,
    end_time,
    pending_reason,
    decision_needed,
    lock_version,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', ec.id, 'commission_id', ec.commission_id, 'commission_slug', ec.commission_slug, 'commission_name', COALESCE(c.nome, ec.commission_name_snapshot), 'relation_role', ec.relation_role) ORDER BY (ec.relation_role = 'principal'::text) DESC, ec.created_at) AS jsonb_agg
           FROM cronograma_evento_comissoes ec
             LEFT JOIN commissions c ON c.id = ec.commission_id
          WHERE ec.event_id = e.id), '[]'::jsonb) AS commissions_rel,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', er.id, 'user_id', er.org_member_user_id, 'person_id', er.person_id, 'avatar_path', p.avatar_path, 'legacy_photo', p.legacy_photo, 'name', COALESCE(p.display_name, m.nome_exibicao, er.name_snapshot), 'role', er.role, 'is_primary', er.is_primary, 'responsible_type', er.responsible_type) ORDER BY er.is_primary DESC, er.created_at) AS jsonb_agg
           FROM cronograma_evento_responsaveis er
             LEFT JOIN commission_people p ON p.id = er.person_id AND p.org_id = er.org_id
             LEFT JOIN org_members m ON m.user_id = er.org_member_user_id AND m.org_id = er.org_id
          WHERE er.event_id = e.id), '[]'::jsonb) AS responsibles_rel,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'description', s.description, 'start_date', s.start_date, 'end_date', s.end_date, 'start_time', s.start_time, 'end_time', s.end_time, 'status', s.status, 'priority', s.priority, 'commission_slug', s.commission_slug, 'responsible_name', s.responsible_name, 'sort_order', s.sort_order, 'lock_version', s.lock_version, 'created_at', s.created_at, 'updated_at', s.updated_at, 'commissions', COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', sc.id, 'commission_id', sc.commission_id, 'commission_slug', sc.commission_slug, 'commission_name', COALESCE(c2.nome, sc.commission_name_snapshot), 'relation_role', sc.relation_role)) AS jsonb_agg
                   FROM cronograma_subevento_comissoes sc
                     LEFT JOIN commissions c2 ON c2.id = sc.commission_id
                  WHERE sc.subevent_id = s.id), '[]'::jsonb), 'responsibles', COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', sr.id, 'user_id', sr.org_member_user_id, 'person_id', sr.person_id, 'avatar_path', p2.avatar_path, 'legacy_photo', p2.legacy_photo, 'name', COALESCE(p2.display_name, m2.nome_exibicao, sr.name_snapshot), 'role', sr.role, 'is_primary', sr.is_primary, 'responsible_type', sr.responsible_type)) AS jsonb_agg
                   FROM cronograma_subevento_responsaveis sr
                     LEFT JOIN commission_people p2 ON p2.id = sr.person_id AND p2.org_id = sr.org_id
                     LEFT JOIN org_members m2 ON m2.user_id = sr.org_member_user_id AND m2.org_id = sr.org_id
                  WHERE sr.subevent_id = s.id), '[]'::jsonb), 'actions', COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', sa.id, 'start_time', sa.start_time, 'title', sa.title, 'notes', sa.notes, 'responsible_user_id', sa.responsible_user_id, 'responsible_name', sa.responsible_name, 'commission_slug', sa.commission_slug, 'commission_name', sa.commission_name, 'is_done', sa.is_done, 'sort_order', sa.sort_order) ORDER BY sa.sort_order, sa.created_at) AS jsonb_agg
                   FROM cronograma_subevento_acoes sa
                  WHERE sa.subevent_id = s.id), '[]'::jsonb), 'provisions', COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', sp.id, 'description', sp.description, 'responsible_user_id', sp.responsible_user_id, 'responsible_name', sp.responsible_name, 'commission_slug', sp.commission_slug, 'commission_name', sp.commission_name, 'note', sp.note, 'is_done', sp.is_done, 'sort_order', sp.sort_order) ORDER BY sp.sort_order, sp.created_at) AS jsonb_agg
                   FROM cronograma_subevento_providencias sp
                  WHERE sp.subevent_id = s.id), '[]'::jsonb), 'guests', COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', sg.id, 'name', sg.name, 'category', sg.category, 'sort_order', sg.sort_order) ORDER BY sg.sort_order, sg.created_at) AS jsonb_agg
                   FROM cronograma_subevento_convidados sg
                  WHERE sg.subevent_id = s.id), '[]'::jsonb), 'budget', COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', sb.id, 'item', sb.item, 'supplier', sb.supplier, 'amount', sb.amount, 'sort_order', sb.sort_order) ORDER BY sb.sort_order, sb.created_at) AS jsonb_agg
                   FROM cronograma_subevento_orcamento_itens sb
                  WHERE sb.subevent_id = s.id), '[]'::jsonb)) ORDER BY s.sort_order, s.created_at, s.id) AS jsonb_agg
           FROM cronograma_subeventos s
          WHERE s.parent_event_id = e.id), '[]'::jsonb) AS subevents_rel,
    origin_source,
    origin_commission_id,
    location_code
   FROM cronograma_eventos e;

CREATE OR REPLACE FUNCTION public.cronograma_unit_agenda(_commission_id uuid)
 RETURNS TABLE(id uuid, title text, start_date date, end_date date, start_time text, end_time text, event_time text, status text, location text, description text, responsible_name text, commission_slug text, origin_source text, origin_commission_id uuid, units jsonb, people jsonb, document_count integer, lock_version bigint, location_code text, source_key text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    e.id,
    e.title,
    e.start_date,
    e.end_date,
    e.start_time::text,
    e.end_time::text,
    e.event_time::text,
    e.status,
    e.location,
    e.description,
    e.responsible_name,
    e.commission_slug,
    e.origin_source,
    e.origin_commission_id,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'commission_id', l2.commission_id,
        'slug', l2.commission_slug,
        'name', l2.commission_name_snapshot,
        'role', l2.relation_role
      ) ORDER BY l2.relation_role, l2.commission_slug)
      FROM public.cronograma_evento_comissoes l2 WHERE l2.event_id = e.id
    ), '[]'::jsonb) AS units,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'user_id', r.org_member_user_id,
        'person_id', r.person_id,
        'avatar_path', p.avatar_path,
        'legacy_photo', p.legacy_photo,
        'name', COALESCE(p.display_name,r.name_snapshot),
        'role', r.role,
        'is_primary', r.is_primary
      ) ORDER BY r.is_primary DESC, r.name_snapshot)
      FROM public.cronograma_evento_responsaveis r LEFT JOIN public.commission_people p ON p.id=r.person_id AND p.org_id=r.org_id WHERE r.event_id = e.id
    ), '[]'::jsonb) AS people,
    (SELECT count(*)::int FROM public.cronograma_evento_anexos a WHERE a.event_id = e.id) AS document_count, e.lock_version, e.location_code, e.source_key
  FROM public.cronograma_eventos e
  WHERE EXISTS (
    SELECT 1 FROM public.cronograma_evento_comissoes l
    WHERE l.event_id = e.id AND l.commission_id = _commission_id
  )
  ORDER BY e.start_date NULLS LAST, e.start_time NULLS LAST, e.title;
$function$;

REVOKE ALL ON FUNCTION team_private.validate_event_person() FROM PUBLIC,anon,authenticated;
