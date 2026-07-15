## Objetivo
Parar de gravar snapshots de clima e esconder a UI. Manter tabelas e dados intactos para reativação futura.

## Mudanças

**1. Edge function `weather-service`**
- Adicionar kill-switch no topo do handler: retorna `{ ok: true, disabled: true }` para qualquer `action` (`preview`, `sync_transport`, `refresh`, `sync_batch`).
- Não deleta a função — só neutraliza. Reverter é remover o early-return.

**2. Cron job (se existir)**
- Verificar `cron.job` por schedules chamando `weather-service` e desagendar via `cron.unschedule(...)`.

**3. UI — remover pontos de entrada visual**
- `src/components/transport/TransportForm.tsx` — remover render de `WeatherPreviewInTransportForm`.
- `src/components/transport/TransportCard.tsx` e `TransportDetailView.tsx` — remover render de `TransportWeatherCard` / `WeatherMiniSummary` / `WeatherRiskIndicator` onde aparecerem.
- Hooks (`useTransportWeather`, `useBulkTransportWeather`, `useWeatherPreview`) ficam no repo mas sem consumidores.

**4. Preservado (nada tocado)**
- Tabelas `transport_weather_snapshots`, `transport_weather_alerts`, `weather_city_cache`, `weather_sync_jobs` — dados e RLS mantidos.
- Componentes `weather/*` mantidos para reativação futura.

## Reativação
Reverter o early-return do `weather-service`, restaurar imports/renders removidos, reagendar cron.
