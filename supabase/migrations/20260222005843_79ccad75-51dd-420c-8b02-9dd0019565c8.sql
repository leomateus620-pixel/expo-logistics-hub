
CREATE OR REPLACE FUNCTION public.create_org_with_member(org_nome text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_org_id uuid;
  caller_id uuid := auth.uid();
  caller_name text;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT COALESCE(raw_user_meta_data->>'full_name', email)
    INTO caller_name FROM auth.users WHERE id = caller_id;
  INSERT INTO organizations (nome) VALUES (org_nome) RETURNING id INTO new_org_id;
  INSERT INTO org_members (org_id, user_id, role, nome_exibicao)
    VALUES (new_org_id, caller_id, 'admin', caller_name);
  RETURN new_org_id;
END; $$;

ALTER TABLE public.electric_carts ADD COLUMN IF NOT EXISTS comissao text;
