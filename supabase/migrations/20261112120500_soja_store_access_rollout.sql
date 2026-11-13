BEGIN;

ALTER TABLE soja_store_private.scopes
  ADD COLUMN institutional_access boolean NOT NULL DEFAULT false;

DO $$
DECLARE
  v_commission public.commissions;
BEGIN
  SELECT * INTO STRICT v_commission
  FROM public.commissions
  WHERE slug = 'soja-store' AND unit_type = 'comissao' AND is_active;

  INSERT INTO soja_store_private.scopes (org_id, commission_id, enabled, institutional_access)
  VALUES (v_commission.org_id, v_commission.id, false, true)
  ON CONFLICT (org_id, commission_id) DO UPDATE
  SET enabled = false, institutional_access = true;
EXCEPTION
  WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'SOJA_STORE_CANONICAL_COMMISSION_UNRESOLVED';
END;
$$;

-- Protect the organization role and account identity used to authorize the store.
-- Direct writes without a user claim remain available to trusted server provisioning.
CREATE FUNCTION soja_store_private.guard_org_member_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_org uuid := NEW.org_id;
  v_actor_role text;
BEGIN
  IF v_user IS NULL AND coalesce(current_setting('role', true), '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND ROW(OLD.org_id, OLD.user_id) IS DISTINCT FROM ROW(NEW.org_id, NEW.user_id) THEN
    IF EXISTS (
      SELECT 1 FROM soja_store_private.scopes s
      WHERE s.institutional_access AND s.org_id IN (OLD.org_id, NEW.org_id)
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SOJA_STORE_ORG_MEMBER_IDENTITY_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM soja_store_private.scopes s WHERE s.institutional_access AND s.org_id = v_org
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.role IS NOT DISTINCT FROM NEW.role AND OLD.is_active IS NOT DISTINCT FROM NEW.is_active THEN
    RETURN NEW;
  END IF;

  SELECT m.role::text INTO v_actor_role FROM public.org_members m
  WHERE m.org_id = v_org AND m.user_id = v_user AND m.is_active;

  IF TG_OP = 'INSERT' THEN
    IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'gestor')
      OR (NEW.role::text IN ('admin', 'gestor') AND v_actor_role <> 'admin') THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SOJA_STORE_ORG_MEMBER_INSERT_FORBIDDEN';
    END IF;
  ELSIF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'gestor')
    OR ((OLD.role::text IN ('admin', 'gestor') OR NEW.role::text IN ('admin', 'gestor')) AND v_actor_role <> 'admin') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SOJA_STORE_ORG_MEMBER_ROLE_FORBIDDEN';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER soja_store_guard_org_member_access
  BEFORE INSERT OR UPDATE OF org_id, user_id, role, is_active ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION soja_store_private.guard_org_member_access();

CREATE TABLE soja_store_private.operational_capability_registry (
  capability text PRIMARY KEY
    CHECK (capability ~ '^[a-z]+[.][a-z_]+$' AND capability NOT LIKE 'imports.%')
);
ALTER TABLE soja_store_private.operational_capability_registry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON soja_store_private.operational_capability_registry FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO soja_store_private.operational_capability_registry (capability) VALUES
  ('catalog.manage'), ('catalog.view'),
  ('purchases.costs'), ('purchases.manage'), ('purchases.receive'), ('purchases.view'),
  ('settings.manage'), ('settings.view'),
  ('stock.view'),
  ('suppliers.manage'), ('suppliers.view');

CREATE FUNCTION soja_store_private.operational_capabilities()
RETURNS text[] LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(array_agg(capability ORDER BY capability), ARRAY[]::text[])
  FROM soja_store_private.operational_capability_registry;
$$;

CREATE OR REPLACE FUNCTION soja_store_private.scope_enabled(_org_id uuid, _commission_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM soja_store_private.scopes s
    JOIN public.commissions c ON c.org_id = s.org_id AND c.id = s.commission_id
    JOIN public.org_members m ON m.org_id = s.org_id AND m.user_id = (SELECT auth.uid())
    WHERE s.org_id = _org_id AND s.commission_id = _commission_id
      AND s.enabled AND s.institutional_access AND c.is_active AND c.unit_type = 'comissao' AND c.slug = 'soja-store'
      AND m.is_active
  );
$$;

CREATE OR REPLACE FUNCTION soja_store_private.capabilities(_org_id uuid, _commission_id uuid)
RETURNS text[] LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM public.org_members m
    WHERE m.org_id = _org_id AND m.user_id = (SELECT auth.uid()) AND m.is_active
      AND soja_store_private.scope_enabled(_org_id, _commission_id) AND (
        m.role::text = 'admin'
        OR EXISTS (
          SELECT 1
          FROM public.commission_people p
          JOIN public.commission_responsibles r ON r.person_id = p.id AND r.org_id = p.org_id
          WHERE p.org_id = m.org_id AND p.user_id = m.user_id AND r.commission_id = _commission_id
            AND r.active AND r.responsible_type = 'pessoa'
        )
      )
  ) THEN soja_store_private.operational_capabilities() ELSE ARRAY[]::text[] END;
$$;

REVOKE ALL ON FUNCTION
  soja_store_private.guard_org_member_access(),
  soja_store_private.operational_capabilities(),
  soja_store_private.scope_enabled(uuid, uuid),
  soja_store_private.capabilities(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
