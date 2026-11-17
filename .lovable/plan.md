# Google Agenda: enviar só eventos ligados ao usuário

## Objetivo
O Google Agenda de cada pessoa recebe apenas eventos criados no Fenasoja e vinculados a ela (responsável, comissão dela ou acompanhante do local). Eventos importados de planilha/legados sem vínculo direto (ex.: "Entrega de planos de mídia") nunca são enviados.

## Etapas
1. **Diagnóstico com o Eduardo (eduardo.s.qt@gmail.com)**: listar todos os eventos já enviados ao Google dele e, para cada um, o motivo do envio (responsável, comissão, local, ou regra ampla como "ver todos"/org). Confirmar a causa real antes de mudar a regra.
2. **Nova regra de elegibilidade** (vale para envio inicial, atualizações e reenvios):
   - Entra: evento criado no sistema (não importado) em que a pessoa é responsável, faz parte de comissão vinculada, ou acompanha o local oficial (Casa Fenasoja).
   - Não entra: eventos de importação/planilha ou legados sem responsável/comissão do usuário; visibilidade ampla (admin, "ver todos") não gera envio.
3. **Limpeza no Google do Eduardo**: apagar do calendário dele só os eventos fora da regra e remover os registros de envio correspondentes; manter os corretos (ex.: "Evento Teste Logística").
4. **Varredura geral**: aplicar a mesma limpeza para os demais usuários conectados (Fernanda, Zélia etc.), relatando quantos eventos saem de cada agenda antes de remover.
5. **Teste**: rodar a sincronização do Eduardo, conferir que restam apenas os eventos vinculados; criar/alterar um evento vinculado e confirmar que chega; confirmar que um evento importado não é enviado. Adicionar teste automático da regra.

## Detalhes técnicos
- Ajustar a função de destinatários/elegibilidade usada por `google_sync_outbox` (cronograma) para excluir origem de importação e o critério de visibilidade ampla; identificar o marcador de origem (campo de importação/criador nulo) na etapa 1.
- Limpeza via outbox com operação de exclusão, usando `google_calendar_event_map` — nunca apagar eventos do Google não criados pelo sistema.
- Lembretes push não mudam neste pedido.
- Registrar a regra no `AGENTS.md` da Agenda.
