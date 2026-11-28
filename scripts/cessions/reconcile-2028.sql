-- Read-only query used before and after the seed on the connected 2028 map.
WITH inventory AS (
  SELECT l.*, p.renovacao_total, p.segunda_total, p.resolution_status,
    (SELECT CASE WHEN count(*) = 1 THEN min(s.negotiated_value) END
     FROM public.lot_sales s
     WHERE s.lot_id = l.id AND s.status = CASE l.status
       WHEN 'SOLD' THEN 'CONFIRMED' WHEN 'SALE_OPEN' THEN 'OPEN' END) AS sale_value
  FROM public.commercial_lots l
  JOIN public.map_entities e ON e.id = l.entity_id AND NOT e.is_archived
  LEFT JOIN public.commercial_lot_pricing_2028 p ON p.lot_id = l.id AND p.entity_id = l.entity_id
  WHERE l.project_id = '0538d132-34dd-4347-a33c-526edac7339c' AND l.archived_at IS NULL
    AND l.status <> 'UNAVAILABLE'
    AND (l.commercial_package_role IS DISTINCT FROM 'COMPONENT' OR l.status IN ('SALE_OPEN','SOLD'))
    AND NOT EXISTS (
      SELECT FROM public.commercial_lots c
      WHERE c.commercial_package_principal_lot_id = l.id AND c.archived_at IS NULL
        AND c.status IN ('SALE_OPEN','SOLD')
    )
    AND (
      EXISTS (SELECT FROM public.map_entity_geometries g WHERE g.entity_id = e.id AND g.is_current)
      OR e.classification = 'FOOD_POINT' OR l.commercial_package_role = 'PRINCIPAL'
    )
)
SELECT count(*) AS qty,
  count(*) FILTER (WHERE status = 'AVAILABLE') AS available,
  sum(official_area_sqm) AS area,
  sum(official_area_sqm) FILTER (WHERE status = 'AVAILABLE') AS available_area,
  sum(CASE WHEN status IN ('SOLD','SALE_OPEN') THEN sale_value
    WHEN resolution_status <> 'EXCLUIDO' THEN renovacao_total END) AS potential1,
  sum(CASE WHEN status IN ('SOLD','SALE_OPEN') THEN sale_value
    WHEN resolution_status <> 'EXCLUIDO' THEN segunda_total END) AS potential2,
  sum(renovacao_total) FILTER (WHERE status = 'AVAILABLE' AND resolution_status <> 'EXCLUIDO') AS available1,
  sum(segunda_total) FILTER (WHERE status = 'AVAILABLE' AND resolution_status <> 'EXCLUIDO') AS available2,
  count(*) FILTER (WHERE status = 'SOLD') AS sold,
  count(*) FILTER (WHERE status = 'SALE_OPEN') AS open,
  sum(sale_value) FILTER (WHERE status = 'SOLD') AS sold_value,
  sum(sale_value) FILTER (WHERE status = 'SALE_OPEN') AS open_value
FROM inventory;
