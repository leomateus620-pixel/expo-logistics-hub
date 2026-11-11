-- Commercial tables needed by the disposable PostgreSQL fixture.
-- This file contains schema only. All records are synthesized in setup-database.mjs.

CREATE TABLE public.commercial_exhibitors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  document_number text NOT NULL,
  document_normalized text NOT NULL,
  phone text,
  email text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  trade_name text,
  CONSTRAINT commercial_exhibitors_doc_chk CHECK ((document_normalized ~ '^[0-9]{11}$|^[0-9]{14}$'::text)),
  CONSTRAINT commercial_exhibitors_org_doc_key UNIQUE (org_id, document_normalized),
  CONSTRAINT commercial_exhibitors_pkey PRIMARY KEY (id)
);

CREATE TABLE public.commercial_lot_corner_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL,
  project_id uuid NOT NULL,
  classification text NOT NULL,
  db_is_corner boolean NOT NULL DEFAULT false,
  adjacent_roads jsonb NOT NULL DEFAULT '[]'::jsonb,
  intersection_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  method text NOT NULL DEFAULT 'GEOMETRIC_BLOCK_VERTEX_V1'::text,
  notes text,
  audited_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT commercial_lot_corner_audit_classification_check CHECK ((classification = ANY (ARRAY['CORNER_CONFIRMED'::text, 'NOT_CORNER'::text, 'REVIEW_REQUIRED'::text]))),
  CONSTRAINT commercial_lot_corner_audit_lot_id_key UNIQUE (lot_id),
  CONSTRAINT commercial_lot_corner_audit_pkey PRIMARY KEY (id)
);

CREATE TABLE public.commercial_lot_price_overrides (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL,
  stage text NOT NULL,
  total numeric(14,2) NOT NULL,
  previous_total numeric(14,2),
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT commercial_lot_price_overrides_lot_id_stage_key UNIQUE (lot_id, stage),
  CONSTRAINT commercial_lot_price_overrides_pkey PRIMARY KEY (id),
  CONSTRAINT commercial_lot_price_overrides_stage_check CHECK ((stage = ANY (ARRAY['RENOVACAO'::text, 'SEGUNDA_ETAPA'::text]))),
  CONSTRAINT commercial_lot_price_overrides_total_check CHECK (((total >= (0)::numeric) AND (total <= (100000000)::numeric)))
);

CREATE TABLE public.commercial_lots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  public_identifier text NOT NULL,
  block text,
  lot_number text,
  level_label text,
  display_name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'AVAILABLE'::text,
  official_area_sqm numeric(14,4),
  calculated_area_sqm numeric(14,4),
  area_validation_status text NOT NULL DEFAULT 'UNVALIDATED'::text,
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
  archived_at timestamp with time zone,
  superseded_by_lot_id uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT commercial_lots_area_positive_check CHECK ((((official_area_sqm IS NULL) OR (official_area_sqm > (0)::numeric)) AND ((calculated_area_sqm IS NULL) OR (calculated_area_sqm > (0)::numeric)) AND ((frontage_meters IS NULL) OR (frontage_meters > (0)::numeric)) AND ((depth_meters IS NULL) OR (depth_meters > (0)::numeric)))),
  CONSTRAINT commercial_lots_area_validation_check CHECK ((area_validation_status = ANY (ARRAY['UNVALIDATED'::text, 'CALCULATED'::text, 'VALIDATED'::text, 'REJECTED'::text]))),
  CONSTRAINT commercial_lots_entity_id_key UNIQUE (entity_id),
  CONSTRAINT commercial_lots_pkey PRIMARY KEY (id),
  CONSTRAINT commercial_lots_project_identifier_unique UNIQUE (project_id, public_identifier),
  CONSTRAINT commercial_lots_status_check CHECK ((status = ANY (ARRAY['AVAILABLE'::text, 'RESERVED'::text, 'IN_NEGOTIATION'::text, 'SALE_OPEN'::text, 'SOLD'::text, 'BLOCKED'::text, 'UNAVAILABLE'::text])))
);

CREATE TABLE public.commercial_price_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  exercise integer NOT NULL DEFAULT 2028,
  stage text NOT NULL,
  scope_type text NOT NULL,
  pavilion_identifier text,
  block text,
  range_start integer,
  range_end integer,
  is_corner boolean,
  price_per_sqm numeric(12,2),
  priority integer NOT NULL,
  label text NOT NULL,
  source text NOT NULL DEFAULT 'POLITICAS_CESSAO_ESPACOS_2028'::text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT commercial_price_rules_pkey PRIMARY KEY (id),
  CONSTRAINT commercial_price_rules_price_chk CHECK (((scope_type = 'EXCLUSION'::text) OR ((price_per_sqm IS NOT NULL) AND (price_per_sqm > (0)::numeric)))),
  CONSTRAINT commercial_price_rules_range_chk CHECK ((((range_start IS NULL) AND (range_end IS NULL)) OR ((range_start IS NOT NULL) AND (range_end IS NOT NULL) AND (range_end >= range_start)))),
  CONSTRAINT commercial_price_rules_scope_type_check CHECK ((scope_type = ANY (ARRAY['PAVILION'::text, 'MODULE_RANGE'::text, 'BLOCK'::text, 'LOT_RANGE'::text, 'CORNER'::text, 'ARTESANATO'::text, 'EXCLUSION'::text]))),
  CONSTRAINT commercial_price_rules_stage_check CHECK ((stage = ANY (ARRAY['RENOVACAO'::text, 'SEGUNDA_ETAPA'::text])))
);

CREATE TABLE public.commercial_signature_completions (
  order_id uuid NOT NULL,
  cycle integer NOT NULL DEFAULT 1,
  project_id uuid NOT NULL,
  registered_at timestamp with time zone NOT NULL,
  completed_at timestamp with time zone NOT NULL,
  actor_user_id uuid,
  evidence text NOT NULL,
  item_ids uuid[] NOT NULL,
  CONSTRAINT commercial_signature_completions_check CHECK ((completed_at >= registered_at)),
  CONSTRAINT commercial_signature_completions_cycle_check CHECK ((cycle = 1)),
  CONSTRAINT commercial_signature_completions_evidence_check CHECK ((evidence = ANY (ARRAY['CONFIRMATION'::text, 'SIMPLE_HISTORY'::text]))),
  CONSTRAINT commercial_signature_completions_pkey PRIMARY KEY (order_id, cycle)
);

CREATE TABLE public.lot_contract_lots (
  contract_id uuid NOT NULL,
  lot_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT lot_contract_lots_pkey PRIMARY KEY (contract_id, lot_id)
);

CREATE TABLE public.lot_contract_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL,
  version integer NOT NULL,
  storage_path text NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  uploaded_by uuid NOT NULL,
  uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
  superseded_at timestamp with time zone,
  CONSTRAINT lot_contract_versions_contract_version_unique UNIQUE (contract_id, version),
  CONSTRAINT lot_contract_versions_file_size_check CHECK (((file_size > 0) AND (file_size <= 15728640))),
  CONSTRAINT lot_contract_versions_mime_check CHECK ((mime_type = ANY (ARRAY['application/pdf'::text, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'::text]))),
  CONSTRAINT lot_contract_versions_pkey PRIMARY KEY (id),
  CONSTRAINT lot_contract_versions_storage_unique UNIQUE (storage_path)
);

CREATE TABLE public.lot_contracts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lot_id uuid,
  contract_number text,
  active_version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  order_id uuid,
  scope text NOT NULL DEFAULT 'LOT'::text,
  CONSTRAINT lot_contracts_active_version_check CHECK ((active_version > 0)),
  CONSTRAINT lot_contracts_pkey PRIMARY KEY (id),
  CONSTRAINT lot_contracts_scope_check CHECK ((scope = ANY (ARRAY['LOT'::text, 'ORDER_ITEMS'::text]))),
  CONSTRAINT lot_contracts_target_check CHECK ((((scope = 'LOT'::text) AND (lot_id IS NOT NULL)) OR ((scope = 'ORDER_ITEMS'::text) AND (order_id IS NOT NULL))))
);
CREATE UNIQUE INDEX lot_contracts_one_active_per_lot ON public.lot_contracts USING btree (lot_id) WHERE (is_active = true);

CREATE TABLE public.lot_negotiations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL,
  company_name text NOT NULL,
  document_number text,
  contact_name text,
  proposed_value numeric(14,2),
  notes text,
  status text NOT NULL DEFAULT 'ACTIVE'::text,
  responsible_user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT lot_negotiations_pkey PRIMARY KEY (id),
  CONSTRAINT lot_negotiations_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'WON'::text, 'LOST'::text, 'CANCELLED'::text]))),
  CONSTRAINT lot_negotiations_value_check CHECK (((proposed_value IS NULL) OR (proposed_value >= (0)::numeric)))
);
CREATE UNIQUE INDEX lot_negotiations_one_active_per_lot ON public.lot_negotiations USING btree (lot_id) WHERE (status = 'ACTIVE'::text);

CREATE TABLE public.lot_prices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL,
  pricing_mode text NOT NULL,
  base_price numeric(14,2),
  price_per_sqm numeric(14,2),
  asking_price numeric(14,2),
  minimum_price numeric(14,2),
  is_active boolean NOT NULL DEFAULT true,
  valid_from timestamp with time zone NOT NULL DEFAULT now(),
  valid_until timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'MANUAL'::text,
  stage text,
  rule_id uuid,
  area_used_sqm numeric(12,2),
  notes text,
  CONSTRAINT lot_prices_mode_check CHECK ((pricing_mode = ANY (ARRAY['FIXED_TOTAL'::text, 'PRICE_PER_SQUARE_METER'::text, 'NEGOTIABLE'::text, 'NOT_FOR_SALE'::text]))),
  CONSTRAINT lot_prices_pkey PRIMARY KEY (id),
  CONSTRAINT lot_prices_positive_check CHECK ((((base_price IS NULL) OR (base_price >= (0)::numeric)) AND ((price_per_sqm IS NULL) OR (price_per_sqm >= (0)::numeric)) AND ((asking_price IS NULL) OR (asking_price >= (0)::numeric)) AND ((minimum_price IS NULL) OR (minimum_price >= (0)::numeric)))),
  CONSTRAINT lot_prices_range_check CHECK (((valid_until IS NULL) OR (valid_until > valid_from)))
);
CREATE UNIQUE INDEX lot_prices_one_active_per_lot ON public.lot_prices USING btree (lot_id) WHERE (is_active = true);

CREATE TABLE public.lot_reservations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL,
  company_name text NOT NULL,
  document_number text,
  contact_name text NOT NULL,
  phone text,
  email text,
  reserved_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  responsible_user_id uuid NOT NULL,
  responsible_name text,
  notes text,
  status text NOT NULL DEFAULT 'ACTIVE'::text,
  cancelled_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT lot_reservations_expiry_check CHECK ((expires_at > reserved_at)),
  CONSTRAINT lot_reservations_pkey PRIMARY KEY (id),
  CONSTRAINT lot_reservations_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'EXPIRED'::text, 'CANCELLED'::text, 'CONVERTED'::text])))
);
CREATE UNIQUE INDEX lot_reservations_one_active_per_lot ON public.lot_reservations USING btree (lot_id) WHERE (status = 'ACTIVE'::text);

CREATE TABLE public.lot_sale_installments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  installment_number integer NOT NULL,
  due_date date NOT NULL,
  amount numeric(14,2) NOT NULL,
  payment_status text NOT NULL DEFAULT 'PENDING'::text,
  paid_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT lot_sale_installments_amount_check CHECK ((amount >= (0)::numeric)),
  CONSTRAINT lot_sale_installments_installment_number_check CHECK ((installment_number >= 1)),
  CONSTRAINT lot_sale_installments_payment_status_check CHECK ((payment_status = ANY (ARRAY['PENDING'::text, 'PAID'::text, 'CANCELLED'::text]))),
  CONSTRAINT lot_sale_installments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.lot_sale_order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  lot_id uuid NOT NULL,
  public_identifier text NOT NULL,
  official_area_snapshot numeric(14,2) NOT NULL,
  price_per_sqm_snapshot numeric(14,2) NOT NULL,
  pricing_rule_id uuid,
  pricing_rule_label text,
  pricing_stage text NOT NULL,
  item_total numeric(14,2) NOT NULL,
  original_status text NOT NULL,
  sale_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  contract_state text NOT NULL DEFAULT 'PENDING_SIGNATURE'::text,
  signed_at timestamp with time zone,
  signed_by uuid,
  cancelled_at timestamp with time zone,
  cancelled_by uuid,
  CONSTRAINT lot_sale_order_items_contract_state_check CHECK ((contract_state = ANY (ARRAY['PENDING_SIGNATURE'::text, 'SIGNED'::text, 'CANCELLED'::text, 'LEGACY_UNVERIFIED'::text]))),
  CONSTRAINT lot_sale_order_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.lot_sale_order_revisions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  added_lot_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  removed_lot_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  reason text NOT NULL,
  actor_user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT lot_sale_order_revisions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.lot_sale_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  buyer_name text NOT NULL,
  document_number text,
  phone text,
  email text,
  stage text NOT NULL,
  official_area_total numeric(14,2) NOT NULL DEFAULT 0,
  negotiated_total numeric(14,2) NOT NULL DEFAULT 0,
  payment_type text NOT NULL,
  installment_count integer NOT NULL DEFAULT 1,
  payment_method text NOT NULL,
  first_due_date date,
  status text NOT NULL DEFAULT 'CONFIRMED'::text,
  notes text,
  salesperson_user_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  reverted_at timestamp with time zone,
  reverted_by uuid,
  exhibitor_id uuid,
  spaces_subtotal numeric,
  fee_admin numeric NOT NULL DEFAULT 0,
  fee_ppci numeric NOT NULL DEFAULT 0,
  fee_cleaning_license numeric NOT NULL DEFAULT 0,
  fees_total numeric NOT NULL DEFAULT 0,
  logo_path text,
  buyer_trade_name text,
  CONSTRAINT lot_sale_orders_fee_admin_check CHECK ((fee_admin >= (0)::numeric)),
  CONSTRAINT lot_sale_orders_fee_cleaning_license_check CHECK ((fee_cleaning_license >= (0)::numeric)),
  CONSTRAINT lot_sale_orders_fee_ppci_check CHECK ((fee_ppci >= (0)::numeric)),
  CONSTRAINT lot_sale_orders_fees_total_check CHECK ((fees_total >= (0)::numeric)),
  CONSTRAINT lot_sale_orders_installment_count_check CHECK ((installment_count >= 1)),
  CONSTRAINT lot_sale_orders_payment_type_check CHECK ((payment_type = ANY (ARRAY['CASH'::text, 'INSTALLMENTS'::text]))),
  CONSTRAINT lot_sale_orders_pkey PRIMARY KEY (id),
  CONSTRAINT lot_sale_orders_stage_check CHECK ((stage = ANY (ARRAY['RENOVACAO'::text, 'SEGUNDA_ETAPA'::text]))),
  CONSTRAINT lot_sale_orders_status_check CHECK ((status = ANY (ARRAY['CONFIRMED'::text, 'REVERTED'::text])))
);

CREATE TABLE public.lot_sales (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL,
  buyer_name text NOT NULL,
  document_number text,
  negotiated_value numeric(14,2) NOT NULL,
  sale_date date NOT NULL,
  salesperson_user_id uuid NOT NULL,
  salesperson_name text NOT NULL,
  contract_number text,
  payment_status text NOT NULL DEFAULT 'PENDING'::text,
  internal_notes text,
  status text NOT NULL DEFAULT 'CONFIRMED'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reverted_at timestamp with time zone,
  reverted_by uuid,
  buyer_trade_name text,
  CONSTRAINT lot_sales_payment_check CHECK ((payment_status = ANY (ARRAY['PENDING'::text, 'PARTIAL'::text, 'PAID'::text, 'CANCELLED'::text]))),
  CONSTRAINT lot_sales_pkey PRIMARY KEY (id),
  CONSTRAINT lot_sales_status_check CHECK ((status = ANY (ARRAY['OPEN'::text, 'CONFIRMED'::text, 'REVERTED'::text]))),
  CONSTRAINT lot_sales_value_check CHECK ((negotiated_value >= (0)::numeric))
);
CREATE UNIQUE INDEX lot_sales_one_confirmed_per_lot ON public.lot_sales USING btree (lot_id) WHERE (status = 'CONFIRMED'::text);

CREATE TABLE public.lot_status_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  reason text,
  changed_by uuid NOT NULL,
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT lot_status_history_new_check CHECK ((new_status = ANY (ARRAY['AVAILABLE'::text, 'RESERVED'::text, 'IN_NEGOTIATION'::text, 'SALE_OPEN'::text, 'SOLD'::text, 'BLOCKED'::text, 'UNAVAILABLE'::text]))),
  CONSTRAINT lot_status_history_pkey PRIMARY KEY (id),
  CONSTRAINT lot_status_history_previous_check CHECK (((previous_status IS NULL) OR (previous_status = ANY (ARRAY['AVAILABLE'::text, 'RESERVED'::text, 'IN_NEGOTIATION'::text, 'SALE_OPEN'::text, 'SOLD'::text, 'BLOCKED'::text, 'UNAVAILABLE'::text]))))
);

CREATE TABLE public.map_activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  project_id uuid NOT NULL,
  entity_id uuid,
  lot_id uuid,
  action text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  reason text,
  actor_user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT map_activity_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.map_calibrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
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
  status text NOT NULL DEFAULT 'UNVALIDATED'::text,
  version integer NOT NULL DEFAULT 1,
  invalidated_reason text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT map_calibrations_distance_check CHECK (((known_distance_meters IS NULL) OR (known_distance_meters > (0)::numeric))),
  CONSTRAINT map_calibrations_image_scale_check CHECK (((image_scale_x > (0)::numeric) AND (image_scale_y > (0)::numeric))),
  CONSTRAINT map_calibrations_opacity_check CHECK (((opacity >= (0)::numeric) AND (opacity <= (1)::numeric))),
  CONSTRAINT map_calibrations_pkey PRIMARY KEY (id),
  CONSTRAINT map_calibrations_scale_check CHECK (((map_units_per_meter IS NULL) OR (map_units_per_meter > (0)::numeric))),
  CONSTRAINT map_calibrations_status_check CHECK ((status = ANY (ARRAY['UNVALIDATED'::text, 'VALIDATED'::text, 'INVALIDATED'::text]))),
  CONSTRAINT map_calibrations_version_unique UNIQUE (project_id, version)
);

CREATE TABLE public.map_entities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  layer_id uuid NOT NULL,
  parent_entity_id uuid,
  public_identifier text NOT NULL,
  name text NOT NULL,
  description text,
  classification text NOT NULL,
  verification_status text NOT NULL DEFAULT 'DRAFT'::text,
  is_sellable boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  segment_id uuid,
  CONSTRAINT map_entities_classification_check CHECK ((classification = ANY (ARRAY['SELLABLE_LOT'::text, 'INTERNAL_STAND'::text, 'QUADRA'::text, 'PAVILION'::text, 'BUILDING'::text, 'RESTAURANT'::text, 'FOOD_AREA'::text, 'EVENT_VENUE'::text, 'RESTROOM'::text, 'CHEMICAL_RESTROOM'::text, 'GATE'::text, 'PARKING'::text, 'ROAD'::text, 'PEDESTRIAN_PATH'::text, 'GREEN_AREA'::text, 'TREE'::text, 'WATER'::text, 'ADMINISTRATION'::text, 'SECURITY'::text, 'EMERGENCY'::text, 'SERVICE'::text, 'ATTRACTION'::text, 'LIVESTOCK_AREA'::text, 'RURAL_EXHIBITION'::text, 'RESTRICTED_AREA'::text, 'LANDMARK'::text, 'OTHER'::text]))),
  CONSTRAINT map_entities_pkey PRIMARY KEY (id),
  CONSTRAINT map_entities_project_identifier_unique UNIQUE (project_id, public_identifier),
  CONSTRAINT map_entities_sellable_class_check CHECK (((is_sellable = false) OR (classification = ANY (ARRAY['SELLABLE_LOT'::text, 'INTERNAL_STAND'::text])))),
  CONSTRAINT map_entities_verification_check CHECK ((verification_status = ANY (ARRAY['DRAFT'::text, 'NEEDS_REVIEW'::text, 'VERIFIED'::text, 'ARCHIVED'::text])))
);

CREATE TABLE public.map_entity_geometries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  geometry jsonb NOT NULL,
  elevation numeric(14,6) NOT NULL DEFAULT 0,
  extrusion_height numeric(14,6) NOT NULL DEFAULT 0.15,
  rotation numeric(14,6) NOT NULL DEFAULT 0,
  calibration_version integer,
  version integer NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  change_reason text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT map_entity_geometries_pkey PRIMARY KEY (id),
  CONSTRAINT map_geometry_entity_version_unique UNIQUE (entity_id, version),
  CONSTRAINT map_geometry_geojson_check CHECK (((jsonb_typeof(geometry) = 'object'::text) AND ((geometry ->> 'type'::text) = 'Polygon'::text) AND (jsonb_typeof((geometry -> 'coordinates'::text)) = 'array'::text) AND (jsonb_array_length((geometry -> 'coordinates'::text)) > 0))),
  CONSTRAINT map_geometry_positive_check CHECK (((elevation >= (0)::numeric) AND (extrusion_height >= (0)::numeric))),
  CONSTRAINT map_geometry_version_check CHECK ((version > 0))
);
CREATE UNIQUE INDEX map_entity_one_current_geometry ON public.map_entity_geometries USING btree (entity_id) WHERE (is_current = true);

CREATE TABLE public.map_layers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  layer_key text NOT NULL,
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#64748b'::text,
  opacity numeric(4,3) NOT NULL DEFAULT 1,
  is_visible boolean NOT NULL DEFAULT true,
  is_locked boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT map_layers_opacity_check CHECK (((opacity >= (0)::numeric) AND (opacity <= (1)::numeric))),
  CONSTRAINT map_layers_pkey PRIMARY KEY (id),
  CONSTRAINT map_layers_project_key_unique UNIQUE (project_id, layer_key)
);

CREATE TABLE public.map_lot_lineage (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_lot_id uuid NOT NULL,
  target_lot_id uuid NOT NULL,
  relationship text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT map_lot_lineage_no_self_check CHECK ((source_lot_id <> target_lot_id)),
  CONSTRAINT map_lot_lineage_pkey PRIMARY KEY (id),
  CONSTRAINT map_lot_lineage_relationship_check CHECK ((relationship = ANY (ARRAY['SPLIT_FROM'::text, 'MERGED_FROM'::text, 'SUPERSEDES'::text]))),
  CONSTRAINT map_lot_lineage_unique UNIQUE (source_lot_id, target_lot_id, relationship)
);

CREATE TABLE public.map_projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  coordinate_system text NOT NULL DEFAULT 'LOCAL_NORMALIZED'::text,
  reference_width numeric(14,6) NOT NULL DEFAULT 120,
  reference_height numeric(14,6) NOT NULL DEFAULT 67.5,
  active_version integer NOT NULL DEFAULT 1,
  is_published boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  reference_revision text,
  CONSTRAINT map_projects_coordinate_system_check CHECK ((coordinate_system = ANY (ARRAY['LOCAL_NORMALIZED'::text, 'GEOREFERENCED'::text]))),
  CONSTRAINT map_projects_dimensions_check CHECK (((reference_width > (0)::numeric) AND (reference_height > (0)::numeric))),
  CONSTRAINT map_projects_pkey PRIMARY KEY (id),
  CONSTRAINT map_projects_version_check CHECK ((active_version > 0))
);
CREATE UNIQUE INDEX map_projects_one_active_per_org ON public.map_projects USING btree (org_id) WHERE (is_archived = false);

CREATE TABLE public.map_segments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  display_name text NOT NULL,
  source_reference text NOT NULL,
  boundary_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  camera_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  visual_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  required_capability text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT map_segments_boundary_object_check CHECK ((jsonb_typeof(boundary_data) = 'object'::text)),
  CONSTRAINT map_segments_camera_object_check CHECK ((jsonb_typeof(camera_config) = 'object'::text)),
  CONSTRAINT map_segments_pkey PRIMARY KEY (id),
  CONSTRAINT map_segments_project_slug_unique UNIQUE (project_id, slug),
  CONSTRAINT map_segments_slug_check CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text)),
  CONSTRAINT map_segments_visual_object_check CHECK ((jsonb_typeof(visual_config) = 'object'::text))
);
