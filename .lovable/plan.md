# Atalhos de Documentos/Histórico e novo Histórico do evento

Módulo: Agenda Restaurante e Arena. A identidade visual, os dados, as permissões e os fluxos atuais são preservados; nada é publicado em produção.

## 1. Atalhos no cartão do evento

Dois botões-ícone compactos entram no grupo de ações à direita de cada cartão (Agenda, Todos os Eventos, Restaurante e Arena, celular e computador):

- Documentos (ícone de arquivo)
- Histórico (ícone de relógio/atividade)

Comportamento:
- Abrem o mesmo evento já existente, direto na seção certa — sem passar pelo Resumo.
- O clique nos ícones não dispara a abertura padrão do cartão (propagação interrompida).
- Botões acessíveis por teclado, com rótulo "Abrir documentos do evento" / "Abrir histórico do evento" e dica visual no computador.
- Altura do cartão não aumenta: os ícones ficam na coluna lateral, discretos, antes do selo de status.
- Contador de documentos exibido ao lado do ícone quando disponível, usando uma única consulta agregada para todos os eventos listados (sem consulta por cartão). Sem contador de histórico nesta etapa.

Voltar do evento mantém ano, mês, Restaurante/Arena, busca e posição de rolagem, porque a seleção continua sendo um parâmetro na própria URL da lista.

## 2. Navegação direta

A URL do módulo passa a aceitar, além de `?evento=<id>`, o parâmetro `?aba=resumo|operacao|contrapartida|documentos|historico`. As abas do detalhe deixam de ser não controladas e passam a refletir/atualizar esse parâmetro, de modo que link direto, voltar e avançar do navegador funcionem de forma previsível. Um único evento, um único ID, sem URLs alternativas.

Abas ficam roláveis horizontalmente em telas estreitas, com áreas de toque adequadas e sem corte de texto nem rolagem lateral da página.

## 3. Histórico do evento

Nova linha do tempo cronológica única (mais recente primeiro) combinando:

- Registros do sistema (já existentes): evento criado/atualizado, status alterado, documento registrado/removido, aprovações, operação e contrapartida.
- Apontamentos manuais (novo): anotações operacionais escritas por usuários autorizados.

Melhorias de apresentação:
- Rótulos em português padronizados ("Documento registrado", "Evento atualizado", "Status alterado"), no lugar dos termos técnicos em inglês.
- Cada item mostra ícone, tipo, descrição legível, autor e data/hora curta (ex.: 11 SET 2026 · 10:35), no fuso oficial do sistema.
- Alterações estruturadas viram texto legível ("Rascunho → Solicitado", "19:00–23:30 → 20:00–00:00"), nunca dados brutos.
- Documento registrado mostra o nome do arquivo e, quando permitido, um atalho discreto "Ver documento" reutilizando o download seguro atual.
- Densidade compacta: espaçamento reduzido, largura de leitura controlada no computador, sem grandes áreas vazias; leitura rápida no celular (360–430px).
- Cabeçalho com "Histórico do evento", contagem de registros e botão "+ Adicionar apontamento".
- Filtros leves: Todos (padrão), Apontamentos, Sistema, Documentos — apenas visuais.
- Estados de carregamento (esqueleto), vazio ("Ainda não há registros neste evento." com o botão de apontamento), erro com "tentar novamente" e paginação "carregar mais" já existente preservada.
- Diferenciação sutil: marcadores neutros para sistema, marcador levemente destacado e etiqueta "Apontamento" para notas manuais.

## 4. Apontamentos

- Botão "+ Adicionar apontamento": composer inline no computador e folha inferior no celular, respeitando teclado e área segura.
- Campo único obrigatório (texto). Autor, data/hora, evento e origem são gravados automaticamente.
- Texto normalizado em maiúsculas preservando acentos, usando o utilitário compartilhado já existente do módulo.
- Cada apontamento é um registro real no banco, individual, com autor e data — nunca concatenado em outro campo.
- Aparece na hora após salvar, pela invalidação de consulta já usada no projeto, sem duplicar.
- Edição/remoção de apontamento (quando a permissão permitir) gera registro de auditoria correspondente; registros de sistema continuam imutáveis pela interface.

## 5. Permissões

Reutiliza a arquitetura atual: ver histórico continua condicionado à permissão de auditoria já existente; criar apontamento fica vinculado à permissão de gestão/operação do módulo, sem criar um sistema paralelo de permissões.

## Detalhes técnicos

- Cartões: `src/components/venue-events/VenueEventCard.tsx` ganha `onOpenDocuments` / `onOpenHistory`; `VenueWorkspace.tsx` passa os handlers e escreve `evento`+`aba` nos search params (`openEvent(id, tab)`).
- Detalhe: `VenueEventDetail.tsx` usa `<Tabs value=... onValueChange=...>` sincronizado com o parâmetro `aba`.
- Novo `venue_event_notes` (id, org_id, event_id, body, author_user_id, created_at, updated_at, deleted_at) com GRANTs explícitos e RLS espelhando as políticas de `venue_events`; criação/edição/remoção via RPC `venue_save_event_note` / `venue_delete_event_note` gravando também em `audit_log` (`entity='venue_event_note'`).
- Hook: `useVenueOperations.ts` ganha `useVenueEventNotes(eventId)` e mutação com invalidação; o histórico passa a ser um seletor que funde auditoria + aprovações + notas em uma lista ordenada tipada (`src/lib/venue-history.ts`), com rótulos PT-BR e formatação de diffs reaproveitando `buildAuditDiff`.
- Contador de documentos: uma consulta agregada por página de eventos visíveis em `useVenueOperations`, sem N+1.
- Normalização de texto: `toDisplayUpper` de `src/lib/textNormalize.ts`.
- Estilos: extensão de `src/styles/venue-events-detail.css` e `venue-event-cards.css`, sem novos temas.
- Testes: unidades para fusão/ordenação/rótulos do histórico e normalização; validação no navegador em 320/360/390/430px, tablet e desktop, incluindo criação de apontamento, persistência após recarregar, mudança de status, registro de documento e atalhos a partir da Agenda.
