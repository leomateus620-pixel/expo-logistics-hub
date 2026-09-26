-- PROPOSTO. SOMENTE LEITURA. Nenhuma alteração foi aplicada ao Supabase pelo Codex.
-- Executar no ambiente confirmado pelo Lovable. Não executar a RPC de expiração.
-- Antes deste arquivo, definir na sessão os UUIDs reais, nunca IDs reference:.
-- SELECT set_config('exporural.org_id', <org_id confirmado>::text, false);
-- SELECT set_config('exporural.project_id', <project_id confirmado>::text, false);
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $$
DECLARE org uuid := nullif(current_setting('exporural.org_id',true),'')::uuid;
        project uuid := nullif(current_setting('exporural.project_id',true),'')::uuid;
BEGIN
  IF org IS NULL OR project IS NULL THEN RAISE EXCEPTION 'CONFIRMAR_ORG_E_PROJETO'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.map_projects WHERE id=project AND org_id=org AND NOT is_archived)
    THEN RAISE EXCEPTION 'AMBIENTE_OU_PROJETO_DIVERGENTE'; END IF;
END $$;

-- Identidade do ambiente e revisão efetivamente implantada (não inferir do código).
SELECT current_database(), current_user, auth.uid() AS actor, p.*
FROM public.map_projects p WHERE p.id=current_setting('exporural.project_id')::uuid;
SELECT s.* FROM public.map_segments s
WHERE s.project_id=current_setting('exporural.project_id')::uuid AND s.slug='exporural';
SELECT c.* FROM public.map_calibrations c
WHERE c.project_id=current_setting('exporural.project_id')::uuid ORDER BY c.version DESC;

-- Esquema vivo deve ser comparado às migrations citadas no relatório.
SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name IN
 ('map_projects','map_entities','map_entity_geometries','map_geometry_versions','commercial_lots',
  'map_segments','map_lot_lineage','map_activity_logs','map_reference_migration_snapshots',
  'lot_prices','lot_reservations','lot_negotiations','lot_sales','lot_contracts','lot_contract_versions')
ORDER BY table_name,ordinal_position;
-- O script transacional exige execução de manutenção autorizada com identidade
-- auditável e privilégios já existentes. authenticated possui apenas SELECT
-- na tabela de snapshots na migration consultada. Não alterar RLS para contornar.
SELECT current_user,auth.uid(),has_table_privilege(current_user,
 'public.map_reference_migration_snapshots','INSERT,UPDATE') AS can_write_snapshot;
SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN ('map_reference_migration_snapshots',
 'map_entities','commercial_lots','map_segments');
SELECT conrelid::regclass AS relation,conname,pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid IN ('public.map_entities'::regclass,'public.commercial_lots'::regclass,
 'public.map_entity_geometries'::regclass,'public.map_lot_lineage'::regclass);

-- Inventário real distingue entidades/lotes/apoios/vias. Código local: 108/95;
-- migration histórica: 111/95. Qualquer outra composição exige reconciliação.
SELECT e.segment_id,e.classification,count(*) AS active_entities,
 count(l.id) FILTER (WHERE l.archived_at IS NULL) AS active_lots
FROM public.map_entities e LEFT JOIN public.commercial_lots l ON l.entity_id=e.id
WHERE e.project_id=current_setting('exporural.project_id')::uuid AND NOT e.is_archived
GROUP BY e.segment_id,e.classification ORDER BY e.segment_id,e.classification;
SELECT l.block,count(*) AS lots,sum(l.official_area_sqm) AS official_area_sqm
FROM public.commercial_lots l WHERE l.project_id=current_setting('exporural.project_id')::uuid
AND l.block IN ('R','S') AND l.archived_at IS NULL GROUP BY l.block;

-- Exportar este resultado para resolver UUIDs e alimentar approvals_resolvidas.json.
-- public_identifier é somente um atributo para conferir uma identidade já resolvida.
SELECT e.id AS entity_id,l.id AS lot_id,e.public_identifier,e.name,e.classification,
 e.segment_id,e.metadata,e.is_archived,e.updated_at AS entity_updated_at,
 l.status,l.official_area_sqm,l.calculated_area_sqm,l.archived_at,l.updated_at AS lot_updated_at,
 g.id AS geometry_id,g.version AS geometry_version,g.calibration_version,
 md5(g.geometry::text) AS geometry_md5,g.geometry,
 EXISTS(SELECT 1 FROM public.lot_reservations x WHERE x.lot_id=l.id AND x.status='ACTIVE') AS active_reservation,
 EXISTS(SELECT 1 FROM public.lot_negotiations x WHERE x.lot_id=l.id AND x.status='ACTIVE') AS active_negotiation,
 EXISTS(SELECT 1 FROM public.lot_sales x WHERE x.lot_id=l.id AND x.status='CONFIRMED') AS confirmed_sale,
 EXISTS(SELECT 1 FROM public.lot_contracts x WHERE x.lot_id=l.id AND x.is_active) AS active_contract
FROM public.map_entities e
LEFT JOIN public.commercial_lots l ON l.entity_id=e.id
LEFT JOIN public.map_entity_geometries g ON g.entity_id=e.id AND g.is_current
WHERE e.project_id=current_setting('exporural.project_id')::uuid
AND (e.metadata->>'areaCode'='EXPORURAL' OR e.public_identifier ~ '^Q-[RS]-[0-9]{2}$'
 OR e.public_identifier IN ('RUA-UBIRETAMA-LATERAL-R55','RUA-LESTE-EXPORURAL','B7','B8','D3'))
ORDER BY e.public_identifier;

-- Colisões incluem arquivados: os índices únicos não são parciais.
SELECT 'entity' AS kind,upper(public_identifier) AS code,array_agg(id) AS ids,count(*)
FROM public.map_entities WHERE project_id=current_setting('exporural.project_id')::uuid
GROUP BY upper(public_identifier) HAVING count(*)>1
UNION ALL
SELECT 'lot',upper(public_identifier),array_agg(id),count(*) FROM public.commercial_lots
WHERE project_id=current_setting('exporural.project_id')::uuid
GROUP BY upper(public_identifier) HAVING count(*)>1;
SELECT e.id,e.public_identifier,count(g.id) AS current_geometries
FROM public.map_entities e LEFT JOIN public.map_entity_geometries g ON g.entity_id=e.id AND g.is_current
WHERE e.project_id=current_setting('exporural.project_id')::uuid AND NOT e.is_archived
GROUP BY e.id,e.public_identifier HAVING count(g.id)<>1;
SELECT e.id,e.public_identifier,g.version,extensions.ST_IsValidReason(g.native_geometry)
FROM public.map_entities e JOIN public.map_entity_geometries g ON g.entity_id=e.id AND g.is_current
WHERE e.project_id=current_setting('exporural.project_id')::uuid
AND (NOT extensions.ST_IsValid(g.native_geometry) OR extensions.ST_IsEmpty(g.native_geometry));

-- Histórico completo: não filtrar só preço ou contrato ativo ao resolver linhagem.
SELECT 'prices' AS kind,to_jsonb(x) AS record FROM public.lot_prices x JOIN public.commercial_lots l ON l.id=x.lot_id
WHERE l.project_id=current_setting('exporural.project_id')::uuid AND l.block IN ('R','S')
UNION ALL SELECT 'reservations',to_jsonb(x) FROM public.lot_reservations x JOIN public.commercial_lots l ON l.id=x.lot_id
WHERE l.project_id=current_setting('exporural.project_id')::uuid AND l.block IN ('R','S')
UNION ALL SELECT 'negotiations',to_jsonb(x) FROM public.lot_negotiations x JOIN public.commercial_lots l ON l.id=x.lot_id
WHERE l.project_id=current_setting('exporural.project_id')::uuid AND l.block IN ('R','S')
UNION ALL SELECT 'sales',to_jsonb(x) FROM public.lot_sales x JOIN public.commercial_lots l ON l.id=x.lot_id
WHERE l.project_id=current_setting('exporural.project_id')::uuid AND l.block IN ('R','S')
UNION ALL SELECT 'contracts',to_jsonb(x) FROM public.lot_contracts x JOIN public.commercial_lots l ON l.id=x.lot_id
WHERE l.project_id=current_setting('exporural.project_id')::uuid AND l.block IN ('R','S');
SELECT v.* FROM public.lot_contract_versions v JOIN public.lot_contracts c ON c.id=v.contract_id
JOIN public.commercial_lots l ON l.id=c.lot_id
WHERE l.project_id=current_setting('exporural.project_id')::uuid AND l.block IN ('R','S');
SELECT x.* FROM public.map_lot_lineage x
JOIN public.commercial_lots l ON l.id=x.source_lot_id OR l.id=x.target_lot_id
WHERE l.project_id=current_setting('exporural.project_id')::uuid AND l.block IN ('R','S');
SELECT s.id,s.area_code,s.source_revision,s.payload_hash,s.status,s.applied_at
FROM public.map_reference_migration_snapshots s WHERE s.project_id=current_setting('exporural.project_id')::uuid;
SELECT p.oid::regprocedure AS routine,pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('apply_exporural_reference_2026',
 'get_commission_map_segment_inventory','map_segment_lineage_inventory_delta',
 'sync_commercial_map_reference_2026','resolve_commission_map_segment_slug');
ROLLBACK;
