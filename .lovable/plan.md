## Diagnóstico

Confirmei no banco que **nenhuma viagem ativa** tem `tracking_device_id` ou `tracking_started_by_user_id` preenchidos:

| Viagem | Motorista | Status | Owner GPS |
|---|---|---|---|
| Vladimir → Passo Fundo | VLADIMIR | em_retorno | (vazio) |
| Ricardo C. → Santo Ângelo | RICARDO C. | em_andamento | (vazio) |
| Lucas → Chapecó | LUCAS | chegou_destino | (vazio) |
| Marcelo → PREFEITO MANTEI | MARCELO | chegou_destino | (vazio) |
| Micael → Santo Ângelo | MICAEL | chegou_destino | (vazio) |

A tabela `transport_locations` está vazia para essas viagens.

### Causa raiz

O hook `useLocationTracking` só chama `startTracking()` quando `trackingTransportId` está preenchido (linha 330-334 de `TransportsPage.tsx`). E `trackingTransportId` só é preenchido por **3 caminhos**:

1. **Auto-resume**: o usuário **já era dono** (`tracking_started_by_user_id === user.id`) — circular, depende de já ter publicado antes.
2. **Cache local**: o usuário precisou já ter clicado uma vez nesse navegador.
3. **Clique manual** em algum botão (não óbvio para o motorista).

Como nenhum motorista nunca foi “marcado dono” no banco (depende do primeiro publish, e o publish depende do tracking estar rodando), o ciclo nunca começa. Resultado: motoristas abrem o app e o GPS **nunca arma** sozinho — por isso o mapa ao vivo nunca aparece, nem na ida nem na volta.

## Correção proposta

Fazer o tracking **armar automaticamente** assim que o motorista designado abre o app e existe uma viagem ativa atribuída a ele, sem depender do estado do banco.

### 1. `src/pages/TransportsPage.tsx` — auto-claim por motorista designado

Adicionar uma 4ª regra no `useEffect` de auto-resume, antes da regra do cache local:

- Se existir uma viagem em status ativo (`em_andamento`, `em_retorno`, `chegou_destino`) **com `motorista_user_id === user.id`** **e** o GPS ainda não pertence a outro usuário (ou já é nosso, ou está vazio), seleciona ela como `trackingTransportId` automaticamente.
- Critério de desempate quando há mais de uma: prioridade `em_retorno` → `em_andamento` → `chegou_destino`, depois `inicio_em` mais recente.
- Se já existir owner em outro user (`tracking_started_by_user_id !== user.id` e `!= null`), **não** tenta — respeita o motorista atual.

Isso garante que Vladimir abrindo o app vê o GPS dele iniciar sozinho na viagem em retorno; Ricardo C. abrindo vê iniciar na ida dele; etc.

### 2. `src/components/TransportDynamicIsland.tsx` — botão visível “Iniciar GPS”

Hoje o aviso “Aguardando o motorista abrir o app…” aparece para os observadores, mas o motorista designado vendo o próprio card não tem um CTA óbvio caso o auto-arm falhe (permissão negada antes, etc.). Adicionar:

- Se `t.motorista_user_id === user.id` **e** `!isMyTracking` **e** status ativo → mostrar botão “Iniciar meu GPS desta viagem” que chama `setTrackingTransportId(t.id, t.fase_atual)`.
- Mantém o aviso atual para os outros usuários.

### 3. Resetar tracking ao trocar de viagem ativa

No mesmo `useEffect` de auto-resume, se o motorista já está com `trackingTransportId = A` mas A já não é mais ativa (concluída/cancelada) e existe outra viagem ativa B atribuída a ele, trocar de A → B (o singleton `locationTracker.start()` já trata o swap limpamente).

### 4. Sem mudanças de banco/RLS

O backend já está correto:
- `publish_transport_location` valida motorista designado e device_id
- `arrive_destination` e `start_return` já limpam `tracking_*` para a próxima fase reivindicar limpo
- `reset_transport_tracking` está disponível como auxiliar

## Arquivos a alterar

- `src/pages/TransportsPage.tsx` — nova regra de auto-arm para motorista designado + swap entre viagens
- `src/components/TransportDynamicIsland.tsx` — CTA “Iniciar meu GPS” para o motorista quando o auto-arm não disparou

## Resultado esperado

Após a mudança:
- **Vladimir** abrindo o app → GPS arma automaticamente na viagem Santa Rosa→Passo Fundo (em_retorno) → mapa ao vivo aparece para todo mundo.
- **Ricardo C., Lucas, Marcelo, Micael** abrindo cada um o app → cada um arma na própria viagem, sem misturar.
- Quem **não é o motorista** continua vendo apenas o mapa ao vivo (read-only) via `useTransportLocation`, sem nunca publicar.
