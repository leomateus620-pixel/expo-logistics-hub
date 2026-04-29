## Problema

O backend já registra três timestamps no ciclo de vida da viagem:

- `chegada_destino_em` — quando o motorista clica "Cheguei no destino"
- `inicio_retorno_em` — quando inicia a viagem de volta
- `fim_retorno_em` — quando finaliza o retorno (igual a `fim_real_em`)

Porém, **nenhum desses três campos é renderizado** no card de detalhes do transporte, na Dynamic Island ou no PDF gerado. O usuário só vê "Iniciado em" e "Concluído em" (a partir de `inicio_real_em` / `fim_real_em`), o que faz parecer que a chegada e o retorno não estão sendo capturados.

## Solução

Mostrar os horários reais de chegada e início do retorno em todos os pontos de exibição da viagem, sem alterar o backend (já está correto).

### 1. `src/components/transport/TransportDetailView.tsx` — Bloco "Histórico"

Atualizar a timeline para incluir os novos marcos cronológicos, exibindo cada um somente quando existir:

```text
• Criado em ...
• Iniciado (ida) em {inicio_real_em}
• Chegou no destino em {chegada_destino_em}     ← novo (cor âmbar)
• Iniciou viagem de volta em {inicio_retorno_em} ← novo (cor índigo)
• Finalizado em {fim_retorno_em || fim_real_em}
```

Também ajustar a condição que mostra/oculta o bloco para considerar `chegada_destino_em` e `inicio_retorno_em`.

### 2. `src/components/TransportDynamicIsland.tsx` — Estado "Chegou no destino"

Hoje só aparece "Concluído às HH:MM" quando `isDone`. Adicionar dois badges análogos:

- Quando `t.status === 'chegou_destino'` e `t.chegada_destino_em` existir → badge âmbar:  
  "Chegou ao destino às HH:MM"
- Quando `t.status === 'em_retorno'` e `t.inicio_retorno_em` existir → badge índigo:  
  "Retorno iniciado às HH:MM"

Renderizados acima do bloco de "Actions", no mesmo padrão visual do badge "Concluído às".

### 3. `src/pages/TransportsPage.tsx` — `generatePDF`

Acrescentar linhas no PDF logo após "Saída" / "Devolução", condicionalmente:

```text
Chegada no destino: {chegada_destino_em formatado pt-BR}
Início do retorno:   {inicio_retorno_em formatado pt-BR}
Fim do retorno:      {fim_retorno_em formatado pt-BR}
```

Mantendo o mesmo formato `<div class="row">` já existente.

### 4. Verificação rápida

Após a alteração, validar via `supabase--read_query` que o transporte de teste citado pelo usuário (Santa Rosa → Passo Fundo → Santa Rosa, 29/04) tem `chegada_destino_em` preenchido, garantindo que o problema era apenas de renderização. Se algum registro antigo estiver `NULL` (porque chegou ao destino antes da feature ser introduzida), o bloco simplesmente não exibirá a linha — comportamento correto.

## Arquivos modificados

- `src/components/transport/TransportDetailView.tsx`
- `src/components/TransportDynamicIsland.tsx`
- `src/pages/TransportsPage.tsx`

Sem migração de banco, sem alteração de RLS, sem alteração de Edge Functions.
