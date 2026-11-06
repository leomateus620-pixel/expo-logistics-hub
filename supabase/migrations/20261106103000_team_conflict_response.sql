-- Optimistic-version conflicts are business conflicts, not serialization failures.
-- SQLSTATE 40001 is automatically retried by the hosted API infrastructure.
-- PT409 returns a deterministic HTTP 409 immediately; preserve bodies and grants.
-- https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions
DO $conflicts$
DECLARE signature text; definition text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'public.team_save_volunteer(uuid,uuid,text,text,uuid,integer)',
  'public.team_deactivate_volunteer(uuid,uuid,integer)',
  'public.team_avatar_prepare(uuid,uuid,integer,uuid)',
  'public.team_avatar_commit(uuid,uuid,uuid,integer,text,uuid)',
  'public.team_update_access_request(uuid,text,text)'
 ] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  IF (length(definition)-length(replace(definition,'''40001''','')))/7<>1 THEN
   RAISE EXCEPTION 'TEAM_CONFLICT_CONTRACT_CHANGED: %',signature;
  END IF;
  EXECUTE replace(definition,'''40001''','''PT409''');
 END LOOP;
END $conflicts$;
