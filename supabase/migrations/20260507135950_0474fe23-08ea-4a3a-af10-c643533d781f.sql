DELETE FROM public.vehicle_usage WHERE id IN ('776cd7e8-db5f-4cee-9720-15ef292b71e9','0d2067b9-c869-4e4b-b8b3-524cb2a2e4d6');
DELETE FROM public.transport_guests WHERE transport_id = 'f43e953f-5933-4d89-a135-abfddf0f9c16';
DELETE FROM public.transports WHERE id = 'f43e953f-5933-4d89-a135-abfddf0f9c16';
UPDATE public.vehicles SET km_atual = 6283 WHERE id = '2241a476-b89e-48b4-9caa-4b083bb14d46';