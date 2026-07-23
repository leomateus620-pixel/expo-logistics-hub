# Google Calendar OAuth recovery

## Root cause

The previous flow declared success before authorization was trustworthy:

1. The frontend and Edge Function inserted `google=connected` in `return_url` before Google authorization.
2. The callback page interpreted that untrusted query value (or any `code`) as success and notified its opener.
3. The parent then called `complete` without a guaranteed finalized connector key.
4. The gateway helper accepted multiple guessed response fields and could fall back from a finalized connection key to the temporary OAuth `session_id`.
5. The backend stored `connected_at` during `start`, then eventually returned `authorization_not_confirmed` when the temporary identifier could not call Google.

The old `GET /api/v1/app-users/connections` recovery hypothesis is not valid for the current gateway: that route returns `404`. The current redirect contract is:

- `POST /api/v1/app-users/oauth2/authorize` with `connector_id`, stable Supabase `user.id` as `app_user_id`, `return_url`, `credentials_configuration` and `response_mode: redirect`.
- response fields: `authorization_url`, `session_id`;
- the gateway returns to the application with one-time `code` and `state`;
- `POST /api/v1/app-users/oauth2/exchange` with exactly `{ code }`;
- response fields: `api_key`, `connector_id`.

The browser never receives `api_key`. `session_id`, `code`, `state` and the finalized connection key have separate types and storage rules.

## Sanitized production trace before the fix

The production module loaded 178 real events and showed `Conexão não finalizada`. A fresh attempt produced this sanitized sequence:

1. `/cronograma-eventos` → authenticated Edge Function `start`;
2. connector authorization endpoint → `2xx`, returning only the expected authorization URL and temporary session identifier;
3. Google account chooser at `accounts.google.com`;
4. registered provider redirect host: `connector-gateway.lovable.dev`;
5. requested scopes: `userinfo.email`, `userinfo.profile`, `calendar`, `calendar.events`;
6. application callback route prepared with a premature `google=connected` marker by the deployed version.

Sensitive query values and account addresses are intentionally omitted. The deployed backend logs were unavailable to the repository session because the authenticated Supabase dashboard account does not have access to project `btfaumhroqtqzxomqorx`; post-deployment log verification remains required.

## Corrected trust boundary

The server creates a one-time `google_calendar_oauth_attempts` row and hashes the gateway state and temporary session id. Completion requires:

- the authenticated Supabase user that created the attempt;
- the same active organization membership;
- the exact allowlisted return origin and `/google-calendar/callback` route;
- an unexpired attempt;
- a matching state hash;
- an atomic `waiting_authorization → completing` claim.

Only after the one-time code is exchanged does the server store the finalized per-user connection key. It then:

1. probes `users/me/calendarList`;
2. verifies, recovers or creates `FENASOJA — Cronograma`;
3. verifies that the calendar is accessible in `calendarList`;
4. records `verified_at`, `secondary_calendar_id` and a new connection generation;
5. queues the eligible initial backfill;
6. returns success to the callback page.

The callback removes all OAuth parameters from browser history before the network request and reports success to `window.opener` only after the server returns `ok: true`.

## Event eligibility and delivery

Users with `full_access` receive every organization event with a start date. Other users receive events linked to their active commission memberships. This makes the administrator behavior explicit instead of silently producing a zero-event backfill.

Outbox work is bound to a connection generation. Claims use `FOR UPDATE SKIP LOCKED`, stale claims recover after five minutes, retries are bounded at six attempts, and active work is coalesced per user/event/generation. Remote events are found through `extendedProperties.private.fenasoja_event_id`; duplicate remote copies are removed and the surviving event is read back before the mapping is committed.

Event deletion is queued in a `BEFORE DELETE` trigger. The event and mapping foreign keys that previously cascaded away delete work are removed, so Google deletions remain durable after the local row is gone.

## Required deployment order

1. Apply `20260722234000_google_calendar_oauth_hardening.sql`.
2. Confirm these Supabase Edge Function secrets exist:
   - `LOVABLE_API_KEY`
   - `GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY`
   - `SITE_URL=https://www.fenasojagestao.com`
   - `GOOGLE_CALENDAR_ALLOWED_RETURN_ORIGINS` containing only explicitly authorized preview origins, when preview validation is needed.
3. Store the service-role value in Vault out of band under `google_sync_worker_service_role_key`. Never paste the value into SQL files, shell history, screenshots or PR text.
4. Deploy `google-calendar-oauth` and `google-sync-worker`.
5. Verify the `google-sync-worker-every-minute` pg_cron job is active.
6. Deploy the frontend only after the migration and Edge Functions are live.

The full `calendar` scope remains intentional because the integration calls `POST /calendar/v3/calendars` to create the secondary calendar. Removing it would break that behavior. `openid` is added alongside the two user-info scopes and `calendar.events`.

## Post-deployment evidence queries

Run with privileged access and never select `connection_key`, state/code/session hashes or Vault values.

```sql
select user_id, org_id, status, secondary_calendar_id, verified_at,
       backfill_done, backfill_total, last_sync_at, error_code
from public.google_calendar_connections
where user_id = '<test-user-id>';

select status, count(*)
from public.google_sync_outbox
where user_id = '<test-user-id>'
group by status;

select event_id, google_calendar_id, google_event_id, last_synced_at, deleted_at
from public.google_calendar_event_map
where user_id = '<test-user-id>'
order by last_synced_at desc nulls last;
```

Expected structured log sequence:

`oauth_start_started` → `oauth_start_succeeded` → `oauth_callback_received` → `oauth_completion_pending` → `connection_key_retrieved` → `google_probe_succeeded` → `secondary_calendar_ready` → `backfill_queued` → `worker_started` → `event_sync_succeeded`.

Logs contain only shortened user ids, organization/task/event ids, HTTP status and safe error codes.

## End-to-end checklist

- Connect a clean first user and verify the card does not become connected during the Google popup.
- Confirm the secondary calendar through the Google Calendar API and then visually.
- Confirm multiple eligible mappings and matching `fenasoja_event_id` private properties.
- Create a clearly named temporary event, edit it, then delete it; verify create/update/delete remotely and remove all temporary data.
- Disconnect and reconnect the same user.
- Repeat with a second user and confirm different Google accounts, connection generations, mappings and events.
- Inspect outbox transitions `queued → in_flight → completed`, including one forced retry and stale-claim recovery.

## Rollback

Frontend and Edge Functions can be rolled back together, but the new migration should remain in place because it removes credential exposure to `authenticated` and preserves delete tasks. To suspend background processing without losing queued work, unschedule `google-sync-worker-every-minute`. Do not restore the premature callback marker, direct connection-table grants, session-id fallback or cascading event foreign keys.
