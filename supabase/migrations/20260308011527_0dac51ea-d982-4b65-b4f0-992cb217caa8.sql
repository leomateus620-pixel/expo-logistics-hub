
-- Update existing 3 carts
UPDATE public.electric_carts SET codigo = 'CAR-01', nome = 'CAR ELÉTRICO Nº 01' WHERE codigo = 'ELE 01';
UPDATE public.electric_carts SET codigo = 'CAR-02', nome = 'CAR ELÉTRICO Nº 02' WHERE codigo = 'ELE 02';
UPDATE public.electric_carts SET codigo = 'CAR-03', nome = 'CAR ELÉTRICO Nº 03' WHERE codigo = 'ELE 03';

-- Insert 15 more carts (04 to 18) for all existing orgs
INSERT INTO public.electric_carts (org_id, codigo, nome, status)
SELECT o.id, c.codigo, c.nome, 'disponivel'::cart_status
FROM public.organizations o
CROSS JOIN (VALUES
  ('CAR-04', 'CAR ELÉTRICO Nº 04'),
  ('CAR-05', 'CAR ELÉTRICO Nº 05'),
  ('CAR-06', 'CAR ELÉTRICO Nº 06'),
  ('CAR-07', 'CAR ELÉTRICO Nº 07'),
  ('CAR-08', 'CAR ELÉTRICO Nº 08'),
  ('CAR-09', 'CAR ELÉTRICO Nº 09'),
  ('CAR-10', 'CAR ELÉTRICO Nº 10'),
  ('CAR-11', 'CAR ELÉTRICO Nº 11'),
  ('CAR-12', 'CAR ELÉTRICO Nº 12'),
  ('CAR-13', 'CAR ELÉTRICO Nº 13'),
  ('CAR-14', 'CAR ELÉTRICO Nº 14'),
  ('CAR-15', 'CAR ELÉTRICO Nº 15'),
  ('CAR-16', 'CAR ELÉTRICO Nº 16'),
  ('CAR-17', 'CAR ELÉTRICO Nº 17'),
  ('CAR-18', 'CAR ELÉTRICO Nº 18')
) AS c(codigo, nome)
WHERE NOT EXISTS (
  SELECT 1 FROM public.electric_carts ec WHERE ec.org_id = o.id AND ec.codigo = c.codigo
);
