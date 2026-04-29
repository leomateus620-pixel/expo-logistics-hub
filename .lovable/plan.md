## Diagnóstico

Investiguei o transporte em questão (Santa Rosa → Aeroporto de Chapecó → Santa Rosa, id `f7833513…`). Encontrei **dois problemas reais** que se combinam:

**1. Coordenadas e polyline da rota nunca foram salvos no banco**
A linha do transporte está com:
- `origem_lat / origem_lng` = NULL
- `destino_lat / destino_lng` = NULL
- `rota_polyline` = NULL

Isso aconteceu porque o transporte foi criado por um caminho que **não passa** pelo bloco de criação do `TransportsPage` (que preenche `origem_lat = SANTA_ROSA` e dispara o `fetchRoutePreview` em background). Provavelmente foi criado a partir do Dashboard / Agenda / um fluxo legado, que insere apenas os campos básicos. Resultado: a Dynamic Island até desenha o pino de destino (porque cai no fallback `knownDestCoords['Aeroporto_Chapecó']`), mas **a rota traçada e o cálculo "Live" usam coordenadas erradas/incompletas**, e quando o motorista inicia, o mapa não tem rota base nenhuma.

**2. Sessão de tracking nunca foi iniciada para este transporte**
Não existe nenhum registro em `transport_locations` para `f7833513…`. Ou seja: o navegador do motorista nunca chamou `startTracking()` (provavelmente porque ele iniciou a viagem em outro dispositivo/sessão e este aparelho nem abriu a tela ainda, ou porque a permissão de geolocalização foi negada silenciosamente). Hoje o sistema só ativa GPS quando o próprio motorista clica "Iniciar viagem" nessa sessão — se a viagem já está `em_andamento`, o app **não retoma o tracking automaticamente**.

Como consequência o card mostra "Em trânsito" mas o ícone do motorista nunca aparece, e a rota desenhada (quando aparece) é a estática/errada.

## O que vamos corrigir

### A. Backfill no `start` da viagem (Edge Function `transport-lifecycle`)
Quando uma viagem inicia, se o transporte estiver sem `origem_lat/lng`, `destino_lat/lng` ou `rota_polyline`, a Edge Function vai:
- Preencher `origem_lat/lng` com Santa Rosa (ou com o que estiver no transporte) por padrão.
- Resolver `destino_lat/lng` a partir da tabela canônica de destinos conhecidos (Aeroporto Chapecó, Passo Fundo, Santo Ângelo, POA, etc.) ou do `voo_cidade`.
- Chamar `estimate-return` no modo rota para obter a polyline base e gravar em `rota_polyline`, `distancia_estimada_km`, `duracao_estimada_min` (apenas se ainda não existir).

Isso garante que **todo transporte iniciado tem coordenadas e rota**, independentemente de como foi criado.

### B. Recuperação imediata do transporte atual (one-shot SQL)
Migration que preenche para o transporte `f7833513…` (e quaisquer outros `em_andamento` com `destino_lat IS NULL`):
- `origem_lat = -27.8708`, `origem_lng = -54.4814` (Santa Rosa).
- `destino_lat = -27.1342`, `destino_lng = -52.6566` (Aeroporto de Chapecó), ou o conhecido para o `voo_cidade`/título.

A polyline de rota será regenerada pela própria Dynamic Island na próxima atualização Live (ela já busca `LIVE_ROUTE` quando há localização do motorista).

### C. Auto-retomar tracking quando o motorista abre o app
No `TransportsPage` (e no `useLocationTracking`), ao montar a página:
- Se existe um transporte `em_andamento` ou `em_retorno` cujo `motorista_user_id === user.id`, definir automaticamente `trackingTransportId` e disparar `startTracking()` — sem precisar do clique "Iniciar".
- Persistir esse id em `localStorage` (já existe `fenasoja_tracking_transport`) para sobreviver a refresh.
- Mostrar um aviso discreto se a permissão de geolocalização estiver `denied`, com botão "Reativar localização".

### D. Indicador honesto no card quando não há localização
Quando o transporte está `em_andamento` mas `transport_locations` está vazio há mais de ~2 min, o overlay "Obtendo localização do motorista…" passa a exibir também:
- "Aguardando o motorista abrir o app" + botão para **copiar/enviar link via WhatsApp** ao motorista pedindo para abrir a tela.

Assim o operador entende o estado real em vez de achar que está travado.

## Detalhes técnicos

```text
Fluxo após correção
┌────────────────────────────────────────────────────────────┐
│ Usuário cria transporte (qualquer fluxo)                   │
│   └─► pode ou não ter coords/rota                          │
│                                                            │
│ Motorista clica "Iniciar"  ──►  transport-lifecycle:start │
│   ├─ DELETE transport_locations stale                      │
│   ├─ BACKFILL origem_lat/lng se nulo (Santa Rosa)          │
│   ├─ BACKFILL destino_lat/lng via knownDestCoords          │
│   ├─ BACKFILL rota_polyline via estimate-return            │
│   └─ status = em_andamento                                 │
│                                                            │
│ App do motorista (qualquer aba/refresh)                    │
│   └─ detecta transporte em_andamento dele                  │
│       └─► startTracking() automático → upsert location     │
│                                                            │
│ Operador vê: ícone do motorista + rota real até o destino  │
└────────────────────────────────────────────────────────────┘
```

### Arquivos a alterar
- `supabase/functions/transport-lifecycle/index.ts` — backfill em `handleStart` (e `handleStartReturn`).
- `supabase/migrations/<novo>.sql` — corrigir as linhas atualmente quebradas.
- `src/pages/TransportsPage.tsx` — auto-retomar tracking se sou o motorista de uma viagem ativa.
- `src/hooks/useLocationTracking.ts` — pequeno helper para retomar a partir do `localStorage`.
- `src/components/TransportDynamicIsland.tsx` — mensagem mais clara quando não há `location` há > 2 min.

### Sem mudanças
- Schema permanece igual (apenas `UPDATE` de dados).
- RLS já está correta (alterada na rodada anterior).
- Sem novas dependências.
