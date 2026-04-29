## Diagnóstico

A correção anterior já garante que **só o motorista designado pode publicar GPS** (checagem no frontend + função `publish_transport_location`). Falta blindar contra mistura de localizações entre transportes/dispositivos quando:

1. O mesmo usuário acidentalmente reativa o GPS num transporte que não é mais dele.
2. O motorista abre o app em **dois dispositivos** (celular + desktop) e os dois começam a publicar.
3. Outra aba/usuário entra no celular do motorista e confunde a `geolocation.watchPosition` ativa.
4. Um transporte muda de fase (ida → retorno) e o `transport_id` antigo continua sendo publicado.

## Correção (4 frentes)

### 1. Identificador de dispositivo (device fingerprint)

Adicionar 2 colunas em `public.transports`:
- `tracking_device_id text` — UUID gerado no primeiro start, persistido em `localStorage` (`fenasoja_device_id`).
- `tracking_user_agent text` — diagnóstico (navegador/SO).

Atualizar `publish_transport_location()` para receber `_device_id` e exigir que ele bata com o registrado. Se outro dispositivo tentar publicar (mesmo do mesmo user), recebe erro `"Outro dispositivo já está enviando a localização desta viagem"`.

### 2. Singleton global de tracking no frontend

Hoje cada montagem do `useLocationTracking` cria um `watchPosition`. Vou centralizar num **singleton module** (`src/lib/locationTracker.ts`) que:
- Mantém **apenas um `watchPosition` ativo por aba**, mesmo se o hook montar em vários lugares.
- Guarda `currentTransportId` e `currentDeviceId` em memória.
- Antes de cada `publish`, valida no DB que: `status` é ativo, `motorista_user_id === user.id`, `tracking_device_id IS NULL OR === currentDeviceId`.
- Se mudar o `transportId`, **para o watch antigo** antes de criar o novo (evita coordenadas vazando entre transportes).

`useLocationTracking` vira um wrapper fino que delega ao singleton e expõe estado reativo.

### 3. Limpeza explícita ao mudar de fase

No edge function `transport-lifecycle`, no `handleArriveDestination`, **deletar a linha de `transport_locations` da fase de ida** antes de mudar status para `chegou_destino`. E no `handleStartReturn`/equivalente, resetar `tracking_device_id` para permitir que o motorista reinicie do zero (mesmo dispositivo na maioria dos casos, mas garantia de fluxo limpo).

### 4. Hardening visual

No `TransportDynamicIsland.tsx`, exibir badge sutil: **"GPS via [nome do motorista] · [iniciais do dispositivo]"** quando o card é aberto por outros usuários acompanhando — só leitura, evita confusão "de quem é essa localização?".

## Comportamento esperado

| Cenário | Antes | Depois |
|---|---|---|
| Marcelo inicia GPS no celular | OK | OK + dispositivo registrado |
| Marcelo abre o app no PC e clica em "Iniciar GPS" | PC sobrescreve | PC recebe erro educado, celular continua mandando |
| Eduardo (admin) clica iniciar | Já bloqueado | Já bloqueado |
| Marcelo finaliza ida e inicia retorno | Pode vazar coordenadas | Linha antiga deletada, dispositivo re-permitido |
| Outros operadores acompanham viagem | OK | OK + badge "GPS via Marcelo" |

## Arquivos afetados

- **Migration**: novas colunas `tracking_device_id`, `tracking_user_agent` em `transports`; nova assinatura de `publish_transport_location` com `_device_id` + `_user_agent`.
- **Novo**: `src/lib/locationTracker.ts` (singleton de geolocation).
- **Editar**: `src/hooks/useLocationTracking.ts` (delegar ao singleton, enviar device_id).
- **Editar**: `supabase/functions/transport-lifecycle/index.ts` (limpar `transport_locations` em arrive/start_return + resetar device_id).
- **Editar**: `src/components/TransportDynamicIsland.tsx` (badge "GPS via X").

Nenhuma outra parte do fluxo (KM, WhatsApp, retorno automático, ETA) é tocada.
