-- Execute antes e depois da carga no mesmo projeto Lovable.
WITH project AS (
  SELECT id, name FROM public.map_projects WHERE id = '0538d132-34dd-4347-a33c-526edac7339c'
), targets(number, cell, code) AS (
  VALUES (8,'J10','GAST-B3-01'), (9,'J11',NULL), (10,'J12','GAST-ARVOREDO-02'),
    (11,'J13','GAST-D1-03'), (12,'J14','GAST-D2-01'), (23,'J25','GAST-B1-01'),
    (29,'J31','GAST-D5-01'), (33,'J35','GAST-J-01'), (34,'J36','GAST-J-02'), (35,'J37','GAST-J-03')
), inventory AS MATERIALIZED (
  SELECT l.id, e.id AS entity_id, l.public_identifier AS code, a.public_identifier AS structure,
    l.status, l.food_type, l.price_source, e.metadata->'gastronomyMarkerPosition' AS marker,
    p.renovacao_total AS renewal, p.segunda_total AS phase_two, l.official_area_sqm AS area,
    CASE
      WHEN l.status IN ('SALE_OPEN','SOLD') THEN sales.negotiated
      WHEN l.status <> 'UNAVAILABLE' AND p.resolution_status <> 'EXCLUIDO' THEN p.renovacao_total
    END AS commercial_value
  FROM project
  JOIN public.commercial_lots l ON l.project_id = project.id AND l.archived_at IS NULL
  JOIN public.map_entities e ON e.id = l.entity_id AND e.project_id = l.project_id AND NOT e.is_archived
  JOIN public.map_segments s ON s.id = e.segment_id AND s.project_id = project.id AND s.slug = 'gastronomia'
  JOIN public.map_entities a ON a.id = e.parent_entity_id AND a.project_id = project.id AND NOT a.is_archived
  LEFT JOIN public.commercial_lot_pricing_2028 p ON p.lot_id = l.id AND p.entity_id = e.id
  LEFT JOIN LATERAL (
    SELECT CASE WHEN count(*) = 1 THEN min(ls.negotiated_value) END AS negotiated
    FROM public.lot_sales ls WHERE ls.lot_id = l.id
      AND ls.status = CASE l.status WHEN 'SALE_OPEN' THEN 'OPEN' WHEN 'SOLD' THEN 'CONFIRMED' END
  ) sales ON true
  WHERE l.commercial_unit = 'FOOD_POINT'
), by_structure AS (
  SELECT structure, status, count(*) AS points, count(renewal) AS priced, sum(renewal) AS table_value,
    count(commercial_value) AS valued, sum(commercial_value) AS commercial_value
  FROM inventory GROUP BY structure, status
), by_status AS (
  SELECT status, count(*) AS points, count(renewal) AS priced, sum(renewal) AS table_value,
    count(commercial_value) AS valued, sum(commercial_value) AS commercial_value
  FROM inventory GROUP BY status
), candidates AS (
  SELECT t.number, t.cell, t.code AS expected_code, i.*,
    (SELECT jsonb_agg(jsonb_build_object('id',p.id,'mode',p.pricing_mode,'value',p.base_price,'per_m2',p.price_per_sqm,'active',p.is_active))
      FROM public.lot_prices p WHERE p.lot_id = i.id) AS prices,
    (SELECT jsonb_agg(jsonb_build_object('id',r.id,'status',r.status))
      FROM public.lot_reservations r WHERE r.lot_id = i.id) AS reservations,
    (SELECT jsonb_agg(jsonb_build_object('id',s.id,'status',s.status,'value',s.negotiated_value))
      FROM public.lot_sales s WHERE s.lot_id = i.id) AS sales,
    (SELECT jsonb_agg(jsonb_build_object('id',o.order_id,'state',o.contract_state))
      FROM public.lot_sale_order_items o WHERE o.lot_id = i.id) AS orders,
    (SELECT jsonb_agg(c.id) FROM public.lot_contracts c WHERE c.lot_id = i.id OR EXISTS (
      SELECT 1 FROM public.lot_contract_lots cl WHERE cl.contract_id = c.id AND cl.lot_id = i.id)) AS contracts
  FROM targets t
  LEFT JOIN inventory i ON i.code = t.code OR i.price_source->>'cell' = t.cell OR i.price_source->>'sourceNumber' = t.number::text
)
SELECT project.id, project.name,
  (SELECT jsonb_agg(jsonb_build_object('version',version,'name',name) ORDER BY version)
    FROM supabase_migrations.schema_migrations
    WHERE version IN ('20261111190000','20261116180000','20261124190000')) AS migrations,
  (SELECT jsonb_build_object('points',count(*),'table_value',sum(renewal),'commercial_value',sum(commercial_value))
    FROM inventory) AS totals,
  (SELECT jsonb_agg(to_jsonb(by_structure) ORDER BY structure,status) FROM by_structure) AS structures,
  (SELECT jsonb_agg(to_jsonb(by_status) ORDER BY status) FROM by_status) AS statuses,
  (SELECT jsonb_agg(to_jsonb(candidates) ORDER BY number,id) FROM candidates) AS units,
  (SELECT count(*) FROM public.lot_sale_orders o WHERE o.project_id = project.id) AS order_count,
  (SELECT jsonb_build_object('units',count(*),'area',sum(l.official_area_sqm)) FROM public.commercial_lots l
    JOIN public.map_entities e ON e.id = l.entity_id AND e.project_id = l.project_id
    WHERE l.project_id = project.id AND l.commercial_unit = 'SQUARE_METER' AND l.archived_at IS NULL AND NOT e.is_archived) AS metric
FROM project;
