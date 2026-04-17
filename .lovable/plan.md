

# Plano: Módulo de Clima Operacional para Transportes

## Visão geral
Adicionar uma camada climática completa ao sistema, integrada à Google Weather API (já ativada conforme print), com snapshots persistidos por transporte, atualização 2x/dia + sob demanda, scoring operacional de risco, e UI premium em Transportes, Agenda e formulário de criação. Multi-tenant (isolado por `org_id`), cache por cidade, sem quebrar nada existente.

## Arquitetura

```text
┌─────────────────────────────────────────────────────────────┐
│ Frontend (React)                                            │
│  ├ TransportWeatherCard (cards Transportes)                 │
│  ├ WeatherMiniSummary (cards Agenda)                        │
│  ├ WeatherPreviewInTransportForm (criação/edição)           │
│  ├ WeatherBadge / WeatherAlertPill / WeatherRiskIndicator   │
│  └ Hooks: useTransportWeather, useWeatherPreview,           │
│           useBulkTransportWeather                           │
└──────────────┬──────────────────────────────────────────────┘
               │ supabase.functions.invoke
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Edge Function: weather-service                              │
│  Actions: preview | sync_transport | sync_batch | refresh   │
│  ├ resolveLocation()  (lat/lng | place_id | geocode)        │
│  ├ fetchCurrent / fetchForecast / fetchAlerts (Google)      │
│  ├ normalizePayload()                                       │
│  ├ calculateOperationalRisk()                               │
│  └ persistSnapshot() + invalidate(is_latest=false)          │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Tabelas: transport_weather_snapshots                        │
│          transport_weather_alerts                           │
│          weather_sync_jobs                                  │
│          weather_city_cache (dedupe por city_key)           │
└─────────────────────────────────────────────────────────────┘
               ▲
               │ pg_cron 06:00 e 18:00 (America/Sao_Paulo)
               │ → invoca weather-service action=sync_batch
```

## Modelo de dados (migration)

**`transport_weather_snapshots`** — todos os campos do prompt (`org_id`, `transport_id`, `city_key`, lat/lng, `current_*`, `precipitation_*`, `wind_*`, `visibility_km`, `alert_count`, `alerts_summary_jsonb`, `operational_risk_level` enum, `operational_risk_reason`, `forecast_period_label`, `fetched_at`, `valid_until`, `is_latest`, `raw_payload_jsonb`). Index parcial `(transport_id) WHERE is_latest=true`.

**`transport_weather_alerts`** — granularidade de alertas públicos (severidade, janela, fonte).

**`weather_sync_jobs`** — auditoria de execuções batch/sob demanda.

**`weather_city_cache`** — `city_key` (hash lat/lng arredondado) + `time_bucket` para deduplicar chamadas entre transportes da mesma cidade (TTL 30 min).

**Enums**: `weather_risk_level` (favoravel | atencao | alerta | critico), `weather_source` (google_weather_api).

**RLS**: SELECT/INSERT/UPDATE restritos a membros da `org_id`; função `has_org_access()` reutilizada. Service role grava via edge function.

**Trigger**: ao inserir snapshot novo com `is_latest=true`, marcar anteriores do mesmo `transport_id` como `is_latest=false` automaticamente.

## Edge Function: `weather-service`

Único endpoint com `action`:
- **`preview`** `{lat, lng}` ou `{address}` → resolve localização, busca clima, retorna normalizado **sem persistir** (usado no formulário).
- **`sync_transport`** `{transport_id}` → resolve localização do transporte, busca, normaliza, persiste snapshot, retorna.
- **`sync_batch`** `{org_id?, scope}` → busca transportes futuros/em andamento, agrupa por `city_key`, faz 1 fetch por cidade, persiste para todos. Usado pelo cron e pela ação manual em massa.
- **`refresh`** `{transport_id, force?}` → idem `sync_transport` mas respeita TTL salvo se `force=false`.

**Segurança**: `GOOGLE_MAPS_API_KEY` (já existe) usada server-side. Validação JWT + RBAC: qualquer membro autenticado da org pode ler/disparar refresh; cron usa service role.

**APIs Google chamadas**:
- `weather.googleapis.com/v1/currentConditions:lookup`
- `weather.googleapis.com/v1/forecast/hours:lookup` (próximas ~12h)
- Alertas via campo `weatherAlerts` retornado.

**Fallbacks**: se Google falhar, retornar último snapshot válido + flag `stale=true`. Job vai para `weather_sync_jobs` com `error_message`.

**Risk scoring** — função pura `calculateOperationalRisk(normalized)`:
- Crítico: alerta severo OR (precip>80% AND wind>50kph) OR visibility<1km OR thunderstorm>70%
- Alerta: precip>60% OR wind>40kph OR thunderstorm>40% OR temp>38 OR temp<5
- Atenção: precip>30% OR wind>25kph OR neblina leve
- Favorável: caso contrário
- Retorna `{ level, reason }` em PT-BR.

## Scheduler (pg_cron)

```sql
-- 06:00 e 18:00 America/Sao_Paulo (= 09:00 e 21:00 UTC)
select cron.schedule('weather-sync-morning', '0 9 * * *', $$
  select net.http_post(
    url := 'https://fidagsspejekripwkczr.supabase.co/functions/v1/weather-service',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON>"}'::jsonb,
    body := '{"action":"sync_batch","scope":"all_active"}'::jsonb
  );
$$);
-- idem 21 UTC para 18:00 SP
```

Será criado via SQL direto (não migration) por conter chaves específicas.

## Frontend

**Hooks** (`src/hooks/`):
- `useTransportWeather(transportId)` — query do snapshot ativo + auto-refetch se `valid_until < now()` (background, mantém UI).
- `useWeatherPreview(input)` — debounced 500ms, dispara `preview` action.
- `useBulkTransportWeather(transportIds[])` — single query batch.

**Componentes** (`src/components/weather/`):
- `TransportWeatherCard.tsx` — bloco completo para cards do menu Transportes (ícone Google, temp grande, condição, chuva%, vento, badge risco, alertas em pill, "atualizado há X min").
- `WeatherMiniSummary.tsx` — resumo compacto p/ Agenda (1 linha desktop, 2 linhas mobile).
- `WeatherBadge.tsx` — pill colorido por risk level (verde/amarelo/laranja/vermelho), com ícone + label, sem depender só de cor (acessibilidade AA).
- `WeatherAlertPill.tsx` — alertas oficiais com tooltip.
- `WeatherRiskIndicator.tsx` — barra/dot indicando severidade.
- `WeatherPreviewInTransportForm.tsx` — preview no `TransportForm` ao escolher destino.
- `WeatherSkeleton.tsx` — loading premium.

**Estados de UI** (todos implementados): loading skeleton, stale ("Atualizando..."), success, partial (sem alertas), no_data ("Clima indisponível"), error com retry.

**Integração nos arquivos existentes** (mínima e cirúrgica):
- `src/components/transport/TransportCard.tsx` → adiciona `<TransportWeatherCard transportId={t.id} />` no rodapé do card.
- `src/components/transport/TransportForm.tsx` → adiciona `<WeatherPreviewInTransportForm destino={watch('destino')} latLng={...} />` antes dos botões.
- `src/pages/AgendaPage.tsx` (cards de transporte na agenda) → adiciona `<WeatherMiniSummary transportId={...} />` na linha de metadados.
- `src/components/transport/TransportDetailView.tsx` → seção dedicada com `<TransportWeatherCard expanded />`.

**Design**: paleta atual (verde #006400 + dourado #F2C94C), liquid glass sutil, `bg-card/60 backdrop-blur` consistente com o resto. Ícones do Google (`current.iconBaseUri`). Tipografia hierarquizada: temp em `text-3xl font-bold`, condição `text-sm`, badges `text-xs`.

**Responsividade**:
- Desktop: clima como sidebar lateral do card (col-span 4 de 12).
- Mobile: stacked, ícone+temp+condição na primeira linha, chuva+vento+badge na segunda, alertas em terceira se houver.

## Resolução de localização

Prioridade: `latitude/longitude` salvos > `place_id` (resolve via Places API existente) > geocode do `destino` (string) usando `places-autocomplete` edge function já existente. `city_key` = `${round(lat,2)}_${round(lng,2)}` para dedupe geográfico.

Para transportes com origem+destino: snapshot principal = destino. Edge function aceita `include_origin=true` para gravar 2 snapshots quando solicitado (futuro).

## Cache & performance
- `weather_city_cache` por `city_key` + `time_bucket` (30 min) → fetch único por cidade no batch.
- React Query `staleTime: 5min`, `gcTime: 30min`.
- Index parcial em `is_latest=true` torna leitura O(1).
- `useBulkTransportWeather` evita N+1 nos cards.

## Observabilidade
Logs estruturados na edge function: `[weather] transport=X org=Y city=Z lat,lng status=ok|stale|error duration=Yms risk=alerta`. Persistidos em `weather_sync_jobs` para jobs batch.

## Arquivos

**Novos**:
- `supabase/migrations/<ts>_weather_module.sql` (3 tabelas + enums + RLS + trigger is_latest)
- `supabase/functions/weather-service/index.ts`
- `src/hooks/useTransportWeather.ts`
- `src/hooks/useWeatherPreview.ts`
- `src/hooks/useBulkTransportWeather.ts`
- `src/components/weather/TransportWeatherCard.tsx`
- `src/components/weather/WeatherMiniSummary.tsx`
- `src/components/weather/WeatherBadge.tsx`
- `src/components/weather/WeatherAlertPill.tsx`
- `src/components/weather/WeatherRiskIndicator.tsx`
- `src/components/weather/WeatherPreviewInTransportForm.tsx`
- `src/components/weather/WeatherSkeleton.tsx`
- `src/lib/weatherRiskScoring.ts` (função pura, testável)
- `src/test/weatherRiskScoring.test.ts`

**Editados (cirúrgico, sem refactor)**:
- `src/components/transport/TransportCard.tsx` → 1 import + 1 linha JSX
- `src/components/transport/TransportForm.tsx` → preview antes dos botões
- `src/components/transport/TransportDetailView.tsx` → seção clima
- `src/pages/AgendaPage.tsx` → mini summary nos cards de transporte da agenda

**Pós-deploy (SQL via insert tool, não migration)**: 2 jobs `pg_cron` (06h e 18h SP).

## Critérios de aceitação atendidos
1. Preview no form ao escolher destino ✅ 2. Card já mostra clima ao salvar (sync_transport on create) ✅ 3. Cards de Transportes com clima atualizado ✅ 4. Agenda com resumo ✅ 5. Cron 2x/dia ✅ 6. Substituição via trigger `is_latest` ✅ 7. Fallback elegante ✅ 8. Mobile/desktop refinados ✅ 9. Não quebra nada (adições aditivas) ✅ 10. Modular e testável (lib pura + hooks isolados) ✅

