import json
from pathlib import Path
root=Path.cwd();a=json.load(open(root/'docs/exporural/2028-revisao-2026-10-20/junction-apron.json'))
geom=json.dumps(a['geometry'],separators=(',',':'))
old=json.dumps(a['previous_geometry'],separators=(',',':'))
sql="""-- User-requested apron at Johan/Ubiretama. Existing commercial faces are immutable.
DO $surface$
DECLARE p uuid:='0538d132-34dd-4347-a33c-526edac7339c';
 seg uuid:='feb6fcb7-5bc4-4725-ad74-d408a7b56522';
 rev text:='2028-exporural-2026-10-21.surfaces.1';
 e uuid:='__ID__'; sid uuid; before_state jsonb; ids uuid[]; after_state jsonb;
 pavement jsonb:=$pavement$__GEOM__$pavement$::jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('commercial-map:exporural:'||p,0));
 IF EXISTS(SELECT 1 FROM public.map_reference_migration_snapshots WHERE project_id=p AND source_revision=rev AND status='APPLIED') THEN RETURN; END IF;
 LOCK TABLE public.map_entities,public.map_entity_geometries,public.commercial_lots IN SHARE ROW EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM public.map_segments WHERE id=seg AND project_id=p AND source_reference='2028-exporural-2026-10-20.1' AND is_active) THEN RAISE EXCEPTION 'OFFICIAL_REVISION_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.map_entity_geometries WHERE entity_id=e AND is_current AND version=__VERSION__ AND geometry=$previous$__OLD__$previous$::jsonb) THEN RAISE EXCEPTION 'ROAD_CHANGED_REQUIRES_REVIEW'; END IF;
 SELECT array_agg(id) INTO ids FROM public.map_entities WHERE project_id=p AND (id=e OR public_identifier IN ('EXPORURAL-PASSAGEM-LESTE-01','EXPORURAL-PASSAGEM-LESTE-02','Q-R-41','Q-R-44','Q-R-45','Q-R-46','Q-R-49','Q-R-52','Q-R-53','Q-R-54')) AND NOT is_archived;
 before_state:=pg_temp.exporural_state(p,ids);
 IF EXISTS(SELECT 1 FROM public.commercial_lots l JOIN public.map_entities me ON me.id=l.entity_id JOIN public.map_entity_geometries g ON g.entity_id=me.id AND g.is_current WHERE me.project_id=p AND NOT me.is_archived AND l.archived_at IS NULL AND ST_Area(ST_Intersection(ST_GeomFromGeoJSON(pavement),ST_GeomFromGeoJSON(g.geometry)))>0.0000001) THEN RAISE EXCEPTION 'PAVEMENT_INTERSECTS_COMMERCIAL_PARCEL'; END IF;
 INSERT INTO public.map_reference_migration_snapshots(org_id,project_id,area_code,source_revision,payload_hash,status,snapshot,created_by)
 VALUES('985888b8-155f-4bbe-b6b9-6bef2893d99b',p,'EXPORURAL_SURFACES',rev,md5(pavement::text),'PENDING',before_state,auth.uid()) RETURNING id INTO sid;
 UPDATE public.map_entity_geometries SET geometry=pavement,version=version+1,change_reason=rev,updated_at=now() WHERE entity_id=e AND is_current;
 UPDATE public.map_entity_geometries SET extrusion_height=.032,version=version+1,change_reason=rev,updated_at=now() WHERE entity_id IN (SELECT id FROM public.map_entities WHERE project_id=p AND public_identifier IN ('EXPORURAL-PASSAGEM-LESTE-01','EXPORURAL-PASSAGEM-LESTE-02') AND NOT is_archived) AND is_current AND extrusion_height<>.032;
 UPDATE public.map_entities me SET metadata=metadata||jsonb_build_object('surfaceRevision',rev,'geometryHash',encode(sha256(convert_to(g.geometry::text,'UTF8')),'hex'),'revisionGeometryVersion',g.version) FROM public.map_entity_geometries g WHERE me.id=g.entity_id AND g.is_current AND me.id=ANY(ids) AND me.classification='ROAD';
 -- The initial physical template was a corner. Internal children have no second
 -- street frontage; do not copy its corner flag or approve a corner premium.
 UPDATE public.commercial_lots SET is_corner=false WHERE entity_id=ANY(ids) AND public_identifier IN ('Q-R-41','Q-R-44','Q-R-45','Q-R-46','Q-R-49','Q-R-52','Q-R-53','Q-R-54');
 after_state:=pg_temp.exporural_state(p,ids);
 IF pg_temp.exporural_business(before_state)<>pg_temp.exporural_business(after_state) THEN RAISE EXCEPTION 'COMMERCIAL_LINK_CHANGED'; END IF;
 UPDATE public.map_reference_migration_snapshots SET status='APPLIED',applied_at=now(),apply_result=jsonb_build_object('entityIds',ids,'afterStateMd5',md5(after_state::text),'commercialPolygonsChanged',0,'businessLinksUnchanged',true,'addedAsphaltLocalSq',__AREA__) WHERE id=sid;
 INSERT INTO public.map_activity_logs(org_id,project_id,entity_id,action,reason,before_state,after_state,actor_user_id) VALUES('985888b8-155f-4bbe-b6b9-6bef2893d99b',p,e,'EXPORURAL_SURFACE_CORRECTED',rev,jsonb_build_object('snapshotId',sid),jsonb_build_object('commercialPolygonsChanged',0),auth.uid());
END;
$surface$;
""".replace('__ID__',a['entity_id']).replace('__GEOM__',geom).replace('__OLD__',old).replace('__VERSION__',str(a['previous_version'])).replace('__AREA__',str(a['added_area_local_sq']))
helpers=(root/'scripts/exporural/official-2026-10-20/state.sql').read_text()
(root/'supabase/migrations/20261021130000_exporural_surface_corrections.sql').write_text(helpers+'\n'+sql)
