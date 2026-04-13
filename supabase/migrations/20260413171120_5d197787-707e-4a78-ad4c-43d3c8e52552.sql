
-- Add origem_lancamento column to expenses
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS origem_lancamento text NOT NULL DEFAULT 'manual';

-- Allow operador to also insert expense_approvals (they need to log status changes)
DROP POLICY IF EXISTS "appr_insert" ON public.expense_approvals;
CREATE POLICY "appr_insert" ON public.expense_approvals
FOR INSERT TO public
WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));
