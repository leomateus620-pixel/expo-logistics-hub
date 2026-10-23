# Cancelamento de evento — Restaurante e Arena

## O que muda para o usuário
1. **Edição do evento, aba "Evento" (primeira parte)**: novo bloco "Situação do evento" logo abaixo da identificação, com escolha **Ativo / Cancelado**.
   - Ao marcar **Cancelado**, aparece o campo obrigatório "Motivo do cancelamento" (mínimo 8 caracteres) e um aviso vermelho explicando que o evento sai da ocupação e não pode ser reaberto.
   - O bloco só aparece para quem tem permissão de cancelar; os demais veem o status somente leitura.
   - Na aba "Revisão", o resumo mostra o cancelamento em destaque antes de salvar.
2. **Ao salvar**: as alterações do evento são gravadas e, em seguida, o cancelamento é aplicado pelo mesmo fluxo oficial já existente (que registra histórico, libera o espaço, cancela contrapartidas e dispara avisos/Google Agenda). Se o cancelamento falhar, as demais edições continuam salvas e a mensagem de erro é exibida.
3. **Card vermelho bem destacado**:
   - Na **Agenda** (lista do print): o card do evento cancelado fica com borda e faixa vermelhas, selo "CANCELADO", título riscado levemente e o motivo em uma linha.
   - No **detalhe do evento**: faixa vermelha no topo "Evento cancelado" com motivo, data e quem cancelou.
   - Mesmo destaque nos cards da lista de Eventos e Visão geral.

## Regras
- Cancelamento é definitivo (regra atual do sistema: evento cancelado ou concluído não volta a ser editado).
- Eventos já concluídos não exibem a opção.
- Nenhuma mudança no banco: o status "cancelado", o motivo e a permissão já existem.

## Detalhes técnicos
- `VenueEventFormDialog.tsx`: estado `cancelRequested` + `cancelReason` no passo "Evento"; validação; após `save` bem-sucedido chama a transição existente `cancel` (mesma função usada pelo botão de ação em `VenueEventDetail.tsx`), com `venue_events_cancel` checado via permissões já carregadas.
- `VenueEventCard.tsx` / card da agenda em `VenueWorkspace.tsx`: variante `cancelled` usando tokens `destructive` (sem cores fixas); motivo lido do último registro de transição/campo de motivo já retornado.
- `VenueEventDetail.tsx`: banner de cancelamento no topo.
- CSS em `venue-events-detail.css` com tokens semânticos.
- Teste: validação do motivo (vazio/curto bloqueia; 8+ libera) e que eventos concluídos não oferecem cancelamento.
