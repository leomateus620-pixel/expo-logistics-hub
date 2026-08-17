# Fenasoja Meeting — limpeza visual da Inteligência de Reunião

Ajuste apenas de apresentação (front-end). Nenhum fluxo de captura, transcrição, finalização, ata ou permissão é alterado.

## Mudanças

1. **Nome padrão**
   - O cabeçalho passa a exibir **Fenasoja Meeting** no lugar de "Ata vinculada à Agenda FENASOJA".
   - Eyebrow encurtada para "Inteligência de reunião" em caixa alta discreta, sem competir com o título.

2. **Remoção de textos poluentes**
   - Sai a descrição "Capture, organize decisões e acompanhe responsabilidades com evidência."
   - Sai o aviso "A FENASOJA guarda apenas transcrição, atas e itens estruturados. Não existe áudio histórico, player, download ou retranscrição posterior."
   - A frase de consentimento permanece (é requisito legal do fluxo), reescrita mais curta: "Confirmo que todos os participantes foram informados e consentiram com a transcrição."
   - A mensagem de indisponibilidade continua, porém condensada em uma linha.

3. **Diagnóstico técnico sai da interface**
   - O painel "Diagnóstico técnico da captura" deixa de ser renderizado.
   - A instrumentação continua ativa em memória (`meetingDiagnostics`) e continua sendo enviada junto aos erros, apenas sem UI visível. Nenhuma coleta é removida.

4. **Layout e tipografia (desktop)**
   - Cabeçalho em linha única: marca + título + estado + ação, com alinhamento vertical central e espaçamento consistente.
   - Blocos com hierarquia clara: Sessão → Captura → Histórico → Detalhe, separados por espaçamento em vez de caixas empilhadas.
   - Escala tipográfica reduzida e regular: eyebrow 11px/letter-spacing, título 16–18px semibold, corpo 13–14px, sem textos em verde sobre verde.
   - Cronômetro e medidor de áudio agrupados em uma faixa única alinhada à esquerda; métricas (microfone, backlog, rede) em grade de 3 colunas compacta.
   - Botão principal deixa de ocupar 100% da largura no desktop; largura automática alinhada à direita da área de consentimento.

5. **Mobile**
   - Cabeçalho quebra em duas linhas (marca + título / ação), sem truncamento do nome do evento.
   - Métricas passam a coluna única; controles (Pausar / Retomar / Finalizar / Cancelar) em grade 2 colunas com alvo de toque de 44px.
   - Área de transcrição ao vivo com altura limitada e rolagem própria, evitando empurrar os controles para fora da tela.

## Detalhes técnicos

- `AgendaMeetingWorkspace.tsx`: apenas troca de strings, remoção do `<MeetingDiagnosticsPanel />` e reorganização de wrappers/classes.
- `MeetingDiagnosticsPanel.tsx`: deixa de ser importado (arquivo mantido para uso interno/futuro); `meetingDiagnostics` continua registrando eventos.
- `src/styles/agenda-meeting-intelligence.css`: refino de grid, tipografia, espaçamento e media queries (<= 899px).
- Nenhuma alteração em hooks de captura, edge functions, contratos ou banco.
