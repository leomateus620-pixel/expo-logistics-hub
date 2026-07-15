-- Preparação para importar dados completos do projeto de origem (pg_dump)
-- Concede permissões temporárias e desativa triggers de validação em todas as tabelas public.*
GRANT USAGE ON SCHEMA auth TO sandbox_exec;
GRANT INSERT, DELETE ON auth.users TO sandbox_exec;
GRANT INSERT, DELETE ON auth.identities TO sandbox_exec;
GRANT DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public TO sandbox_exec;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', t);
  END LOOP;
END $$;