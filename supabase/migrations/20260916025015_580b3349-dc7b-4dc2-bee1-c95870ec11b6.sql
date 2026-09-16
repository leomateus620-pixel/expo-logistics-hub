DO $$
DECLARE
  v_planned integer;
  v_matched integer;
  v_conflicts integer;
  v_updated integer;
  v_total numeric;
BEGIN
  CREATE TEMP TABLE tmp_band(pav text, first_n int, last_n int, area numeric(12,2), vstatus text, method text) ON COMMIT DROP;
  INSERT INTO tmp_band VALUES
    ('B1',1,57,3.00,'CALCULATED','Malha modular impressa 1 x 3 m'),
    ('B1',58,58,4.50,'VALIDATED','Area escrita no croqui; 1,5 x 3 m'),
    ('B1',59,64,3.50,'VALIDATED','Area escrita no croqui; 1 x 3,5 m'),
    ('B1',65,140,3.00,'CALCULATED','Malha modular impressa 1 x 3 m'),
    ('B1',141,141,19.35,'VALIDATED','Area escrita no croqui; recorte em L'),
    ('B1',142,189,3.00,'CALCULATED','Malha modular impressa 1 x 3 m'),
    ('B6',1,35,3.00,'CALCULATED','Malha modular impressa 1 x 3 m'),
    ('B6',36,36,24.00,'VALIDATED','Area escrita no croqui; 6 x 5 - 3 x 2'),
    ('B6',37,214,3.00,'CALCULATED','Malha modular impressa 1 x 3 m'),
    ('B8',1,1,4.50,'VALIDATED','Area escrita no croqui; 1,5 x 3 m'),
    ('B8',2,81,3.00,'CALCULATED','Malha modular impressa 1 x 3 m'),
    ('B10',1,171,2.50,'CALCULATED','Malha modular impressa 1 x 2,5 m'),
    ('B4',1,25,4.00,'CALCULATED','Malha modular impressa 1 x 4 m'),
    ('B4',26,37,3.00,'CALCULATED','Malha modular impressa 1 x 3 m'),
    ('B4',38,89,3.50,'CALCULATED','Malha modular impressa 1 x 3,5 m'),
    ('B4',90,90,24.50,'VALIDATED','Area escrita no croqui; recorte em L'),
    ('B4',91,114,4.00,'CALCULATED','Malha modular impressa 1 x 4 m'),
    ('B3',1,257,3.00,'CALCULATED','Malha modular impressa 1 x 3 m'),
    ('B5',1,24,3.00,'CALCULATED','Malha modular impressa 1 x 3 m'),
    ('B5',25,25,12.45,'VALIDATED','Area escrita no croqui; (5,65 + 2,65) / 2 x 3'),
    ('B5',26,26,14.70,'VALIDATED','Area escrita no croqui; (6,40 + 3,40) / 2 x 3'),
    ('B5',27,77,3.00,'CALCULATED','Malha modular impressa 1 x 3 m'),
    ('B5',78,78,14.70,'UNVALIDATED','Area escrita no croqui (14,70); cotas 6,80 x 3,40 x 3 levariam a 15,30 - conferir'),
    ('B5',79,79,12.45,'VALIDATED','Area escrita no croqui; (5,65 + 2,65) / 2 x 3'),
    ('B5',80,103,3.00,'CALCULATED','Malha modular impressa 1 x 3 m'),
    ('B2',1,35,3.00,'CALCULATED','Malha modular impressa 1 x 3 m'),
    ('B2',36,151,3.50,'CALCULATED','Malha modular impressa 1 x 3,5 m'),
    ('B2',152,186,3.00,'CALCULATED','Malha modular impressa 1 x 3 m');

  CREATE TEMP TABLE tmp_plan ON COMMIT DROP AS
    SELECT b.pav,
           n AS num,
           b.area,
           b.vstatus,
           b.method,
           b.pav || '-M' || lpad(n::text, 3, '0') AS pid
    FROM tmp_band b, generate_series(b.first_n, b.last_n) AS n;

  SELECT count(*) INTO v_planned FROM tmp_plan;
  IF v_planned <> 1315 THEN
    RAISE EXCEPTION 'PAVILION_AREA_PLAN_INVALID: % linhas planejadas, esperado 1315', v_planned;
  END IF;

  CREATE TEMP TABLE tmp_match ON COMMIT DROP AS
    SELECT p.pav,
           p.num,
           p.area,
           p.vstatus,
           p.method,
           lot.id AS lot_id,
           lot.official_area_sqm AS previous_area,
           lot.area_validation_status AS previous_status
    FROM tmp_plan p
    JOIN map_entities parent
      ON parent.public_identifier = p.pav
     AND parent.is_archived = false
    JOIN map_entities entity
      ON entity.parent_entity_id = parent.id
     AND entity.classification = 'INTERNAL_STAND'
     AND entity.is_archived = false
     AND entity.public_identifier = p.pid
     AND (entity.metadata->>'moduleNumber')::int = p.num
    JOIN commercial_lots lot
      ON lot.entity_id = entity.id
     AND lot.archived_at IS NULL
     AND lot.project_id = entity.project_id;

  SELECT count(*), count(DISTINCT lot_id) INTO v_matched, v_updated FROM tmp_match;
  IF v_matched <> 1315 OR v_updated <> 1315 THEN
    RAISE EXCEPTION 'PAVILION_AREA_MATCH_INVALID: % correspondencias / % lotes distintos, esperado 1315', v_matched, v_updated;
  END IF;

  SELECT count(*) INTO v_conflicts
  FROM tmp_match
  WHERE previous_area IS NOT NULL
    AND previous_area <> area;

  IF v_conflicts > 0 THEN
    RAISE WARNING 'PAVILION_AREA_CONFLICTS: % lotes com area divergente preservados sem alteracao', v_conflicts;
  END IF;

  WITH applied AS (
    UPDATE commercial_lots lot
       SET official_area_sqm = m.area,
           area_validation_status = m.vstatus,
           updated_at = now()
      FROM tmp_match m
     WHERE lot.id = m.lot_id
       AND lot.official_area_sqm IS DISTINCT FROM m.area
       AND m.previous_area IS NULL
    RETURNING lot.id
  )
  SELECT count(*) INTO v_updated FROM applied;

  -- Snapshot por lote para reversao seletiva, gravado na metadata da entidade.
  UPDATE map_entities entity
     SET metadata = entity.metadata || jsonb_build_object(
           'areaBackfill', jsonb_build_object(
             'revision', '2026.4-pavilion-module-areas.1',
             'appliedAt', now(),
             'officialAreaSqm', m.area,
             'areaValidationStatus', m.vstatus,
             'method', m.method,
             'previousOfficialAreaSqm', m.previous_area,
             'previousAreaValidationStatus', m.previous_status
           )
         ),
         updated_at = now()
    FROM tmp_match m
    JOIN commercial_lots lot ON lot.id = m.lot_id
   WHERE entity.id = lot.entity_id
     AND m.previous_area IS NULL
     AND entity.metadata->'areaBackfill'->>'revision'
         IS DISTINCT FROM '2026.4-pavilion-module-areas.1';

  SELECT round(sum(official_area_sqm), 2) INTO v_total
  FROM commercial_lots lot
  JOIN map_entities entity ON entity.id = lot.entity_id
  JOIN map_entities parent ON parent.id = entity.parent_entity_id
  WHERE entity.classification = 'INTERNAL_STAND'
    AND entity.is_archived = false
    AND lot.archived_at IS NULL
    AND parent.public_identifier IN ('B1','B2','B3','B4','B5','B6','B8','B10');

  IF v_total IS NULL OR abs(v_total - 4099.65) > 0.005 THEN
    RAISE EXCEPTION 'PAVILION_AREA_TOTAL_INVALID: soma % m², esperado 4099.65 m²', v_total;
  END IF;

  RAISE NOTICE 'PAVILION_AREAS_OK: % lotes atualizados nesta execucao; soma total % m²', v_updated, v_total;
END $$;