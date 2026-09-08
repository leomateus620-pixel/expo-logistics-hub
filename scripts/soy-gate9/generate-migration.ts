import { readFileSync, writeFileSync } from 'node:fs';
import { OFFICIAL_RENDERED_ENTITIES } from '../../src/features/commercial-map/data/officialReference2026';
const original=JSON.parse(readFileSync('docs/screenshots/soy-gate9/before-inventory.json','utf8')).entities;
const specs=['E-07','RUA-MONTEVIDEU-COZINHA','RES-A9'].map(id=>{
 const e=OFFICIAL_RENDERED_ENTITIES.find(e=>e.publicIdentifier===id)!;
 return {identifier:id,name:e.name,description:e.description,classification:e.classification,layer:e.layerId.replace('reference:',''),height:e.geometry.extrusionHeight,geometry:{type:'Polygon',coordinates:e.geometry.coordinates},oldGeometry:original.find(e=>e.publicIdentifier===id)?.geometry.coordinates??null,metadata:{...e.metadata,sourceRevision:'2026.9-soy-gate9.1'}};
});
const sql=`-- Scoped, repeatable park infrastructure update. No sales, RLS or permissions change.
-- Run through the normal migration deployment, never from a renderer read.
BEGIN;
DO $migration$
DECLARE
  p record; spec jsonb; current_entity public.map_entities%ROWTYPE;
  current_geometry public.map_entity_geometries%ROWTYPE;
  v_layer_id uuid; v_entity_id uuid; next_version integer; delta numeric;
  specs jsonb := $seed$${JSON.stringify(specs)}$seed$::jsonb;
BEGIN
  FOR p IN SELECT project.* FROM public.map_projects project
    WHERE NOT project.is_archived AND project.reference_revision LIKE '2026%'
      AND EXISTS (SELECT 1 FROM public.map_entities e JOIN public.map_entity_geometries g ON g.entity_id=e.id AND g.is_current
        WHERE e.project_id=project.id AND e.public_identifier='B7' AND NOT e.is_archived
          AND abs((g.geometry#>>'{coordinates,0,0,0}')::numeric-3.163636363636364)<0.00001
          AND abs((g.geometry#>>'{coordinates,0,0,1}')::numeric+10.429090961445787)<0.00001)
      AND EXISTS (SELECT 1 FROM public.map_entities e JOIN public.map_entity_geometries g ON g.entity_id=e.id AND g.is_current
        WHERE e.project_id=project.id AND e.public_identifier='A9' AND NOT e.is_archived
          AND abs((g.geometry#>>'{coordinates,0,0,0}')::numeric-13.396363636363631)<0.00001
          AND abs((g.geometry#>>'{coordinates,0,0,1}')::numeric+36.981818367469884)<0.00001)
    FOR UPDATE
  LOOP
    FOR spec IN SELECT value FROM jsonb_array_elements(specs) LOOP
      SELECT * INTO current_entity FROM public.map_entities
        WHERE project_id=p.id AND public_identifier=spec->>'identifier' FOR UPDATE;
      IF FOUND THEN
        IF current_entity.is_sellable OR current_entity.classification<>spec->>'classification'
          OR current_entity.metadata->>'seedManaged' IS DISTINCT FROM 'true'
          OR EXISTS(SELECT 1 FROM public.commercial_lots WHERE commercial_lots.entity_id=current_entity.id)
        THEN RAISE EXCEPTION 'Infrastructure identity conflict: project %, entity %',p.id,spec->>'identifier'; END IF;
        v_entity_id := current_entity.id;
        SELECT * INTO current_geometry FROM public.map_entity_geometries g
          WHERE g.entity_id=current_entity.id AND g.is_current FOR UPDATE;
        IF FOUND AND current_entity.metadata->>'sourceRevision' IS DISTINCT FROM '2026.9-soy-gate9.1' THEN
          IF spec->>'identifier'<>'E-07' OR jsonb_array_length(current_geometry.geometry#>'{coordinates,0}')<>5 THEN
            RAISE EXCEPTION 'Existing geometry requires review: %',spec->>'identifier';
          END IF;
          SELECT max(abs((actual.point->>axis.n)::numeric-(expected.point->>axis.n)::numeric)) INTO delta
            FROM jsonb_array_elements(current_geometry.geometry#>'{coordinates,0}') WITH ORDINALITY actual(point,i)
            JOIN jsonb_array_elements(spec#>'{oldGeometry,0}') WITH ORDINALITY expected(point,i) ON actual.i=expected.i
            CROSS JOIN (VALUES(0),(1)) axis(n);
          IF delta IS NULL OR delta>0.00001 THEN RAISE EXCEPTION 'Custom E-07 geometry requires review'; END IF;
        END IF;
        UPDATE public.map_entities SET name=spec->>'name',description=spec->>'description',
          is_archived=false,verification_status='NEEDS_REVIEW',metadata=metadata||(spec->'metadata'),updated_at=now()
          WHERE id=v_entity_id AND (is_archived OR name IS DISTINCT FROM spec->>'name'
            OR description IS DISTINCT FROM spec->>'description' OR metadata IS DISTINCT FROM metadata||(spec->'metadata'));
      ELSE
        SELECT id INTO v_layer_id FROM public.map_layers WHERE project_id=p.id AND layer_key=spec->>'layer';
        IF v_layer_id IS NULL THEN RAISE EXCEPTION 'Missing infrastructure layer % in project %',spec->>'layer',p.id; END IF;
        INSERT INTO public.map_entities(project_id,layer_id,public_identifier,name,description,classification,
          verification_status,is_sellable,is_archived,metadata)
          VALUES(p.id,v_layer_id,spec->>'identifier',spec->>'name',spec->>'description',spec->>'classification',
          'NEEDS_REVIEW',false,false,spec->'metadata') RETURNING id INTO v_entity_id;
        current_geometry := NULL;
      END IF;
      IF current_geometry.id IS NULL OR current_geometry.geometry IS DISTINCT FROM spec->'geometry'
        OR current_geometry.extrusion_height<>(spec->>'height')::numeric THEN
        SELECT coalesce(max(g.version),0)+1 INTO next_version FROM public.map_entity_geometries g WHERE g.entity_id=v_entity_id;
        UPDATE public.map_entity_geometries g SET is_current=false WHERE g.entity_id=v_entity_id AND g.is_current;
        INSERT INTO public.map_entity_geometries(project_id,entity_id,geometry,elevation,extrusion_height,rotation,
          version,is_current,change_reason)
          VALUES(p.id,v_entity_id,spec->'geometry',0,(spec->>'height')::numeric,0,next_version,true,
          '2026.9-soy-gate9.1: satellite-registered infrastructure; previous geometry retained');
      END IF;
    END LOOP;
  END LOOP;
END $migration$;
COMMIT;
`;
writeFileSync('supabase/migrations/20260908010000_soy_restroom_gate9_infrastructure.sql',sql);
writeFileSync('docs/screenshots/soy-gate9/migration-specs.json',JSON.stringify(specs,null,2));
