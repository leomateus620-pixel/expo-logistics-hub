# Motivo padrão "Cancelado pelo requerente"

## O que muda
- Ao ligar "Cancelar evento" na edição, o campo de motivo já aparece preenchido com **CANCELADO PELO REQUERENTE** (editável).
- Se o usuário desligar e ligar de novo, o texto padrão volta caso o campo esteja vazio.
- Ao salvar, o cancelamento é registrado com esse motivo e o card vermelho do evento, o detalhe e a revisão já mostram "CANCELADO PELO REQUERENTE".

## Detalhes técnicos
- `src/lib/venue-cancellation.ts`: exportar `DEFAULT_CANCEL_REASON = "CANCELADO PELO REQUERENTE"` (24 caracteres, passa na regra mínima de 8).
- `VenueEventFormDialog.tsx`: no `onCheckedChange` do Switch, quando ativar e `cancelReason.trim()` vazio, `setCancelReason(DEFAULT_CANCEL_REASON)`.
- Após salvar, invalidar/atualizar a lista para o card refletir imediatamente (verificar que a transição já faz refetch).
- Teste: motivo padrão é válido em `validateCancellationReason`.
