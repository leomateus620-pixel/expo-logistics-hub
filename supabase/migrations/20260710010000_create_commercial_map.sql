-- Fenasoja Commercial Map
-- Versioned local-coordinate digital twin, commercial workflows and private contracts.

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

CREATE OR REPLACE FUNCTION public.archive_map_geometry_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.geometry IS DISTINCT FROM NEW.geometry
     OR OLD.elevation IS DISTINCT FROM NEW.elevation
     OR OLD.extrusion_height IS DISTINCT FROM NEW.extrusion_height
     OR OLD.rotation IS DISTINCT FROM NEW.rotation THEN
    INSERT INTO public.map_geometry_versions (
      geometry_id, project_id, entity_id, geometry, elevation, extrusion_height, rotation,
      calibration_version, version, change_reason, created_by, created_at
    ) VALUES (
      OLD.id, OLD.project_id, OLD.entity_id, OLD.geometry, OLD.elevation, OLD.extrusion_height, OLD.rotation,
      OLD.calibration_version, OLD.version, OLD.change_reason, OLD.created_by, OLD.created_at
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER map_geometry_archive_before_update
  BEFORE UPDATE ON public.map_entity_geometries
  FOR EACH ROW EXECUTE FUNCTION public.archive_map_geometry_revision();

CREATE OR REPLACE FUNCTION public.enforce_map_layer_geometry_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_org_id uuid; v_locked boolean;
BEGIN
  SELECT p.org_id, l.is_locked INTO v_org_id, v_locked
  FROM public.map_entities e
  JOIN public.map_layers l ON l.id = e.layer_id
  JOIN public.map_projects p ON p.id = e.project_id
  WHERE e.id = NEW.entity_id;
  IF v_locked AND NOT public.map_has_explicit_capability(v_org_id, 'map.admin') THEN RAISE EXCEPTION 'MAP_LAYER_LOCKED'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER map_geometry_layer_lock_before_write
  BEFORE INSERT OR UPDATE ON public.map_entity_geometries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_map_layer_geometry_lock();

CREATE OR REPLACE FUNCTION public.set_map_layer_lock(p_layer_id uuid, p_is_locked boolean, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_layer public.map_layers%ROWTYPE; v_org_id uuid;
BEGIN
  SELECT * INTO v_layer FROM public.map_layers WHERE id = p_layer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MAP_LAYER_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_layer.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_layers') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'CHANGE_REASON_REQUIRED'; END IF;
  UPDATE public.map_layers SET is_locked = p_is_locked, updated_at = now() WHERE id = p_layer_id;
  INSERT INTO public.map_activity_logs (org_id, project_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (
    v_org_id, v_layer.project_id, 'LAYER_LOCK_CHANGED',
    jsonb_build_object('layerId', v_layer.id, 'locked', v_layer.is_locked),
    jsonb_build_object('layerId', v_layer.id, 'locked', p_is_locked), p_reason, auth.uid()
  );
  RETURN p_is_locked;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_map_entity_verification(p_entity_id uuid, p_status text, p_reason text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_entity public.map_entities%ROWTYPE; v_org_id uuid; v_area_status text;
BEGIN
  SELECT * INTO v_entity FROM public.map_entities WHERE id = p_entity_id AND is_archived = false FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MAP_ENTITY_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_entity.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.admin') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF p_status NOT IN ('NEEDS_REVIEW', 'VERIFIED') THEN RAISE EXCEPTION 'INVALID_VERIFICATION_STATUS'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'CHANGE_REASON_REQUIRED'; END IF;
  IF p_status = 'VERIFIED' THEN
    IF (SELECT status FROM public.map_calibrations WHERE project_id = v_entity.project_id ORDER BY version DESC LIMIT 1) IS DISTINCT FROM 'VALIDATED' THEN
      RAISE EXCEPTION 'VALIDATED_CALIBRATION_REQUIRED';
    END IF;
    IF v_entity.is_sellable THEN
      SELECT area_validation_status INTO v_area_status FROM public.commercial_lots WHERE entity_id = v_entity.id AND archived_at IS NULL;
      IF v_area_status <> 'VALIDATED' THEN RAISE EXCEPTION 'OFFICIAL_AREA_REQUIRED_FOR_VERIFICATION'; END IF;
    END IF;
  END IF;
  UPDATE public.map_entities SET verification_status = p_status, updated_by = auth.uid(), updated_at = now() WHERE id = v_entity.id;
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (
    v_org_id, v_entity.project_id, v_entity.id, 'ENTITY_VERIFICATION_CHANGED',
    jsonb_build_object('status', v_entity.verification_status), jsonb_build_object('status', p_status), p_reason, auth.uid()
  );
  RETURN p_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_commercial_map(p_project_id uuid, p_reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_project public.map_projects%ROWTYPE; v_version integer;
BEGIN
  SELECT * INTO v_project FROM public.map_projects WHERE id = p_project_id AND is_archived = false FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MAP_PROJECT_NOT_FOUND'; END IF;
  IF NOT public.map_has_explicit_capability(v_project.org_id, 'map.admin') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'CHANGE_REASON_REQUIRED'; END IF;
  IF (SELECT status FROM public.map_calibrations WHERE project_id = p_project_id ORDER BY version DESC LIMIT 1) IS DISTINCT FROM 'VALIDATED' THEN
    RAISE EXCEPTION 'VALIDATED_CALIBRATION_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.map_entities WHERE project_id = p_project_id AND is_archived = false AND verification_status <> 'VERIFIED') THEN
    RAISE EXCEPTION 'UNVERIFIED_MAP_ENTITIES';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.map_entities WHERE project_id = p_project_id AND is_archived = false) THEN
    RAISE EXCEPTION 'EMPTY_MAP_PROJECT';
  END IF;
  UPDATE public.map_projects
  SET is_published = true, active_version = active_version + 1, updated_by = auth.uid(), updated_at = now()
  WHERE id = p_project_id
  RETURNING active_version INTO v_version;
  INSERT INTO public.map_activity_logs (org_id, project_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (
    v_project.org_id, p_project_id, 'MAP_PUBLISHED',
    jsonb_build_object('published', v_project.is_published, 'version', v_project.active_version),
    jsonb_build_object('published', true, 'version', v_version), p_reason, auth.uid()
  );
  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_commercial_map(
  p_org_id uuid,
  p_project jsonb,
  p_layers jsonb,
  p_entities jsonb,
  p_calibration jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project_id uuid;
  v_layer_id uuid;
  v_entity_id uuid;
  v_layer jsonb;
  v_entity jsonb;
  v_geometry jsonb;
BEGIN
  IF NOT public.map_has_explicit_capability(p_org_id, 'map.admin') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF EXISTS (SELECT 1 FROM public.map_projects WHERE org_id = p_org_id AND is_archived = false) THEN
    RAISE EXCEPTION 'MAP_PROJECT_ALREADY_EXISTS';
  END IF;
  IF jsonb_typeof(p_project) <> 'object'
    OR jsonb_typeof(p_layers) <> 'array'
    OR jsonb_array_length(p_layers) = 0
    OR jsonb_array_length(p_layers) > 50
    OR jsonb_typeof(p_entities) <> 'array'
    OR jsonb_array_length(p_entities) > 1000
  THEN
    RAISE EXCEPTION 'INVALID_BOOTSTRAP_PAYLOAD';
  END IF;

  INSERT INTO public.map_projects (
    org_id, name, description, coordinate_system, reference_width, reference_height,
    active_version, is_published, created_by, updated_by
  ) VALUES (
    p_org_id,
    trim(p_project->>'name'),
    p_project->>'description',
    coalesce(p_project->>'coordinateSystem', 'LOCAL_NORMALIZED'),
    coalesce((p_project->>'referenceWidth')::numeric, 120),
    coalesce((p_project->>'referenceHeight')::numeric, 67.5),
    1, false, auth.uid(), auth.uid()
  ) RETURNING id INTO v_project_id;

  FOR v_layer IN SELECT value FROM jsonb_array_elements(p_layers)
  LOOP
    INSERT INTO public.map_layers (
      project_id, layer_key, name, description, color, opacity, is_visible, is_locked, sort_order
    ) VALUES (
      v_project_id,
      trim(v_layer->>'key'),
      trim(v_layer->>'name'),
      v_layer->>'description',
      coalesce(v_layer->>'color', '#64748b'),
      coalesce((v_layer->>'opacity')::numeric, 1),
      coalesce((v_layer->>'isVisible')::boolean, true),
      coalesce((v_layer->>'isLocked')::boolean, false),
      coalesce((v_layer->>'sortOrder')::integer, 0)
    );
  END LOOP;

  FOR v_entity IN SELECT value FROM jsonb_array_elements(p_entities)
  LOOP
    SELECT id INTO v_layer_id
    FROM public.map_layers
    WHERE project_id = v_project_id AND layer_key = v_entity->>'layerKey';
    IF NOT FOUND THEN RAISE EXCEPTION 'BOOTSTRAP_LAYER_NOT_FOUND'; END IF;
    v_geometry := jsonb_build_object('type', 'Polygon', 'coordinates', v_entity#>'{geometry,coordinates}');
    PERFORM public.map_polygon_from_geojson(v_geometry);

    INSERT INTO public.map_entities (
      project_id, layer_id, public_identifier, name, description, classification,
      verification_status, is_sellable, metadata, created_by, updated_by
    ) VALUES (
      v_project_id, v_layer_id, trim(v_entity->>'publicIdentifier'), trim(v_entity->>'name'),
      v_entity->>'description', v_entity->>'classification', 'NEEDS_REVIEW', false,
      coalesce(v_entity->'metadata', '{}'::jsonb), auth.uid(), auth.uid()
    ) RETURNING id INTO v_entity_id;

    INSERT INTO public.map_entity_geometries (
      project_id, entity_id, geometry, elevation, extrusion_height, rotation,
      calibration_version, version, is_current, change_reason, created_by
    ) VALUES (
      v_project_id, v_entity_id, v_geometry,
      coalesce((v_entity#>>'{geometry,elevation}')::numeric, 0),
      coalesce((v_entity#>>'{geometry,extrusionHeight}')::numeric, 0.15),
      coalesce((v_entity#>>'{geometry,rotation}')::numeric, 0),
      NULL, 1, true, 'Importação da referência cartográfica oficial 2024', auth.uid()
    );
  END LOOP;

  INSERT INTO public.map_calibrations (
    project_id, reference_image_path, opacity, is_locked, status, version, created_by
  ) VALUES (
    v_project_id, NULL, coalesce((p_calibration->>'opacity')::numeric, 0.28), true,
    'UNVALIDATED', 1, auth.uid()
  );
  INSERT INTO public.map_activity_logs (org_id, project_id, action, after_state, reason, actor_user_id)
  VALUES (
    p_org_id, v_project_id, 'MAP_BOOTSTRAPPED',
    jsonb_build_object('layers', jsonb_array_length(p_layers), 'entities', jsonb_array_length(p_entities)),
    'Implantação controlada da referência oficial 2024', auth.uid()
  );
  RETURN v_project_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_commercial_lot(
  p_project_id uuid,
  p_layer_id uuid,
  p_parent_entity_id uuid,
  p_public_identifier text,
  p_display_name text,
  p_description text,
  p_classification text,
  p_geometry jsonb,
  p_elevation numeric,
  p_extrusion_height numeric,
  p_block text,
  p_lot_number text,
  p_level_label text,
  p_official_area_sqm numeric,
  p_area_validation_status text,
  p_frontage_meters numeric,
  p_depth_meters numeric,
  p_pricing_mode text,
  p_fixed_total numeric,
  p_price_per_sqm numeric,
  p_asking_price numeric,
  p_minimum_price numeric,
  p_calibration_version integer,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
  v_entity_id uuid;
  v_lot_id uuid;
  v_status text;
  v_asking_price numeric;
  v_calculated_area numeric;
BEGIN
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = p_project_id AND is_archived = false FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MAP_PROJECT_NOT_FOUND'; END IF;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_lots') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF p_classification NOT IN ('SELLABLE_LOT', 'INTERNAL_STAND') THEN RAISE EXCEPTION 'INVALID_SELLABLE_CLASSIFICATION'; END IF;
  IF coalesce(trim(p_public_identifier), '') = '' OR coalesce(trim(p_display_name), '') = '' THEN RAISE EXCEPTION 'LOT_IDENTIFICATION_REQUIRED'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'CHANGE_REASON_REQUIRED'; END IF;
  PERFORM public.map_polygon_from_geojson(p_geometry);
  IF public.map_geometry_overlaps_sellable(p_project_id, p_geometry) THEN RAISE EXCEPTION 'MAP_GEOMETRY_OVERLAP'; END IF;
  IF p_elevation < 0 OR p_extrusion_height < 0 THEN RAISE EXCEPTION 'INVALID_GEOMETRY_DIMENSION'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.map_layers WHERE id = p_layer_id AND project_id = p_project_id AND layer_key = 'commercial') THEN
    RAISE EXCEPTION 'INVALID_COMMERCIAL_LAYER';
  END IF;
  IF p_parent_entity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.map_entities WHERE id = p_parent_entity_id AND project_id = p_project_id AND is_archived = false) THEN
    RAISE EXCEPTION 'INVALID_PARENT_ENTITY';
  END IF;
  IF p_area_validation_status NOT IN ('UNVALIDATED', 'VALIDATED') THEN RAISE EXCEPTION 'INVALID_AREA_VALIDATION_STATUS'; END IF;
  IF p_area_validation_status = 'VALIDATED' AND (p_official_area_sqm IS NULL OR p_official_area_sqm <= 0) THEN
    RAISE EXCEPTION 'OFFICIAL_AREA_REQUIRED';
  END IF;
  IF p_pricing_mode NOT IN ('FIXED_TOTAL', 'PRICE_PER_SQUARE_METER', 'NEGOTIABLE', 'NOT_FOR_SALE') THEN RAISE EXCEPTION 'INVALID_PRICING_MODE'; END IF;
  IF p_calibration_version IS NOT NULL THEN
    SELECT extensions.ST_Area(public.map_polygon_from_geojson(p_geometry)) / (map_units_per_meter * map_units_per_meter)
    INTO v_calculated_area
    FROM public.map_calibrations
    WHERE project_id = p_project_id AND version = p_calibration_version AND status = 'VALIDATED';
    IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_CALIBRATION_VERSION'; END IF;
  END IF;

  v_status := CASE WHEN p_pricing_mode = 'NOT_FOR_SALE' THEN 'UNAVAILABLE' ELSE 'AVAILABLE' END;
  IF p_pricing_mode = 'FIXED_TOTAL' THEN
    IF p_fixed_total IS NULL OR p_fixed_total < 0 THEN RAISE EXCEPTION 'FIXED_TOTAL_REQUIRED'; END IF;
    v_asking_price := p_fixed_total;
  ELSIF p_pricing_mode = 'PRICE_PER_SQUARE_METER' THEN
    IF p_area_validation_status <> 'VALIDATED' OR p_official_area_sqm IS NULL OR p_price_per_sqm IS NULL OR p_price_per_sqm < 0 THEN
      RAISE EXCEPTION 'VALIDATED_AREA_REQUIRED_FOR_SQM_PRICE';
    END IF;
    v_asking_price := p_official_area_sqm * p_price_per_sqm;
  ELSE
    v_asking_price := NULL;
  END IF;
  IF p_asking_price IS NOT NULL AND v_asking_price IS NOT NULL AND abs(p_asking_price - v_asking_price) > 0.01 THEN
    RAISE EXCEPTION 'ASKING_PRICE_MISMATCH';
  END IF;
  IF p_minimum_price IS NOT NULL AND v_asking_price IS NOT NULL AND p_minimum_price > v_asking_price THEN
    RAISE EXCEPTION 'MINIMUM_PRICE_ABOVE_ASKING_PRICE';
  END IF;

  INSERT INTO public.map_entities (
    project_id, layer_id, parent_entity_id, public_identifier, name, description, classification,
    verification_status, is_sellable, metadata, created_by, updated_by
  ) VALUES (
    p_project_id, p_layer_id, p_parent_entity_id, upper(trim(p_public_identifier)), trim(p_display_name), p_description,
    p_classification, 'NEEDS_REVIEW', true,
    jsonb_build_object('officialMeasurements', p_area_validation_status = 'VALIDATED', 'createdFrom', 'COMMERCIAL_TRACING_EDITOR'),
    auth.uid(), auth.uid()
  ) RETURNING id INTO v_entity_id;

  INSERT INTO public.map_entity_geometries (
    project_id, entity_id, geometry, elevation, extrusion_height, rotation, calibration_version,
    version, is_current, change_reason, created_by
  ) VALUES (
    p_project_id, v_entity_id, p_geometry, p_elevation, p_extrusion_height, 0, p_calibration_version,
    1, true, p_reason, auth.uid()
  );

  INSERT INTO public.commercial_lots (
    project_id, entity_id, public_identifier, block, lot_number, level_label, display_name, description, status,
    official_area_sqm, calculated_area_sqm, area_validation_status, frontage_meters, depth_meters, created_by, updated_by
  ) VALUES (
    p_project_id, v_entity_id, upper(trim(p_public_identifier)), nullif(trim(p_block), ''), nullif(trim(p_lot_number), ''), nullif(trim(p_level_label), ''),
    trim(p_display_name), p_description, v_status, p_official_area_sqm, v_calculated_area, p_area_validation_status,
    p_frontage_meters, p_depth_meters, auth.uid(), auth.uid()
  ) RETURNING id INTO v_lot_id;

  INSERT INTO public.lot_prices (
    lot_id, pricing_mode, base_price, price_per_sqm, asking_price, minimum_price, is_active, created_by
  ) VALUES (
    v_lot_id, p_pricing_mode, p_fixed_total, p_price_per_sqm, v_asking_price, p_minimum_price, true, auth.uid()
  );
  INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by)
  VALUES (v_lot_id, NULL, v_status, p_reason, auth.uid());
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, after_state, reason, actor_user_id)
  VALUES (
    v_org_id, p_project_id, v_entity_id, v_lot_id, 'LOT_CREATED',
    jsonb_build_object('identifier', upper(trim(p_public_identifier)), 'classification', p_classification, 'status', v_status),
    p_reason, auth.uid()
  );
  RETURN v_entity_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.split_commercial_lot(
  p_source_lot_id uuid,
  p_first_identifier text,
  p_first_name text,
  p_first_geometry jsonb,
  p_second_identifier text,
  p_second_name text,
  p_second_geometry jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source public.commercial_lots%ROWTYPE;
  v_source_entity public.map_entities%ROWTYPE;
  v_source_geometry public.map_entity_geometries%ROWTYPE;
  v_org_id uuid;
  v_child jsonb;
  v_entity_id uuid;
  v_lot_id uuid;
  v_entity_ids uuid[] := '{}'::uuid[];
  v_lot_ids uuid[] := '{}'::uuid[];
BEGIN
  SELECT * INTO v_source FROM public.commercial_lots WHERE id = p_source_lot_id FOR UPDATE;
  IF NOT FOUND OR v_source.archived_at IS NOT NULL THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_source.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_lots') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF v_source.status NOT IN ('AVAILABLE', 'BLOCKED', 'UNAVAILABLE') THEN RAISE EXCEPTION 'LOT_HAS_ACTIVE_COMMERCIAL_FLOW'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'CHANGE_REASON_REQUIRED'; END IF;
  IF upper(trim(p_first_identifier)) = upper(trim(p_second_identifier)) THEN RAISE EXCEPTION 'DUPLICATE_CHILD_IDENTIFIER'; END IF;
  IF EXISTS (SELECT 1 FROM public.lot_contracts WHERE lot_id = p_source_lot_id AND is_active = true)
    OR EXISTS (SELECT 1 FROM public.lot_reservations WHERE lot_id = p_source_lot_id AND status = 'ACTIVE')
    OR EXISTS (SELECT 1 FROM public.lot_negotiations WHERE lot_id = p_source_lot_id AND status = 'ACTIVE')
  THEN
    RAISE EXCEPTION 'LOT_HAS_LINKED_RECORDS';
  END IF;
  SELECT * INTO v_source_entity FROM public.map_entities WHERE id = v_source.entity_id;
  SELECT * INTO v_source_geometry FROM public.map_entity_geometries WHERE entity_id = v_source.entity_id AND is_current = true;
  PERFORM public.map_polygon_from_geojson(p_first_geometry);
  PERFORM public.map_polygon_from_geojson(p_second_geometry);
  IF extensions.ST_Area(extensions.ST_Intersection(
      public.map_polygon_from_geojson(p_first_geometry), public.map_polygon_from_geojson(p_second_geometry)
    )) > 0.00000001
    OR NOT extensions.ST_Equals(
      extensions.ST_Union(public.map_polygon_from_geojson(p_first_geometry), public.map_polygon_from_geojson(p_second_geometry)),
      v_source_geometry.native_geometry
    )
  THEN
    RAISE EXCEPTION 'INVALID_SPLIT_TOPOLOGY';
  END IF;
  IF public.map_geometry_overlaps_sellable(v_source.project_id, p_first_geometry, ARRAY[v_source.entity_id])
    OR public.map_geometry_overlaps_sellable(v_source.project_id, p_second_geometry, ARRAY[v_source.entity_id])
  THEN
    RAISE EXCEPTION 'MAP_GEOMETRY_OVERLAP';
  END IF;

  FOR v_child IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('identifier', p_first_identifier, 'name', p_first_name, 'geometry', p_first_geometry),
    jsonb_build_object('identifier', p_second_identifier, 'name', p_second_name, 'geometry', p_second_geometry)
  ))
  LOOP
    IF coalesce(trim(v_child->>'identifier'), '') = '' OR coalesce(trim(v_child->>'name'), '') = '' THEN
      RAISE EXCEPTION 'LOT_IDENTIFICATION_REQUIRED';
    END IF;
    INSERT INTO public.map_entities (
      project_id, layer_id, parent_entity_id, public_identifier, name, description, classification,
      verification_status, is_sellable, metadata, created_by, updated_by
    ) VALUES (
      v_source.project_id, v_source_entity.layer_id, v_source_entity.parent_entity_id,
      upper(trim(v_child->>'identifier')), trim(v_child->>'name'), v_source.description,
      v_source_entity.classification, 'NEEDS_REVIEW', true,
      jsonb_build_object('createdFrom', 'LOT_SPLIT', 'sourceLotId', v_source.id), auth.uid(), auth.uid()
    ) RETURNING id INTO v_entity_id;
    INSERT INTO public.map_entity_geometries (
      project_id, entity_id, geometry, elevation, extrusion_height, rotation, calibration_version,
      version, is_current, change_reason, created_by
    ) VALUES (
      v_source.project_id, v_entity_id, v_child->'geometry', v_source_geometry.elevation,
      v_source_geometry.extrusion_height, v_source_geometry.rotation, v_source_geometry.calibration_version,
      1, true, p_reason, auth.uid()
    );
    INSERT INTO public.commercial_lots (
      project_id, entity_id, public_identifier, block, level_label, display_name, description, status,
      area_validation_status, created_by, updated_by
    ) VALUES (
      v_source.project_id, v_entity_id, upper(trim(v_child->>'identifier')), v_source.block, v_source.level_label,
      trim(v_child->>'name'), v_source.description, 'BLOCKED', 'UNVALIDATED', auth.uid(), auth.uid()
    ) RETURNING id INTO v_lot_id;
    INSERT INTO public.lot_prices (lot_id, pricing_mode, is_active, created_by)
    VALUES (v_lot_id, 'NEGOTIABLE', true, auth.uid());
    INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by)
    VALUES (v_lot_id, NULL, 'BLOCKED', 'Aguardando validação após divisão: ' || p_reason, auth.uid());
    INSERT INTO public.map_lot_lineage (source_lot_id, target_lot_id, relationship, created_by)
    VALUES (v_source.id, v_lot_id, 'SPLIT_FROM', auth.uid());
    v_entity_ids := array_append(v_entity_ids, v_entity_id);
    v_lot_ids := array_append(v_lot_ids, v_lot_id);
  END LOOP;

  UPDATE public.commercial_lots
  SET status = 'UNAVAILABLE', archived_at = now(), updated_by = auth.uid(), updated_at = now()
  WHERE id = v_source.id;
  UPDATE public.map_entities
  SET is_archived = true, verification_status = 'ARCHIVED', updated_by = auth.uid(), updated_at = now()
  WHERE id = v_source.entity_id;
  INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by)
  VALUES (v_source.id, v_source.status, 'UNAVAILABLE', p_reason, auth.uid());
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (
    v_org_id, v_source.project_id, v_source.entity_id, v_source.id, 'LOT_SPLIT',
    jsonb_build_object('identifier', v_source.public_identifier, 'status', v_source.status),
    jsonb_build_object('targetLotIds', to_jsonb(v_lot_ids), 'targetEntityIds', to_jsonb(v_entity_ids)),
    p_reason, auth.uid()
  );
  RETURN jsonb_build_object('lotIds', to_jsonb(v_lot_ids), 'entityIds', to_jsonb(v_entity_ids));
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_commercial_lots(
  p_source_lot_ids uuid[],
  p_public_identifier text,
  p_display_name text,
  p_geometry jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_first public.commercial_lots%ROWTYPE;
  v_second public.commercial_lots%ROWTYPE;
  v_first_entity public.map_entities%ROWTYPE;
  v_second_entity public.map_entities%ROWTYPE;
  v_first_geometry public.map_entity_geometries%ROWTYPE;
  v_second_geometry public.map_entity_geometries%ROWTYPE;
  v_org_id uuid;
  v_entity_id uuid;
  v_lot_id uuid;
BEGIN
  IF array_length(p_source_lot_ids, 1) <> 2 OR p_source_lot_ids[1] = p_source_lot_ids[2] THEN RAISE EXCEPTION 'TWO_DISTINCT_LOTS_REQUIRED'; END IF;
  SELECT * INTO v_first FROM public.commercial_lots WHERE id = p_source_lot_ids[1] FOR UPDATE;
  IF NOT FOUND OR v_first.archived_at IS NOT NULL THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  SELECT * INTO v_second FROM public.commercial_lots WHERE id = p_source_lot_ids[2] FOR UPDATE;
  IF NOT FOUND OR v_second.archived_at IS NOT NULL THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  IF v_first.project_id <> v_second.project_id THEN RAISE EXCEPTION 'LOTS_FROM_DIFFERENT_PROJECTS'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_first.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_lots') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF v_first.status NOT IN ('AVAILABLE', 'BLOCKED', 'UNAVAILABLE') OR v_second.status NOT IN ('AVAILABLE', 'BLOCKED', 'UNAVAILABLE') THEN
    RAISE EXCEPTION 'LOT_HAS_ACTIVE_COMMERCIAL_FLOW';
  END IF;
  IF coalesce(trim(p_public_identifier), '') = '' OR coalesce(trim(p_display_name), '') = '' THEN RAISE EXCEPTION 'LOT_IDENTIFICATION_REQUIRED'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'CHANGE_REASON_REQUIRED'; END IF;
  IF EXISTS (SELECT 1 FROM public.lot_contracts WHERE lot_id = ANY(p_source_lot_ids) AND is_active = true)
    OR EXISTS (SELECT 1 FROM public.lot_reservations WHERE lot_id = ANY(p_source_lot_ids) AND status = 'ACTIVE')
    OR EXISTS (SELECT 1 FROM public.lot_negotiations WHERE lot_id = ANY(p_source_lot_ids) AND status = 'ACTIVE')
  THEN
    RAISE EXCEPTION 'LOT_HAS_LINKED_RECORDS';
  END IF;
  SELECT * INTO v_first_entity FROM public.map_entities WHERE id = v_first.entity_id;
  SELECT * INTO v_second_entity FROM public.map_entities WHERE id = v_second.entity_id;
  IF v_first_entity.classification <> v_second_entity.classification THEN RAISE EXCEPTION 'INCOMPATIBLE_LOT_CLASSIFICATIONS'; END IF;
  SELECT * INTO v_first_geometry FROM public.map_entity_geometries WHERE entity_id = v_first.entity_id AND is_current = true;
  SELECT * INTO v_second_geometry FROM public.map_entity_geometries WHERE entity_id = v_second.entity_id AND is_current = true;
  PERFORM public.map_polygon_from_geojson(p_geometry);
  IF NOT extensions.ST_Touches(v_first_geometry.native_geometry, v_second_geometry.native_geometry)
    OR NOT extensions.ST_Equals(
      extensions.ST_Union(v_first_geometry.native_geometry, v_second_geometry.native_geometry),
      public.map_polygon_from_geojson(p_geometry)
    )
  THEN
    RAISE EXCEPTION 'LOTS_NOT_ADJACENT_OR_INVALID_MERGE';
  END IF;
  IF public.map_geometry_overlaps_sellable(v_first.project_id, p_geometry, ARRAY[v_first.entity_id, v_second.entity_id]) THEN
    RAISE EXCEPTION 'MAP_GEOMETRY_OVERLAP';
  END IF;

  INSERT INTO public.map_entities (
    project_id, layer_id, parent_entity_id, public_identifier, name, description, classification,
    verification_status, is_sellable, metadata, created_by, updated_by
  ) VALUES (
    v_first.project_id, v_first_entity.layer_id,
    CASE WHEN v_first_entity.parent_entity_id IS NOT DISTINCT FROM v_second_entity.parent_entity_id THEN v_first_entity.parent_entity_id ELSE NULL END,
    upper(trim(p_public_identifier)), trim(p_display_name), coalesce(v_first.description, v_second.description),
    v_first_entity.classification, 'NEEDS_REVIEW', true,
    jsonb_build_object('createdFrom', 'LOT_MERGE', 'sourceLotIds', to_jsonb(p_source_lot_ids)), auth.uid(), auth.uid()
  ) RETURNING id INTO v_entity_id;
  INSERT INTO public.map_entity_geometries (
    project_id, entity_id, geometry, elevation, extrusion_height, rotation, calibration_version,
    version, is_current, change_reason, created_by
  ) VALUES (
    v_first.project_id, v_entity_id, p_geometry,
    LEAST(v_first_geometry.elevation, v_second_geometry.elevation),
    GREATEST(v_first_geometry.extrusion_height, v_second_geometry.extrusion_height), 0,
    CASE WHEN v_first_geometry.calibration_version IS NOT DISTINCT FROM v_second_geometry.calibration_version THEN v_first_geometry.calibration_version ELSE NULL END,
    1, true, p_reason, auth.uid()
  );
  INSERT INTO public.commercial_lots (
    project_id, entity_id, public_identifier, block, level_label, display_name, description, status,
    area_validation_status, created_by, updated_by
  ) VALUES (
    v_first.project_id, v_entity_id, upper(trim(p_public_identifier)),
    CASE WHEN v_first.block IS NOT DISTINCT FROM v_second.block THEN v_first.block ELSE NULL END,
    CASE WHEN v_first.level_label IS NOT DISTINCT FROM v_second.level_label THEN v_first.level_label ELSE NULL END,
    trim(p_display_name), coalesce(v_first.description, v_second.description), 'BLOCKED',
    'UNVALIDATED', auth.uid(), auth.uid()
  ) RETURNING id INTO v_lot_id;
  INSERT INTO public.lot_prices (lot_id, pricing_mode, is_active, created_by)
  VALUES (v_lot_id, 'NEGOTIABLE', true, auth.uid());
  INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by)
  VALUES (v_lot_id, NULL, 'BLOCKED', 'Aguardando validação após mesclagem: ' || p_reason, auth.uid());
  INSERT INTO public.map_lot_lineage (source_lot_id, target_lot_id, relationship, created_by)
  VALUES (v_first.id, v_lot_id, 'MERGED_FROM', auth.uid()), (v_second.id, v_lot_id, 'MERGED_FROM', auth.uid());

  UPDATE public.commercial_lots
  SET status = 'UNAVAILABLE', archived_at = now(), superseded_by_lot_id = v_lot_id,
      updated_by = auth.uid(), updated_at = now()
  WHERE id = ANY(p_source_lot_ids);
  UPDATE public.map_entities
  SET is_archived = true, verification_status = 'ARCHIVED', updated_by = auth.uid(), updated_at = now()
  WHERE id IN (v_first.entity_id, v_second.entity_id);
  INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by)
  VALUES
    (v_first.id, v_first.status, 'UNAVAILABLE', p_reason, auth.uid()),
    (v_second.id, v_second.status, 'UNAVAILABLE', p_reason, auth.uid());
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (
    v_org_id, v_first.project_id, v_entity_id, v_lot_id, 'LOTS_MERGED',
    jsonb_build_object('sourceLotIds', to_jsonb(p_source_lot_ids)),
    jsonb_build_object('targetLotId', v_lot_id, 'targetEntityId', v_entity_id), p_reason, auth.uid()
  );
  RETURN jsonb_build_object('lotId', v_lot_id, 'entityId', v_entity_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_map_geometry(
  p_geometry_id uuid,
  p_geometry jsonb,
  p_elevation numeric,
  p_extrusion_height numeric,
  p_rotation numeric,
  p_expected_version integer,
  p_change_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current public.map_entity_geometries%ROWTYPE;
  v_org_id uuid;
  v_calculated_area numeric;
BEGIN
  SELECT * INTO v_current
  FROM public.map_entity_geometries
  WHERE id = p_geometry_id AND is_current = true
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GEOMETRY_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_current.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.edit_geometry') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF v_current.version <> p_expected_version THEN RAISE EXCEPTION 'GEOMETRY_VERSION_CONFLICT'; END IF;
  IF coalesce(trim(p_change_reason), '') = '' THEN RAISE EXCEPTION 'CHANGE_REASON_REQUIRED'; END IF;
  PERFORM public.map_polygon_from_geojson(p_geometry);
  IF EXISTS (SELECT 1 FROM public.map_entities WHERE id = v_current.entity_id AND is_sellable = true)
    AND public.map_geometry_overlaps_sellable(v_current.project_id, p_geometry, ARRAY[v_current.entity_id])
  THEN
    RAISE EXCEPTION 'MAP_GEOMETRY_OVERLAP';
  END IF;
  IF p_elevation < 0 OR p_extrusion_height < 0 THEN RAISE EXCEPTION 'INVALID_GEOMETRY_DIMENSION'; END IF;

  UPDATE public.map_entity_geometries
  SET geometry = p_geometry,
      elevation = p_elevation,
      extrusion_height = p_extrusion_height,
      rotation = p_rotation,
      version = version + 1,
      change_reason = p_change_reason,
      created_by = auth.uid(),
      updated_at = now()
  WHERE id = p_geometry_id;

  IF v_current.calibration_version IS NOT NULL THEN
    SELECT extensions.ST_Area(public.map_polygon_from_geojson(p_geometry)) / (map_units_per_meter * map_units_per_meter)
    INTO v_calculated_area
    FROM public.map_calibrations
    WHERE project_id = v_current.project_id AND version = v_current.calibration_version AND status = 'VALIDATED';
    UPDATE public.commercial_lots
    SET calculated_area_sqm = v_calculated_area, updated_by = auth.uid(), updated_at = now()
    WHERE entity_id = v_current.entity_id;
  END IF;

  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (
    v_org_id, v_current.project_id, v_current.entity_id, 'GEOMETRY_CHANGED',
    jsonb_build_object('geometry', v_current.geometry, 'version', v_current.version),
    jsonb_build_object('geometry', p_geometry, 'version', v_current.version + 1),
    p_change_reason, auth.uid()
  );
  RETURN v_current.version + 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_map_calibration(
  p_project_id uuid,
  p_reference_image_path text,
  p_opacity numeric,
  p_is_locked boolean,
  p_image_offset_x numeric,
  p_image_offset_y numeric,
  p_image_scale_x numeric,
  p_image_scale_y numeric,
  p_image_rotation_degrees numeric,
  p_point_a jsonb,
  p_point_b jsonb,
  p_known_distance_meters numeric,
  p_map_units_per_meter numeric,
  p_status text,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org_id uuid; v_version integer; v_recalculated integer := 0;
BEGIN
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MAP_PROJECT_NOT_FOUND'; END IF;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.edit_geometry') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF p_status NOT IN ('UNVALIDATED', 'VALIDATED', 'INVALIDATED') THEN RAISE EXCEPTION 'INVALID_CALIBRATION_STATUS'; END IF;
  IF p_image_scale_x <= 0 OR p_image_scale_y <= 0 THEN RAISE EXCEPTION 'INVALID_REFERENCE_IMAGE_SCALE'; END IF;
  IF p_status = 'VALIDATED' AND (p_map_units_per_meter IS NULL OR p_map_units_per_meter <= 0 OR p_known_distance_meters IS NULL OR p_known_distance_meters <= 0) THEN
    RAISE EXCEPTION 'INVALID_CALIBRATION_SCALE';
  END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v_version FROM public.map_calibrations WHERE project_id = p_project_id;
  INSERT INTO public.map_calibrations (
    project_id, reference_image_path, opacity, is_locked,
    image_offset_x, image_offset_y, image_scale_x, image_scale_y, image_rotation_degrees,
    point_a, point_b,
    known_distance_meters, map_units_per_meter, status, version, invalidated_reason, created_by
  ) VALUES (
    p_project_id, p_reference_image_path, p_opacity, p_is_locked,
    p_image_offset_x, p_image_offset_y, p_image_scale_x, p_image_scale_y, p_image_rotation_degrees,
    p_point_a, p_point_b,
    p_known_distance_meters, p_map_units_per_meter, p_status, v_version,
    CASE WHEN p_status = 'INVALIDATED' THEN p_reason ELSE NULL END, auth.uid()
  );
  IF p_status = 'VALIDATED' THEN
    UPDATE public.commercial_lots lot
    SET calculated_area_sqm = extensions.ST_Area(geometry.native_geometry) / (p_map_units_per_meter * p_map_units_per_meter),
        updated_by = auth.uid(), updated_at = now()
    FROM public.map_entity_geometries geometry
    WHERE geometry.entity_id = lot.entity_id AND geometry.is_current = true AND lot.project_id = p_project_id AND lot.archived_at IS NULL;
    GET DIAGNOSTICS v_recalculated = ROW_COUNT;
  ELSIF p_status = 'INVALIDATED' THEN
    UPDATE public.commercial_lots SET calculated_area_sqm = NULL, updated_by = auth.uid(), updated_at = now()
    WHERE project_id = p_project_id AND archived_at IS NULL;
    GET DIAGNOSTICS v_recalculated = ROW_COUNT;
  END IF;
  UPDATE public.map_projects SET active_version = active_version + 1, updated_by = auth.uid(), updated_at = now() WHERE id = p_project_id;
  INSERT INTO public.map_activity_logs (org_id, project_id, action, after_state, reason, actor_user_id)
  VALUES (v_org_id, p_project_id, 'CALIBRATION_CHANGED', jsonb_build_object('version', v_version, 'status', p_status, 'map_units_per_meter', p_map_units_per_meter, 'recalculatedLots', v_recalculated), p_reason, auth.uid());
  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_commercial_lot(
  p_lot_id uuid,
  p_expected_updated_at timestamptz,
  p_patch jsonb,
  p_reason text
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lot public.commercial_lots%ROWTYPE;
  v_org_id uuid;
  v_pricing_mode text := p_patch->>'pricingMode';
  v_area_status text := p_patch->>'areaValidationStatus';
  v_official_area numeric := nullif(p_patch->>'officialAreaSqm', '')::numeric;
  v_fixed_total numeric := nullif(p_patch->>'fixedTotal', '')::numeric;
  v_price_per_sqm numeric := nullif(p_patch->>'pricePerSqm', '')::numeric;
  v_minimum_price numeric := nullif(p_patch->>'minimumPrice', '')::numeric;
  v_asking_price numeric;
  v_updated_at timestamptz;
  v_before jsonb;
BEGIN
  SELECT * INTO v_lot FROM public.commercial_lots WHERE id = p_lot_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_lot.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_lots') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF v_lot.updated_at <> p_expected_updated_at THEN RAISE EXCEPTION 'LOT_VERSION_CONFLICT'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'CHANGE_REASON_REQUIRED'; END IF;
  IF coalesce(trim(p_patch->>'publicIdentifier'), '') = '' OR coalesce(trim(p_patch->>'displayName'), '') = '' THEN
    RAISE EXCEPTION 'LOT_IDENTIFICATION_REQUIRED';
  END IF;
  IF v_area_status NOT IN ('UNVALIDATED', 'VALIDATED') THEN RAISE EXCEPTION 'INVALID_AREA_VALIDATION_STATUS'; END IF;
  IF v_area_status = 'VALIDATED' AND (v_official_area IS NULL OR v_official_area <= 0) THEN RAISE EXCEPTION 'OFFICIAL_AREA_REQUIRED'; END IF;
  IF v_pricing_mode NOT IN ('FIXED_TOTAL', 'PRICE_PER_SQUARE_METER', 'NEGOTIABLE', 'NOT_FOR_SALE') THEN RAISE EXCEPTION 'INVALID_PRICING_MODE'; END IF;
  IF jsonb_typeof(coalesce(p_patch->'infrastructure', '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'INVALID_INFRASTRUCTURE'; END IF;

  IF v_pricing_mode = 'FIXED_TOTAL' THEN
    IF v_fixed_total IS NULL OR v_fixed_total < 0 THEN RAISE EXCEPTION 'FIXED_TOTAL_REQUIRED'; END IF;
    v_asking_price := v_fixed_total;
  ELSIF v_pricing_mode = 'PRICE_PER_SQUARE_METER' THEN
    IF v_area_status <> 'VALIDATED' OR v_official_area IS NULL OR v_price_per_sqm IS NULL OR v_price_per_sqm < 0 THEN
      RAISE EXCEPTION 'VALIDATED_AREA_REQUIRED_FOR_SQM_PRICE';
    END IF;
    v_asking_price := v_official_area * v_price_per_sqm;
  ELSE
    v_asking_price := NULL;
  END IF;
  IF v_minimum_price IS NOT NULL AND (v_minimum_price < 0 OR (v_asking_price IS NOT NULL AND v_minimum_price > v_asking_price)) THEN
    RAISE EXCEPTION 'MINIMUM_PRICE_ABOVE_ASKING_PRICE';
  END IF;
  v_before := to_jsonb(v_lot) || jsonb_build_object(
    'price', (SELECT to_jsonb(price) FROM public.lot_prices price WHERE price.lot_id = v_lot.id AND price.is_active = true)
  );

  UPDATE public.map_entities
  SET public_identifier = upper(trim(p_patch->>'publicIdentifier')),
      name = trim(p_patch->>'displayName'),
      description = nullif(trim(p_patch->>'description'), ''),
      updated_by = auth.uid(), updated_at = now()
  WHERE id = v_lot.entity_id;
  UPDATE public.commercial_lots
  SET public_identifier = upper(trim(p_patch->>'publicIdentifier')),
      block = nullif(trim(p_patch->>'block'), ''),
      lot_number = nullif(trim(p_patch->>'lotNumber'), ''),
      level_label = nullif(trim(p_patch->>'levelLabel'), ''),
      display_name = trim(p_patch->>'displayName'),
      description = nullif(trim(p_patch->>'description'), ''),
      official_area_sqm = v_official_area,
      area_validation_status = v_area_status,
      frontage_meters = nullif(p_patch->>'frontageMeters', '')::numeric,
      depth_meters = nullif(p_patch->>'depthMeters', '')::numeric,
      infrastructure = coalesce(p_patch->'infrastructure', '[]'::jsonb),
      has_electricity = coalesce((p_patch->>'hasElectricity')::boolean, false),
      has_water = coalesce((p_patch->>'hasWater')::boolean, false),
      has_internet = coalesce((p_patch->>'hasInternet')::boolean, false),
      is_corner = coalesce((p_patch->>'isCorner')::boolean, false),
      is_covered = coalesce((p_patch->>'isCovered')::boolean, false),
      accessibility_notes = nullif(trim(p_patch->>'accessibilityNotes'), ''),
      commercial_notes = nullif(trim(p_patch->>'commercialNotes'), ''),
      internal_notes = nullif(trim(p_patch->>'internalNotes'), ''),
      updated_by = auth.uid(), updated_at = now()
  WHERE id = v_lot.id
  RETURNING updated_at INTO v_updated_at;

  UPDATE public.lot_prices SET is_active = false, valid_until = now() WHERE lot_id = v_lot.id AND is_active = true;
  INSERT INTO public.lot_prices (
    lot_id, pricing_mode, base_price, price_per_sqm, asking_price, minimum_price, is_active, created_by
  ) VALUES (
    v_lot.id, v_pricing_mode, v_fixed_total, v_price_per_sqm, v_asking_price, v_minimum_price, true, auth.uid()
  );
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (
    v_org_id, v_lot.project_id, v_lot.entity_id, v_lot.id, 'LOT_UPDATED', v_before,
    (SELECT to_jsonb(updated_lot) FROM public.commercial_lots updated_lot WHERE updated_lot.id = v_lot.id)
      || jsonb_build_object('pricingMode', v_pricing_mode, 'askingPrice', v_asking_price),
    p_reason, auth.uid()
  );
  RETURN v_updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_commercial_reservations(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_record record;
  v_count integer := 0;
BEGIN
  IF NOT public.can_view_commercial_map(p_org_id) THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  FOR v_record IN
    SELECT r.id AS reservation_id, r.lot_id, l.project_id, l.entity_id, l.status
    FROM public.lot_reservations r
    JOIN public.commercial_lots l ON l.id = r.lot_id
    JOIN public.map_projects p ON p.id = l.project_id
    WHERE p.org_id = p_org_id AND r.status = 'ACTIVE' AND r.expires_at <= now()
    FOR UPDATE OF r, l SKIP LOCKED
  LOOP
    UPDATE public.lot_reservations
    SET status = 'EXPIRED', updated_at = now()
    WHERE id = v_record.reservation_id AND status = 'ACTIVE';
    IF FOUND THEN
      IF v_record.status = 'RESERVED' THEN
        UPDATE public.commercial_lots SET status = 'AVAILABLE', updated_at = now() WHERE id = v_record.lot_id;
        INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by)
        VALUES (v_record.lot_id, 'RESERVED', 'AVAILABLE', 'Expiração automática da reserva', auth.uid());
      END IF;
      INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
      VALUES (
        p_org_id, v_record.project_id, v_record.entity_id, v_record.lot_id, 'RESERVATION_EXPIRED',
        jsonb_build_object('reservationId', v_record.reservation_id, 'status', 'ACTIVE'),
        jsonb_build_object('reservationId', v_record.reservation_id, 'status', 'EXPIRED'),
        'Prazo de reserva encerrado automaticamente', auth.uid()
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_commercial_lot(
  p_lot_id uuid,
  p_company_name text,
  p_document_number text,
  p_contact_name text,
  p_phone text,
  p_email text,
  p_expires_at timestamptz,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_lot public.commercial_lots%ROWTYPE; v_org_id uuid; v_reservation_id uuid;
BEGIN
  SELECT * INTO v_lot FROM public.commercial_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_lot.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF v_lot.status NOT IN ('AVAILABLE', 'IN_NEGOTIATION') THEN RAISE EXCEPTION 'LOT_NOT_AVAILABLE'; END IF;
  IF coalesce(trim(p_company_name), '') = '' OR coalesce(trim(p_contact_name), '') = '' THEN RAISE EXCEPTION 'RESERVATION_CONTACT_REQUIRED'; END IF;
  IF p_expires_at <= now() THEN RAISE EXCEPTION 'INVALID_RESERVATION_EXPIRY'; END IF;
  INSERT INTO public.lot_reservations (lot_id, company_name, document_number, contact_name, phone, email, expires_at, responsible_user_id, notes)
  VALUES (p_lot_id, trim(p_company_name), nullif(trim(p_document_number), ''), trim(p_contact_name), p_phone, p_email, p_expires_at, auth.uid(), p_notes)
  RETURNING id INTO v_reservation_id;
  UPDATE public.lot_negotiations SET status = 'CANCELLED', updated_at = now() WHERE lot_id = p_lot_id AND status = 'ACTIVE';
  UPDATE public.commercial_lots SET status = 'RESERVED', updated_by = auth.uid(), updated_at = now() WHERE id = p_lot_id;
  INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by) VALUES (p_lot_id, v_lot.status, 'RESERVED', p_notes, auth.uid());
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (v_org_id, v_lot.project_id, v_lot.entity_id, p_lot_id, 'RESERVATION_CREATED', jsonb_build_object('status', v_lot.status), jsonb_build_object('status', 'RESERVED', 'reservation_id', v_reservation_id), p_notes, auth.uid());
  RETURN v_reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_commercial_negotiation(
  p_lot_id uuid,
  p_company_name text,
  p_document_number text,
  p_contact_name text,
  p_proposed_value numeric,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_lot public.commercial_lots%ROWTYPE; v_org_id uuid; v_negotiation_id uuid;
BEGIN
  SELECT * INTO v_lot FROM public.commercial_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_lot.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF v_lot.status NOT IN ('AVAILABLE', 'RESERVED') THEN RAISE EXCEPTION 'LOT_NOT_NEGOTIABLE'; END IF;
  IF coalesce(trim(p_company_name), '') = '' THEN RAISE EXCEPTION 'NEGOTIATION_COMPANY_REQUIRED'; END IF;
  UPDATE public.lot_reservations SET status = 'CANCELLED', cancelled_at = now(), updated_at = now() WHERE lot_id = p_lot_id AND status = 'ACTIVE';
  INSERT INTO public.lot_negotiations (lot_id, company_name, document_number, contact_name, proposed_value, notes, responsible_user_id)
  VALUES (p_lot_id, trim(p_company_name), nullif(trim(p_document_number), ''), nullif(trim(p_contact_name), ''), p_proposed_value, p_notes, auth.uid())
  RETURNING id INTO v_negotiation_id;
  UPDATE public.commercial_lots SET status = 'IN_NEGOTIATION', updated_by = auth.uid(), updated_at = now() WHERE id = p_lot_id;
  INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by) VALUES (p_lot_id, v_lot.status, 'IN_NEGOTIATION', p_notes, auth.uid());
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (v_org_id, v_lot.project_id, v_lot.entity_id, p_lot_id, 'NEGOTIATION_STARTED', jsonb_build_object('status', v_lot.status), jsonb_build_object('status', 'IN_NEGOTIATION', 'negotiation_id', v_negotiation_id), p_notes, auth.uid());
  RETURN v_negotiation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_commercial_sale(
  p_lot_id uuid,
  p_buyer_name text,
  p_document_number text,
  p_negotiated_value numeric,
  p_sale_date date,
  p_salesperson_name text,
  p_contract_number text,
  p_payment_status text,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_lot public.commercial_lots%ROWTYPE; v_org_id uuid; v_sale_id uuid;
BEGIN
  SELECT * INTO v_lot FROM public.commercial_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_lot.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF v_lot.status NOT IN ('RESERVED', 'IN_NEGOTIATION', 'AVAILABLE') THEN RAISE EXCEPTION 'LOT_CANNOT_BE_SOLD'; END IF;
  IF coalesce(trim(p_buyer_name), '') = '' OR coalesce(trim(p_salesperson_name), '') = '' THEN RAISE EXCEPTION 'SALE_PARTIES_REQUIRED'; END IF;
  IF p_negotiated_value < 0 THEN RAISE EXCEPTION 'INVALID_SALE_VALUE'; END IF;
  INSERT INTO public.lot_sales (lot_id, buyer_name, document_number, negotiated_value, sale_date, salesperson_user_id, salesperson_name, contract_number, payment_status, internal_notes)
  VALUES (p_lot_id, trim(p_buyer_name), nullif(trim(p_document_number), ''), p_negotiated_value, p_sale_date, auth.uid(), trim(p_salesperson_name), nullif(trim(p_contract_number), ''), p_payment_status, p_notes)
  RETURNING id INTO v_sale_id;
  UPDATE public.lot_reservations SET status = 'CONVERTED', updated_at = now() WHERE lot_id = p_lot_id AND status = 'ACTIVE';
  UPDATE public.lot_negotiations SET status = 'WON', updated_at = now() WHERE lot_id = p_lot_id AND status = 'ACTIVE';
  UPDATE public.commercial_lots SET status = 'SOLD', updated_by = auth.uid(), updated_at = now() WHERE id = p_lot_id;
  INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by) VALUES (p_lot_id, v_lot.status, 'SOLD', p_notes, auth.uid());
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (v_org_id, v_lot.project_id, v_lot.entity_id, p_lot_id, 'LOT_SOLD', jsonb_build_object('status', v_lot.status), jsonb_build_object('status', 'SOLD', 'sale_id', v_sale_id), p_notes, auth.uid());
  RETURN v_sale_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_lot_contract_version(
  p_lot_id uuid,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_file_size bigint,
  p_contract_number text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_lot public.commercial_lots%ROWTYPE; v_org_id uuid; v_contract_id uuid; v_version integer; v_version_id uuid;
BEGIN
  SELECT * INTO v_lot FROM public.commercial_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_lot.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_contracts') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF p_storage_path NOT LIKE v_org_id::text || '/' || p_lot_id::text || '/%' THEN RAISE EXCEPTION 'INVALID_CONTRACT_STORAGE_PATH'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'map-contracts' AND name = p_storage_path) THEN RAISE EXCEPTION 'CONTRACT_OBJECT_NOT_FOUND'; END IF;
  SELECT id, active_version INTO v_contract_id, v_version FROM public.lot_contracts WHERE lot_id = p_lot_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.lot_contracts (lot_id, contract_number, active_version, created_by) VALUES (p_lot_id, nullif(trim(p_contract_number), ''), 1, auth.uid()) RETURNING id, active_version INTO v_contract_id, v_version;
  ELSE
    v_version := v_version + 1;
    UPDATE public.lot_contract_versions SET superseded_at = now() WHERE contract_id = v_contract_id AND superseded_at IS NULL;
    UPDATE public.lot_contracts SET active_version = v_version, contract_number = coalesce(nullif(trim(p_contract_number), ''), contract_number), updated_at = now() WHERE id = v_contract_id;
  END IF;
  INSERT INTO public.lot_contract_versions (contract_id, version, storage_path, original_name, mime_type, file_size, uploaded_by)
  VALUES (v_contract_id, v_version, p_storage_path, p_original_name, p_mime_type, p_file_size, auth.uid()) RETURNING id INTO v_version_id;
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, after_state, actor_user_id)
  VALUES (v_org_id, v_lot.project_id, v_lot.entity_id, p_lot_id, CASE WHEN v_version = 1 THEN 'CONTRACT_UPLOADED' ELSE 'CONTRACT_REPLACED' END, jsonb_build_object('contract_id', v_contract_id, 'version', v_version), auth.uid());
  RETURN v_version_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_map_geometry(uuid, jsonb, numeric, numeric, numeric, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_commercial_map(uuid, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_commercial_lot(uuid, uuid, uuid, text, text, text, text, jsonb, numeric, numeric, text, text, text, numeric, text, numeric, numeric, text, numeric, numeric, numeric, numeric, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.split_commercial_lot(uuid, text, text, jsonb, text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_commercial_lots(uuid[], text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.map_polygon_from_geojson(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.map_geometry_overlaps_sellable(uuid, jsonb, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_map_layer_geometry_lock() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_map_layer_lock(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_map_entity_verification(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_commercial_map(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_map_calibration(uuid, text, numeric, boolean, numeric, numeric, numeric, numeric, numeric, jsonb, jsonb, numeric, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_commercial_lot(uuid, timestamptz, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_commercial_reservations(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_commercial_lot(uuid, text, text, text, text, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_commercial_negotiation(uuid, text, text, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_commercial_sale(uuid, text, text, numeric, date, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_lot_contract_version(uuid, text, text, text, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_map_geometry(uuid, jsonb, numeric, numeric, numeric, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_commercial_map(uuid, jsonb, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_commercial_lot(uuid, uuid, uuid, text, text, text, text, jsonb, numeric, numeric, text, text, text, numeric, text, numeric, numeric, text, numeric, numeric, numeric, numeric, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.split_commercial_lot(uuid, text, text, jsonb, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_commercial_lots(uuid[], text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_map_layer_lock(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_map_entity_verification(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_commercial_map(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_map_calibration(uuid, text, numeric, boolean, numeric, numeric, numeric, numeric, numeric, jsonb, jsonb, numeric, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_commercial_lot(uuid, timestamptz, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_commercial_reservations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_commercial_lot(uuid, text, text, text, text, text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_commercial_negotiation(uuid, text, text, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_commercial_sale(uuid, text, text, numeric, date, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_lot_contract_version(uuid, text, text, text, bigint, text) TO authenticated;

CREATE TRIGGER map_projects_updated BEFORE UPDATE ON public.map_projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER map_layers_updated BEFORE UPDATE ON public.map_layers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER map_entities_updated BEFORE UPDATE ON public.map_entities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER commercial_lots_updated BEFORE UPDATE ON public.commercial_lots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER lot_reservations_updated BEFORE UPDATE ON public.lot_reservations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER lot_negotiations_updated BEFORE UPDATE ON public.lot_negotiations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER lot_contracts_updated BEFORE UPDATE ON public.lot_contracts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'map-contracts', 'map-contracts', false, 15728640,
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('map-references', 'map-references', false, 26214400, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

CREATE POLICY map_contract_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'map-contracts' AND public.map_has_explicit_capability(((storage.foldername(name))[1])::uuid, 'map.manage_contracts'));
CREATE POLICY map_contract_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'map-contracts' AND public.map_has_explicit_capability(((storage.foldername(name))[1])::uuid, 'map.manage_contracts'));
CREATE POLICY map_contract_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'map-contracts' AND public.map_has_explicit_capability(((storage.foldername(name))[1])::uuid, 'map.manage_contracts'));
CREATE POLICY map_reference_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'map-references' AND public.can_view_commercial_map(((storage.foldername(name))[1])::uuid));
CREATE POLICY map_reference_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'map-references' AND public.map_has_explicit_capability(((storage.foldername(name))[1])::uuid, 'map.edit_geometry'));
CREATE POLICY map_reference_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'map-references' AND public.map_has_explicit_capability(((storage.foldername(name))[1])::uuid, 'map.admin'));

COMMENT ON TABLE public.map_entities IS 'Explicitly classified physical and commercial entities; only SELLABLE_LOT and INTERNAL_STAND may be sellable.';
COMMENT ON COLUMN public.map_entity_geometries.geometry IS 'GeoJSON-compatible Polygon in the project local coordinate system; independent from Three.js render objects.';
COMMENT ON TABLE public.map_geometry_versions IS 'Immutable superseded geometry snapshots used for audit and restoration.';
COMMENT ON TABLE public.lot_contract_versions IS 'Metadata only; files live in the private map-contracts bucket and are served with short-lived signed URLs.';
