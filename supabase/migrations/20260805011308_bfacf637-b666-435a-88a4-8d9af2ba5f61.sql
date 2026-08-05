CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

CREATE TABLE public.map_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  coordinate_system text NOT NULL DEFAULT 'LOCAL_NORMALIZED',
  reference_width numeric(14,6) NOT NULL DEFAULT 120,
  reference_height numeric(14,6) NOT NULL DEFAULT 67.5,
  active_version integer NOT NULL DEFAULT 1,
  is_published boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_projects_coordinate_system_check CHECK (coordinate_system IN ('LOCAL_NORMALIZED', 'GEOREFERENCED')),
  CONSTRAINT map_projects_dimensions_check CHECK (reference_width > 0 AND reference_height > 0),
  CONSTRAINT map_projects_version_check CHECK (active_version > 0)
);

CREATE UNIQUE INDEX map_projects_one_active_per_org
  ON public.map_projects(org_id)
  WHERE is_archived = false;

CREATE TABLE public.map_calibrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.map_projects(id) ON DELETE CASCADE,
  reference_image_path text,
  opacity numeric(4,3) NOT NULL DEFAULT 0.28,
  is_locked boolean NOT NULL DEFAULT true,
  image_offset_x numeric(14,6) NOT NULL DEFAULT 0,
  image_offset_y numeric(14,6) NOT NULL DEFAULT 0,
  image_scale_x numeric(12,6) NOT NULL DEFAULT 1,
  image_scale_y numeric(12,6) NOT NULL DEFAULT 1,
  image_rotation_degrees numeric(12,6) NOT NULL DEFAULT 0,
  point_a jsonb,
  point_b jsonb,
  known_distance_meters numeric(14,6),
  map_units_per_meter numeric(18,9),
  status text NOT NULL DEFAULT 'UNVALIDATED',
  version integer NOT NULL DEFAULT 1,
  invalidated_reason text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_calibrations_status_check CHECK (status IN ('UNVALIDATED', 'VALIDATED', 'INVALIDATED')),
  CONSTRAINT map_calibrations_opacity_check CHECK (opacity >= 0 AND opacity <= 1),
  CONSTRAINT map_calibrations_distance_check CHECK (known_distance_meters IS NULL OR known_distance_meters > 0),
  CONSTRAINT map_calibrations_scale_check CHECK (map_units_per_meter IS NULL OR map_units_per_meter > 0),
  CONSTRAINT map_calibrations_image_scale_check CHECK (image_scale_x > 0 AND image_scale_y > 0),
  CONSTRAINT map_calibrations_version_unique UNIQUE (project_id, version)
);

CREATE TABLE public.map_layers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.map_projects(id) ON DELETE CASCADE,
  layer_key text NOT NULL,
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#64748b',
  opacity numeric(4,3) NOT NULL DEFAULT 1,
  is_visible boolean NOT NULL DEFAULT true,
  is_locked boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_layers_opacity_check CHECK (opacity >= 0 AND opacity <= 1),
  CONSTRAINT map_layers_project_key_unique UNIQUE (project_id, layer_key)
);

CREATE TABLE public.map_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.map_projects(id) ON DELETE CASCADE,
  layer_id uuid NOT NULL REFERENCES public.map_layers(id) ON DELETE RESTRICT,
  parent_entity_id uuid REFERENCES public.map_entities(id) ON DELETE SET NULL,
  public_identifier text NOT NULL,
  name text NOT NULL,
  description text,
  classification text NOT NULL,
  verification_status text NOT NULL DEFAULT 'DRAFT',
  is_sellable boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_entities_classification_check CHECK (classification IN (
    'SELLABLE_LOT', 'INTERNAL_STAND', 'PAVILION', 'BUILDING', 'RESTAURANT', 'FOOD_AREA',
    'RESTROOM', 'CHEMICAL_RESTROOM', 'GATE', 'PARKING', 'ROAD', 'PEDESTRIAN_PATH',
    'GREEN_AREA', 'TREE', 'WATER', 'ADMINISTRATION', 'SECURITY', 'EMERGENCY', 'SERVICE',
    'ATTRACTION', 'LIVESTOCK_AREA', 'RURAL_EXHIBITION', 'RESTRICTED_AREA', 'LANDMARK', 'OTHER'
  )),
  CONSTRAINT map_entities_verification_check CHECK (verification_status IN ('DRAFT', 'NEEDS_REVIEW', 'VERIFIED', 'ARCHIVED')),
  CONSTRAINT map_entities_sellable_class_check CHECK (
    is_sellable = false OR classification IN ('SELLABLE_LOT', 'INTERNAL_STAND')
  ),
  CONSTRAINT map_entities_project_identifier_unique UNIQUE (project_id, public_identifier)
);

CREATE TABLE public.map_entity_geometries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.map_projects(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES public.map_entities(id) ON DELETE CASCADE,
  geometry jsonb NOT NULL,
  native_geometry extensions.geometry(Polygon, 0) GENERATED ALWAYS AS (
    extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(geometry::text), 0)
  ) STORED,
  elevation numeric(14,6) NOT NULL DEFAULT 0,
  extrusion_height numeric(14,6) NOT NULL DEFAULT 0.15,
  rotation numeric(14,6) NOT NULL DEFAULT 0,
  calibration_version integer,
  version integer NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  change_reason text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_geometry_geojson_check CHECK (
    jsonb_typeof(geometry) = 'object'
    AND geometry->>'type' = 'Polygon'
    AND jsonb_typeof(geometry->'coordinates') = 'array'
    AND jsonb_array_length(geometry->'coordinates') > 0
  ),
  CONSTRAINT map_geometry_positive_check CHECK (elevation >= 0 AND extrusion_height >= 0),
  CONSTRAINT map_geometry_topology_check CHECK (
    extensions.ST_IsValid(native_geometry)
    AND NOT extensions.ST_IsEmpty(native_geometry)
    AND extensions.ST_Area(native_geometry) > 0.00000001
  ),
  CONSTRAINT map_geometry_version_check CHECK (version > 0),
  CONSTRAINT map_geometry_entity_version_unique UNIQUE (entity_id, version)
);

CREATE UNIQUE INDEX map_entity_one_current_geometry
  ON public.map_entity_geometries(entity_id)
  WHERE is_current = true;

CREATE TABLE public.map_geometry_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  geometry_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.map_projects(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES public.map_entities(id) ON DELETE CASCADE,
  geometry jsonb NOT NULL,
  elevation numeric(14,6) NOT NULL,
  extrusion_height numeric(14,6) NOT NULL,
  rotation numeric(14,6) NOT NULL,
  calibration_version integer,
  version integer NOT NULL,
  change_reason text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL,
  superseded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_geometry_versions_entity_version_unique UNIQUE (entity_id, version)
);

CREATE TABLE public.commercial_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.map_projects(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL UNIQUE REFERENCES public.map_entities(id) ON DELETE RESTRICT,
  public_identifier text NOT NULL,
  block text,
  lot_number text,
  level_label text,
  display_name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'AVAILABLE',
  official_area_sqm numeric(14,4),
  calculated_area_sqm numeric(14,4),
  area_validation_status text NOT NULL DEFAULT 'UNVALIDATED',
  frontage_meters numeric(12,4),
  depth_meters numeric(12,4),
  infrastructure jsonb NOT NULL DEFAULT '[]'::jsonb,
  has_electricity boolean NOT NULL DEFAULT false,
  has_water boolean NOT NULL DEFAULT false,
  has_internet boolean NOT NULL DEFAULT false,
  is_corner boolean NOT NULL DEFAULT false,
  is_covered boolean NOT NULL DEFAULT false,
  accessibility_notes text,
  commercial_notes text,
  internal_notes text,
  archived_at timestamptz,
  superseded_by_lot_id uuid REFERENCES public.commercial_lots(id),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_lots_status_check CHECK (status IN ('AVAILABLE', 'RESERVED', 'IN_NEGOTIATION', 'SOLD', 'BLOCKED', 'UNAVAILABLE')),
  CONSTRAINT commercial_lots_area_validation_check CHECK (area_validation_status IN ('UNVALIDATED', 'CALCULATED', 'VALIDATED', 'REJECTED')),
  CONSTRAINT commercial_lots_area_positive_check CHECK (
    (official_area_sqm IS NULL OR official_area_sqm > 0)
    AND (calculated_area_sqm IS NULL OR calculated_area_sqm > 0)
    AND (frontage_meters IS NULL OR frontage_meters > 0)
    AND (depth_meters IS NULL OR depth_meters > 0)
  ),
  CONSTRAINT commercial_lots_project_identifier_unique UNIQUE (project_id, public_identifier)
);

CREATE TABLE public.lot_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.commercial_lots(id) ON DELETE CASCADE,
  pricing_mode text NOT NULL,
  base_price numeric(14,2),
  price_per_sqm numeric(14,2),
  asking_price numeric(14,2),
  minimum_price numeric(14,2),
  is_active boolean NOT NULL DEFAULT true,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lot_prices_mode_check CHECK (pricing_mode IN ('FIXED_TOTAL', 'PRICE_PER_SQUARE_METER', 'NEGOTIABLE', 'NOT_FOR_SALE')),
  CONSTRAINT lot_prices_positive_check CHECK (
    (base_price IS NULL OR base_price >= 0)
    AND (price_per_sqm IS NULL OR price_per_sqm >= 0)
    AND (asking_price IS NULL OR asking_price >= 0)
    AND (minimum_price IS NULL OR minimum_price >= 0)
  ),
  CONSTRAINT lot_prices_range_check CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE UNIQUE INDEX lot_prices_one_active_per_lot ON public.lot_prices(lot_id) WHERE is_active = true;

CREATE TABLE public.lot_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.commercial_lots(id) ON DELETE RESTRICT,
  company_name text NOT NULL,
  document_number text,
  contact_name text NOT NULL,
  phone text,
  email text,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  responsible_user_id uuid NOT NULL REFERENCES auth.users(id),
  responsible_name text,
  notes text,
  status text NOT NULL DEFAULT 'ACTIVE',
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lot_reservations_status_check CHECK (status IN ('ACTIVE', 'EXPIRED', 'CANCELLED', 'CONVERTED')),
  CONSTRAINT lot_reservations_expiry_check CHECK (expires_at > reserved_at)
);

CREATE UNIQUE INDEX lot_reservations_one_active_per_lot ON public.lot_reservations(lot_id) WHERE status = 'ACTIVE';

CREATE TABLE public.lot_negotiations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.commercial_lots(id) ON DELETE RESTRICT,
  company_name text NOT NULL,
  document_number text,
  contact_name text,
  proposed_value numeric(14,2),
  notes text,
  status text NOT NULL DEFAULT 'ACTIVE',
  responsible_user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lot_negotiations_status_check CHECK (status IN ('ACTIVE', 'WON', 'LOST', 'CANCELLED')),
  CONSTRAINT lot_negotiations_value_check CHECK (proposed_value IS NULL OR proposed_value >= 0)
);

CREATE UNIQUE INDEX lot_negotiations_one_active_per_lot ON public.lot_negotiations(lot_id) WHERE status = 'ACTIVE';

CREATE TABLE public.lot_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.commercial_lots(id) ON DELETE RESTRICT,
  buyer_name text NOT NULL,
  document_number text,
  negotiated_value numeric(14,2) NOT NULL,
  sale_date date NOT NULL,
  salesperson_user_id uuid NOT NULL REFERENCES auth.users(id),
  salesperson_name text NOT NULL,
  contract_number text,
  payment_status text NOT NULL DEFAULT 'PENDING',
  internal_notes text,
  status text NOT NULL DEFAULT 'CONFIRMED',
  created_at timestamptz NOT NULL DEFAULT now(),
  reverted_at timestamptz,
  reverted_by uuid REFERENCES auth.users(id),
  CONSTRAINT lot_sales_value_check CHECK (negotiated_value >= 0),
  CONSTRAINT lot_sales_payment_check CHECK (payment_status IN ('PENDING', 'PARTIAL', 'PAID', 'CANCELLED')),
  CONSTRAINT lot_sales_status_check CHECK (status IN ('CONFIRMED', 'REVERTED'))
);

CREATE UNIQUE INDEX lot_sales_one_confirmed_per_lot ON public.lot_sales(lot_id) WHERE status = 'CONFIRMED';

CREATE TABLE public.lot_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.commercial_lots(id) ON DELETE RESTRICT,
  contract_number text,
  active_version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lot_contracts_active_version_check CHECK (active_version > 0)
);

CREATE UNIQUE INDEX lot_contracts_one_active_per_lot ON public.lot_contracts(lot_id) WHERE is_active = true;

CREATE TABLE public.lot_contract_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.lot_contracts(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  storage_path text NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  CONSTRAINT lot_contract_versions_file_size_check CHECK (file_size > 0 AND file_size <= 15728640),
  CONSTRAINT lot_contract_versions_mime_check CHECK (mime_type IN (
    'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  CONSTRAINT lot_contract_versions_contract_version_unique UNIQUE (contract_id, version),
  CONSTRAINT lot_contract_versions_storage_unique UNIQUE (storage_path)
);

CREATE TABLE public.lot_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.commercial_lots(id) ON DELETE CASCADE,
  previous_status text,
  new_status text NOT NULL,
  reason text,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lot_status_history_previous_check CHECK (previous_status IS NULL OR previous_status IN ('AVAILABLE', 'RESERVED', 'IN_NEGOTIATION', 'SOLD', 'BLOCKED', 'UNAVAILABLE')),
  CONSTRAINT lot_status_history_new_check CHECK (new_status IN ('AVAILABLE', 'RESERVED', 'IN_NEGOTIATION', 'SOLD', 'BLOCKED', 'UNAVAILABLE'))
);

CREATE TABLE public.map_lot_lineage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_lot_id uuid NOT NULL REFERENCES public.commercial_lots(id) ON DELETE RESTRICT,
  target_lot_id uuid NOT NULL REFERENCES public.commercial_lots(id) ON DELETE RESTRICT,
  relationship text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_lot_lineage_relationship_check CHECK (relationship IN ('SPLIT_FROM', 'MERGED_FROM', 'SUPERSEDES')),
  CONSTRAINT map_lot_lineage_no_self_check CHECK (source_lot_id <> target_lot_id),
  CONSTRAINT map_lot_lineage_unique UNIQUE (source_lot_id, target_lot_id, relationship)
);

CREATE TABLE public.map_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.map_projects(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES public.map_entities(id) ON DELETE SET NULL,
  lot_id uuid REFERENCES public.commercial_lots(id) ON DELETE SET NULL,
  action text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  reason text,
  actor_user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX map_projects_org_idx ON public.map_projects(org_id, is_archived);
CREATE INDEX map_calibrations_project_idx ON public.map_calibrations(project_id, version DESC);
CREATE INDEX map_layers_project_idx ON public.map_layers(project_id, sort_order);
CREATE INDEX map_entities_project_type_idx ON public.map_entities(project_id, classification, is_archived);
CREATE INDEX map_entities_parent_idx ON public.map_entities(parent_entity_id);
CREATE INDEX map_geometries_project_idx ON public.map_entity_geometries(project_id, is_current);
CREATE INDEX map_geometries_native_gist_idx ON public.map_entity_geometries USING gist(native_geometry);
CREATE INDEX commercial_lots_project_status_idx ON public.commercial_lots(project_id, status) WHERE archived_at IS NULL;
CREATE INDEX commercial_lots_block_idx ON public.commercial_lots(project_id, block) WHERE archived_at IS NULL;
CREATE INDEX commercial_lots_identifier_idx ON public.commercial_lots(project_id, public_identifier);
CREATE INDEX lot_reservations_expiration_idx ON public.lot_reservations(expires_at) WHERE status = 'ACTIVE';
CREATE INDEX lot_sales_buyer_idx ON public.lot_sales(buyer_name);
CREATE INDEX map_activity_entity_idx ON public.map_activity_logs(entity_id, created_at DESC);
CREATE INDEX map_activity_lot_idx ON public.map_activity_logs(lot_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.map_has_explicit_capability(_org_id uuid, _capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.get_user_org_role(auth.uid(), _org_id) IN ('admin', 'gestor')
    OR EXISTS (
      SELECT 1
      FROM public.user_capabilities c
      WHERE c.user_id = auth.uid()
        AND c.org_id = _org_id
        AND c.capability IN (_capability, 'map.admin', 'full_access')
    );
$$;

CREATE OR REPLACE FUNCTION public.can_view_commercial_map(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.get_user_org_role(auth.uid(), _org_id) IN ('admin', 'gestor', 'operador')
    OR public.map_has_explicit_capability(_org_id, 'map.view');
$$;

CREATE OR REPLACE FUNCTION public.map_polygon_from_geojson(_geometry jsonb)
RETURNS extensions.geometry
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE v_polygon extensions.geometry;
BEGIN
  IF _geometry IS NULL
    OR _geometry->>'type' <> 'Polygon'
    OR jsonb_typeof(_geometry->'coordinates') <> 'array'
    OR jsonb_array_length(_geometry->'coordinates') = 0
  THEN
    RAISE EXCEPTION 'INVALID_POLYGON';
  END IF;
  v_polygon := extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(_geometry::text), 0);
  IF extensions.GeometryType(v_polygon) <> 'POLYGON'
    OR NOT extensions.ST_IsValid(v_polygon)
    OR extensions.ST_IsEmpty(v_polygon)
    OR extensions.ST_Area(v_polygon) <= 0.00000001
  THEN
    RAISE EXCEPTION 'INVALID_POLYGON';
  END IF;
  RETURN v_polygon;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM IN ('INVALID_POLYGON', 'MAP_GEOMETRY_OVERLAP') THEN RAISE; END IF;
    RAISE EXCEPTION 'INVALID_POLYGON';
END;
$$;

CREATE OR REPLACE FUNCTION public.map_geometry_overlaps_sellable(
  _project_id uuid,
  _geometry jsonb,
  _excluded_entity_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.map_entity_geometries g
    JOIN public.map_entities e ON e.id = g.entity_id
    WHERE g.project_id = _project_id
      AND g.is_current = true
      AND e.is_archived = false
      AND e.is_sellable = true
      AND NOT (e.id = ANY(_excluded_entity_ids))
      AND extensions.ST_Area(
        extensions.ST_Intersection(g.native_geometry, public.map_polygon_from_geojson(_geometry))
      ) > 0.00000001
  );
$$;

REVOKE ALL ON FUNCTION public.map_has_explicit_capability(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_commercial_map(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.map_has_explicit_capability(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_commercial_map(uuid) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_calibrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_layers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_entities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_entity_geometries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_geometry_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_lots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lot_prices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lot_reservations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lot_negotiations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lot_sales TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lot_contracts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lot_contract_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lot_status_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_lot_lineage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_activity_logs TO authenticated;
GRANT ALL ON public.map_projects TO service_role;
GRANT ALL ON public.map_calibrations TO service_role;
GRANT ALL ON public.map_layers TO service_role;
GRANT ALL ON public.map_entities TO service_role;
GRANT ALL ON public.map_entity_geometries TO service_role;
GRANT ALL ON public.map_geometry_versions TO service_role;
GRANT ALL ON public.commercial_lots TO service_role;
GRANT ALL ON public.lot_prices TO service_role;
GRANT ALL ON public.lot_reservations TO service_role;
GRANT ALL ON public.lot_negotiations TO service_role;
GRANT ALL ON public.lot_sales TO service_role;
GRANT ALL ON public.lot_contracts TO service_role;
GRANT ALL ON public.lot_contract_versions TO service_role;
GRANT ALL ON public.lot_status_history TO service_role;
GRANT ALL ON public.map_lot_lineage TO service_role;
GRANT ALL ON public.map_activity_logs TO service_role;

ALTER TABLE public.map_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_calibrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_entity_geometries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_geometry_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_negotiations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_contract_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_lot_lineage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY map_projects_select ON public.map_projects FOR SELECT TO authenticated
  USING (public.can_view_commercial_map(org_id));
CREATE POLICY map_projects_insert ON public.map_projects FOR INSERT TO authenticated
  WITH CHECK (public.map_has_explicit_capability(org_id, 'map.admin'));
CREATE POLICY map_projects_update ON public.map_projects FOR UPDATE TO authenticated
  USING (public.map_has_explicit_capability(org_id, 'map.admin'))
  WITH CHECK (public.map_has_explicit_capability(org_id, 'map.admin'));

CREATE POLICY map_calibrations_select ON public.map_calibrations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = project_id AND public.can_view_commercial_map(p.org_id)));
CREATE POLICY map_calibrations_insert ON public.map_calibrations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = project_id AND public.map_has_explicit_capability(p.org_id, 'map.edit_geometry')));
CREATE POLICY map_calibrations_update ON public.map_calibrations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = project_id AND public.map_has_explicit_capability(p.org_id, 'map.edit_geometry')));

CREATE POLICY map_layers_select ON public.map_layers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = project_id AND public.can_view_commercial_map(p.org_id)));
CREATE POLICY map_layers_manage ON public.map_layers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = project_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_layers')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = project_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_layers')));

CREATE POLICY map_entities_select ON public.map_entities FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = project_id AND public.can_view_commercial_map(p.org_id)));
CREATE POLICY map_entities_manage ON public.map_entities FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = project_id AND public.map_has_explicit_capability(p.org_id, 'map.edit')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = project_id AND public.map_has_explicit_capability(p.org_id, 'map.edit')));

CREATE POLICY map_geometries_select ON public.map_entity_geometries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = project_id AND public.can_view_commercial_map(p.org_id)));
CREATE POLICY map_geometries_manage ON public.map_entity_geometries FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = project_id AND public.map_has_explicit_capability(p.org_id, 'map.edit_geometry')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = project_id AND public.map_has_explicit_capability(p.org_id, 'map.edit_geometry')));

CREATE POLICY map_geometry_versions_select ON public.map_geometry_versions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = project_id AND public.can_view_commercial_map(p.org_id)));
CREATE POLICY map_geometry_versions_insert ON public.map_geometry_versions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = project_id AND public.map_has_explicit_capability(p.org_id, 'map.edit_geometry')));

CREATE POLICY commercial_lots_select ON public.commercial_lots FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = project_id AND public.can_view_commercial_map(p.org_id)));
CREATE POLICY commercial_lots_manage ON public.commercial_lots FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = project_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_lots')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = project_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_lots')));

CREATE POLICY lot_prices_select ON public.lot_prices FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.commercial_lots l JOIN public.map_projects p ON p.id = l.project_id WHERE l.id = lot_id AND public.can_view_commercial_map(p.org_id)));
CREATE POLICY lot_prices_manage ON public.lot_prices FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.commercial_lots l JOIN public.map_projects p ON p.id = l.project_id WHERE l.id = lot_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_lots')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.commercial_lots l JOIN public.map_projects p ON p.id = l.project_id WHERE l.id = lot_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_lots')));

CREATE POLICY lot_reservations_restricted ON public.lot_reservations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.commercial_lots l JOIN public.map_projects p ON p.id = l.project_id WHERE l.id = lot_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_sales')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.commercial_lots l JOIN public.map_projects p ON p.id = l.project_id WHERE l.id = lot_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_sales')));
CREATE POLICY lot_negotiations_restricted ON public.lot_negotiations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.commercial_lots l JOIN public.map_projects p ON p.id = l.project_id WHERE l.id = lot_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_sales')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.commercial_lots l JOIN public.map_projects p ON p.id = l.project_id WHERE l.id = lot_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_sales')));
CREATE POLICY lot_sales_restricted ON public.lot_sales FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.commercial_lots l JOIN public.map_projects p ON p.id = l.project_id WHERE l.id = lot_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_sales')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.commercial_lots l JOIN public.map_projects p ON p.id = l.project_id WHERE l.id = lot_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_sales')));

CREATE POLICY lot_contracts_restricted ON public.lot_contracts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.commercial_lots l JOIN public.map_projects p ON p.id = l.project_id WHERE l.id = lot_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_contracts')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.commercial_lots l JOIN public.map_projects p ON p.id = l.project_id WHERE l.id = lot_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_contracts')));
CREATE POLICY lot_contract_versions_restricted ON public.lot_contract_versions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lot_contracts c JOIN public.commercial_lots l ON l.id = c.lot_id JOIN public.map_projects p ON p.id = l.project_id WHERE c.id = contract_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_contracts')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lot_contracts c JOIN public.commercial_lots l ON l.id = c.lot_id JOIN public.map_projects p ON p.id = l.project_id WHERE c.id = contract_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_contracts')));

CREATE POLICY lot_status_history_select ON public.lot_status_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.commercial_lots l JOIN public.map_projects p ON p.id = l.project_id WHERE l.id = lot_id AND public.can_view_commercial_map(p.org_id)));
CREATE POLICY lot_status_history_insert ON public.lot_status_history FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.commercial_lots l JOIN public.map_projects p ON p.id = l.project_id WHERE l.id = lot_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_sales')));
CREATE POLICY map_lot_lineage_select ON public.map_lot_lineage FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.commercial_lots l JOIN public.map_projects p ON p.id = l.project_id WHERE l.id = source_lot_id AND public.can_view_commercial_map(p.org_id)));
CREATE POLICY map_lot_lineage_insert ON public.map_lot_lineage FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.commercial_lots l JOIN public.map_projects p ON p.id = l.project_id WHERE l.id = source_lot_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_lots')));
CREATE POLICY map_activity_logs_select ON public.map_activity_logs FOR SELECT TO authenticated
  USING (public.map_has_explicit_capability(org_id, 'map.edit'));
CREATE POLICY map_activity_logs_insert ON public.map_activity_logs FOR INSERT TO authenticated
  WITH CHECK (public.can_view_commercial_map(org_id) AND actor_user_id = auth.uid());