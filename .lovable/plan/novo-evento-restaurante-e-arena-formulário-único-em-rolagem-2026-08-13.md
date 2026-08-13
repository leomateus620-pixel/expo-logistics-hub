# Novo evento (Restaurante e Arena) — formulário único em rolagem

Substituir o assistente de 4 etapas por uma única tela de cadastro, contínua, com seções bem definidas, menos campos e um visual operacional refinado. A interface permanece em português.

## Estrutura da nova tela

Rolagem única com cinco seções:

1. **Identificação do evento** — Título, Tipo, Descrição executiva, Espaço (já definido pelo ambiente ativo), Área solicitada (somente Arena).
2. **Data e ocupação** — Data e horário de início/término, Montagem e Desmontagem.
3. **Vínculos** — Solicitante (automático), Responsável Fenasoja (Roque Vanderlei Lugoch), Comissão ou Assessoria responsável, Patrocinador ou parceiro.
4. **Operação e observações** — um único campo de texto livre para requisitos operacionais.
5. **Revisão e disponibilidade** — resumo final e conflitos, na mesma rolagem.

Rodapé fixo com **Criar evento** (e **Cancelar**), sempre visível no desktop e no mobile.

## Campos removidos da tela de cadastro

- Reserva preliminar sem data definida
- Capacidade dos espaços ("até 5.000 pessoas" / "até 600 pessoas")
- Público estimado, Público-alvo, Prioridade, Equipe Fenasoja de apoio
- Grade completa de "Recursos necessários" (mesas, cadeiras, som, limpeza, etc.)

Esses dados continuam existindo no banco; passam a ser gravados com valores padrão (prioridade média, visibilidade institucional, sem recursos, sem reserva preliminar) para não quebrar registros existentes nem a validação de disponibilidade.

## Comportamento por ambiente

- Agenda Restaurante: espaço Restaurante já selecionado; campo "Área solicitada" não é renderizado.
- Agenda Arena: espaço Arena já selecionado; "Área solicitada" disponível.
- O ambiente ativo aparece como um selo discreto no topo do formulário, não como grade de escolha com capacidades.

## Vínculos

- **Solicitante**: preenchido automaticamente com o nome real do usuário autenticado, exibido como informação confirmada (não um input vazio).
- **Responsável Fenasoja**: Roque Vanderlei Lugoch como padrão, apresentado de forma clara; ainda alterável quando houver permissão.
- Comissão/Assessoria e Patrocinador permanecem como seletores.

## Revisão e disponibilidade

- Resumo compacto: evento, espaço, data e horário, solicitante, responsável Fenasoja, comissão (se houver), patrocinador (se houver), observações.
- Verificação de disponibilidade continua sendo feita no servidor; ao alterar data/horário/espaço, a revisão é recalculada automaticamente sem sair da tela.
- Conflitos exibidos em bloco sóbrio: "2 conflitos encontrados" + lista compacta e legível, com destaque contido (sem alarme excessivo).

## Orientação durante a rolagem

Indicador discreto de seções (Evento · Data · Vínculos · Operação · Revisão) que marca a seção atual conforme a rolagem e permite pular para uma seção. No mobile ele fica reduzido, sem recriar o peso do antigo assistente.

## Layout e design

- Desktop/notebook: grade de duas colunas onde faz sentido (Título | Tipo, Data | Horário, Montagem | Desmontagem, Comissão | Patrocinador); linhas inteiras para Descrição, Observações e Revisão.
- Mobile: coluna única, espaçamento vertical reduzido, alvos de toque confortáveis, campos de data/hora sem estouro horizontal, ação final acessível.
- Refino visual: superfícies limpas, bordas precisas, profundidade contida, raios consistentes, hierarquia tipográfica forte entre título de seção, rótulo e valor, estados de foco/seleção nítidos, marcação clara de obrigatório/opcional.

## Detalhes técnicos

- Reescrever `src/components/venue-events/VenueEventFormDialog.tsx`: remover `STEPS`, `STEP_FIELDS`, navegação por etapa e a grade de recursos; passar a renderizar todas as seções em um contêiner rolável com `IntersectionObserver` para o indicador de seção.
- Validação passa a ser integral (`venueEventDraftSchema` sobre o rascunho completo) no envio, com foco automático no primeiro campo inválido dentro da mesma tela.
- Campos removidos deixam de ser editáveis, mas continuam no `VenueEventDraft` com os padrões de `createEmptyVenueEventDraft` (prioridade `media`, visibilidade `institucional`, `pendingDate: false`, `resources: []`), preservando `venueEventDraftSchema` e o mapeamento de gravação.
- "Área solicitada" renderizada apenas quando o espaço selecionado for a Arena.
- Solicitante vem do usuário autenticado (`defaultRequesterName` já fornecido pelo workspace); Responsável Fenasoja passa a ter padrão resolvido pelo nome "Roque Vanderlei Lugoch" na lista de membros do workspace.
- Estilos reescritos em `src/styles/venue-events-production.css` (blocos do formulário), sem cores fixas — apenas tokens do projeto.
- Mesma tela usada para edição de evento existente.
- Validação visual com Playwright em Restaurante e Arena, nos tamanhos desktop, notebook, tablet e mobile.
