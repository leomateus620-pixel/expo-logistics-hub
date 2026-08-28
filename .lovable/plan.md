# Agenda FenaSoja — mês atual, conclusão em cascata e plano do subevento

## 1. Linha do tempo abrindo setembro em vez de agosto

Verificado no app real (carregamento limpo, sem parâmetros na URL, hoje = 28/08/2026):
agosto de 2026 existe na linha do tempo com 6 eventos (28, 28, 28, 30, 30, 31/08),
mas o mês em foco e expandido é setembro de 2026 — agosto aparece recolhido, apenas
com o selo "MÊS ATUAL".

O foco inicial é definido em `useTimelineCycleNavigation` enquanto a lista de eventos
ainda não terminou de carregar; nesse momento agosto ainda não está na lista e o foco
cai no primeiro mês disponível. Quando os dados completos chegam, a reconciliação é
abortada porque o mês já focado (setembro) continua sendo um mês válido — o mês
corrente nunca é recuperado.

Correção:

- Em `useTimelineCycleNavigation`, marcar quando o posicionamento inicial foi feito
  com a lista ainda vazia/parcial; ao chegar o primeiro conjunto real de meses,
  reposicionar usando `initialMonth` (que já prioriza o mês corrente), sem sobrescrever
  navegação feita pelo usuário nem deep-link de `timelineYear`/`timelineMonth`.
- Garantir que o mês corrente, quando tiver eventos na visão, entre expandido por
  padrão (hoje só o mês focado abre).
- Manter o mesmo comportamento na versão mobile (`MobileCronogramaTimeline`) e nas
  visões Timeline e Concluídos.
- Validar com Playwright: carga limpa em desktop e mobile deve focar/expandir
  `2026-08`; "Ir para hoje", troca de ano e links diretos continuam funcionando.

## 2. Concluir o evento conclui os subeventos

Hoje o status do evento é salvo por `cronograma_save_event` e os subeventos ficam em
`cronograma_subeventos` com status próprio, sem qualquer vínculo.

- Migration: quando o evento passa a `concluido`, todos os subeventos que não estejam
  `cancelado` passam a `concluido` (mesma transação, via trigger de atualização na
  tabela de eventos, preservando o log em `cronograma_evento_logs`).
- As ações programadas e as providências desses subeventos também são marcadas como
  concluídas, para o rundown ficar coerente.
- Reverter o evento para outro status não reabre os subeventos automaticamente
  (evita apagar trabalho já registrado).
- No cliente, após concluir um evento, a atualização otimista já reflete os subeventos
  concluídos antes do refetch.

## 3. Novo visual das Ações programadas e Estrutura e providências

Reescrita da apresentação em `SubeventPlanRundown` + estilos em
`cronograma-plan-builder.css`, usada no `EventDrawer` e na tela mobile do evento:

- Blocos separados com cabeçalho próprio (ícone + título + contador, ex.: "6 ações",
  "8 de 12 providências"), superfície de cartão clara e borda sutil no padrão navy/ouro.
- **Ações programadas**: trilha vertical com marcador por item, horário em coluna fixa
  tabular destacada, título em peso forte e responsável/comissão como metadado
  secundário; item concluído usa marcador preenchido e texto atenuado.
- **Estrutura e providências**: lista com caixa de verificação visual (ícone de
  concluído/pendente), descrição legível e responsável ao lado; barra de progresso
  fina no cabeçalho do bloco.
- Remoção do risco (`line-through`) que hoje corta o texto inteiro — que é justamente
  a "linha em cima da visualização" reportada; o estado concluído passa a ser
  comunicado por ícone, cor e opacidade, mantendo o texto legível.
- Convidados ganham chips mais compactos e consistentes com o restante.
- Responsivo: no mobile, horário acima do título e metadados abaixo, sem rolagem
  horizontal.

## Detalhes técnicos

- Arquivos: `src/hooks/useTimelineCycleNavigation.ts`,
  `src/components/cronograma-eventos/CronogramaTimelineBoard.tsx`,
  `src/components/cronograma-eventos/mobile/MobileCronogramaTimeline.tsx`,
  `src/components/cronograma-eventos/workspace/SubeventPlanRundown.tsx`,
  `src/styles/cronograma-plan-builder.css`, hook `useCronogramaEventos.ts` e uma
  migration no banco.
- Sem mudança de contrato de dados no cliente: os campos `status`, `actions[].isDone`
  e `provisions[].isDone` já existem.
- Validação: testes existentes de cronograma (`src/test/cronogramaTimeline.test.tsx`)
  mais checagem visual via Playwright em 1440px e 390px, sem erros de console.
