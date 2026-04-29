## Diagnóstico do problema

Investiguei o transporte do **MARCELO DE BAIRROS** (Santa Rosa → PREFEITO MANTEI → Santa Rosa) e descobri o problema raiz consultando a base.

| Campo | Valor encontrado |
|---|---|
| `motorista_user_id` | MARCELO DE BAIRROS ✅ |
| `tracking_started_by_user_id` | **EDUARDO SANTOS** ❌ |
| `transport_locations.driver_user_id` | **EDUARDO SANTOS** ❌ |

E não foi só esse — os 3 transportes ativos hoje (Marcelo, Micael Böck e Ricardo Carpenedo) estão todos com **EDUARDO SANTOS** como dono do GPS. Ou seja, o Eduardo (operador/coordenador) clicou em "Iniciar viagem" pelo dispositivo dele para as 3 viagens, e o sistema "claimou" a localização do celular dele em vez da dos motoristas reais.

### Causa técnica

Em `TransportsPage.tsx` linha 809, depois de iniciar a viagem o código faz:
```ts
setTrackingTransportId(t.id);
toast.success('Viagem iniciada — localização ativada');
```
**Sem checar se o usuário logado é o motorista designado.** Qualquer pessoa que aperta o botão vira dono do GPS daquela viagem (a função `publish_transport_location` reivindica `tracking_started_by_user_id` na primeira publicação).

A intenção original do produto é clara: a localização exibida no card precisa ser a do motorista que está dirigindo, não a de quem agendou/iniciou a viagem do escritório.

## Correção (3 frentes)

### 1. Limpar o GPS errado dos 3 transportes ativos (migration SQL)

Para cada um dos 3 transportes ativos com tracker errado:
- `DELETE FROM transport_locations WHERE transport_id IN (...)` — remove as coordenadas do Eduardo.
- `UPDATE transports SET tracking_started_by_user_id = NULL, tracking_started_at = NULL WHERE id IN (...)` — libera o slot de GPS para que o motorista correto possa começar a publicar do celular dele.

Isso devolve o estado "aguardando GPS do motorista" — quando Marcelo (e os outros) abrir o app no celular dele, o auto-resume já existente em `TransportsPage.tsx` (linhas 338+) vai iniciar o tracking corretamente, porque ele é o `motorista_user_id`.

### 2. Bloquear publicação de GPS por quem não é o motorista (frontend)

Em `src/pages/TransportsPage.tsx`, no handler que inicia a viagem (próximo da linha 809) e no `useEffect` de auto-resume (linhas 330-334):

```ts
// Só ativa GPS local se o usuário logado for o motorista designado
const isAssignedDriver = t.motorista_user_id === user?.id;
if (isAssignedDriver) {
  setTrackingTransportId(t.id);
  toast.success('Viagem iniciada — localização ativada');
} else {
  toast.success('Viagem iniciada — aguardando GPS do motorista');
}
```

Mesma checagem no `useEffect` linha 330-334 antes de chamar `startTracking()`.

### 3. Defesa em profundidade no banco (migration)

Atualizar `publish_transport_location()` para rejeitar publicações de quem não é o motorista quando há um motorista designado:

```sql
-- dentro de publish_transport_location, antes do "claim ownership":
IF v_transport.motorista_user_id IS NOT NULL 
   AND v_transport.motorista_user_id <> v_user THEN
  RAISE EXCEPTION 'Apenas o motorista designado pode publicar a localização desta viagem';
END IF;
```

Assim, mesmo se o frontend falhar, o backend nunca grava a localização errada. Motoristas continuam podendo iniciar/publicar normalmente; coordenadores apenas agendam e iniciam administrativamente sem virar fonte de GPS.

### Comportamento esperado depois

- O Eduardo (ou qualquer coordenador) pode continuar clicando em "Iniciar viagem" do escritório — só não vira fonte de GPS.
- O Marcelo abre o app no celular dele → auto-resume detecta que ele é o motorista da viagem ativa → reivindica `tracking_started_by_user_id` → coordenadas reais começam a aparecer no card.
- O fluxo de WhatsApp, KM automático, retorno e demais lógicas seguem inalterados.

## Arquivos afetados

- **Nova migration SQL**: limpeza dos 3 transports + atualização de `publish_transport_location`.
- **`src/pages/TransportsPage.tsx`**: checagem `motorista_user_id === user?.id` antes de `setTrackingTransportId` no `startActive` e no `useEffect` de auto-start.

Nenhuma outra parte do fluxo (lifecycle, WhatsApp, KM, retorno) é tocada.
