-- PROPOSTO; executar antes do COMMIT e repetir em uma NOVA sessão após aplicação.
-- UUIDs de sessão: exporural.org_id / exporural.project_id conforme preflight.
DO $$
DECLARE p uuid:=current_setting('exporural.project_id')::uuid; seg uuid; n integer;
BEGIN
 SELECT id INTO STRICT seg FROM public.map_segments WHERE project_id=p AND slug='exporural' AND is_active;
 IF (SELECT count(*) FROM public.commercial_lots WHERE project_id=p AND archived_at IS NULL AND block='R')<>65
 OR (SELECT count(*) FROM public.commercial_lots WHERE project_id=p AND archived_at IS NULL AND block='S')<>35
 OR (SELECT sum(official_area_sqm) FROM public.commercial_lots WHERE project_id=p AND archived_at IS NULL AND block='R')<>29564.26
 OR (SELECT sum(official_area_sqm) FROM public.commercial_lots WHERE project_id=p AND archived_at IS NULL AND block='S')<>16203.53
 OR EXISTS(SELECT 1 FROM public.commercial_lots WHERE project_id=p AND archived_at IS NULL AND public_identifier IN ('Q-S-36','Q-R-66'))
 THEN RAISE EXCEPTION 'POST_MIGRATION_INVENTORY_OR_AREA_FAILURE'; END IF;
 IF EXISTS(SELECT 1 FROM public.commercial_lots l JOIN public.map_entities e ON e.id=l.entity_id
  WHERE l.project_id=p AND l.block IN ('R','S') AND l.archived_at IS NULL AND
  (e.is_archived OR e.public_identifier<>l.public_identifier OR e.segment_id IS DISTINCT FROM seg OR
   e.metadata->>'geometryRevision' IS DISTINCT FROM '2028-exporural-2026-09-25.1'))
 THEN RAISE EXCEPTION 'POST_MIGRATION_IDENTITY_FAILURE'; END IF;
 SELECT count(*) INTO n FROM public.map_entities WHERE project_id=p AND segment_id=seg AND NOT is_archived;
 IF NOT EXISTS(SELECT 1 FROM public.map_segments WHERE id=seg AND
  (boundary_data->>'expectedEntityCount')::integer=n AND (boundary_data->>'expectedLotCount')::integer=100)
 THEN RAISE EXCEPTION 'ENTITY_AND_LOT_BASELINES_NOT_INDEPENDENT'; END IF;
 IF EXISTS(SELECT 1 FROM public.map_entities e LEFT JOIN public.map_entity_geometries g ON g.entity_id=e.id AND g.is_current
  WHERE e.project_id=p AND e.segment_id=seg AND NOT e.is_archived GROUP BY e.id HAVING count(g.id)<>1)
 THEN RAISE EXCEPTION 'CURRENT_GEOMETRY_COUNT_FAILURE'; END IF;
 IF EXISTS(SELECT 1 FROM public.map_entities e JOIN public.map_entity_geometries g ON g.entity_id=e.id AND g.is_current
  WHERE e.project_id=p AND e.segment_id=seg AND NOT e.is_archived AND
  (NOT extensions.ST_IsValid(g.native_geometry) OR extensions.ST_IsEmpty(g.native_geometry)))
 THEN RAISE EXCEPTION 'POST_MIGRATION_GEOMETRY_FAILURE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.map_entities WHERE project_id=p AND NOT is_archived
   AND public_identifier='EXPORURAL-ACESSO-TRANSVERSAL-01' AND classification='ROAD' AND NOT is_sellable AND segment_id=seg)
 THEN RAISE EXCEPTION 'TRANSVERSE_MISSING_OR_SELLABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.commercial_lots WHERE project_id=p AND public_identifier='Q-R-56'
  AND official_area_sqm=249.03 AND archived_at IS NULL) THEN RAISE EXCEPTION 'R56_IDENTITY_FAILURE'; END IF;
END $$;
SELECT s.id,s.boundary_data,inventory.* FROM public.map_segments s
CROSS JOIN LATERAL public.get_commission_map_segment_inventory(s.id) inventory
WHERE s.project_id=current_setting('exporural.project_id')::uuid AND s.slug='exporural';
SELECT e.id,e.public_identifier,l.id AS lot_id,l.official_area_sqm,l.calculated_area_sqm,l.status,
 l.area_validation_status,e.verification_status,e.is_sellable,g.version,e.metadata->'labelAnchor' AS label,
 e.metadata->>'geometryRevision' AS revision,g.geometry
FROM public.map_entities e LEFT JOIN public.commercial_lots l ON l.entity_id=e.id AND l.archived_at IS NULL
JOIN public.map_entity_geometries g ON g.entity_id=e.id AND g.is_current
WHERE e.project_id=current_setting('exporural.project_id')::uuid AND NOT e.is_archived
AND e.metadata->>'geometryRevision'='2028-exporural-2026-09-25.1' ORDER BY e.public_identifier;
-- Resultado esperado: zero sobreposições envolvendo um lote.
SELECT a.public_identifier,b.public_identifier,extensions.ST_Area(extensions.ST_Intersection(ga.native_geometry,gb.native_geometry)) AS overlap
FROM public.map_entities a JOIN public.map_entity_geometries ga ON ga.entity_id=a.id AND ga.is_current
JOIN public.map_entities b ON b.project_id=a.project_id AND b.id>a.id AND NOT b.is_archived
JOIN public.map_entity_geometries gb ON gb.entity_id=b.id AND gb.is_current
WHERE a.project_id=current_setting('exporural.project_id')::uuid AND NOT a.is_archived
AND a.metadata->>'areaCode'='EXPORURAL' AND b.metadata->>'areaCode'='EXPORURAL'
AND (a.classification='SELLABLE_LOT' OR b.classification='SELLABLE_LOT')
AND a.classification NOT IN ('QUADRA','RURAL_EXHIBITION') AND b.classification NOT IN ('QUADRA','RURAL_EXHIBITION')
AND extensions.ST_Area(extensions.ST_Intersection(ga.native_geometry,gb.native_geometry))>1e-8;
-- Comparar os valores individuais com manifesto_lotes.json, não apenas a soma.
-- Comparar contratos/preços/reservas/vendas e UUIDs preservados com snapshot.
-- Reconsultar servidor, cache/seleção, picking, labels e cartões na aplicação real.
-- Publicação é uma etapa separada: não forçar VERIFIED/VALIDATED para publicá-la.
