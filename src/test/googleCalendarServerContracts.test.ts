import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const oauth = () => read('supabase/functions/google-calendar-oauth/index.ts');
const gateway = () => read('supabase/functions/_shared/googleCalendarGateway.ts');
const worker = () => read('supabase/functions/google-sync-worker/index.ts');
const migration = () => read('supabase/migrations/20260722234000_google_calendar_oauth_hardening.sql');

describe('contratos server-side do Google Agenda', () => {
  it('preserva as rotas públicas e usa o App User Connector existente', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('path="/cronograma-eventos"');
    expect(app).toContain('path="/google-calendar/callback"');
    expect(oauth()).toContain('const APP_ROUTE = "/cronograma-eventos"');
    expect(oauth()).toContain('const CALLBACK_ROUTE = "/google-calendar/callback"');
    expect(gateway()).toContain('https://connector-gateway.lovable.dev');
    expect(gateway()).toContain('/api/v1/app-users/oauth2/authorize');
    expect(gateway()).toContain('/api/v1/app-users/oauth2/exchange');
    expect(gateway()).not.toContain('/api/v1/app-users/connections');
  });

  it('implementa o contrato exato de authorize e exchange sem adivinhar campos', () => {
    const source = gateway();
    const authorize = source.slice(source.indexOf('export async function startOAuth'), source.indexOf('/** Exchanges'));
    const exchange = source.slice(source.indexOf('export async function exchangeOAuthCode'), source.indexOf('export async function disconnectGoogleConnection'));
    expect(authorize).toContain('connector_id: CONNECTOR_ID');
    expect(authorize).toContain('app_user_id: appUserId');
    expect(authorize).toContain('response_mode: "redirect"');
    expect(authorize).toContain('requiredString(payload, "authorization_url"');
    expect(authorize).toContain('requiredString(payload, "session_id"');
    expect(exchange).toContain('body: JSON.stringify({ code })');
    expect(exchange).toContain('payload.api_key');
    expect(exchange).toContain('payload, "connector_id"');
    expect(exchange).not.toContain('app_user_id');
    expect(exchange).not.toContain('X-Client-Api-Key');
  });

  it('mantém tipos distintos e nunca usa session id como connection key', () => {
    const source = gateway();
    expect(source).toContain('export type OAuthSessionId');
    expect(source).toContain('export type OAuthExchangeCode');
    expect(source).toContain('export type FinalizedConnectionKey');
    expect(source).not.toContain('extractConnectionKey');
    expect(source).not.toContain('record.session_id');
    expect(source).toContain('headers.set("X-Connection-Api-Key", key)');
  });

  it('valida tentativa, origem, rota, state quando presente e replay antes da troca', () => {
    const source = oauth();
    expect(source).toContain('await requireUser(req)');
    expect(source).toContain('requireActiveOrgMembership');
    expect(source).toContain('req.headers.get("Origin") !== attempt.return_origin');
    expect(source).toContain('callbackPath !== attempt.callback_path');
    expect(source).toContain('if (state && (!attempt.provider_state_hash || stateHash !== attempt.provider_state_hash))');
    expect(source).toContain('throw new Error("callback_replayed")');
    expect(source).toContain('.eq("status", "waiting_authorization")');
    expect(source).toContain('isTrustedLovableOrigin(origin)');
  });

  it('usa o mesmo Supabase user.id como identidade por usuário', () => {
    const source = oauth();
    expect(source).toContain('startOAuth(returnTarget.url, user.id)');
    expect(source).toContain('user_id: user.id');
    expect(source).toContain('.eq("user_id", user.id)');
    expect(worker()).toContain('.eq("user_id", task.user_id)');
    expect(worker()).toContain('user_id: task.user_id');
  });

  it('somente confirma a conexão após probe e calendário secundário acessível', () => {
    const source = oauth();
    const probe = source.indexOf('probeConnection(connectionKey)');
    const calendar = source.indexOf('ensureSecondaryCalendar(connectionKey, existingCalendarId)');
    const verified = source.indexOf('verified_at: now');
    expect(probe).toBeGreaterThan(0);
    expect(calendar).toBeGreaterThan(probe);
    expect(verified).toBeGreaterThan(calendar);
    expect(source).toContain('if (!probe.ok)');
    expect(source).toContain('diagnostic("google_probe_succeeded"');
    expect(source).not.toContain('connected_at: now,\n        status: "starting"');
    expect(gateway()).toContain('/calendar/v3/users/me/calendarList');
    expect(gateway()).toContain('export interface ProbeConnectionResult');
    expect(gateway()).toContain('safeCode: response.ok ? "ok" : safeProviderError(response.status)');
    expect(gateway()).toContain('SECONDARY_CALENDAR_SUMMARY');
  });

  it('inclui administradores/full access e filtra eventos sem data no backfill', () => {
    const source = oauth();
    expect(source).toContain('_capability: "full_access"');
    expect(source).toContain('if (fullAccess)');
    expect(source).toContain('.not("start_date", "is", null)');
    expect(source).toContain('access: fullAccess ? "full" : "commission"');
    expect(migration()).toContain("public.has_capability(_user_id, _org_id, 'full_access')");
  });

  it('torna fila e remoções duráveis, atômicas, limitadas e idempotentes', () => {
    const sql = migration();
    const source = worker();
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS google_sync_outbox_event_id_fkey');
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS google_calendar_event_map_event_id_fkey');
    expect(sql).toContain('BEFORE DELETE ON public.cronograma_eventos');
    expect(sql).toContain('FOR UPDATE OF outbox SKIP LOCKED');
    expect(sql).toContain("status = 'completed'");
    expect(sql).toContain('connection_generation IS DISTINCT FROM connection.connection_generation');
    expect(sql).toContain('google_calendar_event_map_main_uidx');
    expect(source).toContain('claim_google_sync_batch');
    expect(source).toContain('findRemoteEventIds');
    expect(source).toContain('remote_event_verification_failed');
    expect(source).toContain('remote_event_verified');
    expect(source).toContain('?fields=id,extendedProperties');
    expect(source).toContain('attempts >= MAX_ATTEMPTS');
  });

  it('agenda o worker com segredo no Vault e mantém o endpoint protegido', () => {
    const sql = migration();
    expect(sql).toContain("name = 'google_sync_worker_service_role_key'");
    expect(sql).toContain("'google-sync-worker-every-minute'");
    expect(sql).toContain("'* * * * *'");
    expect(sql).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{20,}/);
    expect(worker()).toContain('requireServiceRole(req)');
    expect(read('supabase/config.toml')).toMatch(/\[functions\.google-sync-worker\]\r?\nverify_jwt = false/);
  });

  it('não expõe segredo Google ou chave final no frontend', () => {
    const hook = read('src/hooks/useGoogleCalendarConnection.ts');
    const callbackPage = read('src/pages/GoogleCalendarCallbackPage.tsx');
    const callbackParser = read('src/lib/google-calendar-callback.ts');
    const frontend = [hook, callbackPage, callbackParser].join('\n');
    expect(frontend).not.toMatch(/GOOGLE_CLIENT_SECRET|client_secret|X-Connection-Api-Key/);
    expect(frontend).not.toContain('extractGoogleCalendarConnectionKey');
    expect(hook).not.toContain('connectionKey');
    expect(hook).not.toContain('exchangeCode');
    expect(callbackPage).not.toContain('connectionKey');
    expect(callbackPage).not.toContain('exchangeCode');
  });
});

describe('contratos de lembretes preservados', () => {
  it('preserva remetente, fila e proteção do job de lembretes', () => {
    const reminders = read('supabase/functions/event-reminders/index.ts');
    const sender = read('supabase/functions/send-transactional-email/index.ts');
    const config = read('supabase/config.toml');
    expect(reminders).toContain('requireServiceRole(req)');
    expect(reminders).toContain('templateName: "event-reminder"');
    expect(reminders).toContain('onConflict: "idempotency_key", ignoreDuplicates: true');
    expect(sender).toContain('const SENDER_DOMAIN = "notify.fenasojagestao.com"');
    expect(config).toMatch(/\[functions\.event-reminders\]\r?\nverify_jwt = true/);
  });
});
