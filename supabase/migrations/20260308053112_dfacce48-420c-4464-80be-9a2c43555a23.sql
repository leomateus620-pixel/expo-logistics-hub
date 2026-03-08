
-- ============================================================
-- Convert ALL restrictive RLS policies to PERMISSIVE
-- Same rules, just changing the policy type
-- ============================================================

-- ── vehicles ──
DROP POLICY IF EXISTS "vehicles_select" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_insert" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_update" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_delete" ON public.vehicles;

CREATE POLICY "vehicles_select" ON public.vehicles FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "vehicles_insert" ON public.vehicles FOR INSERT WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));
CREATE POLICY "vehicles_update" ON public.vehicles FOR UPDATE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));
CREATE POLICY "vehicles_delete" ON public.vehicles FOR DELETE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));

-- ── fuel_records ──
DROP POLICY IF EXISTS "fuel_select" ON public.fuel_records;
DROP POLICY IF EXISTS "fuel_insert" ON public.fuel_records;
DROP POLICY IF EXISTS "fuel_update" ON public.fuel_records;
DROP POLICY IF EXISTS "fuel_delete" ON public.fuel_records;

CREATE POLICY "fuel_select" ON public.fuel_records FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "fuel_insert" ON public.fuel_records FOR INSERT WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));
CREATE POLICY "fuel_update" ON public.fuel_records FOR UPDATE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));
CREATE POLICY "fuel_delete" ON public.fuel_records FOR DELETE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));

-- ── vehicle_usage ──
DROP POLICY IF EXISTS "vehicle_usage_select" ON public.vehicle_usage;
DROP POLICY IF EXISTS "vehicle_usage_insert" ON public.vehicle_usage;
DROP POLICY IF EXISTS "vehicle_usage_update" ON public.vehicle_usage;
DROP POLICY IF EXISTS "vehicle_usage_delete" ON public.vehicle_usage;

CREATE POLICY "vehicle_usage_select" ON public.vehicle_usage FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "vehicle_usage_insert" ON public.vehicle_usage FOR INSERT WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));
CREATE POLICY "vehicle_usage_update" ON public.vehicle_usage FOR UPDATE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));
CREATE POLICY "vehicle_usage_delete" ON public.vehicle_usage FOR DELETE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));

-- ── transports ──
DROP POLICY IF EXISTS "transports_select" ON public.transports;
DROP POLICY IF EXISTS "transports_insert" ON public.transports;
DROP POLICY IF EXISTS "transports_update" ON public.transports;
DROP POLICY IF EXISTS "transports_delete" ON public.transports;

CREATE POLICY "transports_select" ON public.transports FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "transports_insert" ON public.transports FOR INSERT WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));
CREATE POLICY "transports_update" ON public.transports FOR UPDATE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));
CREATE POLICY "transports_delete" ON public.transports FOR DELETE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));

-- ── electric_carts ──
DROP POLICY IF EXISTS "carts_select" ON public.electric_carts;
DROP POLICY IF EXISTS "carts_insert" ON public.electric_carts;
DROP POLICY IF EXISTS "carts_update" ON public.electric_carts;
DROP POLICY IF EXISTS "carts_delete" ON public.electric_carts;

CREATE POLICY "carts_select" ON public.electric_carts FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "carts_insert" ON public.electric_carts FOR INSERT WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));
CREATE POLICY "carts_update" ON public.electric_carts FOR UPDATE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));
CREATE POLICY "carts_delete" ON public.electric_carts FOR DELETE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));

-- ── scooters ──
DROP POLICY IF EXISTS "scooters_select" ON public.scooters;
DROP POLICY IF EXISTS "scooters_insert" ON public.scooters;
DROP POLICY IF EXISTS "scooters_update" ON public.scooters;
DROP POLICY IF EXISTS "scooters_delete" ON public.scooters;

CREATE POLICY "scooters_select" ON public.scooters FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "scooters_insert" ON public.scooters FOR INSERT WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));
CREATE POLICY "scooters_update" ON public.scooters FOR UPDATE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));
CREATE POLICY "scooters_delete" ON public.scooters FOR DELETE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));

-- ── tasks ──
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));

-- ── events ──
DROP POLICY IF EXISTS "events_select" ON public.events;
DROP POLICY IF EXISTS "events_insert" ON public.events;
DROP POLICY IF EXISTS "events_update" ON public.events;
DROP POLICY IF EXISTS "events_delete" ON public.events;

CREATE POLICY "events_select" ON public.events FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "events_insert" ON public.events FOR INSERT WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));
CREATE POLICY "events_update" ON public.events FOR UPDATE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));
CREATE POLICY "events_delete" ON public.events FOR DELETE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));

-- ── guests ──
DROP POLICY IF EXISTS "guests_select" ON public.guests;
DROP POLICY IF EXISTS "guests_insert" ON public.guests;
DROP POLICY IF EXISTS "guests_update" ON public.guests;
DROP POLICY IF EXISTS "guests_delete" ON public.guests;

CREATE POLICY "guests_select" ON public.guests FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "guests_insert" ON public.guests FOR INSERT WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));
CREATE POLICY "guests_update" ON public.guests FOR UPDATE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));
CREATE POLICY "guests_delete" ON public.guests FOR DELETE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));

-- ── schedules ──
DROP POLICY IF EXISTS "schedules_select" ON public.schedules;
DROP POLICY IF EXISTS "schedules_insert" ON public.schedules;
DROP POLICY IF EXISTS "schedules_update" ON public.schedules;
DROP POLICY IF EXISTS "schedules_delete" ON public.schedules;

CREATE POLICY "schedules_select" ON public.schedules FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "schedules_insert" ON public.schedules FOR INSERT WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));
CREATE POLICY "schedules_update" ON public.schedules FOR UPDATE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));
CREATE POLICY "schedules_delete" ON public.schedules FOR DELETE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));

-- ── schedule_shifts ──
DROP POLICY IF EXISTS "shifts_select" ON public.schedule_shifts;
DROP POLICY IF EXISTS "shifts_insert" ON public.schedule_shifts;
DROP POLICY IF EXISTS "shifts_update" ON public.schedule_shifts;
DROP POLICY IF EXISTS "shifts_delete" ON public.schedule_shifts;

CREATE POLICY "shifts_select" ON public.schedule_shifts FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "shifts_insert" ON public.schedule_shifts FOR INSERT WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));
CREATE POLICY "shifts_update" ON public.schedule_shifts FOR UPDATE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));
CREATE POLICY "shifts_delete" ON public.schedule_shifts FOR DELETE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));

-- ── shift_assignments ──
DROP POLICY IF EXISTS "assignments_select" ON public.shift_assignments;
DROP POLICY IF EXISTS "assignments_insert" ON public.shift_assignments;
DROP POLICY IF EXISTS "assignments_update" ON public.shift_assignments;
DROP POLICY IF EXISTS "assignments_delete" ON public.shift_assignments;

CREATE POLICY "assignments_select" ON public.shift_assignments FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "assignments_insert" ON public.shift_assignments FOR INSERT WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));
CREATE POLICY "assignments_update" ON public.shift_assignments FOR UPDATE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));
CREATE POLICY "assignments_delete" ON public.shift_assignments FOR DELETE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));

-- ── organizations ──
DROP POLICY IF EXISTS "org_select" ON public.organizations;
DROP POLICY IF EXISTS "org_insert" ON public.organizations;
DROP POLICY IF EXISTS "org_update" ON public.organizations;
DROP POLICY IF EXISTS "org_delete" ON public.organizations;

CREATE POLICY "org_select" ON public.organizations FOR SELECT USING (id = ANY (get_user_org_ids(auth.uid())));
CREATE POLICY "org_insert" ON public.organizations FOR INSERT WITH CHECK (true);
CREATE POLICY "org_update" ON public.organizations FOR UPDATE USING (get_user_org_role(auth.uid(), id) = 'admin'::org_role);
CREATE POLICY "org_delete" ON public.organizations FOR DELETE USING (get_user_org_role(auth.uid(), id) = 'admin'::org_role);

-- ── org_members ──
DROP POLICY IF EXISTS "members_select" ON public.org_members;
DROP POLICY IF EXISTS "members_insert" ON public.org_members;
DROP POLICY IF EXISTS "members_update" ON public.org_members;
DROP POLICY IF EXISTS "members_delete" ON public.org_members;

CREATE POLICY "members_select" ON public.org_members FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "members_insert" ON public.org_members FOR INSERT WITH CHECK ((get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role])) OR (user_id = auth.uid()));
CREATE POLICY "members_update" ON public.org_members FOR UPDATE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));
CREATE POLICY "members_delete" ON public.org_members FOR DELETE USING (get_user_org_role(auth.uid(), org_id) = 'admin'::org_role);

-- ── commissions ──
DROP POLICY IF EXISTS "commissions_select" ON public.commissions;
DROP POLICY IF EXISTS "commissions_insert" ON public.commissions;
DROP POLICY IF EXISTS "commissions_update" ON public.commissions;
DROP POLICY IF EXISTS "commissions_delete" ON public.commissions;

CREATE POLICY "commissions_select" ON public.commissions FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "commissions_insert" ON public.commissions FOR INSERT WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));
CREATE POLICY "commissions_update" ON public.commissions FOR UPDATE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));
CREATE POLICY "commissions_delete" ON public.commissions FOR DELETE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));

-- ── cart_history ──
DROP POLICY IF EXISTS "cart_history_select" ON public.cart_history;
DROP POLICY IF EXISTS "cart_history_insert" ON public.cart_history;

CREATE POLICY "cart_history_select" ON public.cart_history FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "cart_history_insert" ON public.cart_history FOR INSERT WITH CHECK (is_org_member(auth.uid(), org_id));

-- ── scooter_history ──
DROP POLICY IF EXISTS "scooter_history_select" ON public.scooter_history;
DROP POLICY IF EXISTS "scooter_history_insert" ON public.scooter_history;

CREATE POLICY "scooter_history_select" ON public.scooter_history FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "scooter_history_insert" ON public.scooter_history FOR INSERT WITH CHECK (is_org_member(auth.uid(), org_id));

-- ── audit_log ──
DROP POLICY IF EXISTS "audit_select" ON public.audit_log;
DROP POLICY IF EXISTS "audit_insert" ON public.audit_log;

CREATE POLICY "audit_select" ON public.audit_log FOR SELECT USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));
CREATE POLICY "audit_insert" ON public.audit_log FOR INSERT WITH CHECK (is_org_member(auth.uid(), org_id));

-- ── profiles ──
DROP POLICY IF EXISTS "Authenticated users can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- ── security_audit_reports ──
DROP POLICY IF EXISTS "audit_reports_select" ON public.security_audit_reports;
DROP POLICY IF EXISTS "audit_reports_insert" ON public.security_audit_reports;

CREATE POLICY "audit_reports_select" ON public.security_audit_reports FOR SELECT USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'operador'::org_role]));
CREATE POLICY "audit_reports_insert" ON public.security_audit_reports FOR INSERT WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'operador'::org_role]));

-- ── transport_locations ──
DROP POLICY IF EXISTS "location_select" ON public.transport_locations;
DROP POLICY IF EXISTS "location_insert" ON public.transport_locations;
DROP POLICY IF EXISTS "location_update" ON public.transport_locations;
DROP POLICY IF EXISTS "location_delete" ON public.transport_locations;

CREATE POLICY "location_select" ON public.transport_locations FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "location_insert" ON public.transport_locations FOR INSERT WITH CHECK (is_org_member(auth.uid(), org_id));
CREATE POLICY "location_update" ON public.transport_locations FOR UPDATE USING (driver_user_id = auth.uid());
CREATE POLICY "location_delete" ON public.transport_locations FOR DELETE USING (driver_user_id = auth.uid());

-- ── user_roles ──
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;

CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "user_roles_own_select" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
