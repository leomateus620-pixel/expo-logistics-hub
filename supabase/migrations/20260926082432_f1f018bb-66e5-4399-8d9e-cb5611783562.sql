CREATE OR REPLACE FUNCTION public.exporural_add_unnumbered_56878() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_project uuid:='0538d132-34dd-4347-a33c-526edac7339c';v_segment uuid:='feb6fcb7-5bc4-4725-ad74-d408a7b56522';v_entity uuid;v_lot uuid;v_org uuid;v_layer uuid;v_parent uuid;v_geom jsonb:='{"type":"Polygon","coordinates":[[[24.68837516,-13.450066446],[21.747534344,-12.896686115],[18.525656934,-12.040628063],[18.475592803,-11.57],[14.073937134,-11.57],[14.061813005,-13.096302304],[14.149275247,-13.301302308],[14.399055627,-13.454521817],[24.68837516,-13.450066446]]]}'::jsonb;v_shape extensions.geometry;v_conflict text;v_actor uuid;v_result jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('exporural-56878'),hashtext(v_project::text));
 SELECT id INTO v_entity FROM public.map_entities WHERE project_id=v_project AND public_identifier='EXPORURAL-AREA-56878';
 IF v_entity IS NOT NULL THEN
   SELECT id INTO v_lot FROM public.commercial_lots WHERE entity_id=v_entity AND archived_at IS NULL;
   IF v_lot IS NULL THEN RAISE EXCEPTION 'AREA_PARTIAL_REGISTRATION'; END IF;
   RETURN jsonb_build_object('entity_id',v_entity,'lot_id',v_lot,'already_applied',true);
 END IF;
 IF (SELECT count(*) FROM public.commercial_lots WHERE project_id=v_project AND archived_at IS NULL AND official_area_sqm=568.78)<>0 THEN RAISE EXCEPTION 'AREA_ALREADY_EXISTS_RECONCILE'; END IF;
 SELECT p.org_id INTO v_org FROM public.map_projects p WHERE p.id=v_project;
 SELECT e.id INTO v_parent FROM public.map_entities e WHERE e.project_id=v_project AND e.public_identifier='QUADRA-R' AND NOT e.is_archived;
 SELECT e.layer_id INTO v_layer FROM public.map_entities e WHERE e.id=v_parent AND e.segment_id=v_segment;
 IF v_org IS NULL OR v_layer IS NULL THEN RAISE EXCEPTION 'AREA_SCOPE_NOT_FOUND'; END IF;
 SELECT id INTO v_actor FROM auth.users WHERE email='fenasojalog@gmail.com' LIMIT 1;
 v_shape:=extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(v_geom::text),0);
 IF NOT extensions.ST_IsValid(v_shape) OR extensions.ST_Area(v_shape)<=0 THEN RAISE EXCEPTION 'AREA_INVALID_GEOMETRY'; END IF;
 SELECT e.public_identifier INTO v_conflict FROM public.map_entities e JOIN public.map_entity_geometries g ON g.entity_id=e.id AND g.is_current WHERE e.project_id=v_project AND NOT e.is_archived AND e.classification IN ('SELLABLE_LOT','ATTRACTION','ROAD','PEDESTRIAN_PATH','BUILDING') AND extensions.ST_Area(extensions.ST_Intersection(g.native_geometry,v_shape))>0.00001 LIMIT 1;
 IF v_conflict IS NOT NULL THEN RAISE EXCEPTION 'AREA_GEOMETRY_CONFLICT: %',v_conflict; END IF;
 INSERT INTO public.map_entities(project_id,layer_id,parent_entity_id,segment_id,public_identifier,name,description,classification,verification_status,is_sellable,metadata,created_by,updated_by) VALUES(v_project,v_layer,v_parent,v_segment,'EXPORURAL-AREA-56878','Área comercial · Quadra R','Área sem numeração na planta oficial Fenasoja 2028, 568,78 m².','SELLABLE_LOT','VERIFIED',true,jsonb_build_object('areaCode','EXPORURAL','entityType','EXPORURAL_COMMERCIAL_LOT','block','R','lotNumber',null,'pricingGroup','quadra-r-01-12','officialAreaSqm',568.78,'geometryRevision','2028-exporural-2026-09-25.1','source','Fenasoja_Parque_Ajustes_300dpi.png','mapUnitsPerMeter',0.15),v_actor,v_actor) RETURNING id INTO v_entity;
 INSERT INTO public.map_entity_geometries(project_id,entity_id,geometry,elevation,extrusion_height,rotation,version,is_current,change_reason,created_by) VALUES(v_project,v_entity,v_geom,0,0.15,0,1,true,'Delimitação da área sem número de 568,78 m² no raster oficial 300 dpi; calibração da revisão Exporural 2028.',v_actor);
 INSERT INTO public.commercial_lots(project_id,entity_id,public_identifier,block,lot_number,display_name,description,status,official_area_sqm,calculated_area_sqm,area_validation_status,created_by,updated_by) VALUES(v_project,v_entity,'EXPORURAL-AREA-56878','R',NULL,'Área comercial · Quadra R','Área sem número no mapa oficial, acima do Mirante.','AVAILABLE',568.78,round(extensions.ST_Area(v_shape)/0.0225,4),'VALIDATED',v_actor,v_actor) RETURNING id INTO v_lot;
 INSERT INTO public.map_activity_logs(org_id,project_id,entity_id,lot_id,action,after_state,reason,actor_user_id) VALUES(v_org,v_project,v_entity,v_lot,'create',jsonb_build_object('status','AVAILABLE','official_area_sqm',568.78,'lot_number',null,'pricing_group','quadra-r-01-12'),'Área sem número incluída como lote após autorização específica; demais parcelas e Mirante preservados.',v_actor);
 v_result:=jsonb_build_object('entity_id',v_entity,'lot_id',v_lot,'already_applied',false);
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.exporural_add_unnumbered_56878() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.exporural_add_unnumbered_56878() TO service_role;