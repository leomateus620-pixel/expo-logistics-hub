ALTER TABLE public.commissions DROP CONSTRAINT commissions_unit_type_check;
ALTER TABLE public.commissions ADD CONSTRAINT commissions_unit_type_check CHECK (unit_type IN ('comissao','assessoria','conselho'));
UPDATE public.commissions SET unit_type = 'conselho' WHERE slug = 'ccpf' AND unit_type <> 'conselho';