DROP TABLE IF EXISTS public._sync_probe;
CREATE TABLE public._sync_probe AS 
SELECT 
  current_user AS role_name, 
  current_setting('is_superuser') AS is_superuser,
  has_table_privilege('auth.users', 'INSERT') AS can_insert_users,
  (SELECT relowner::regrole::text FROM pg_class WHERE oid = 'auth.users'::regclass) AS users_owner;
GRANT SELECT ON public._sync_probe TO sandbox_exec;