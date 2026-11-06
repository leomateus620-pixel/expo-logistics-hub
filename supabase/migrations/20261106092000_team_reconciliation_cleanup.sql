-- Cross-unit matches require an admin. Never reveal the matched person's name, ID or contact.
CREATE UNIQUE INDEX team_reconciliation_id ON team_private.reconciliation_queue(id);

CREATE FUNCTION public.team_avatar_orphans() RETURNS text[] LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(array_agg(path),'{}'::text[]) FROM (
 SELECT a.path FROM team_private.avatar_objects a WHERE a.created_at<now()-interval '1 day'
 AND NOT EXISTS(SELECT 1 FROM public.commission_people p WHERE p.avatar_path=a.path)
 ORDER BY a.created_at LIMIT 30) x;
$$;
CREATE FUNCTION public.team_avatar_forget(_paths text[]) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 DELETE FROM team_private.avatar_objects a WHERE a.path=ANY(_paths)
 AND NOT EXISTS(SELECT 1 FROM public.commission_people p WHERE p.avatar_path=a.path);
$$;
REVOKE ALL ON FUNCTION public.team_avatar_orphans(),public.team_avatar_forget(text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.team_avatar_orphans(),public.team_avatar_forget(text[]) TO service_role;

CREATE FUNCTION public.team_reconciliation_requests(_org_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF public.get_user_org_role(auth.uid(),_org_id) IS DISTINCT FROM 'admin'::public.org_role THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Acesso administrativo necessário.'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'commission_id',r.commission_id,'unit_name',c.nome,
 'name',r.proposed_name,'email',r.proposed_email,'candidates',(
 SELECT jsonb_agg(DISTINCT jsonb_build_object('person_id',p.id,'name',p.display_name)) FROM team_private.contacts x
 JOIN public.commission_people p ON p.id=x.person_id WHERE x.org_id=r.org_id AND x.email=r.proposed_email)))
 FROM team_private.reconciliation_queue r JOIN public.commissions c ON c.id=r.commission_id WHERE r.org_id=_org_id AND r.resolved_at IS NULL),'[]'::jsonb);
END; $$;
CREATE FUNCTION public.team_resolve_reconciliation(_request_id uuid,_person_id uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r team_private.reconciliation_queue; v_person uuid:=_person_id;
BEGIN
 SELECT * INTO STRICT r FROM team_private.reconciliation_queue WHERE id=_request_id FOR UPDATE;
 IF public.get_user_org_role(auth.uid(),r.org_id) IS DISTINCT FROM 'admin'::public.org_role THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Acesso administrativo necessário.'; END IF;
 IF r.resolved_at IS NOT NULL THEN RETURN; END IF;
 IF v_person IS NULL THEN
  INSERT INTO public.commission_people(org_id,display_name) VALUES(r.org_id,r.proposed_name) RETURNING id INTO v_person;
 END IF;
 PERFORM public.team_link_existing_person(r.commission_id,v_person,r.proposed_email);
 UPDATE team_private.reconciliation_queue SET resolved_at=now() WHERE id=r.id;
END; $$;
REVOKE ALL ON FUNCTION public.team_reconciliation_requests(uuid),public.team_resolve_reconciliation(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.team_reconciliation_requests(uuid),public.team_resolve_reconciliation(uuid,uuid) TO authenticated,service_role;

-- The administrative queue records work in the existing admin-only provisioning flow.
-- It never changes auth.users, passwords, roles, capabilities or sends messages.
CREATE FUNCTION public.team_update_access_request(_request_id uuid,_expected_state text,_state text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r team_private.access_requests;
BEGIN
 SELECT * INTO STRICT r FROM team_private.access_requests WHERE id=_request_id FOR UPDATE;
 IF public.get_user_org_role(auth.uid(),r.org_id) IS DISTINCT FROM 'admin'::public.org_role THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Acesso administrativo necessário.';
 END IF;
 IF _state NOT IN ('processing','completed','declined') OR _state IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Situação inválida.';
 END IF;
 IF r.state IS DISTINCT FROM _expected_state THEN
  RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Solicitação alterada. Atualize a lista.';
 END IF;
 UPDATE team_private.access_requests SET state=_state,updated_at=now() WHERE id=r.id;
 INSERT INTO team_private.audit(actor_id,org_id,commission_id,person_id,action)
 VALUES(auth.uid(),r.org_id,r.commission_id,r.person_id,'access_'||_state);
END; $$;
REVOKE ALL ON FUNCTION public.team_update_access_request(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.team_update_access_request(uuid,text,text) TO authenticated,service_role;

-- Keep legacy readers/provisioning inserts compatible without a second source of identity.
-- Direct authenticated writes remain revoked. Account links cannot be reassigned here.
CREATE FUNCTION team_private.membership_identity() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.commission_people;
BEGIN
 IF NEW.person_id IS NULL THEN
  IF NEW.user_id IS NOT NULL THEN
   SELECT * INTO p FROM public.commission_people WHERE org_id=NEW.org_id AND user_id=NEW.user_id;
  END IF;
  IF p.id IS NULL THEN
   INSERT INTO public.commission_people(id,org_id,display_name,user_id,legacy_photo)
   VALUES(NEW.id,NEW.org_id,NEW.display_name,NEW.user_id,true) RETURNING * INTO p;
  END IF;
  NEW.person_id:=p.id;
 ELSE
  SELECT * INTO STRICT p FROM public.commission_people WHERE id=NEW.person_id AND org_id=NEW.org_id;
 END IF;
 IF NEW.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM p.user_id THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Vincule a conta somente pelo fluxo de confirmação de identidade.';
 END IF;
 NEW.display_name:=p.display_name;
 NEW.user_id:=p.user_id;
 RETURN NEW;
END; $$;
CREATE TRIGGER team_membership_identity BEFORE INSERT OR UPDATE ON public.commission_responsibles
 FOR EACH ROW EXECUTE FUNCTION team_private.membership_identity();
CREATE FUNCTION team_private.mirror_person_name() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
  UPDATE public.commission_responsibles SET display_name=NEW.display_name WHERE person_id=NEW.id;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER team_mirror_person_name AFTER UPDATE OF display_name ON public.commission_people
 FOR EACH ROW EXECUTE FUNCTION team_private.mirror_person_name();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA team_private FROM PUBLIC,anon,authenticated;

-- Realtime publishes only public identities and memberships; polling remains a fallback.
DO $$ DECLARE t text; BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  FOREACH t IN ARRAY ARRAY['commission_people','commission_responsibles'] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',t);
   END IF;
  END LOOP;
 END IF;
END $$;
