-- Pavilhões 12 e 14: inventário interno oficial; Pavilhão 3: extensões 76–83 e 140–147.
-- A migração preserva todo estado comercial compatível e falha fechada diante
-- de identidades conflitantes. Nenhuma área individual ou empresa é inferida.

BEGIN;

CREATE TEMP TABLE _commercial_pavilion_previous_lineage ON COMMIT DROP AS
SELECT id AS segment_id, boundary_data->'lineageBaselineAt' AS lineage_baseline_at
FROM public.map_segments
WHERE slug IN ('exporural', 'industria-comercio-servicos');

CREATE OR REPLACE FUNCTION public.ensure_commission_map_segments(_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.map_projects WHERE id = _project_id) THEN
    RAISE EXCEPTION 'MAP_PROJECT_NOT_FOUND';
  END IF;

  INSERT INTO public.map_segments (
    project_id, slug, name, display_name, source_reference, boundary_data,
    camera_config, visual_config, required_capability
  )
  VALUES
    (
      _project_id,
      'exporural',
      'Exporural',
      'Exporural',
      'Perímetro cadastral oficial Exporural 2026.4',
      '{"resolution":"explicit-entity-union","expectedEntityCount":111,"expectedLotCount":95,"blockIdentifiers":["QUADRA-R","QUADRA-S"],"perimeter":["Rua Ubiretama","Rua Bruno Schwartz","Rua Gustavo Bessel","Rua Emanuel Brachmann"],"excludedIdentifiers":["B7","B8","D3","B35","B36","D6-01","D6-02","D6-03"]}'::jsonb
        || jsonb_build_object('lineageBaselineAt', transaction_timestamp()),
      '{"direction":[0.62,0.72,0.46],"padding":1.08,"minDistanceRatio":0.12,"maxDistanceRatio":2.2,"bounds":{"minX":-2.9,"maxX":57.8,"minZ":-37.6,"maxZ":-7.7}}'::jsonb,
      '{"surface":"#657F3F","edge":"#405527","accent":"#A8BE72","foreground":"#1F2C16"}'::jsonb,
      'exporural_access'
    ),
    (
      _project_id,
      'industria-comercio-servicos',
      'Indústria, Comércio e Serviços',
      'Indústria, Comércio e Serviços',
      'Anexos oficiais 1, 2, 3 e 6 — Pavilhões 3, 12 e 14',
      '{"resolution":"explicit-entity-union","expectedEntityCount":797,"expectedLotCount":760,"blockIdentifiers":["QUADRA-M","QUADRA-G","QUADRA-L","QUADRA-F","QUADRA-J","QUADRA-E","QUADRA-I","QUADRA-D"],"excludedIdentifiers":["Q-G-03","Q-G-04","QUADRA-N","B7","B28","D4","QUADRA-C","QUADRA-B","QUADRA-A","C1","B11","B12","B13","B14","B15","B18","B21","B25","B26","B27","B30","B31","B32","B42-02","G","B8","B9","B10","B39"]}'::jsonb
        || jsonb_build_object('lineageBaselineAt', transaction_timestamp()),
      '{"direction":[0.58,0.7,0.64],"padding":1.12,"minDistanceRatio":0.1,"maxDistanceRatio":2.05,"bounds":{"minX":-24.4582,"maxX":16.3636,"minZ":-11.6727,"maxZ":25.4182}}'::jsonb,
      '{"surface":"#347786","edge":"#173F4A","accent":"#70A9B4","foreground":"#10292F"}'::jsonb,
      'industria_comercio_servicos_access'
    )
  ON CONFLICT (project_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    display_name = EXCLUDED.display_name,
    source_reference = EXCLUDED.source_reference,
    boundary_data = EXCLUDED.boundary_data || jsonb_build_object(
      'lineageBaselineAt', COALESCE(
        map_segments.boundary_data->'lineageBaselineAt',
        EXCLUDED.boundary_data->'lineageBaselineAt'
      )
    ),
    camera_config = EXCLUDED.camera_config,
    visual_config = EXCLUDED.visual_config,
    required_capability = EXCLUDED.required_capability,
    is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_commission_map_segments(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_commission_map_segments(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_commission_map_segments(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_commission_map_segment_slug(
  _public_identifier text,
  _metadata jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN (
      upper(COALESCE(_public_identifier, ''))
        ~ '^B2-M(00[1-9]|0[1-9][0-9]|1[0-7][0-9]|18[0-6])$'
      OR upper(COALESCE(_public_identifier, ''))
        ~ '^B3-M(00[1-9]|0[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-7])$'
      OR upper(COALESCE(_public_identifier, ''))
        ~ '^B6-M(00[1-9]|0[1-9][0-9]|1[0-9]{2}|20[0-9]|21[0-4])$'
      OR (
        upper(COALESCE(_public_identifier, '')) IN (
          '',
          replace(upper(COALESCE(_metadata->>'pavilionModuleKey', '')), ':MODULE:', '-M')
        )
        AND (
          (
            upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B2'
            AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
              ~ '^B2:MODULE:(00[1-9]|0[1-9][0-9]|1[0-7][0-9]|18[0-6])$'
          )
          OR (
            upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B3'
            AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
              ~ '^B3:MODULE:(00[1-9]|0[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-7])$'
          )
          OR (
            upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B6'
            AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
              ~ '^B6:MODULE:(00[1-9]|0[1-9][0-9]|1[0-9]{2}|20[0-9]|21[0-4])$'
          )
        )
      )
    )
    THEN 'industria-comercio-servicos'
    WHEN upper(COALESCE(_public_identifier, '')) = ANY (ARRAY[
      'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
    ]) THEN NULL
    WHEN upper(COALESCE(_public_identifier, '')) <> ALL (ARRAY['B7', 'B8', 'D3'])
      AND (
        upper(COALESCE(_public_identifier, '')) IN (
          'EXPORURAL', 'QUADRA-R', 'QUADRA-S',
          'RUA-BRUNO-SCHWARTZ', 'RUA-JOHAN-MULLER', 'RUA-GUSTAVO-BESSEL',
          'RUA-15-NOVEMBRO', 'RUA-EMANUEL-BRACHMANN',
          'RUA-PASTOR-ALBERT-LEHENBAUER', 'RUA-UBIRETAMA',
          'B37', 'B38', 'C4', 'E-01', 'E-02', 'E-06'
        )
        OR upper(COALESCE(_public_identifier, '')) ~ '^Q-[RS]-[0-9]{2}$'
        OR upper(COALESCE(_metadata->>'block', '')) IN ('R', 'S')
        OR upper(COALESCE(_metadata->>'areaCode', '')) = 'EXPORURAL'
      )
    THEN 'exporural'
    WHEN upper(COALESCE(_public_identifier, '')) <> ALL (ARRAY[
      'Q-G-03', 'Q-G-04', 'QUADRA-N', 'B7', 'B28', 'D4',
      'QUADRA-C', 'QUADRA-B', 'QUADRA-A', 'C1',
      'B11', 'B12', 'B13', 'B14', 'B15', 'B18', 'B21',
      'B25', 'B26', 'B27', 'B30', 'B31', 'B32', 'B42-02',
      'G', 'B8', 'B9', 'B10', 'B39'
    ])
      AND (
        upper(COALESCE(_public_identifier, '')) IN (
          'B1', 'B2', 'B3', 'B4', 'B5', 'B6',
          'B16', 'B17', 'B19', 'B23', 'B24', 'B33', 'B34', 'B40', 'B41',
          'C2', 'C3', 'D1', 'D2', 'D3',
          'E-18', 'E-19', 'E-20', 'E-22', 'E-23', 'E-24',
          'RUA-URUGUAI', 'RUA-MONTEVIDEU', 'CALCADA-ARVOREDO'
        )
        OR upper(COALESCE(_public_identifier, '')) ~ '^QUADRA-(M|G|L|F|J|E|I|D)$'
        OR upper(COALESCE(_public_identifier, '')) ~ '^Q-(M|G|L|F|J|E|I|D)-[0-9]{2}$'
        OR upper(COALESCE(_metadata->>'block', '')) IN ('M', 'G', 'L', 'F', 'J', 'E', 'I', 'D')
      )
    THEN 'industria-comercio-servicos'
    ELSE NULL
  END;
$$;

SELECT public.ensure_commission_map_segments(project.id)
FROM public.map_projects project
WHERE project.is_archived = false;

SELECT pg_advisory_xact_lock(
  hashtextextended('commercial-map:pavilions-3-12-14:' || project.id::text, 0)
)
FROM public.map_projects project
WHERE project.is_archived = false
ORDER BY project.id;

CREATE TEMP TABLE _commercial_pavilion_specs (
  pavilion_identifier text PRIMARY KEY,
  pavilion_number integer NOT NULL,
  official_name text NOT NULL,
  commercial_block text NOT NULL,
  module_count integer NOT NULL,
  facing_radians numeric NOT NULL,
  module_gap numeric NOT NULL,
  layout_revision text NOT NULL,
  source_reference text NOT NULL
) ON COMMIT DROP;

INSERT INTO _commercial_pavilion_specs VALUES
  ('B2', 14, 'Pavilhão 14 — Comércio e Artesanato', 'P14', 186, round((pi() / 2)::numeric, 6), 0, '2026.4-p14.1', 'Anexo 2 e Anexo 6 — Pavilhão 14 — Comércio e Artesanato'),
  ('B3', 12, 'Pavilhão 12 — Indústria, Comércio e Serviços', 'P12', 257, round(pi()::numeric, 6), 0, '2026.4-p12.1', 'Anexo 1 e Anexo 6 — Pavilhão 12 — Indústria, Comércio e Serviços'),
  ('B6',  3, 'Pavilhão 3 — Comércio', 'P3',  214, round(pi()::numeric, 6), 0.0015, '2026.4-p3.2', 'Anexo 3 e Anexo 6 — Pavilhão 3 — Comércio');

CREATE TEMP TABLE _commercial_pavilion_runs (
  pavilion_identifier text NOT NULL,
  run_id text NOT NULL,
  start_number integer NOT NULL,
  end_number integer NOT NULL,
  center_x numeric NOT NULL,
  center_z numeric NOT NULL,
  width numeric NOT NULL,
  depth numeric NOT NULL,
  sequence_orientation text NOT NULL,
  module_orientation text NOT NULL,
  group_key text NOT NULL,
  cluster_key text NOT NULL,
  PRIMARY KEY (pavilion_identifier, run_id)
) ON COMMIT DROP;

-- B2 / Pavilhão 14: 35 m × 33 m. Perímetro 1×3 m; ilhas 1×3,5 m.
INSERT INTO _commercial_pavilion_runs VALUES
  ('B2', 'south-perimeter-01-35',     1,  35, 0.500000000000, 0.936363636364, 0.960000000000, 0.087272727273, 'X+', 'north-south', 'south-perimeter', 'south-perimeter-01-35'),
  ('B2', 'lower-island-south-36-64', 36,  64, 0.500000000000, 0.725454545455, 0.795428571429, 0.101818181818, 'X-', 'north-south', 'lower-island', 'lower-island-south'),
  ('B2', 'lower-island-north-65-93', 65,  93, 0.500000000000, 0.623636363636, 0.795428571429, 0.101818181818, 'X+', 'north-south', 'lower-island', 'lower-island-north'),
  ('B2', 'central-island-south-94-122', 94, 122, 0.500000000000, 0.376363636364, 0.795428571429, 0.101818181818, 'X-', 'north-south', 'central-island', 'central-island-south'),
  ('B2', 'central-island-north-123-151', 123, 151, 0.500000000000, 0.274545454545, 0.795428571429, 0.101818181818, 'X+', 'north-south', 'central-island', 'central-island-north'),
  ('B2', 'north-perimeter-152-186', 152, 186, 0.500000000000, 0.063636363636, 0.960000000000, 0.087272727273, 'X-', 'north-south', 'north-perimeter', 'north-perimeter-152-186');

-- B3 / Pavilhão 12: 50 m × 33 m. Todos os módulos são 1×3 m.
INSERT INTO _commercial_pavilion_runs VALUES
  ('B3', 'north-right-01-22',          1,  22, 0.711200000000, 0.063636363636, 0.422400000000, 0.087272727273, 'X-', 'north-south', 'north-perimeter', 'north-right-01-22'),
  ('B3', 'north-left-23-40',          23,  40, 0.192800000000, 0.063636363636, 0.345600000000, 0.087272727273, 'X-', 'north-south', 'north-perimeter', 'north-left-23-40'),
  ('B3', 'upper-island-north-41-82', 41,  82, 0.500000000000, 0.296363636364, 0.806400000000, 0.087272727273, 'X+', 'north-south', 'upper-island', 'upper-island-north'),
  ('B3', 'upper-island-south-83-124', 83, 124, 0.500000000000, 0.383636363636, 0.806400000000, 0.087272727273, 'X-', 'north-south', 'upper-island', 'upper-island-south'),
  ('B3', 'lower-island-north-125-166', 125, 166, 0.500000000000, 0.616363636364, 0.806400000000, 0.087272727273, 'X+', 'north-south', 'lower-island', 'lower-island-north'),
  ('B3', 'lower-island-south-167-208', 167, 208, 0.500000000000, 0.703636363636, 0.806400000000, 0.087272727273, 'X-', 'north-south', 'lower-island', 'lower-island-south'),
  ('B3', 'south-perimeter-209-257', 209, 257, 0.490400000000, 0.936363636364, 0.940800000000, 0.087272727273, 'X+', 'north-south', 'south-perimeter', 'south-perimeter-209-257');

-- B6 / Pavilhão 3: os grupos 76–83 e 140–147 prolongam verticalmente as colunas oeste.
INSERT INTO _commercial_pavilion_runs VALUES
  ('B6', 'perimeter-01-19',       1,  19, 0.0650, 0.2600, 0.0750, 0.3600, 'Z+', 'east-west',  'perimeter-west',  'perimeter-01-19'),
  ('B6', 'perimeter-20-36',      20,  36, 0.0650, 0.6800, 0.0750, 0.3200, 'Z+', 'east-west',  'perimeter-west',  'perimeter-20-36'),
  ('B6', 'perimeter-37-40',      37,  40, 0.2850, 0.9100, 0.1800, 0.0750, 'X+', 'north-south','perimeter-south', 'perimeter-37-40'),
  ('B6', 'perimeter-41-47',      41,  47, 0.6400, 0.9100, 0.3000, 0.0750, 'X+', 'north-south','perimeter-south', 'perimeter-41-47'),
  ('B6', 'island-1-west-leg',    48,  75, 0.3275, 0.4350, 0.0950, 0.4700, 'Z+', 'east-west',  'island-1',        'island-1-west-leg'),
  ('B6', 'island-1-vertical-extension', 76, 83, 0.3275, 0.738107142857, 0.0950, 0.133214285714, 'Z+', 'east-west', 'island-1', 'island-1-vertical-extension'),
  ('B6', 'island-1-east-leg',    84, 111, 0.4325, 0.4350, 0.0950, 0.4700, 'Z-', 'east-west',  'island-1',        'island-1-east-leg'),
  ('B6', 'island-2-west-leg',   112, 139, 0.5975, 0.4350, 0.0950, 0.4700, 'Z+', 'east-west',  'island-2',        'island-2-west-leg'),
  ('B6', 'island-2-vertical-extension', 140, 147, 0.5975, 0.738107142857, 0.0950, 0.133214285714, 'Z+', 'east-west', 'island-2', 'island-2-vertical-extension'),
  ('B6', 'island-2-east-leg',   148, 175, 0.7025, 0.4350, 0.0950, 0.4700, 'Z-', 'east-west',  'island-2',        'island-2-east-leg'),
  ('B6', 'perimeter-176-214',   176, 214, 0.9400, 0.4800, 0.0750, 0.7600, 'Z+', 'east-west',  'perimeter-east',  'perimeter-176-214');

-- Agrupamentos comerciais impressos nos anexos, sem carregar nomes de expositores.
-- Um mesmo agrupamento pode ocupar faixas espelhadas em duas fileiras.
CREATE TEMP TABLE _commercial_pavilion_cluster_ranges (
  pavilion_identifier text NOT NULL,
  cluster_key text NOT NULL,
  start_number integer NOT NULL,
  end_number integer NOT NULL,
  PRIMARY KEY (pavilion_identifier, start_number, end_number),
  CHECK (start_number > 0 AND end_number >= start_number)
) ON COMMIT DROP;

INSERT INTO _commercial_pavilion_cluster_ranges VALUES
  ('B2', 'south-01-05', 1, 5),
  ('B2', 'south-06-10', 6, 10),
  ('B2', 'south-11-15', 11, 15),
  ('B2', 'south-16-22', 16, 22),
  ('B2', 'south-23-30', 23, 30),
  ('B2', 'south-31-35', 31, 35),
  ('B2', 'lower-36-38', 36, 38),
  ('B2', 'lower-39-40', 39, 40),
  ('B2', 'lower-41-42', 41, 42),
  ('B2', 'lower-43-44', 43, 44),
  ('B2', 'lower-45-46', 45, 46),
  ('B2', 'lower-47-48', 47, 48),
  ('B2', 'lower-49-50', 49, 50),
  ('B2', 'lower-51-52', 51, 52),
  ('B2', 'lower-53-54', 53, 54),
  ('B2', 'lower-55-56', 55, 56),
  ('B2', 'lower-57-58', 57, 58),
  ('B2', 'lower-59-60', 59, 60),
  ('B2', 'lower-61-64', 61, 64),
  ('B2', 'lower-65-68', 65, 68),
  ('B2', 'lower-69-70', 69, 70),
  ('B2', 'lower-71-72', 71, 72),
  ('B2', 'lower-73-74', 73, 74),
  ('B2', 'lower-75-76', 75, 76),
  ('B2', 'lower-77-78', 77, 78),
  ('B2', 'lower-79-82', 79, 82),
  ('B2', 'lower-83-84', 83, 84),
  ('B2', 'lower-85-86', 85, 86),
  ('B2', 'lower-87-88', 87, 88),
  ('B2', 'lower-89-90', 89, 90),
  ('B2', 'lower-91-93', 91, 93),
  ('B2', 'central-94-96-149-151', 94, 96),
  ('B2', 'central-97-102', 97, 102),
  ('B2', 'central-103-107', 103, 107),
  ('B2', 'central-108-112', 108, 112),
  ('B2', 'central-113-118', 113, 118),
  ('B2', 'central-119-126', 119, 126),
  ('B2', 'central-127-132', 127, 132),
  ('B2', 'central-133-137', 133, 137),
  ('B2', 'central-138-145', 138, 145),
  ('B2', 'central-146-148', 146, 148),
  ('B2', 'central-94-96-149-151', 149, 151),
  ('B2', 'north-152-156', 152, 156),
  ('B2', 'north-157-161', 157, 161),
  ('B2', 'north-162-165', 162, 165),
  ('B2', 'north-166-172', 166, 172),
  ('B2', 'north-173-176', 173, 176),
  ('B2', 'north-177-181', 177, 181),
  ('B2', 'north-182-186', 182, 186),
  ('B3', 'north-01-09', 1, 9),
  ('B3', 'north-10-17', 10, 17),
  ('B3', 'north-18-22', 18, 22),
  ('B3', 'north-23-32', 23, 32),
  ('B3', 'north-33-40', 33, 40),
  ('B3', 'upper-41-46-119-124', 41, 46),
  ('B3', 'upper-47-52-113-118', 47, 52),
  ('B3', 'upper-53-57-107-112', 53, 57),
  ('B3', 'upper-58-63-102-106', 58, 63),
  ('B3', 'upper-64-68-97-101', 64, 68),
  ('B3', 'upper-69-96', 69, 96),
  ('B3', 'upper-64-68-97-101', 97, 101),
  ('B3', 'upper-58-63-102-106', 102, 106),
  ('B3', 'upper-53-57-107-112', 107, 112),
  ('B3', 'upper-47-52-113-118', 113, 118),
  ('B3', 'upper-41-46-119-124', 119, 124),
  ('B3', 'lower-125-130-203-208', 125, 130),
  ('B3', 'lower-131-138-195-202', 131, 138),
  ('B3', 'lower-139-142-191-194', 139, 142),
  ('B3', 'lower-143-147-186-190', 143, 147),
  ('B3', 'lower-148-152-181-185', 148, 152),
  ('B3', 'lower-153-156-177-180', 153, 156),
  ('B3', 'lower-157-161-172-176', 157, 161),
  ('B3', 'lower-162-171', 162, 171),
  ('B3', 'lower-157-161-172-176', 172, 176),
  ('B3', 'lower-153-156-177-180', 177, 180),
  ('B3', 'lower-148-152-181-185', 181, 185),
  ('B3', 'lower-143-147-186-190', 186, 190),
  ('B3', 'lower-139-142-191-194', 191, 194),
  ('B3', 'lower-131-138-195-202', 195, 202),
  ('B3', 'lower-125-130-203-208', 203, 208),
  ('B3', 'south-209-212', 209, 212),
  ('B3', 'south-213-216', 213, 216),
  ('B3', 'south-217-220', 217, 220),
  ('B3', 'south-221-223', 221, 223),
  ('B3', 'south-224-226', 224, 226),
  ('B3', 'south-227-236', 227, 236),
  ('B3', 'south-237-238', 237, 238),
  ('B3', 'south-239-242', 239, 242),
  ('B3', 'south-243-246', 243, 246),
  ('B3', 'south-247-251', 247, 251),
  ('B3', 'south-252-257', 252, 257);

CREATE TEMP TABLE _commercial_pavilion_cells ON COMMIT DROP AS
WITH expanded AS (
  SELECT
    spec.*,
    run.run_id,
    run.start_number,
    run.end_number,
    run.center_x,
    run.center_z,
    run.width,
    run.depth,
    run.sequence_orientation,
    run.module_orientation,
    run.group_key,
    COALESCE(cluster.cluster_key, run.cluster_key) AS cluster_key,
    module_number,
    run.end_number - run.start_number + 1 AS run_module_count,
    CASE
      WHEN run.sequence_orientation IN ('X-', 'Z-') THEN run.end_number - module_number
      ELSE module_number - run.start_number
    END AS spatial_index
  FROM _commercial_pavilion_specs spec
  JOIN _commercial_pavilion_runs run USING (pavilion_identifier)
  CROSS JOIN LATERAL generate_series(run.start_number, run.end_number) module_number
  LEFT JOIN _commercial_pavilion_cluster_ranges cluster
    ON cluster.pavilion_identifier = run.pavilion_identifier
    AND module_number BETWEEN cluster.start_number AND cluster.end_number
), measured AS (
  SELECT
    expanded.*,
    CASE
      WHEN sequence_orientation IN ('X+', 'X-')
        THEN (width - module_gap * (run_module_count - 1)) / run_module_count
      ELSE (depth - module_gap * (run_module_count - 1)) / run_module_count
    END AS cell_length
  FROM expanded
)
SELECT
  *,
  pavilion_identifier || '-M' || lpad(module_number::text, 3, '0') AS public_identifier,
  pavilion_identifier || ':module:' || lpad(module_number::text, 3, '0') AS pavilion_module_key,
  CASE WHEN module_number < 100 THEN lpad(module_number::text, 2, '0') ELSE module_number::text END AS lot_number,
  CASE
    WHEN sequence_orientation IN ('X+', 'X-')
      THEN center_x - width / 2 + spatial_index * (cell_length + module_gap) + cell_length / 2
    ELSE center_x
  END AS cell_center_x,
  CASE
    WHEN sequence_orientation IN ('X+', 'X-') THEN center_z
    ELSE center_z - depth / 2 + spatial_index * (cell_length + module_gap) + cell_length / 2
  END AS cell_center_z,
  CASE WHEN sequence_orientation IN ('X+', 'X-') THEN cell_length ELSE width END AS cell_width,
  CASE WHEN sequence_orientation IN ('X+', 'X-') THEN depth ELSE cell_length END AS cell_depth,
  CASE
    WHEN pavilion_identifier = 'B6' AND module_number IN (6, 156, 157, 158, 159)
      THEN 'official-range-omission'
    WHEN pavilion_identifier = 'B2' AND module_number IN (73, 74)
      THEN 'manual-confirmation-required'
    ELSE NULL
  END AS source_discrepancy
FROM measured;

DO $$
BEGIN
  IF (SELECT count(*) FROM _commercial_pavilion_cells) <> 657
    OR (SELECT count(DISTINCT pavilion_identifier || ':' || module_number) FROM _commercial_pavilion_cells) <> 657
    OR EXISTS (
      SELECT 1 FROM _commercial_pavilion_specs spec
      WHERE (SELECT count(*) FROM _commercial_pavilion_cells cell WHERE cell.pavilion_identifier = spec.pavilion_identifier)
        <> spec.module_count
    )
    OR EXISTS (
      SELECT 1
      FROM _commercial_pavilion_specs spec
      CROSS JOIN LATERAL generate_series(1, spec.module_count) expected(module_number)
      LEFT JOIN _commercial_pavilion_cells cell
        ON cell.pavilion_identifier = spec.pavilion_identifier
        AND cell.module_number = expected.module_number
      WHERE cell.module_number IS NULL
    )
    OR EXISTS (SELECT 1 FROM _commercial_pavilion_cells WHERE cell_width <= 0 OR cell_depth <= 0)
    OR EXISTS (
      SELECT 1
      FROM _commercial_pavilion_cells
      WHERE cell_center_x - cell_width / 2 < 0
        OR cell_center_x + cell_width / 2 > 1
        OR cell_center_z - cell_depth / 2 < 0
        OR cell_center_z + cell_depth / 2 > 1
    )
    OR EXISTS (
      SELECT 1
      FROM _commercial_pavilion_cells cell
      WHERE cell.pavilion_identifier IN ('B2', 'B3')
        AND NOT EXISTS (
          SELECT 1
          FROM _commercial_pavilion_cluster_ranges cluster
          WHERE cluster.pavilion_identifier = cell.pavilion_identifier
            AND cell.module_number BETWEEN cluster.start_number AND cluster.end_number
        )
    )
  THEN
    RAISE EXCEPTION 'COMMERCIAL_PAVILION_MODULE_SEED_INVALID';
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    CROSS JOIN _commercial_pavilion_specs spec
    WHERE project.is_archived = false
      AND (
        SELECT count(*)
        FROM public.map_entities pavilion
        WHERE pavilion.project_id = project.id
          AND pavilion.is_archived = false
          AND upper(pavilion.public_identifier) = spec.pavilion_identifier
          AND pavilion.classification = 'PAVILION'
      ) <> 1
  ) OR EXISTS (
    SELECT 1
    FROM public.map_projects project
    CROSS JOIN _commercial_pavilion_specs spec
    JOIN public.map_entities pavilion
      ON pavilion.project_id = project.id
      AND upper(pavilion.public_identifier) = spec.pavilion_identifier
      AND pavilion.is_archived = false
    WHERE project.is_archived = false
      AND pavilion.public_identifier <> spec.pavilion_identifier
  ) THEN
    RAISE EXCEPTION 'COMMERCIAL_PAVILION_PARENT_IDENTITY_CONFLICT';
  END IF;
END;
$$;

-- O cabeçalho interno usa map_entities.name; normalize também a identidade
-- exibida dos pais para que fallback, mapa externo e banco autenticado coincidam.
UPDATE public.map_entities pavilion
SET name = spec.official_name, updated_at = transaction_timestamp()
FROM _commercial_pavilion_specs spec
JOIN public.map_projects project ON project.is_archived = false
WHERE pavilion.project_id = project.id
  AND pavilion.public_identifier = spec.pavilion_identifier
  AND pavilion.classification = 'PAVILION'
  AND pavilion.is_archived = false
  AND pavilion.name IS DISTINCT FROM spec.official_name;

CREATE TEMP TABLE _commercial_pavilion_footprints ON COMMIT DROP AS
WITH world_bounds AS (
  SELECT
    project.id AS project_id,
    pavilion.id AS pavilion_id,
    layer.id AS layer_id,
    segment.id AS segment_id,
    geometry.elevation,
    geometry.calibration_version,
    spec.*,
    min((point->>0)::numeric) AS min_x,
    max((point->>0)::numeric) AS max_x,
    min((point->>1)::numeric) AS min_z,
    max((point->>1)::numeric) AS max_z
  FROM public.map_projects project
  CROSS JOIN _commercial_pavilion_specs spec
  JOIN public.map_entities pavilion
    ON pavilion.project_id = project.id
    AND pavilion.public_identifier = spec.pavilion_identifier
    AND pavilion.classification = 'PAVILION'
    AND pavilion.is_archived = false
  JOIN public.map_layers layer
    ON layer.project_id = project.id AND layer.layer_key = 'commercial'
  JOIN public.map_entity_geometries geometry
    ON geometry.project_id = project.id
    AND geometry.entity_id = pavilion.id
    AND geometry.is_current = true
  JOIN public.map_segments segment
    ON segment.project_id = project.id
    AND segment.slug = 'industria-comercio-servicos'
    AND segment.is_active = true
  CROSS JOIN LATERAL jsonb_array_elements(geometry.geometry->'coordinates'->0) point
  WHERE project.is_archived = false
  GROUP BY project.id, pavilion.id, layer.id, segment.id, geometry.elevation,
    geometry.calibration_version, spec.pavilion_identifier, spec.pavilion_number,
    spec.official_name,
    spec.commercial_block, spec.module_count, spec.facing_radians, spec.module_gap,
    spec.layout_revision, spec.source_reference
), local_bounds AS (
  SELECT
    *,
    (min_x + max_x) / 2 AS pavilion_center_x,
    (min_z + max_z) / 2 AS pavilion_center_z,
    CASE WHEN pavilion_identifier = 'B2' THEN max_z - min_z ELSE max_x - min_x END AS model_width,
    CASE WHEN pavilion_identifier = 'B2' THEN max_x - min_x ELSE max_z - min_z END AS model_depth
  FROM world_bounds
)
SELECT
  *,
  model_width - 2 * LEAST(model_width, model_depth) * 0.025
    - 2 * LEAST(model_width, model_depth) * 0.065 AS clear_width,
  model_depth - 2 * LEAST(model_width, model_depth) * 0.025
    - 2 * LEAST(model_width, model_depth) * 0.065 AS clear_depth
FROM local_bounds;

DO $$
BEGIN
  IF (SELECT count(*) FROM _commercial_pavilion_footprints)
      <> 3 * (SELECT count(*) FROM public.map_projects WHERE is_archived = false)
    OR EXISTS (SELECT 1 FROM _commercial_pavilion_footprints WHERE clear_width <= 0 OR clear_depth <= 0)
  THEN
    RAISE EXCEPTION 'COMMERCIAL_PAVILION_CLEAR_FOOTPRINT_INVALID';
  END IF;
END;
$$;

CREATE TEMP TABLE _commercial_pavilion_staged_modules ON COMMIT DROP AS
WITH projected AS (
  SELECT
    footprint.*,
    cell.run_id,
    cell.module_number,
    cell.public_identifier,
    cell.pavilion_module_key,
    cell.lot_number,
    cell.cell_center_x,
    cell.cell_center_z,
    cell.cell_width,
    cell.cell_depth,
    cell.sequence_orientation,
    cell.module_orientation,
    cell.group_key,
    cell.cluster_key,
    cell.source_discrepancy,
    (cell.cell_center_x - 0.5) * footprint.clear_width AS local_x,
    (cell.cell_center_z - 0.5) * footprint.clear_depth AS local_z,
    cell.cell_width * footprint.clear_width AS local_width,
    cell.cell_depth * footprint.clear_depth AS local_depth
  FROM _commercial_pavilion_footprints footprint
  JOIN _commercial_pavilion_cells cell USING (pavilion_identifier)
), placed AS (
  SELECT
    *,
    CASE WHEN pavilion_identifier = 'B2'
      THEN pavilion_center_x + local_z
      ELSE pavilion_center_x - local_x
    END AS world_center_x,
    CASE WHEN pavilion_identifier = 'B2'
      THEN pavilion_center_z - local_x
      ELSE pavilion_center_z - local_z
    END AS world_center_z,
    CASE WHEN pavilion_identifier = 'B2' THEN local_depth ELSE local_width END AS world_width,
    CASE WHEN pavilion_identifier = 'B2' THEN local_width ELSE local_depth END AS world_depth
  FROM projected
)
SELECT
  *,
  jsonb_build_object(
    'type', 'Polygon',
    'coordinates', jsonb_build_array(jsonb_build_array(
      jsonb_build_array(world_center_x - world_width / 2, world_center_z - world_depth / 2),
      jsonb_build_array(world_center_x + world_width / 2, world_center_z - world_depth / 2),
      jsonb_build_array(world_center_x + world_width / 2, world_center_z + world_depth / 2),
      jsonb_build_array(world_center_x - world_width / 2, world_center_z + world_depth / 2),
      jsonb_build_array(world_center_x - world_width / 2, world_center_z - world_depth / 2)
    ))
  ) AS geometry,
  jsonb_strip_nulls(jsonb_build_object(
    'seedManaged', true,
    'sourceRevision', '2026.4',
    'layoutRevision', layout_revision,
    'source', source_reference,
    'cartographicConfidence', 'official_visual_reference',
    'buyerDataImported', false,
    'parentPublicIdentifier', pavilion_identifier,
    'pavilionPublicIdentifier', pavilion_identifier,
    'pavilionModuleKey', pavilion_module_key,
    'pavilionNumber', pavilion_number,
    'commercialBlock', commercial_block,
    'moduleNumber', module_number,
    'lotNumber', lot_number,
    'orientation', module_orientation,
    'sequenceOrientation', lower(replace(sequence_orientation, '+', '-increasing')),
    'group', group_key,
    'cluster', cluster_key,
    'sortOrder', module_number,
    'type', 'commercial-lot',
    'moduleType', 'commercial-lot',
    'areaAssignment', 'unassigned',
    'officialMeasurements', false,
    'normalizedFootprint', jsonb_build_object(
      'centerX', cell_center_x, 'centerZ', cell_center_z,
      'width', cell_width, 'depth', cell_depth
    ),
    'normalizedLabelAnchor', jsonb_build_array(cell_center_x, cell_center_z),
    'labelAnchor', jsonb_build_array(world_center_x, world_center_z),
    'sourceDiscrepancy', source_discrepancy,
    'segmentId', 'industria-comercio-servicos',
    'segmentCode', 'INDUSTRIA_COMERCIO_SERVICOS',
    'segmentName', 'Indústria, Comércio e Serviços'
  )) AS canonical_metadata
FROM placed;

-- Replace the compact direction token with the exact client-domain value.
UPDATE _commercial_pavilion_staged_modules
SET canonical_metadata = canonical_metadata || jsonb_build_object(
  'sequenceOrientation', CASE sequence_orientation
    WHEN 'X+' THEN 'x-increasing'
    WHEN 'X-' THEN 'x-decreasing'
    WHEN 'Z+' THEN 'z-increasing'
    WHEN 'Z-' THEN 'z-decreasing'
  END
);

DO $$
BEGIN
  IF (SELECT count(*) FROM _commercial_pavilion_staged_modules)
      <> 657 * (SELECT count(*) FROM public.map_projects WHERE is_archived = false)
  THEN
    RAISE EXCEPTION 'COMMERCIAL_PAVILION_PROJECT_STAGE_INVALID';
  END IF;
END;
$$;

-- Existing rows are reusable only when every stable identity dimension agrees.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    CROSS JOIN _commercial_pavilion_specs spec
    JOIN public.map_entities pavilion
      ON pavilion.project_id = project.id
      AND pavilion.public_identifier = spec.pavilion_identifier
      AND pavilion.classification = 'PAVILION'
      AND pavilion.is_archived = false
    WHERE project.is_archived = false
      AND pavilion.name IS DISTINCT FROM spec.official_name
  ) THEN
    RAISE EXCEPTION 'COMMERCIAL_PAVILION_PARENT_LABEL_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.map_entities entity
    JOIN _commercial_pavilion_staged_modules staged
      ON staged.project_id = entity.project_id
      AND upper(staged.public_identifier) = upper(entity.public_identifier)
    WHERE entity.public_identifier <> staged.public_identifier
      OR entity.is_archived = true
      OR entity.classification <> 'INTERNAL_STAND'
      OR entity.is_sellable = false
      OR entity.parent_entity_id IS DISTINCT FROM staged.pavilion_id
      OR entity.layer_id IS DISTINCT FROM staged.layer_id
      OR entity.segment_id IS NOT NULL AND entity.segment_id IS DISTINCT FROM staged.segment_id
      OR entity.metadata->>'pavilionPublicIdentifier' IS NOT NULL
        AND upper(entity.metadata->>'pavilionPublicIdentifier') <> staged.pavilion_identifier
      OR entity.metadata->>'pavilionModuleKey' IS NOT NULL
        AND upper(entity.metadata->>'pavilionModuleKey') <> upper(staged.pavilion_module_key)
      OR entity.metadata->>'moduleNumber' IS NOT NULL
        AND entity.metadata->>'moduleNumber' <> staged.module_number::text
  ) THEN
    RAISE EXCEPTION 'COMMERCIAL_PAVILION_ENTITY_IDENTITY_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.map_entities entity
    JOIN _commercial_pavilion_staged_modules staged
      ON staged.project_id = entity.project_id
      AND upper(COALESCE(entity.metadata->>'pavilionModuleKey', ''))
        = upper(staged.pavilion_module_key)
    WHERE entity.public_identifier IS DISTINCT FROM staged.public_identifier
  ) THEN
    RAISE EXCEPTION 'COMMERCIAL_PAVILION_MODULE_KEY_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _commercial_pavilion_footprints footprint
    JOIN public.map_entities entity
      ON entity.project_id = footprint.project_id
      AND entity.parent_entity_id = footprint.pavilion_id
      AND entity.classification = 'INTERNAL_STAND'
      AND entity.is_archived = false
    LEFT JOIN _commercial_pavilion_staged_modules staged
      ON staged.project_id = entity.project_id
      AND staged.public_identifier = entity.public_identifier
    WHERE staged.public_identifier IS NULL
  ) THEN
    RAISE EXCEPTION 'COMMERCIAL_PAVILION_UNEXPECTED_INTERNAL_STAND_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.commercial_lots lot
    JOIN _commercial_pavilion_staged_modules staged
      ON staged.project_id = lot.project_id
      AND upper(staged.public_identifier) = upper(lot.public_identifier)
    LEFT JOIN public.map_entities entity
      ON entity.project_id = staged.project_id
      AND entity.public_identifier = staged.public_identifier
    WHERE lot.public_identifier <> staged.public_identifier
      OR lot.archived_at IS NOT NULL
      OR entity.id IS NULL
      OR lot.entity_id IS DISTINCT FROM entity.id
      OR lot.block IS DISTINCT FROM staged.commercial_block
      OR lot.lot_number IS DISTINCT FROM staged.lot_number
  ) THEN
    RAISE EXCEPTION 'COMMERCIAL_PAVILION_LOT_IDENTITY_CONFLICT';
  END IF;
END;
$$;

CREATE TEMP TABLE _commercial_pavilion_created_entities (entity_id uuid PRIMARY KEY) ON COMMIT DROP;

WITH inserted AS (
  INSERT INTO public.map_entities (
    id, project_id, layer_id, parent_entity_id, public_identifier,
    name, description, classification, verification_status,
    is_sellable, is_archived, segment_id, metadata,
    created_by, updated_by, created_at, updated_at
  )
  SELECT
    gen_random_uuid(), staged.project_id, staged.layer_id, staged.pavilion_id,
    staged.public_identifier, 'Módulo ' || staged.lot_number, NULL,
    'INTERNAL_STAND', 'NEEDS_REVIEW', true, false, staged.segment_id,
    staged.canonical_metadata, NULL, NULL, transaction_timestamp(), transaction_timestamp()
  FROM _commercial_pavilion_staged_modules staged
  WHERE NOT EXISTS (
    SELECT 1 FROM public.map_entities entity
    WHERE entity.project_id = staged.project_id
      AND entity.public_identifier = staged.public_identifier
  )
  ON CONFLICT (project_id, public_identifier) DO NOTHING
  RETURNING id
)
INSERT INTO _commercial_pavilion_created_entities SELECT id FROM inserted;

UPDATE public.map_entities entity
SET
  segment_id = staged.segment_id,
  metadata = (COALESCE(entity.metadata, '{}'::jsonb) - 'sourceDiscrepancy')
    || staged.canonical_metadata,
  updated_at = transaction_timestamp()
FROM _commercial_pavilion_staged_modules staged
WHERE entity.project_id = staged.project_id
  AND entity.public_identifier = staged.public_identifier
  AND (
    entity.segment_id IS DISTINCT FROM staged.segment_id
    OR entity.metadata IS DISTINCT FROM (
      (COALESCE(entity.metadata, '{}'::jsonb) - 'sourceDiscrepancy')
      || staged.canonical_metadata
    )
  );

CREATE TEMP TABLE _commercial_pavilion_entity_map ON COMMIT DROP AS
SELECT staged.*, entity.id AS entity_id
FROM _commercial_pavilion_staged_modules staged
JOIN public.map_entities entity
  ON entity.project_id = staged.project_id
  AND entity.public_identifier = staged.public_identifier
  AND entity.is_archived = false;

DO $$
BEGIN
  IF (SELECT count(*) FROM _commercial_pavilion_entity_map)
      <> (SELECT count(*) FROM _commercial_pavilion_staged_modules)
  THEN
    RAISE EXCEPTION 'COMMERCIAL_PAVILION_ENTITY_BACKFILL_INCOMPLETE';
  END IF;
END;
$$;

ALTER TABLE public.map_entity_geometries
  DISABLE TRIGGER map_geometry_layer_lock_before_write;

INSERT INTO public.map_entity_geometries (
  id, project_id, entity_id, geometry, elevation, extrusion_height,
  rotation, calibration_version, version, is_current, change_reason,
  created_by, created_at, updated_at
)
SELECT
  gen_random_uuid(), staged.project_id, staged.entity_id, staged.geometry,
  staged.elevation, 0, staged.facing_radians, staged.calibration_version,
  COALESCE((SELECT max(previous.version) + 1 FROM public.map_entity_geometries previous
    WHERE previous.entity_id = staged.entity_id), 1),
  true, 'Plantas oficiais dos Pavilhões 3, 12 e 14', NULL,
  transaction_timestamp(), transaction_timestamp()
FROM _commercial_pavilion_entity_map staged
WHERE NOT EXISTS (
  SELECT 1 FROM public.map_entity_geometries geometry
  WHERE geometry.entity_id = staged.entity_id
    AND geometry.project_id = staged.project_id
    AND geometry.is_current = true
);

UPDATE public.map_entity_geometries geometry
SET
  geometry = staged.geometry,
  elevation = staged.elevation,
  extrusion_height = 0,
  rotation = staged.facing_radians,
  calibration_version = staged.calibration_version,
  version = geometry.version + 1,
  change_reason = 'Plantas oficiais dos Pavilhões 3, 12 e 14',
  updated_at = transaction_timestamp()
FROM _commercial_pavilion_entity_map staged
WHERE geometry.entity_id = staged.entity_id
  AND geometry.project_id = staged.project_id
  AND geometry.is_current = true
  AND (
    geometry.geometry IS DISTINCT FROM staged.geometry
    OR geometry.elevation IS DISTINCT FROM staged.elevation
    OR geometry.extrusion_height IS DISTINCT FROM 0::numeric
    OR geometry.rotation IS DISTINCT FROM staged.facing_radians
    OR geometry.calibration_version IS DISTINCT FROM staged.calibration_version
  );

ALTER TABLE public.map_entity_geometries
  ENABLE TRIGGER map_geometry_layer_lock_before_write;

CREATE TEMP TABLE _commercial_pavilion_created_lots (
  lot_id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  entity_id uuid NOT NULL
) ON COMMIT DROP;

WITH inserted AS (
  INSERT INTO public.commercial_lots (
    id, project_id, entity_id, public_identifier, block, lot_number,
    level_label, display_name, description, status,
    official_area_sqm, calculated_area_sqm, area_validation_status,
    frontage_meters, depth_meters, infrastructure,
    has_electricity, has_water, has_internet, is_corner, is_covered,
    accessibility_notes, commercial_notes, internal_notes,
    archived_at, superseded_by_lot_id, created_by, updated_by,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(), staged.project_id, staged.entity_id, staged.public_identifier,
    staged.commercial_block, staged.lot_number, NULL, 'Módulo ' || staged.lot_number,
    NULL, 'BLOCKED', NULL, NULL, 'UNVALIDATED', NULL, NULL, '[]'::jsonb,
    false, false, false, false, true, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    transaction_timestamp(), transaction_timestamp()
  FROM _commercial_pavilion_entity_map staged
  WHERE NOT EXISTS (
    SELECT 1 FROM public.commercial_lots lot
    WHERE lot.entity_id = staged.entity_id
      OR (lot.project_id = staged.project_id AND lot.public_identifier = staged.public_identifier)
  )
  ON CONFLICT DO NOTHING
  RETURNING id, project_id, entity_id
)
INSERT INTO _commercial_pavilion_created_lots SELECT id, project_id, entity_id FROM inserted;

INSERT INTO public.lot_prices (
  id, lot_id, pricing_mode, base_price, price_per_sqm,
  asking_price, minimum_price, is_active, valid_from, valid_until,
  created_by, created_at
)
SELECT
  gen_random_uuid(), created.lot_id, 'NOT_FOR_SALE', NULL, NULL, NULL, NULL,
  true, transaction_timestamp(), NULL, NULL, transaction_timestamp()
FROM _commercial_pavilion_created_lots created;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _commercial_pavilion_created_lots created
    JOIN public.commercial_lots lot ON lot.id = created.lot_id
    WHERE lot.status <> 'BLOCKED'
      OR lot.official_area_sqm IS NOT NULL
      OR lot.calculated_area_sqm IS NOT NULL
      OR lot.frontage_meters IS NOT NULL
      OR lot.depth_meters IS NOT NULL
      OR lot.area_validation_status <> 'UNVALIDATED'
      OR lot.commercial_notes IS NOT NULL
      OR lot.internal_notes IS NOT NULL
      OR lot.accessibility_notes IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'COMMERCIAL_PAVILION_NEUTRAL_DEFAULTS_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _commercial_pavilion_created_lots created
    LEFT JOIN public.lot_prices price
      ON price.lot_id = created.lot_id
      AND price.is_active = true
    WHERE price.id IS NULL
      OR price.pricing_mode <> 'NOT_FOR_SALE'
      OR price.base_price IS NOT NULL
      OR price.price_per_sqm IS NOT NULL
      OR price.asking_price IS NOT NULL
      OR price.minimum_price IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'COMMERCIAL_PAVILION_NEUTRAL_PRICE_DEFAULTS_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _commercial_pavilion_created_lots created
    WHERE EXISTS (SELECT 1 FROM public.lot_reservations row WHERE row.lot_id = created.lot_id)
       OR EXISTS (SELECT 1 FROM public.lot_negotiations row WHERE row.lot_id = created.lot_id)
       OR EXISTS (SELECT 1 FROM public.lot_sales row WHERE row.lot_id = created.lot_id)
       OR EXISTS (SELECT 1 FROM public.lot_contracts row WHERE row.lot_id = created.lot_id)
  ) THEN
    RAISE EXCEPTION 'COMMERCIAL_PAVILION_NEUTRAL_RELATIONS_INVALID';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_map_entity_verification(
  p_entity_id uuid,
  p_status text,
  p_reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entity public.map_entities%ROWTYPE;
  v_lot public.commercial_lots%ROWTYPE;
  v_org_id uuid;
  v_is_measurement_optional_pavilion_module boolean := false;
BEGIN
  SELECT * INTO v_entity
  FROM public.map_entities
  WHERE id = p_entity_id AND is_archived = false
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'MAP_ENTITY_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_entity.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.admin') THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;
  IF p_status NOT IN ('NEEDS_REVIEW', 'VERIFIED') THEN
    RAISE EXCEPTION 'INVALID_VERIFICATION_STATUS';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'CHANGE_REASON_REQUIRED'; END IF;

  IF p_status = 'VERIFIED' THEN
    IF (SELECT status FROM public.map_calibrations WHERE project_id = v_entity.project_id
      ORDER BY version DESC LIMIT 1) IS DISTINCT FROM 'VALIDATED'
    THEN
      RAISE EXCEPTION 'VALIDATED_CALIBRATION_REQUIRED';
    END IF;

    IF v_entity.is_sellable THEN
      SELECT * INTO v_lot
      FROM public.commercial_lots
      WHERE entity_id = v_entity.id AND archived_at IS NULL
      FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'COMMERCIAL_LOT_NOT_FOUND'; END IF;

      v_is_measurement_optional_pavilion_module :=
        v_entity.classification = 'INTERNAL_STAND'
        AND upper(v_entity.public_identifier)
          = replace(upper(COALESCE(v_entity.metadata->>'pavilionModuleKey', '')), ':MODULE:', '-M')
        AND (
          (
            upper(COALESCE(v_entity.metadata->>'pavilionPublicIdentifier', '')) = 'B2'
            AND upper(COALESCE(v_entity.metadata->>'pavilionModuleKey', ''))
              ~ '^B2:MODULE:(00[1-9]|0[1-9][0-9]|1[0-7][0-9]|18[0-6])$'
          ) OR (
            upper(COALESCE(v_entity.metadata->>'pavilionPublicIdentifier', '')) = 'B3'
            AND upper(COALESCE(v_entity.metadata->>'pavilionModuleKey', ''))
              ~ '^B3:MODULE:(00[1-9]|0[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-7])$'
          ) OR (
            upper(COALESCE(v_entity.metadata->>'pavilionPublicIdentifier', '')) = 'B6'
            AND upper(COALESCE(v_entity.metadata->>'pavilionModuleKey', ''))
              ~ '^B6:MODULE:(00[1-9]|0[1-9][0-9]|1[0-9]{2}|20[0-9]|21[0-4])$'
          )
        )
        AND EXISTS (
          SELECT 1
          FROM public.map_entities pavilion
          WHERE pavilion.id = v_entity.parent_entity_id
            AND pavilion.project_id = v_entity.project_id
            AND pavilion.classification = 'PAVILION'
            AND pavilion.is_archived = false
            AND upper(pavilion.public_identifier)
              = upper(COALESCE(v_entity.metadata->>'pavilionPublicIdentifier', ''))
        )
        AND upper(v_lot.public_identifier) = upper(v_entity.public_identifier)
        AND v_lot.lot_number = COALESCE(v_entity.metadata->>'lotNumber', '')
        AND v_lot.area_validation_status = 'UNVALIDATED'
        AND v_lot.official_area_sqm IS NULL
        AND v_lot.calculated_area_sqm IS NULL
        AND v_lot.frontage_meters IS NULL
        AND v_lot.depth_meters IS NULL;

      IF v_lot.area_validation_status <> 'VALIDATED'
        AND NOT v_is_measurement_optional_pavilion_module
      THEN
        RAISE EXCEPTION 'OFFICIAL_AREA_REQUIRED_FOR_VERIFICATION';
      END IF;
    END IF;
  END IF;

  UPDATE public.map_entities
  SET verification_status = p_status, updated_by = auth.uid(), updated_at = now()
  WHERE id = v_entity.id;

  INSERT INTO public.map_activity_logs (
    org_id, project_id, entity_id, action,
    before_state, after_state, reason, actor_user_id
  )
  VALUES (
    v_org_id, v_entity.project_id, v_entity.id, 'ENTITY_VERIFICATION_CHANGED',
    jsonb_build_object('status', v_entity.verification_status),
    jsonb_build_object('status', p_status, 'measurementOptional', v_is_measurement_optional_pavilion_module),
    p_reason, auth.uid()
  );
  RETURN p_status;
END;
$$;

REVOKE ALL ON FUNCTION public.set_map_entity_verification(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_map_entity_verification(uuid, text, text) TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    CROSS JOIN _commercial_pavilion_specs spec
    WHERE project.is_archived = false
      AND (
        SELECT count(*)
        FROM public.map_entities entity
        JOIN public.map_entities pavilion ON pavilion.id = entity.parent_entity_id
        WHERE entity.project_id = project.id
          AND pavilion.public_identifier = spec.pavilion_identifier
          AND entity.classification = 'INTERNAL_STAND'
          AND entity.is_archived = false
      ) <> spec.module_count
  ) THEN
    RAISE EXCEPTION 'COMMERCIAL_PAVILION_INVENTORY_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _commercial_pavilion_entity_map staged
    JOIN public.map_entities entity ON entity.id = staged.entity_id
    LEFT JOIN public.map_entity_geometries geometry
      ON geometry.entity_id = entity.id AND geometry.project_id = entity.project_id AND geometry.is_current = true
    LEFT JOIN public.commercial_lots lot
      ON lot.entity_id = entity.id AND lot.project_id = entity.project_id AND lot.archived_at IS NULL
    WHERE entity.parent_entity_id IS DISTINCT FROM staged.pavilion_id
      OR entity.layer_id IS DISTINCT FROM staged.layer_id
      OR entity.segment_id IS DISTINCT FROM staged.segment_id
      OR entity.classification <> 'INTERNAL_STAND'
      OR entity.is_sellable = false
      OR NOT entity.metadata @> staged.canonical_metadata
      OR entity.metadata->>'sourceDiscrepancy' IS DISTINCT FROM staged.source_discrepancy
      OR geometry.id IS NULL
      OR geometry.geometry IS DISTINCT FROM staged.geometry
      OR geometry.rotation IS DISTINCT FROM staged.facing_radians
      OR lot.id IS NULL
      OR lot.public_identifier IS DISTINCT FROM staged.public_identifier
      OR lot.block IS DISTINCT FROM staged.commercial_block
      OR lot.lot_number IS DISTINCT FROM staged.lot_number
  ) THEN
    RAISE EXCEPTION 'COMMERCIAL_PAVILION_PERSISTED_INVENTORY_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _commercial_pavilion_entity_map staged
    WHERE public.resolve_commission_map_segment_slug(
      staged.public_identifier,
      jsonb_build_object('block', 'R', 'areaCode', 'EXPORURAL')
    ) IS DISTINCT FROM 'industria-comercio-servicos'
      OR public.resolve_commission_map_segment_slug(
        NULL,
        jsonb_build_object(
          'pavilionPublicIdentifier', staged.pavilion_identifier,
          'pavilionModuleKey', staged.pavilion_module_key,
          'block', 'S',
          'areaCode', 'EXPORURAL'
        )
      ) IS DISTINCT FROM 'industria-comercio-servicos'
      OR public.resolve_commission_map_segment_slug(
        'B35',
        jsonb_build_object(
          'pavilionPublicIdentifier', staged.pavilion_identifier,
          'pavilionModuleKey', staged.pavilion_module_key
        )
      ) IS NOT NULL
      OR public.resolve_commission_map_segment_slug(
        'B7',
        jsonb_build_object(
          'pavilionPublicIdentifier', staged.pavilion_identifier,
          'pavilionModuleKey', staged.pavilion_module_key
        )
      ) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'COMMERCIAL_PAVILION_CANONICAL_SEGMENT_RESOLVER_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _commercial_pavilion_previous_lineage previous
    JOIN public.map_segments current ON current.id = previous.segment_id
    WHERE previous.lineage_baseline_at IS NOT NULL
      AND current.boundary_data->'lineageBaselineAt' IS DISTINCT FROM previous.lineage_baseline_at
  ) THEN
    RAISE EXCEPTION 'COMMISSION_SEGMENT_LINEAGE_BASELINE_CHANGED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    JOIN public.map_segments segment ON segment.project_id = project.id
    WHERE project.is_archived = false
      AND segment.slug IN ('exporural', 'industria-comercio-servicos')
      AND (
        segment.boundary_data->'lineageBaselineAt' IS NULL
        OR segment.boundary_data->>'expectedEntityCount' IS DISTINCT FROM CASE
          WHEN segment.slug = 'exporural' THEN '111' ELSE '797'
        END
        OR segment.boundary_data->>'expectedLotCount' IS DISTINCT FROM CASE
          WHEN segment.slug = 'exporural' THEN '95' ELSE '760'
        END
        OR NOT public.map_segment_is_complete(segment.id)
      )
  ) THEN
    RAISE EXCEPTION 'COMMISSION_SEGMENT_INVENTORY_VALIDATION_FAILED';
  END IF;
END;
$$;

COMMIT;
