# Painel expandido do evento — Agenda Restaurante e Arena

Refatoração completa do painel lateral que abre ao clicar num evento: cabeçalho, ações, abas e conteúdo de cada aba, com acabamento premium e hierarquia forte.

## Cabeçalho e ações

- Cabeçalho reorganizado em três níveis: linha de status (status + tipo + alerta de conflito, em chips refinados), título com peso tipográfico alto, e descrição executiva com tratamento editorial (texto discreto, itálico quando ausente).
- Botão de fechar menor e alinhado ao topo direito, sem competir com o título.
- Barra de ações fixa com apenas três botões:
  - **Editar** — secundário, contorno técnico.
  - **Aprovar** — primário positivo (só aparece quando o fluxo permite aprovar).
  - **Excluir** — crítica, com identidade própria (contorno vermelho contido, preenchimento só no hover), com diálogo de confirmação exigindo justificativa.
- Removidas da tela **Cancelar**, **Recusar**, **Bloquear**, **No-show** e demais decisões destrutivas, conforme definido.

## Exclusão real de evento (backend)

- Nova função protegida no banco que apaga o evento e seus vínculos (ocupações, alocações de espaço, responsáveis, recursos, checklists, uso de contrapartida, documentos), liberando espaço e franquia de patrocinador.
- Permitida apenas para quem tem permissão de gestão do módulo; qualquer outro perfil recebe erro.
- Antes de apagar, grava um registro permanente de auditoria (quem excluiu, quando, título/período do evento e justificativa) para que a exclusão fique rastreável.
- Arquivos anexados no armazenamento são removidos junto.

## Abas

Mantidas as cinco abas (Resumo, Operação, Contrapartida, Documentos, Histórico) com visual novo: trilho sólido, aba ativa com fundo próprio, sombra mínima e sublinhado dourado, tipografia mais firme, transição suave e rolagem estável ao trocar de aba.

### Resumo

- Bloco **Identificação**: período, espaço, solicitante, responsável Fenasoja, equipe de apoio — em cards com ícone, rótulo pequeno e valor forte.
- Bloco **Agenda operacional**: indicadores (contrato, pagamento, revisão) como tags refinadas; turno e origem da importação em subcards separados e legíveis.
- Bloco **Janela completa**: montagem → evento → desmontagem numa faixa cronológica com conectores.
- Bloco **Organizações vinculadas**: responsável, patrocinador e público em colunas equilibradas.
- Observações e contexto ganham bloco próprio quando existirem.

### Operação

- Reagrupada em: prontidão operacional (barra de progresso), checklist pré/pós-evento, recursos e estrutura de montagem/desmontagem, e observações internas.
- Itens em linhas com estado colorido discreto, rótulos melhores e ações inline mantidas.

### Contrapartida

- Estado vazio elegante: ícone, explicação curta do que significa não haver contrapartida e ação **Vincular contrapartida**, que abre a edição do evento já posicionada no seletor de contrapartida (fluxo já existente, sem duplicar regra de negócio).
- Com vínculo: card rico com contrato, patrocinador, tipo de benefício, status do vínculo e barra de saldo (consumido / reservado / disponível), além de atalho para trocar o vínculo.

### Documentos

- Área de upload redesenhada como zona de arrastar-e-soltar com seletor de categoria e marcação de sensível melhor apresentados.
- Lista de anexos em cards: ícone por formato (PDF, imagem, planilha, Word), nome, categoria, tamanho, autor e data, com abrir/baixar; miniatura para imagens.
- Estado vazio refinado, sem bloco cinza genérico.

### Histórico

- Transformado em timeline de auditoria: marcador por tipo de ação (criação, edição, status, aprovação, contrapartida, documento, exclusão), autor identificado, data/hora em fuso de Brasília e descrição objetiva.
- Alterações de campo exibidas como “campo: antes → depois”, com agrupamento por dia e carregamento incremental preservado.

## Design e responsividade

- Superfícies sólidas com bordas finas, sombras controladas, espaçamento rigoroso e paleta institucional (navy/creme/dourado) — sem cinza lavado nem cards dentro de cards.
- No mobile o painel ocupa a tela cheia, abas roláveis horizontalmente, barra de ações fixa no rodapé com área de toque adequada.

## Detalhes técnicos

- `src/components/venue-events/VenueEventDetail.tsx`: reescrita do cabeçalho, barra de ações, `TabsList` e conteúdo das cinco abas; extração de subcomponentes (`DetailHero`, `SummaryTab`, `OperationTab`, `CounterpartTab`, `DocumentsTab`, `HistoryTab`) para o arquivo não crescer.
- Nova folha `src/styles/venue-events-detail.css` importada só pelo painel; blocos legados de `venue-detail-*` em `venue-events-production.css` removidos para evitar colisão.
- Exclusão: nova função `venue_delete_event` no banco (SECURITY DEFINER, checagem de permissão) + registro em `venue_event_audit`/`audit_log`; mutação `deleteEvent` em `src/hooks/useVenueOperations.ts` com invalidação de cache e limpeza dos arquivos do bucket.
- “Vincular contrapartida” reutiliza `onEdit(event)` com foco na seção de contrapartida do `VenueEventFormDialog`.
- Testes de apresentação em `src/test/venueEventsPresentation.test.ts` atualizados para o novo contrato (ausência de Cancelar/Recusar, presença de Excluir, novas classes).
- Validação em navegador headless: abertura do painel, troca entre as cinco abas, estados vazios, upload, exclusão com confirmação, desktop e mobile.
