-- Session-local helpers. Run as the existing migration owner; never expose RPCs.
CREATE OR REPLACE FUNCTION pg_temp.exporural_state(p uuid, ids uuid[])
RETURNS jsonb LANGUAGE sql AS $state$
SELECT jsonb_build_object(
 'project',(SELECT to_jsonb(x) FROM public.map_projects x WHERE id=p),
 'segment',(SELECT to_jsonb(x) FROM public.map_segments x WHERE project_id=p AND slug='exporural'),
 'entities',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.map_entities x WHERE project_id=p AND (ids IS NULL OR id=ANY(ids))),'[]'),
 'geometries',coalesce((SELECT jsonb_agg(to_jsonb(x)-'native_geometry' ORDER BY x.id) FROM public.map_entity_geometries x WHERE project_id=p AND (ids IS NULL OR entity_id=ANY(ids))),'[]'),
 'geometry_versions',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.map_geometry_versions x WHERE project_id=p AND (ids IS NULL OR entity_id=ANY(ids))),'[]'),
 'lots',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.commercial_lots x WHERE project_id=p AND (ids IS NULL OR entity_id=ANY(ids))),'[]'),
 'rules',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.commercial_price_rules x WHERE project_id=p OR project_id IS NULL),'[]'),
 'prices',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_prices x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids))),'[]'),
 'overrides',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.commercial_lot_price_overrides x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids))),'[]'),
 'reservations',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_reservations x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids))),'[]'),
 'negotiations',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_negotiations x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids))),'[]'),
 'sales',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_sales x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids))),'[]'),
 'orders',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_sale_orders x WHERE x.project_id=p AND (ids IS NULL OR x.id IN (SELECT i.order_id FROM public.lot_sale_order_items i JOIN public.commercial_lots l ON l.id=i.lot_id WHERE l.entity_id=ANY(ids)))),'[]'),
 'items',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_sale_order_items x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids))),'[]'),
 'installments',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_sale_installments x JOIN public.lot_sale_orders o ON o.id=x.order_id WHERE o.project_id=p AND (ids IS NULL OR o.id IN (SELECT i.order_id FROM public.lot_sale_order_items i JOIN public.commercial_lots l ON l.id=i.lot_id WHERE l.entity_id=ANY(ids)))),'[]'),
 'contracts',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_contracts x WHERE x.id IN (SELECT c.id FROM public.lot_contracts c JOIN public.commercial_lots l ON l.id=c.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids)) UNION SELECT cl.contract_id FROM public.lot_contract_lots cl JOIN public.commercial_lots l ON l.id=cl.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids)))),'[]'),
 'contract_lots',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.contract_id,x.lot_id) FROM public.lot_contract_lots x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids))),'[]'),
 'contract_versions',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_contract_versions x WHERE x.contract_id IN (SELECT c.id FROM public.lot_contracts c JOIN public.commercial_lots l ON l.id=c.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids)) UNION SELECT cl.contract_id FROM public.lot_contract_lots cl JOIN public.commercial_lots l ON l.id=cl.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids)))),'[]'),
 'lineage',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.map_lot_lineage x WHERE x.source_lot_id IN (SELECT id FROM public.commercial_lots WHERE project_id=p AND (ids IS NULL OR entity_id=ANY(ids))) OR x.target_lot_id IN (SELECT id FROM public.commercial_lots WHERE project_id=p AND (ids IS NULL OR entity_id=ANY(ids)))),'[]')
);
$state$;

CREATE OR REPLACE FUNCTION pg_temp.exporural_business(s jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT s-'project'-'segment'-'entities'-'geometries'-'geometry_versions'-'lots'-'rules'-'prices'-'lineage';
$$;

WITH p AS (SELECT '0538d132-34dd-4347-a33c-526edac7339c'::uuid id),
active AS (SELECT l.*,g.geometry,g.version,ST_GeomFromGeoJSON(g.geometry) poly FROM commercial_lots l JOIN map_entities e ON e.id=l.entity_id JOIN map_entity_geometries g ON g.entity_id=e.id AND g.is_current WHERE e.segment_id='feb6fcb7-5bc4-4725-ad74-d408a7b56522' AND NOT e.is_archived AND l.archived_at IS NULL),
expected AS (SELECT * FROM jsonb_to_recordset($manifest$[
  {
    "code": "Q-R-01",
    "block": "R",
    "lot_number": 1,
    "official_area_sqm": "896.85",
    "source_page": 1
  },
  {
    "code": "Q-R-02",
    "block": "R",
    "lot_number": 2,
    "official_area_sqm": "896.85",
    "source_page": 1
  },
  {
    "code": "Q-R-03",
    "block": "R",
    "lot_number": 3,
    "official_area_sqm": "650.00",
    "source_page": 1
  },
  {
    "code": "Q-R-04",
    "block": "R",
    "lot_number": 4,
    "official_area_sqm": "644.75",
    "source_page": 1
  },
  {
    "code": "Q-R-05",
    "block": "R",
    "lot_number": 5,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-R-06",
    "block": "R",
    "lot_number": 6,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-R-07",
    "block": "R",
    "lot_number": 7,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-R-08",
    "block": "R",
    "lot_number": 8,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-R-09",
    "block": "R",
    "lot_number": 9,
    "official_area_sqm": "453.42",
    "source_page": 1
  },
  {
    "code": "Q-R-10",
    "block": "R",
    "lot_number": 10,
    "official_area_sqm": "453.42",
    "source_page": 1
  },
  {
    "code": "Q-R-11",
    "block": "R",
    "lot_number": 11,
    "official_area_sqm": "452.42",
    "source_page": 1
  },
  {
    "code": "Q-R-12",
    "block": "R",
    "lot_number": 12,
    "official_area_sqm": "452.42",
    "source_page": 1
  },
  {
    "code": "Q-R-13",
    "block": "R",
    "lot_number": 13,
    "official_area_sqm": "575.85",
    "source_page": 1
  },
  {
    "code": "Q-R-14",
    "block": "R",
    "lot_number": 14,
    "official_area_sqm": "896.85",
    "source_page": 1
  },
  {
    "code": "Q-R-15",
    "block": "R",
    "lot_number": 15,
    "official_area_sqm": "472.10",
    "source_page": 1
  },
  {
    "code": "Q-R-16",
    "block": "R",
    "lot_number": 16,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-R-17",
    "block": "R",
    "lot_number": 17,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-R-18",
    "block": "R",
    "lot_number": 18,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-R-19",
    "block": "R",
    "lot_number": 19,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-R-20",
    "block": "R",
    "lot_number": 20,
    "official_area_sqm": "500.00",
    "source_page": 1
  },
  {
    "code": "Q-R-21",
    "block": "R",
    "lot_number": 21,
    "official_area_sqm": "500.00",
    "source_page": 1
  },
  {
    "code": "Q-R-22",
    "block": "R",
    "lot_number": 22,
    "official_area_sqm": "500.00",
    "source_page": 1
  },
  {
    "code": "Q-R-23",
    "block": "R",
    "lot_number": 23,
    "official_area_sqm": "504.28",
    "source_page": 1
  },
  {
    "code": "Q-R-24",
    "block": "R",
    "lot_number": 24,
    "official_area_sqm": "504.28",
    "source_page": 1
  },
  {
    "code": "Q-R-25",
    "block": "R",
    "lot_number": 25,
    "official_area_sqm": "504.28",
    "source_page": 1
  },
  {
    "code": "Q-R-26",
    "block": "R",
    "lot_number": 26,
    "official_area_sqm": "495.00",
    "source_page": 1
  },
  {
    "code": "Q-R-27",
    "block": "R",
    "lot_number": 27,
    "official_area_sqm": "495.00",
    "source_page": 1
  },
  {
    "code": "Q-R-28",
    "block": "R",
    "lot_number": 28,
    "official_area_sqm": "495.00",
    "source_page": 1
  },
  {
    "code": "Q-R-29",
    "block": "R",
    "lot_number": 29,
    "official_area_sqm": "452.42",
    "source_page": 1
  },
  {
    "code": "Q-R-30",
    "block": "R",
    "lot_number": 30,
    "official_area_sqm": "452.42",
    "source_page": 1
  },
  {
    "code": "Q-R-31",
    "block": "R",
    "lot_number": 31,
    "official_area_sqm": "452.42",
    "source_page": 1
  },
  {
    "code": "Q-R-32",
    "block": "R",
    "lot_number": 32,
    "official_area_sqm": "447.55",
    "source_page": 1
  },
  {
    "code": "Q-R-33",
    "block": "R",
    "lot_number": 33,
    "official_area_sqm": "447.55",
    "source_page": 1
  },
  {
    "code": "Q-R-34",
    "block": "R",
    "lot_number": 34,
    "official_area_sqm": "447.55",
    "source_page": 1
  },
  {
    "code": "Q-R-35",
    "block": "R",
    "lot_number": 35,
    "official_area_sqm": "447.55",
    "source_page": 1
  },
  {
    "code": "Q-R-36",
    "block": "R",
    "lot_number": 36,
    "official_area_sqm": "447.55",
    "source_page": 1
  },
  {
    "code": "Q-R-37",
    "block": "R",
    "lot_number": 37,
    "official_area_sqm": "447.55",
    "source_page": 1
  },
  {
    "code": "Q-R-38",
    "block": "R",
    "lot_number": 38,
    "official_area_sqm": "447.55",
    "source_page": 1
  },
  {
    "code": "Q-R-39",
    "block": "R",
    "lot_number": 39,
    "official_area_sqm": "447.55",
    "source_page": 1
  },
  {
    "code": "Q-R-40",
    "block": "R",
    "lot_number": 40,
    "official_area_sqm": "268.01",
    "source_page": 1
  },
  {
    "code": "Q-R-41",
    "block": "R",
    "lot_number": 41,
    "official_area_sqm": "268.01",
    "source_page": 1
  },
  {
    "code": "Q-R-42",
    "block": "R",
    "lot_number": 42,
    "official_area_sqm": "268.03",
    "source_page": 1
  },
  {
    "code": "Q-R-43",
    "block": "R",
    "lot_number": 43,
    "official_area_sqm": "268.00",
    "source_page": 1
  },
  {
    "code": "Q-R-44",
    "block": "R",
    "lot_number": 44,
    "official_area_sqm": "268.00",
    "source_page": 1
  },
  {
    "code": "Q-R-45",
    "block": "R",
    "lot_number": 45,
    "official_area_sqm": "268.01",
    "source_page": 1
  },
  {
    "code": "Q-R-46",
    "block": "R",
    "lot_number": 46,
    "official_area_sqm": "267.85",
    "source_page": 1
  },
  {
    "code": "Q-R-47",
    "block": "R",
    "lot_number": 47,
    "official_area_sqm": "333.34",
    "source_page": 1
  },
  {
    "code": "Q-R-48",
    "block": "R",
    "lot_number": 48,
    "official_area_sqm": "268.07",
    "source_page": 1
  },
  {
    "code": "Q-R-49",
    "block": "R",
    "lot_number": 49,
    "official_area_sqm": "268.02",
    "source_page": 1
  },
  {
    "code": "Q-R-50",
    "block": "R",
    "lot_number": 50,
    "official_area_sqm": "268.01",
    "source_page": 1
  },
  {
    "code": "Q-R-51",
    "block": "R",
    "lot_number": 51,
    "official_area_sqm": "268.02",
    "source_page": 1
  },
  {
    "code": "Q-R-52",
    "block": "R",
    "lot_number": 52,
    "official_area_sqm": "268.03",
    "source_page": 1
  },
  {
    "code": "Q-R-53",
    "block": "R",
    "lot_number": 53,
    "official_area_sqm": "268.04",
    "source_page": 1
  },
  {
    "code": "Q-R-54",
    "block": "R",
    "lot_number": 54,
    "official_area_sqm": "268.04",
    "source_page": 1
  },
  {
    "code": "Q-R-55",
    "block": "R",
    "lot_number": 55,
    "official_area_sqm": "249.64",
    "source_page": 1
  },
  {
    "code": "Q-R-56",
    "block": "R",
    "lot_number": 56,
    "official_area_sqm": "249.12",
    "source_page": 1
  },
  {
    "code": "Q-R-57",
    "block": "R",
    "lot_number": 57,
    "official_area_sqm": "250.05",
    "source_page": 1
  },
  {
    "code": "Q-R-58",
    "block": "R",
    "lot_number": 58,
    "official_area_sqm": "251.01",
    "source_page": 1
  },
  {
    "code": "Q-R-59",
    "block": "R",
    "lot_number": 59,
    "official_area_sqm": "250.00",
    "source_page": 1
  },
  {
    "code": "Q-R-60",
    "block": "R",
    "lot_number": 60,
    "official_area_sqm": "249.96",
    "source_page": 1
  },
  {
    "code": "Q-R-61",
    "block": "R",
    "lot_number": 61,
    "official_area_sqm": "356.69",
    "source_page": 1
  },
  {
    "code": "Q-R-62",
    "block": "R",
    "lot_number": 62,
    "official_area_sqm": "249.60",
    "source_page": 1
  },
  {
    "code": "Q-R-63",
    "block": "R",
    "lot_number": 63,
    "official_area_sqm": "249.03",
    "source_page": 1
  },
  {
    "code": "Q-R-64",
    "block": "R",
    "lot_number": 64,
    "official_area_sqm": "248.02",
    "source_page": 1
  },
  {
    "code": "Q-R-65",
    "block": "R",
    "lot_number": 65,
    "official_area_sqm": "249.12",
    "source_page": 1
  },
  {
    "code": "Q-R-66",
    "block": "R",
    "lot_number": 66,
    "official_area_sqm": "250.00",
    "source_page": 1
  },
  {
    "code": "Q-R-67",
    "block": "R",
    "lot_number": 67,
    "official_area_sqm": "250.03",
    "source_page": 1
  },
  {
    "code": "Q-R-68",
    "block": "R",
    "lot_number": 68,
    "official_area_sqm": "242.21",
    "source_page": 1
  },
  {
    "code": "Q-R-69",
    "block": "R",
    "lot_number": 69,
    "official_area_sqm": "471.00",
    "source_page": 1
  },
  {
    "code": "Q-R-70",
    "block": "R",
    "lot_number": 70,
    "official_area_sqm": "471.00",
    "source_page": 1
  },
  {
    "code": "Q-R-71",
    "block": "R",
    "lot_number": 71,
    "official_area_sqm": "471.00",
    "source_page": 1
  },
  {
    "code": "Q-R-72",
    "block": "R",
    "lot_number": 72,
    "official_area_sqm": "471.00",
    "source_page": 1
  },
  {
    "code": "Q-S-01",
    "block": "S",
    "lot_number": 1,
    "official_area_sqm": "500.00",
    "source_page": 1
  },
  {
    "code": "Q-S-02",
    "block": "S",
    "lot_number": 2,
    "official_area_sqm": "500.00",
    "source_page": 1
  },
  {
    "code": "Q-S-03",
    "block": "S",
    "lot_number": 3,
    "official_area_sqm": "500.00",
    "source_page": 1
  },
  {
    "code": "Q-S-04",
    "block": "S",
    "lot_number": 4,
    "official_area_sqm": "692.09",
    "source_page": 1
  },
  {
    "code": "Q-S-05",
    "block": "S",
    "lot_number": 5,
    "official_area_sqm": "450.11",
    "source_page": 1
  },
  {
    "code": "Q-S-06",
    "block": "S",
    "lot_number": 6,
    "official_area_sqm": "450.11",
    "source_page": 1
  },
  {
    "code": "Q-S-07",
    "block": "S",
    "lot_number": 7,
    "official_area_sqm": "450.11",
    "source_page": 1
  },
  {
    "code": "Q-S-08",
    "block": "S",
    "lot_number": 8,
    "official_area_sqm": "450.11",
    "source_page": 1
  },
  {
    "code": "Q-S-09",
    "block": "S",
    "lot_number": 9,
    "official_area_sqm": "450.11",
    "source_page": 1
  },
  {
    "code": "Q-S-10",
    "block": "S",
    "lot_number": 10,
    "official_area_sqm": "450.11",
    "source_page": 1
  },
  {
    "code": "Q-S-11",
    "block": "S",
    "lot_number": 11,
    "official_area_sqm": "449.91",
    "source_page": 1
  },
  {
    "code": "Q-S-12",
    "block": "S",
    "lot_number": 12,
    "official_area_sqm": "376.85",
    "source_page": 1
  },
  {
    "code": "Q-S-13",
    "block": "S",
    "lot_number": 13,
    "official_area_sqm": "376.88",
    "source_page": 1
  },
  {
    "code": "Q-S-14",
    "block": "S",
    "lot_number": 14,
    "official_area_sqm": "506.30",
    "source_page": 1
  },
  {
    "code": "Q-S-15",
    "block": "S",
    "lot_number": 15,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-S-16",
    "block": "S",
    "lot_number": 16,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-S-17",
    "block": "S",
    "lot_number": 17,
    "official_area_sqm": "348.98",
    "source_page": 1
  },
  {
    "code": "Q-S-18",
    "block": "S",
    "lot_number": 18,
    "official_area_sqm": "411.83",
    "source_page": 1
  },
  {
    "code": "Q-S-19",
    "block": "S",
    "lot_number": 19,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-S-20",
    "block": "S",
    "lot_number": 20,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-S-21",
    "block": "S",
    "lot_number": 21,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-S-22",
    "block": "S",
    "lot_number": 22,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-S-23",
    "block": "S",
    "lot_number": 23,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-S-24",
    "block": "S",
    "lot_number": 24,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-S-25",
    "block": "S",
    "lot_number": 25,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-S-26",
    "block": "S",
    "lot_number": 26,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-S-27",
    "block": "S",
    "lot_number": 27,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-S-28",
    "block": "S",
    "lot_number": 28,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-S-29",
    "block": "S",
    "lot_number": 29,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-S-30",
    "block": "S",
    "lot_number": 30,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-S-31",
    "block": "S",
    "lot_number": 31,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-S-32",
    "block": "S",
    "lot_number": 32,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-S-33",
    "block": "S",
    "lot_number": 33,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-S-34",
    "block": "S",
    "lot_number": 34,
    "official_area_sqm": "450.00",
    "source_page": 1
  },
  {
    "code": "Q-S-35",
    "block": "S",
    "lot_number": 35,
    "official_area_sqm": "649.97",
    "source_page": 1
  }
]
$manifest$::jsonb) AS t(code text,official_area_sqm numeric)),
snap AS (SELECT * FROM map_reference_migration_snapshots WHERE id='dbeaf99c-ab1c-4f56-ae11-2dac59d9b535'),
roads AS (SELECT e.public_identifier,ST_GeomFromGeoJSON(g.geometry) poly FROM map_entities e JOIN map_entity_geometries g ON g.entity_id=e.id AND g.is_current WHERE e.segment_id='feb6fcb7-5bc4-4725-ad74-d408a7b56522' AND e.classification='ROAD' AND NOT e.is_archived)
SELECT jsonb_build_object(
 'validated_at',now(),'revision',(SELECT source_reference FROM map_segments WHERE id='feb6fcb7-5bc4-4725-ad74-d408a7b56522'),
 'blocks',(SELECT jsonb_agg(v) FROM (SELECT block,count(*) FILTER(WHERE lot_number IS NOT NULL) numbered_lots,sum(official_area_sqm) FILTER(WHERE lot_number IS NOT NULL) numbered_area FROM active GROUP BY block) v),
 'active_commercial_spaces',(SELECT count(*) FROM active),'active_area_including_unnumbered',(SELECT sum(official_area_sqm) FROM active),
 'individual_manifest_mismatches',(SELECT count(*) FROM expected x LEFT JOIN active a ON a.public_identifier=x.code WHERE a.id IS NULL OR a.official_area_sqm<>x.official_area_sqm),
 'invalid_rings',(SELECT count(*) FROM active WHERE NOT ST_IsValid(poly)),
 'lot_overlaps',(SELECT count(*) FROM active a JOIN active b ON a.id<b.id AND ST_Intersects(a.poly,b.poly) WHERE ST_Area(ST_Intersection(a.poly,b.poly))>1e-7),
 'road_lot_overlaps',(SELECT count(*) FROM active a JOIN roads r ON ST_Intersects(a.poly,r.poly) WHERE ST_Area(ST_Intersection(a.poly,r.poly))>1e-7),
 'legacy_roads_archived',(SELECT bool_and(is_archived) FROM map_entities WHERE id IN ('25e57aa1-b026-4f83-ac6d-1b70ec13c0b2','d7876f2e-bf8b-4a6c-b773-e3320f78eea1')),
 'business_unchanged',pg_temp.exporural_business((SELECT snapshot FROM snap))=pg_temp.exporural_business(pg_temp.exporural_state((SELECT id FROM p),ARRAY(SELECT value::uuid FROM snap,jsonb_array_elements_text(apply_result->'affectedEntityIds')))),
 'unresolved_prices',(SELECT count(*) FROM active a JOIN commercial_lot_pricing_2028 v ON v.lot_id=a.id WHERE v.resolution_status<>'OK' OR v.renovacao_total IS NULL OR v.segunda_total IS NULL),
 'renumbered_signed_sale',(SELECT jsonb_build_object('lot_uuid',a.id,'current_code',a.public_identifier,'negotiated_value',s.negotiated_value,'sale_status',s.status) FROM active a JOIN lot_sales s ON s.lot_id=a.id WHERE a.id='137a7fe9-1724-42b0-adc6-64c46b91a7e8' AND s.status='CONFIRMED'),
 'snapshots',(SELECT jsonb_agg(jsonb_build_object('revision',source_revision,'id',id,'status',status)) FROM map_reference_migration_snapshots WHERE project_id=(SELECT id FROM p) AND source_revision IN ('2028-exporural-2026-10-20.1','2028-exporural-2026-10-21.labels.1','2028-exporural-2026-10-21.surfaces.1','2028-exporural-2026-10-21.legacy-roads.1'))
) validation;
