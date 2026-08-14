# Fotos de Fabiano Soltis e Djeison Drey nos ícones de responsáveis

## O que muda

1. As duas fotos enviadas passam a aparecer dentro do ícone circular desses dois usuários, sempre que o nome deles aparecer como responsável ou convidado:
   - **Cadastro/edição de evento** — no seletor "Responsáveis do evento" (lista de opções e lista dos selecionados).
   - **Visualização principal (linha do tempo, desktop e mobile)** — os ícones passam a ser exibidos em uma linha própria logo abaixo do nome/título do evento, alinhada à coluna de conteúdo do card, com o responsável primeiro e os convidados na sequência.
   - **Visualização expandida (detalhe do evento)** — nos cartões "Responsável" e "Convidados".
2. Todos os demais usuários continuam exatamente como estão hoje (iniciais ou ícone genérico). Nenhuma outra pessoa recebe foto.
3. Foto recortada em círculo, enquadrada no rosto, com borda sutil no padrão visual do módulo, nítida em telas retina. Tamanhos ajustados por contexto: menor nos cards da linha do tempo, maior no cadastro e no detalhe.
4. Se a imagem não carregar, o ícone volta automaticamente para as iniciais atuais — nada quebra.

## Detalhes técnicos

- Subir as duas imagens como assets de CDN (`lovable-assets create`), gerando `src/assets/fabiano-soltis.png.asset.json` e `src/assets/djeison-drey.png.asset.json`.
- Novo `src/components/cronograma-eventos/PersonAvatar.tsx`: recebe `name` (e `userId` quando houver), normaliza o nome (sem acentos, minúsculo) e consulta um registro `personPhotos.ts` com as chaves `fabiano soltis` e `djeison drey`. Renderiza `<img loading="lazy">` com `onError` que faz fallback para o conteúdo atual (iniciais / `UserRound` / `UserPlus`).
- Pontos de uso:
  - `RelationalMultiSelect.tsx` (linhas ~616 e ~750) — substituir o bloco de iniciais pelo `PersonAvatar` quando `variant` for de pessoas.
  - `EventRelationFields.tsx` — no `EventRelationList`, trocar `cronograma-relation-item-icon` pelo `PersonAvatar` para itens de pessoa (mantendo `UserPlus` para externos sem foto).
  - `EventDrawer.tsx` — herda do `RelationCard`/`EventRelationList`, sem mudança estrutural.
  - `CronogramaTimelineBoard.tsx` (`TimelineEventRow`) e `mobile/MobileCronogramaTimeline.tsx` — inserir uma faixa de avatares abaixo do título, antes da linha de metadados, mantendo os nomes textuais como estão hoje.
- Estilos novos em `src/styles/cronograma-registration-interactions.css` (ou folha do módulo já usada pelos cards): classes `.cronograma-person-avatar` com variações de tamanho (`sm`/`md`/`lg`), `object-fit: cover`, `object-position: center 22%` para enquadrar o rosto, anel e sombra suaves.
- Validação: build/typecheck e um teste Playwright autenticado em desktop (1280) e mobile (390) abrindo a linha do tempo, um evento com os dois usuários e o formulário de cadastro, com capturas para conferência de alinhamento.
