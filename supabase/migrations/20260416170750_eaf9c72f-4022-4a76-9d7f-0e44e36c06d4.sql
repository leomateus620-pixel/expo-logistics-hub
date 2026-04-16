
-- 1. Create user_capabilities table
CREATE TABLE public.user_capabilities (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  capability text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id, capability)
);

ALTER TABLE public.user_capabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uc_select_own" ON public.user_capabilities
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "uc_select_admin" ON public.user_capabilities
  FOR SELECT USING (get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));

CREATE POLICY "uc_insert_admin" ON public.user_capabilities
  FOR INSERT WITH CHECK (get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));

CREATE POLICY "uc_update_admin" ON public.user_capabilities
  FOR UPDATE USING (get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));

CREATE POLICY "uc_delete_admin" ON public.user_capabilities
  FOR DELETE USING (get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));

-- 2. has_capability function (admin/gestor/operador auto-inherit full_access)
CREATE OR REPLACE FUNCTION public.has_capability(_user_id uuid, _org_id uuid, _capability text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN (SELECT role FROM public.org_members WHERE user_id = _user_id AND org_id = _org_id AND is_active = true LIMIT 1)
           IN ('admin', 'gestor', 'operador')
      THEN true
      ELSE EXISTS (
        SELECT 1 FROM public.user_capabilities
        WHERE user_id = _user_id AND org_id = _org_id
          AND (capability = _capability OR capability = 'full_access')
      )
    END
$$;

-- 3. Make mobility_authorizations FKs nullable for internal flow
ALTER TABLE public.mobility_authorizations
  ALTER COLUMN source_link_id DROP NOT NULL,
  ALTER COLUMN source_form_id DROP NOT NULL,
  ALTER COLUMN source_member_id DROP NOT NULL;

-- Add internal reference columns
ALTER TABLE public.mobility_authorizations
  ADD COLUMN internal_form_id uuid REFERENCES public.committee_mobility_forms(id) ON DELETE CASCADE,
  ADD COLUMN internal_member_id uuid REFERENCES public.committee_mobility_members(id) ON DELETE CASCADE;

-- 4. sync_internal_mobility_form function
CREATE OR REPLACE FUNCTION public.sync_internal_mobility_form(_form_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form public.committee_mobility_forms%ROWTYPE;
BEGIN
  SELECT * INTO v_form FROM public.committee_mobility_forms WHERE id = _form_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'formulário interno não encontrado';
  END IF;

  -- Remove previous authorizations for this internal form
  DELETE FROM public.mobility_authorizations WHERE internal_form_id = v_form.id;

  -- Insert authorizations from internal members
  INSERT INTO public.mobility_authorizations (
    org_id, committee_id, committee_name_snapshot, president_name_snapshot,
    operational_responsible_name, operational_responsible_phone, operational_responsible_email,
    member_name, member_role, member_identifier,
    authorization_type, qr_access_free, access_status,
    source_origin, notes, submitted_at, synced_at,
    internal_form_id, internal_member_id
  )
  SELECT
    m.org_id, v_form.committee_id, v_form.committee_name_snapshot, v_form.president_name_snapshot,
    v_form.operational_responsible_name, v_form.operational_responsible_phone, v_form.operational_responsible_email,
    m.member_name, m.member_role, m.member_identifier,
    auth_type.authorization_type, m.qr_access_free, 'pendente',
    'interno', m.notes, v_form.submitted_at, now(),
    v_form.id, m.id
  FROM public.committee_mobility_members m
  CROSS JOIN LATERAL (
    SELECT 'carro_eletrico'::public.mobility_authorization_type AS authorization_type
    WHERE m.access_electric_car = true
    UNION ALL
    SELECT 'patinete'::public.mobility_authorization_type AS authorization_type
    WHERE m.access_scooter = true
  ) auth_type
  WHERE m.form_id = v_form.id;

  -- Update form status
  UPDATE public.committee_mobility_forms
  SET submission_status = 'sincronizado', updated_at = now()
  WHERE id = v_form.id;
END;
$$;
