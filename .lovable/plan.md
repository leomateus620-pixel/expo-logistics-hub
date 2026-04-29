
## Diagnóstico end-to-end

Investiguei a viagem ativa Santa Rosa → Passo Fundo (id `9da9dd3c…`, motorista `007f3fa7…`) e encontrei a causa raiz no banco:

```text
transports.motorista_user_id  = 007f3fa7…   (motorista atual, iniciou hoje 07:36)
transport_locations.driver_user_id = b664fc22…   (motorista DIFERENTE)
transport_locations.updated_at = 29/04 01:10  (≈6h ANTES de iniciar)
transport_locations.created_at = 08/04        (registro de 3 semanas atrás!)
```

Ou seja, existe uma linha **fantasma** em `transport_locations` desta viagem, gravada por outro motorista em uma execução anterior, que nunca foi removida. Por isso o ícone do carro fica "travado" no mesmo ponto e a navegação puxa um destino/posição que não corresponde ao motorista real.

### Por que o motorista atual não consegue sobrescrever

`useLocationTracking.updateLocation` faz:
```ts
.upsert({...}, { onConflict: 'transport_id' })
```

Como já existe linha com `transport_id` igual, o Postgres tenta `UPDATE`. Mas a política RLS é:
```
UPDATE: driver_user_id = auth.uid()
```
A linha pertence ao motorista B, então o UPDATE atinge **0 linhas** — silenciosamente, sem erro de rede. Resultado: o GPS do motorista A nunca grava, e o app continua lendo as coordenadas velhas do motorista B.

### Por que isto aconteceu

`handleStart` no edge function `transport-lifecycle` **não limpa** `transport_locations` ao iniciar a viagem (só `complete_return` deleta). Se a mesma viagem já tiver sido iniciada antes por outro motorista (teste, simulação, troca de motorista, etc.), a linha antiga sobrevive e bloqueia o novo motorista.

---

## Correção proposta

### 1. Edge function `transport-lifecycle` — limpar localização ao iniciar
Em `handleStart` (e por simetria em `handleStartReturn`), deletar a linha residual antes de marcar como `em_andamento`:
```ts
await admin.from('transport_locations').delete().eq('transport_id', id);
```
Isso garante que cada nova viagem começa com tracking limpo, independentemente de quem iniciou antes.

### 2. Hook `useLocationTracking` — fallback robusto no upsert
Substituir o `upsert` por uma estratégia tolerante:
- Tentar `update` primeiro (mais comum no caso normal).
- Se afetar 0 linhas (RLS, troca de motorista, ou linha inexistente), fazer `delete` + `insert` para sobrescrever o dono.

```ts
const { data: updated } = await supabase
  .from('transport_locations')
  .update({ latitude, longitude, accuracy, speed, heading, driver_user_id: u.id, updated_at: new Date().toISOString() })
  .eq('transport_id', tid)
  .eq('driver_user_id', u.id)
  .select('transport_id');

if (!updated || updated.length === 0) {
  await supabase.from('transport_locations').delete().eq('transport_id', tid);
  await supabase.from('transport_locations').insert({ transport_id: tid, org_id: oid, driver_user_id: u.id, latitude, longitude, accuracy, speed, heading });
}
```
Para o `delete` funcionar mesmo quando a linha pertence a outro motorista, precisamos relaxar a política — ver passo 3.

### 3. Política RLS de `transport_locations` (migração)
Permitir que membros da org com permissão de operação substituam a localização da viagem (não só o "dono" da linha). A regra continua segura: a linha sempre carrega `driver_user_id = auth.uid()` no insert.

```sql
DROP POLICY IF EXISTS location_delete ON public.transport_locations;
CREATE POLICY location_delete ON public.transport_locations
  FOR DELETE USING (
    is_org_member(auth.uid(), org_id)
    AND (
      driver_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.transports t
        WHERE t.id = transport_id AND t.motorista_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS location_update ON public.transport_locations;
CREATE POLICY location_update ON public.transport_locations
  FOR UPDATE USING (
    is_org_member(auth.uid(), org_id)
    AND (
      driver_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.transports t
        WHERE t.id = transport_id AND t.motorista_user_id = auth.uid()
      )
    )
  );
```

### 4. Recuperação imediata da viagem em curso
Apagar agora, via migração one-shot, a linha fantasma para que o motorista atual comece a gravar:
```sql
DELETE FROM public.transport_locations
WHERE transport_id = '9da9dd3c-1a40-4f1e-8a82-596505f34d3a';
```
Assim que o app do motorista voltar a enviar GPS (próximo `watchPosition`), a posição correta aparece no mapa, e o `estimate-return` passará a calcular ETA a partir de onde ele realmente está.

---

## Arquivos modificados
- `supabase/functions/transport-lifecycle/index.ts` — limpar `transport_locations` em `handleStart` e `handleStartReturn`.
- `src/hooks/useLocationTracking.ts` — `updateLocation` com `update → delete+insert` como fallback.
- Nova migração SQL — relaxar policies de UPDATE/DELETE em `transport_locations` e remover a linha fantasma da viagem ativa.

## O que o usuário verá após o deploy
- Mapa do motorista atual passa a mostrar a posição real em ≤ 15 s (próximo tick do `watchPosition`).
- ETA recalculada com base na localização verdadeira.
- Em viagens futuras, qualquer rastro residual é sempre limpo no momento de "Iniciar viagem".
