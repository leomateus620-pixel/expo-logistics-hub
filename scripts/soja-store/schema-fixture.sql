-- Dependencies for the disposable database. All identities in the test are generated locally.
DO $$
BEGIN
  PERFORM pg_advisory_xact_lock(221018);
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE TABLE public.organizations (id uuid PRIMARY KEY);
CREATE TABLE public.commissions (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  slug text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  unit_type text NOT NULL DEFAULT 'comissao',
  UNIQUE (id, org_id),
  UNIQUE (org_id, slug)
);

CREATE TABLE public.org_members (
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE public.commission_people (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (id, org_id),
  UNIQUE (org_id, user_id)
);

CREATE TABLE public.commission_responsibles (
  commission_id uuid NOT NULL,
  org_id uuid NOT NULL,
  person_id uuid NOT NULL,
  responsible_type text NOT NULL DEFAULT 'pessoa',
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (commission_id, person_id),
  FOREIGN KEY (commission_id, org_id) REFERENCES public.commissions(id, org_id),
  FOREIGN KEY (person_id, org_id) REFERENCES public.commission_people(id, org_id)
);
