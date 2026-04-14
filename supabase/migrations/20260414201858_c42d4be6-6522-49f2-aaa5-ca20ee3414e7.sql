CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_org_id_name_unique_idx
ON public.expense_categories (org_id, name);