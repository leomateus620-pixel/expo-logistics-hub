
-- View for guests: hide email/telefone for 'leitura' role
CREATE OR REPLACE VIEW public.guests_safe
WITH (security_invoker = on) AS
SELECT
  id, org_id, nome, tipo, hotel_nome, observacoes,
  checkin_em, checkout_em, prioridade,
  created_at, updated_at,
  CASE
    WHEN get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor', 'operador')
    THEN email
    ELSE NULL
  END AS email,
  CASE
    WHEN get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor', 'operador')
    THEN telefone
    ELSE NULL
  END AS telefone
FROM public.guests;

-- View for org_members: hide telefone for 'leitura' role
CREATE OR REPLACE VIEW public.org_members_safe
WITH (security_invoker = on) AS
SELECT
  id, org_id, user_id, role, nome_exibicao, cargo,
  commission_id, avatar_color, status, is_active,
  created_at, updated_at,
  CASE
    WHEN get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor', 'operador')
    THEN telefone
    ELSE NULL
  END AS telefone
FROM public.org_members;
