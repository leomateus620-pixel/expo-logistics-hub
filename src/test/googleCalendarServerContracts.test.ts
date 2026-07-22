import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('contratos server-side do Google Agenda e lembretes', () => {
  it('preserva as rotas públicas e o callback gerenciado pelo gateway Lovable', () => {
    const app = read('src/App.tsx');
    const oauth = read('supabase/functions/google-calendar-oauth/index.ts');
    const gateway = read('supabase/functions/_shared/googleCalendarGateway.ts');
    expect(app).toContain('path="/cronograma-eventos"');
    expect(app).toContain('path="/google-calendar/callback"');
    expect(oauth).toContain('const APP_ROUTE = "/cronograma-eventos"');
    expect(oauth).toContain('const CALLBACK_ROUTE = "/google-calendar/callback"');
    expect(gateway).toContain('https://connector-gateway.lovable.dev');
    expect(gateway).toContain('/api/v1/app-users/oauth2/authorize');
  });

  it('mantém a função OAuth protegida e rejeita callbacks ou organizações não validados', () => {
    const oauth = read('supabase/functions/google-calendar-oauth/index.ts');
    expect(oauth).toContain('await requireUser(req)');
    expect(oauth).toContain('requireActiveOrgMembership');
    expect(oauth).toContain('parsed.pathname !== CALLBACK_ROUTE');
    expect(oauth).toContain('GOOGLE_CALENDAR_ALLOWED_RETURN_ORIGINS');
    expect(oauth).not.toContain('new Set([requestOrigin');
    expect(oauth).toContain('status: "completing"');
    expect(oauth).not.toContain('error: String((e as Error).message');
  });

  it('usa connection_key per-user para chamadas reais ao Google sem expor segredo ao navegador', () => {
    const oauth = read('supabase/functions/google-calendar-oauth/index.ts');
    const worker = read('supabase/functions/google-sync-worker/index.ts');
    const gateway = read('supabase/functions/_shared/googleCalendarGateway.ts');
    expect(gateway).toContain('headers.set("X-Connection-Api-Key", key)');
    expect(gateway).not.toContain('headers.set("X-App-User-Id"');
    expect(gateway).toContain('extractConnectionKey');
    expect(oauth).toContain('connection_key: connectionKey');
    expect(oauth).toContain('authorization_not_confirmed');
    expect(oauth).toContain('if (!effectiveConnectionKey)');
    expect(oauth).toContain('redactConnectionSecrets');
    expect(oauth).toContain('appUserConnectionKey');
    expect(worker).toContain('!connection.connection_key');
    expect(worker).toContain('const connectionKey = connection.connection_key as string');
  });

  it('fortalece retry e idempotência sem criar outro worker ou outra rota', () => {
    const oauth = read('supabase/functions/google-calendar-oauth/index.ts');
    const worker = read('supabase/functions/google-sync-worker/index.ts');
    expect(oauth).toContain('if (action === "retry")');
    expect(oauth).toContain('ignoreDuplicates: true');
    expect(worker).toContain('findRemoteEventId');
    expect(worker).toContain('existing?.google_calendar_id === calendarId');
    expect(worker).toContain('.in("status", ["queued", "failed"])');
    expect(worker).toContain('stale_in_flight_recovered');
    expect(worker).toContain('requireServiceRole(req)');
    expect(worker).toContain('supa.rpc("complete_google_sync_task"');
    expect(worker).toContain('.eq("status", "in_flight")');
  });

  it('preserva remetente, fila e template centrais e protege o job de lembretes', () => {
    const reminders = read('supabase/functions/event-reminders/index.ts');
    const sender = read('supabase/functions/send-transactional-email/index.ts');
    const config = read('supabase/config.toml');
    expect(reminders).toContain('requireServiceRole(req)');
    expect(reminders).toContain('templateName: "event-reminder"');
    expect(reminders).toContain('buildCronogramaEventUrl(delivery.event_id)');
    expect(reminders).toContain('onConflict: "idempotency_key", ignoreDuplicates: true');
    expect(reminders).toContain('.eq("updated_at", delivery.updated_at)');
    expect(sender).toContain('const SENDER_DOMAIN = "notify.fenasojagestao.com"');
    expect(sender).toContain("const FROM_DOMAIN = \"fenasojagestao.com\"");
    expect(sender).toContain("authToken !== supabaseServiceKey");
    expect(sender).toContain("supabase.rpc('enqueue_email'");
    expect(config).toContain('[functions.event-reminders]\nverify_jwt = true');
  });
});
