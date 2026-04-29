## Diagnóstico

### 1. Texto da origem
Os dois transportes ativos têm `origem = "Parque de Exposições Alfredo Leandro Carlson"`. Você pediu para mostrar como **"Santa Rosa"** (ou "Parque de Exposições — Santa Rosa"). As coordenadas (`-27.83889, -54.46778`) continuam corretas — só o **rótulo** muda.

### 2. KM não estão sincronizados
Verifiquei o estado real no banco:

| Transporte | Veículo | km_retirada | km_devolucao | vehicle_usage |
|---|---|---|---|---|
| Santa Rosa → Passo Fundo (chegou_destino) | T CROSS IZT7H43 | **NULL** | NULL | nenhum |
| Santa Rosa → Chapecó (em_andamento) | T CROSS TQX7C18 | **NULL** | NULL | nenhum |

Os transportes foram criados sem informar `km_retirada`. Por isso **nada chegou em "Veículos"** — o sistema só registra `vehicle_usage` quando AMBOS `km_saida` e `km_chegada` são fornecidos manualmente no formulário ao concluir.

Hoje o fluxo de KM depende 100% de digitação manual no formulário de transporte. Não há sincronização automática a partir de:
- `distancia_estimada_km` (já temos: 560 km Passo Fundo, 630 km Chapecó — ida+volta)
- KM do veículo (`vehicles.km_atual`) na hora de iniciar
- Chegada / retorno calculados pela rota

## Plano

### Parte A — Renomear origem (cosmético, só texto)

UPDATE pontual nos dois transportes:
- `origem = 'Santa Rosa'` (mais limpo nos cards/PDF; as coordenadas continuam apontando para o Parque)

Sem mudança em código nem em rota — coordenadas e polylines permanecem como estão.

### Parte B — Sincronização automática de KM ida/volta (vale para TODOS os transportes com veículo)

**Princípio:** quando o transporte tem `vehicle_id`, o sistema captura odômetro e gera `vehicle_usage` automaticamente em cada fase do ciclo, sem depender de digitação.

#### B.1 — Captura automática de `km_retirada` no Iniciar viagem
Em `transport-lifecycle/index.ts → handleStart`:
- Se `transport.km_retirada IS NULL` E `transport.vehicle_id IS NOT NULL`:
  - Buscar `vehicles.km_atual` do veículo
  - Se `km_atual > 0`, gravar `transports.km_retirada = vehicles.km_atual`
- Garante que toda viagem com carro saia com odômetro de partida registrado.

#### B.2 — Estimar `km ida` ao chegar no destino
Em `handleArriveDestination`:
- Calcular `km_ida_estimado = round(distancia_estimada_km / 2)` (porque `distancia_estimada_km` armazena ida+volta)
- Se houver `km_retirada` E `vehicle_id`:
  - `km_chegada_destino = km_retirada + km_ida_estimado`
  - Inserir registro intermediário em `vehicle_usage` representando a perna de **ida**:
    ```
    km_saida = km_retirada
    km_chegada = km_chegada_destino
    devolucao_em = chegada_destino_em
    observacoes = 'Ida automática — transporte <id>'
    ```
  - `UPDATE vehicles SET km_atual = km_chegada_destino`
- Resultado: assim que o motorista clica "Cheguei", a quilometragem da ida cai em **Veículos** automaticamente.

#### B.3 — Estimar `km_devolucao` ao concluir o retorno
Em `handleCompleteReturn`:
- Se `km_devolucao` não foi informado manualmente E há `vehicle_id` E há `km_retirada`:
  - `km_devolucao = km_retirada + distancia_estimada_km` (ida + volta total)
  - Inserir registro de **volta** em `vehicle_usage`:
    ```
    km_saida = km_chegada_destino (do passo B.2)
    km_chegada = km_devolucao
    devolucao_em = fim_retorno_em
    observacoes = 'Volta automática — transporte <id>'
    ```
  - `UPDATE vehicles SET km_atual = km_devolucao`
  - `UPDATE transports SET km_devolucao = ...`

#### B.4 — Fallback para "somente ida"
Quando o transporte é marcado `somente_ida` e concluído manualmente, aplicar a mesma lógica B.3 mas usando apenas `km_ida_estimado`.

#### B.5 — Backfill imediato dos dois transportes ativos
Como você quer ver a KM de **Passo Fundo** já em Veículos:
- Para o transporte de Passo Fundo (`chegou_destino`):
  - `km_retirada = vehicles.km_atual` atual (se 0, deixa 0 como base e calcula a partir daí)
  - Inserir `vehicle_usage` da ida com `km_saida = km_retirada`, `km_chegada = km_retirada + 280` (560/2)
  - `UPDATE vehicles SET km_atual = km_retirada + 280`
- Para o transporte de Chapecó (`em_andamento`):
  - Apenas gravar `km_retirada = vehicles.km_atual` (4409). A perna de ida só será registrada quando ele clicar "Cheguei".

## Detalhes técnicos

### Arquivos
- `supabase/functions/transport-lifecycle/index.ts` — adicionar lógica B.1, B.2, B.3, B.4 nos handlers `handleStart`, `handleArriveDestination`, `handleCompleteReturn`
- Migração SQL única para Parte A (rename) + Parte B.5 (backfill dos 2 transportes)

### SQL
```sql
-- Parte A: renomear origem (mantém coords)
UPDATE public.transports
   SET origem = 'Santa Rosa', updated_at = now()
 WHERE id IN (
   '9da9dd3c-1a40-4f1e-8a82-596505f34d3a',
   'f7833513-6bcb-4df7-8123-dcb072eea04d'
 );

-- Parte B.5: backfill Passo Fundo (já chegou no destino)
UPDATE public.transports
   SET km_retirada = 0
 WHERE id = '9da9dd3c-1a40-4f1e-8a82-596505f34d3a' AND km_retirada IS NULL;

INSERT INTO public.vehicle_usage (org_id, vehicle_id, responsavel_user_id, km_saida, km_chegada, retirada_em, devolucao_em, observacoes)
SELECT org_id, vehicle_id, motorista_user_id, 0, 280, inicio_real_em, chegada_destino_em,
       'Ida automática (backfill) — transporte ' || id
  FROM public.transports
 WHERE id = '9da9dd3c-1a40-4f1e-8a82-596505f34d3a';

UPDATE public.vehicles SET km_atual = 280
 WHERE id = 'f8a51a52-1204-4f8e-ac10-97c572c79448';

-- Parte B.5: backfill Chapecó (ainda em andamento — só registra km_retirada)
UPDATE public.transports
   SET km_retirada = 4409
 WHERE id = 'f7833513-6bcb-4df7-8123-dcb072eea04d' AND km_retirada IS NULL;
```

### Resultado esperado
- **Cards/PDF**: origem aparece como "Santa Rosa" nos dois transportes.
- **Veículos**: T CROSS IZT7H43 passa a mostrar 280 km rodados (ida Passo Fundo) imediatamente. Quando o motorista concluir a volta, somam-se mais 280 km.
- **Daqui pra frente**: qualquer transporte com `vehicle_id` capta `km_retirada` automaticamente do `vehicles.km_atual` ao iniciar, gera lançamento de ida ao chegar no destino, e fecha com lançamento de volta ao concluir o retorno — sem digitação manual.
- **Compatibilidade**: se o usuário digitar `km_retirada`/`km_devolucao` manualmente no formulário, o valor manual prevalece (lógica condicional `IS NULL`).
