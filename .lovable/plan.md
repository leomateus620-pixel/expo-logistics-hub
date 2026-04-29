# Corrigir origem da viagem de retorno

## Problema diagnosticado

Os dois transportes em curso têm `origem_lat = -27.8708` e `origem_lng = -54.4814` — coordenadas genéricas do **centro de Santa Rosa**, não do **Parque de Exposições Alfredo Leandro Carlson**, que é a origem real informada pelo usuário.

Quando o motorista clica em "Iniciar Viagem de Volta", o `TransportDynamicIsland` usa `origem_lat/lng` como destino do retorno. Hoje, essa rota termina no centro da cidade — errado. O destino do retorno deve ser o **Parque de Exposições**.

Para os demais transportes, o fluxo já está correto: usa `origem_lat/lng` armazenado no momento do cadastro, então ida (motorista → destino) e volta (motorista → origem) funcionam normalmente sem alteração.

## Plano

### 1. Migração SQL — corrigir geodata dos dois transportes específicos
Atualizar apenas os dois transportes citados (IDs `9da9dd3c-...` Passo Fundo e `f7833513-...` Chapecó) com as coordenadas reais do **Parque de Exposições Alfredo Leandro Carlson, Santa Rosa/RS**:

- `origem_lat = -27.83889`
- `origem_lng = -54.46778`
- `origem = 'Parque de Exposições Alfredo Leandro Carlson'`
- `rota_polyline_volta = NULL` (força recálculo da rota de volta via Google Routes)
- `rota_polyline = NULL` (força recálculo da rota de ida durante a fase atual também, garantindo coerência)

Coordenadas obtidas do endereço público do parque em Santa Rosa/RS (Av. Inconfidência / saída para Tuparendi).

### 2. Sem mudanças na lógica do app
A lógica em `TransportDynamicIsland.tsx` já está correta:
- Na fase `em_retorno`, o `destCoords` aponta para `origem_lat/lng` do transporte.
- O `useTransportLocation` continua puxando a posição ao vivo do motorista que iniciou a viagem (ownership já implementado).
- A Edge Function `estimate-return` recebe `destination: t.origem` e recalcula a rota até o parque assim que `rota_polyline_volta` está vazio.

Isso garante que:
- **Esses dois transportes**: ao iniciar volta, mapa traça rota da posição atual do motorista (ex.: Passo Fundo / Chapecó) até o Parque de Exposições em Santa Rosa.
- **Demais transportes**: continuam usando a `origem_lat/lng` cadastrada normalmente, sem qualquer interferência.

### 3. Remover fallback genérico `SANTA_ROSA` do componente
Em `TransportDynamicIsland.tsx`, hoje há um fallback hardcoded para o centro de Santa Rosa quando `origem_lat/lng` está nulo. Vamos manter esse fallback (não atrapalha), mas adicionar um log silencioso quando ele for usado, para detectar futuros transportes mal cadastrados. Nenhuma mudança visual.

## Detalhes técnicos

### Arquivos
- **`supabase/migrations/<timestamp>_fix_origem_parque_exposicoes.sql`** (novo) — UPDATE pontual nos dois IDs.
- **`src/components/TransportDynamicIsland.tsx`** — apenas log de aviso quando cair no fallback.

### SQL da migração
```sql
UPDATE public.transports
   SET origem = 'Parque de Exposições Alfredo Leandro Carlson',
       origem_lat = -27.83889,
       origem_lng = -54.46778,
       rota_polyline_volta = NULL,
       rota_polyline = NULL,
       updated_at = now()
 WHERE id IN (
   '9da9dd3c-1a40-4f1e-8a82-596505f34d3a',
   'f7833513-6bcb-4df7-8123-dcb072eea04d'
 );
```

### Resultado esperado
- Transporte Passo Fundo (`chegou_destino`): ao clicar em "Iniciar Viagem de Volta", o mapa abre com rota viva de Passo Fundo até o Parque de Exposições em Santa Rosa.
- Transporte Chapecó (`em_andamento`): ao chegar no destino e iniciar o retorno, o mapa abre com rota viva de Chapecó até o Parque de Exposições.
- Todos os outros transportes seguem inalterados.
