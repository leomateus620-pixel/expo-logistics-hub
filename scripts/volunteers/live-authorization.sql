-- Run only through the confirmed Lovable connector. Every mutation rolls back.
-- Existing actors are represented by database JWT claims, never by borrowed sessions.
-- No event write, auth provisioning, mail, access request or storage operation occurs here.
BEGIN;
SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE qa_results(test text, passed boolean) ON COMMIT DROP;
GRANT SELECT,INSERT ON qa_results TO authenticated,anon;
CREATE TEMP TABLE qa_actors AS SELECT
 (SELECT r.user_id FROM public.commission_responsibles r JOIN public.org_members m ON m.user_id=r.user_id AND m.org_id=r.org_id
  WHERE r.org_id='985888b8-155f-4bbe-b6b9-6bef2893d99b' AND r.active AND m.is_active AND m.role<>'admin'
  AND r.relationship_role IN('principal','corresponsavel','copresidente') AND r.commission_id<>'63baa491-c2c7-4e24-8db1-af1cfd6236bf'
  AND r.user_id NOT IN(SELECT user_id FROM commission_responsibles WHERE commission_id='63baa491-c2c7-4e24-8db1-af1cfd6236bf' AND user_id IS NOT NULL) LIMIT 1) other_lead,
 (SELECT r.user_id FROM public.commission_responsibles r JOIN public.org_members m ON m.user_id=r.user_id AND m.org_id=r.org_id
  WHERE r.commission_id='63baa491-c2c7-4e24-8db1-af1cfd6236bf' AND r.active AND m.is_active AND m.role<>'admin' AND r.relationship_role='equipe_apoio' LIMIT 1) volunteer;
GRANT SELECT ON qa_actors TO authenticated;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE saved jsonb; retry jsonb; request uuid:=gen_random_uuid(); contacts jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','c3e01950-00ba-497a-b2b0-e13debce41e2',true);
 saved:=public.team_save_volunteer('63baa491-c2c7-4e24-8db1-af1cfd6236bf',request,'QA Transaction Volunteer','qa.transaction@example.invalid');
 retry:=public.team_save_volunteer('63baa491-c2c7-4e24-8db1-af1cfd6236bf',request,'QA Transaction Volunteer','qa.transaction@example.invalid');
 IF saved<>retry THEN RAISE EXCEPTION 'RETRY_CHANGED_ID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM commission_people WHERE id=(saved->>'person_id')::uuid AND user_id IS NULL) THEN RAISE EXCEPTION 'IDENTITY_NOT_CREATED'; END IF;
 contacts:=public.team_admin_contacts('63baa491-c2c7-4e24-8db1-af1cfd6236bf');
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(contacts) c WHERE c->>'person_id'=saved->>'person_id' AND c->>'email'='qa.transaction@example.invalid') THEN RAISE EXCEPTION 'CONTACT_MISSING'; END IF;
 INSERT INTO qa_results VALUES('Current Soja Store president creates transactional identity/contact/membership and retries safely',true);
 BEGIN
  PERFORM public.team_save_volunteer('ed23de8f-6293-4321-a8c2-852a1f83f5ec',gen_random_uuid(),'Forbidden QA','forbidden@example.invalid');
  RAISE EXCEPTION 'CROSS_UNIT_WRITE_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO qa_results VALUES('President cannot forge a different unit',true);
END $test$;
DO $test$
DECLARE actor uuid;
BEGIN
 FOR actor IN SELECT other_lead FROM qa_actors UNION ALL SELECT volunteer FROM qa_actors LOOP
  IF actor IS NULL THEN RAISE EXCEPTION 'MISSING_TEST_ACTOR'; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  BEGIN
   PERFORM public.team_admin_contacts('63baa491-c2c7-4e24-8db1-af1cfd6236bf');
   RAISE EXCEPTION 'PRIVATE_CONTACT_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
   PERFORM c.email FROM public.commission_people p JOIN team_private.contacts c ON c.person_id=p.id;
   RAISE EXCEPTION 'PRIVATE_JOIN_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
 INSERT INTO qa_results VALUES('Unrelated principal and ordinary volunteer cannot read contacts through RPC or join',true);
END $test$;
RESET ROLE;
UPDATE public.commission_responsibles SET active=false
 WHERE commission_id='63baa491-c2c7-4e24-8db1-af1cfd6236bf' AND user_id='c3e01950-00ba-497a-b2b0-e13debce41e2';
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 PERFORM set_config('request.jwt.claim.sub','c3e01950-00ba-497a-b2b0-e13debce41e2',true);
 BEGIN
  PERFORM public.team_admin_contacts('63baa491-c2c7-4e24-8db1-af1cfd6236bf');
  RAISE EXCEPTION 'REVOKED_PRINCIPAL_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO qa_results VALUES('Revocation immediately blocks the former principal, including their own creation',true);
END $test$;
SET LOCAL ROLE anon;
DO $test$ BEGIN
 BEGIN
  PERFORM public.team_admin_contacts('63baa491-c2c7-4e24-8db1-af1cfd6236bf');
  RAISE EXCEPTION 'ANONYMOUS_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO qa_results VALUES('Anonymous cannot execute private contact RPC',true);
END $test$;
RESET ROLE;
SELECT * FROM qa_results ORDER BY test;
ROLLBACK;
