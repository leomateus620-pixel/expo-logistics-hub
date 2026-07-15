-- Test if migration tool can write to auth.users directly
DO $$
DECLARE _priv boolean; _user text;
BEGIN
  SELECT current_user INTO _user;
  RAISE NOTICE 'current_user in migration = %', _user;
  SELECT has_table_privilege(_user, 'auth.users', 'INSERT') INTO _priv;
  RAISE NOTICE 'insert priv on auth.users = %', _priv;
END $$;