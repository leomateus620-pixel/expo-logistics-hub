-- Append to transactional-tests.sql BEFORE its final RESET ROLE/constraints/check SELECT.
-- Real organization units and real selected people; synthetic non-admin actor; ROLLBACK required.
RESET ROLE;
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.commission_responsibles(org_id,commission_id,person_id,user_id,display_name,relationship_role,active)
 SELECT c.org_id,c.id,a.person,a.uid,'Agenda QA synthetic 1','principal',true
 FROM public.commissions c,qa_actors a WHERE c.org_id=(SELECT org FROM qa_ids) AND c.is_active AND a.n=1
 AND NOT EXISTS(SELECT 1 FROM public.commission_responsibles r WHERE r.commission_id=c.id AND r.person_id=a.person);
CREATE TEMP TABLE qa_all_units(slug text,unit_name text,location_code text,people_selected int,central_linked boolean,passed boolean);
GRANT ALL ON qa_all_units TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',(SELECT uid::text FROM qa_actors WHERE n=1),true);
DO $$
DECLARE area record; place record; payload jsonb; saved jsonb; reloaded jsonb; people jsonb;
DECLARE central uuid; org uuid; second_id uuid; previous_version bigint; linked boolean;
BEGIN
 SELECT i.org INTO org FROM qa_ids i;
 SELECT id INTO central FROM public.commissions WHERE org_id=org AND slug='central';
 FOR area IN SELECT * FROM public.commissions WHERE org_id=org AND is_active ORDER BY slug LOOP
   SELECT jsonb_agg(jsonb_build_object('person_id',id,'name',display_name,'is_primary',rn=1) ORDER BY rn)
    INTO people FROM (SELECT DISTINCT p.id,p.display_name,row_number() OVER(ORDER BY r.is_primary DESC,p.id) rn
      FROM public.commission_responsibles r JOIN public.commission_people p ON p.id=r.person_id AND p.org_id=r.org_id
      WHERE r.commission_id=area.id AND r.active AND p.display_name NOT LIKE 'Agenda QA synthetic%') real_people;
   IF people IS NULL THEN
    SELECT jsonb_build_array(jsonb_build_object('person_id',p.id,'name',p.display_name,'is_primary',true)) INTO people
      FROM public.commission_people p JOIN public.commission_responsibles r ON r.person_id=p.id AND r.org_id=p.org_id
      WHERE r.org_id=org AND r.active AND r.commission_id=central AND p.display_name NOT LIKE 'Agenda QA synthetic%' ORDER BY p.id LIMIT 1;
   END IF;
   FOR place IN SELECT * FROM (VALUES
     ('sala_voluntarios','SALA DOS VOLUNTÁRIOS',false),
     ('casa_fenasoja','CASA FENASOJA',true),
     ('auditorio_centro_administrativo','AUDITÓRIO-CENTRO ADMINISTRATIVO',true),
     ('centro_eventos_fenasoja','CENTRO DE EVENTOS FENASOJA',true)
   ) AS locations(code,label,include_central) LOOP
    linked:=place.include_central AND area.id<>central;
    payload:=jsonb_build_object('org_id',org,'source_key','qa-all-units-'||gen_random_uuid(),'request_id',gen_random_uuid(),
      'title','[QA transacional] '||area.nome,'category','Agenda das comissões','event_type','reuniao','source_year',2028,
      'start_date','2028-05-20','start_time','09:30','end_time','10:30','location',place.label,'location_code',place.code,
      'commission_slug',area.slug,'commission_name',area.nome,'origin_commission_id',area.id,
      'commissions',jsonb_build_array(jsonb_build_object('commission_id',area.id,'relation_role','principal'))
        ||CASE WHEN linked THEN jsonb_build_array(jsonb_build_object('commission_id',central,'relation_role','participante')) ELSE '[]'::jsonb END,
      'responsibles',people);
    saved:=public.cronograma_save_event(payload,NULL);
    SELECT to_jsonb(e) INTO reloaded FROM public.cronograma_eventos_full e WHERE e.id=(saved->>'id')::uuid;
    IF reloaded IS NULL OR reloaded->>'location_code'<>place.code
      OR reloaded->>'origin_commission_id'<>area.id::text OR reloaded->>'start_time'<>'09:30:00'
      OR NOT EXISTS(SELECT 1 FROM public.cronograma_unit_agenda(area.id) e WHERE e.id=(saved->>'id')::uuid)
      OR (linked AND NOT EXISTS(SELECT 1 FROM public.cronograma_unit_agenda(central) e WHERE e.id=(saved->>'id')::uuid))
      OR (SELECT count(*) FROM public.cronograma_evento_responsaveis r WHERE r.event_id=(saved->>'id')::uuid)<>jsonb_array_length(people)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(people) p WHERE NOT EXISTS(
        SELECT 1 FROM public.cronograma_evento_responsaveis r WHERE r.event_id=(saved->>'id')::uuid AND r.person_id=(p->>'person_id')::uuid)) THEN
      RAISE EXCEPTION 'QA ALL UNITS failed for % / %',area.slug,place.code;
    END IF;
    IF place.code='centro_eventos_fenasoja' AND saved->'restaurant_forwarding'->>'event_id' IS NULL THEN
      RAISE EXCEPTION 'QA restaurant forwarding absent for %',area.slug;
    END IF;
    INSERT INTO qa_all_units VALUES(area.slug,area.nome,place.code,jsonb_array_length(people),linked OR area.id=central,true);
   END LOOP;
 END LOOP;
END $$;
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT slug,unit_name,count(*) AS locations_tested,min(people_selected) AS people_selected,
 bool_and(passed) AS passed,bool_or(central_linked) AS central_integration FROM qa_all_units GROUP BY slug,unit_name ORDER BY slug;
