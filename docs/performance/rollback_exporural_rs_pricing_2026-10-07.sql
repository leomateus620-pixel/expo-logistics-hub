-- Reversão da correção de preços Exporural R/S de 2026-10-07 (estado anterior das regras).
UPDATE public.commercial_price_rules SET range_start=1, range_end=12, price_per_sqm=27.50, label='Exporural - Quadra R - Lotes 01 a 12' WHERE id='0aeae0d8-9d13-47e3-8baf-26f48a9aa0e9';
UPDATE public.commercial_price_rules SET range_start=1, range_end=12, price_per_sqm=30.00, label='Exporural - Quadra R - Lotes 01 a 12' WHERE id='fbbc287d-644f-47c0-a957-c1002d00b31b';
UPDATE public.commercial_price_rules SET range_start=13, range_end=40, price_per_sqm=24.20, label='Exporural - Quadra R - Lotes 13 a 40' WHERE id='a8bdb99e-5f5b-4818-8fe2-1d08d3fe0892';
UPDATE public.commercial_price_rules SET range_start=13, range_end=40, price_per_sqm=27.00, label='Exporural - Quadra R - Lotes 13 a 40' WHERE id='c6ff5cac-6d67-4338-93c8-e664f2c299a8';
UPDATE public.commercial_price_rules SET range_start=41, range_end=65, price_per_sqm=16.50, label='Exporural - Quadra R - Lotes 41 a 59' WHERE id='552e1038-6b92-429a-a95c-503b737c97b8';
UPDATE public.commercial_price_rules SET range_start=41, range_end=65, price_per_sqm=18.00, label='Exporural - Quadra R - Lotes 41 a 59' WHERE id='81d78933-ff2e-400b-9c04-2d0d9a161b5a';
UPDATE public.commercial_price_rules SET range_start=1, range_end=36, price_per_sqm=11.00, label='Exporural - Quadra S - Lotes 01 a 36' WHERE id='f9ddbbe7-e8d9-406c-8364-59aa69650b4f';
UPDATE public.commercial_price_rules SET range_start=1, range_end=36, price_per_sqm=12.00, label='Exporural - Quadra S - Lotes 01 a 36' WHERE id='11c343b6-661d-4c44-a5d7-443f292eb5dd';
-- R/62 e R/63 tinham valores manuais R$ 0,00 nas duas etapas (removidos via clear_lot_price_override; histórico em map_activity_logs).
