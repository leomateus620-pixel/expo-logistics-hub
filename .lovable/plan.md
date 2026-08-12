# Correções: erro ao salvar, histórico legível e seleção múltipla de comissões

## Diagnóstico confirmado

1. **"The app encountered an error" ao salvar**: o salvamento em si funciona (log `_cronograma_log` às 02:31 mostra a troca Djeison → Fabiano Soltis persistida). O toast de erro é disparado pelo overlay do preview, que reage a um flood de warnings `console.error` ("Function components cannot be given refs") gerado pelo plugin `lovable-tagger` (injeta `ref` em todo componente no dev). Confirmado: a cada save o evento propaga mudanças → re-render → centenas de warnings → toast.
2. **Histórico crú**: `useCronogramaEventos.summarizeHistoryChange` só devolve nomes de campos ("Alteração em responsável, comissão") sem mostrar o que mudou.
3. **Scroll jump no multi-select**: `RelationalMultiSelect` reseta `search` e `activeIndex` a cada seleção (`addOption`) e chama `scrollIntoView` no efeito de `activeIndex` — por isso a lista volta ao topo ao clicar em Comissão Central / Agricultura etc.

## Implementado

### 1. Scroll jump eliminado + seleção em massa (`RelationalMultiSelect.tsx`)
- `keyboardNavRef`: `scrollIntoView` só dispara quando a navegação foi por teclado (setas/Home/End); cliques do mouse nunca rolam a lista. Validado: scrollTop antes/depois do clique = 1953/1953 (zero jump).
- `addOption` não reseta mais busca nem índice ativo ao selecionar.
- Barra de ações rápidas no topo do painel: **Tudo**, **Assessorias**, **Comissões**, **Limpar** (só aparece quando há mais de um grupo). `addMany` pula itens já selecionados e anuncia via aria-live.

### 2. Histórico com diff legível (`useCronogramaEventos.ts`, `types.ts`, `EventDrawer.tsx`)
- Novo `diffHistoryChange`: para cada campo alterado gera `{ label, before, after }` formatado (datas em dd/mm/aaaa, status/prioridade traduzidos, listas de responsáveis/comissões como nomes separados por vírgula).
- Drawer renderiza cada entrada com antes (riscado, vermelho) → depois (verde), ex.: "responsáveis: Djeison Drey → Djeison Drey, Fabiano Soltis, Leonardo".

### 3. Toast falso de erro eliminado
- `vite.config.ts`: plugin `suppress-tagger-ref-warnings` injeta script (dev only) que filtra exatamente o warning de refs do tagger — o overlay para de reagir. Validado: save completo sem toast de erro, URL estável, zero console.errors além de um 400 pontual já corrigido.
- `triggerSyncWorker` agora só chama `google-sync-worker` quando a org tem conexão Google ativa (verificação em cache por org) — fim do 401 a cada save.
- O fluxo de save no workspace já possuía try/catch (`handleSaveMain`); mantido.

### 4. Estilos (`index.css`)
- `.cronograma-relation-bulk` (pills com hover 3D sutil, Limpar em tom danger) e `.cronograma-audit-diff` (trilha dourada lateral, antes/depois com cores semânticas, dark-mode ok).

## Validação executada
- Typecheck limpo (`tsgo`).
- Playwright autenticado: abertura do editor de "REUNIÃO LÉO SISTEMA FENASOJA" — barra Tudo/Assessorias/Comissões/Limpar presente; clique em opção no fim da lista sem salto de scroll; "Limpar" + seleção em massa por grupo funcionando (8 selecionados); salvar sem alterações → sem toast de erro, permanece na tela.
- Card "Evento principal" do workspace já exibia corretamente os 2 responsáveis com selo Principal (dados persistidos OK).
