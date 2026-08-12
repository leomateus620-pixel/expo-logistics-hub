# Correção do erro ao salvar, histórico legível e multisseleção sem salto

## Diagnóstico confirmado

1. **Erro ao editar "REUNIÃO LÉO SISTEMA FENASOJA"**: o salvamento persistiu corretamente no banco (log gravado às 02:31 com a troca Djeison → Fabiano). Reprodução autenticada via Playwright (salvar o mesmo evento) **não quebra**: sem pageerror, sem toast de erro, dados íntegros. O toast "The app encountered an error" do preview é disparado por `console.error` — e o console do preview está sendo inundado por warnings `Function components cannot be given refs` originados pelo **plugin de edição visual do ambiente** (`lovable-tagger` no `vite.config.ts`, que injeta `ref` em todo elemento JSX em dev). Ou seja: barulho do ambiente de desenvolvimento, não um bug de dados — mas ele assusta o usuário e precisa ser abafado no que depender do projeto.
2. **Bug do seletor de comissões (salto ao topo)**: confirmado no código de `RelationalMultiSelect.tsx` — a cada seleção, `addOption` zera a busca e o `activeIndex`, e um efeito de `scrollIntoView` rola a lista de volta ao primeiro item (as Assessorias). Por isso, ao clicar em "Comissão Central" ou "Agricultura", a lista pula para o topo.
3. **Histórico**: hoje cada entrada mostra apenas "Alteração em responsável, comissão" (nomes de campos), sem dizer o que mudou nem quem entrou/saiu.
4. Achado adicional: a cada salvamento o cliente dispara `google-sync-worker` e recebe **401** (chamada sem escopo de auth) — ruído de rede em todo save.

## O que será feito

### 1. Salvamento robusto + silenciamento do ruído
- Em `EventForm`/`EventRelationshipWorkspace`: envolver o pós-save (`onSaveEvent`, navegação, refetch) em try/catch para que qualquer falha secundária nunca derrube a UI nem exiba toast genérico.
- Em `useCronogramaEventos.ts` (linha ~660): só invocar `google-sync-worker` quando houver conexão Google ativa na organização (evita o 401 em todo save); manter `.catch` silencioso.
- Em `vite.config.ts`: filtrar do console do dev os warnings de ref gerados pelo tagger (via pequeno plugin local de supressão do padrão exato da mensagem), para que erros reais voltem a ser visíveis e o overlay do preview pare de acusar erro falso. Sem alterar o `lovable-tagger` em si.

### 2. Seletor sem salto + ações em massa (`RelationalMultiSelect.tsx`)
- Ao selecionar um item: manter `search` e `activeIndex` estáveis; o `scrollIntoView` só ocorre em navegação por teclado — nunca após clique. A lista permanece onde está ao marcar várias comissões.
- Barra de ações no topo do painel, acima da busca: **Tudo**, **Comissões**, **Assessorias**, **Limpar** — cada uma seleciona/limpa o grupo correspondente de uma vez (visível apenas no modo com grupos, ex.: campo de comissões).

### 3. Histórico com diff legível (`EventDrawer.tsx` + `useCronogramaEventos.ts`)
- `summarizeHistoryChange` passa a gerar entradas estruturadas por campo: rótulo amigável ("Responsáveis", "Comissões", "Data", "Horário"...) + **valor anterior → valor novo**, com nomes resolvidos (ex.: "Djeison → Fabiano Soltis, Leonardo").
- No drawer, cada entrada vira um cartão compacto: autor + data/hora no topo e a lista de mudanças em linhas `campo: antes → depois`, com chips para adicionados (verde) e removidos (vermelho) em listas de vínculos.

## Arquivos tocados
- `src/components/cronograma-eventos/RelationalMultiSelect.tsx` — correção do salto + barra de ações em massa.
- `src/hooks/useCronogramaEventos.ts` — diff estruturado no histórico; chamada condicional ao sync worker.
- `src/components/cronograma-eventos/EventDrawer.tsx` — novo layout das entradas de histórico.
- `src/components/cronograma-eventos/EventForm.tsx` e `workspace/EventRelationshipWorkspace.tsx` — pós-save protegido.
- `vite.config.ts` — supressão do warning de ref do tagger no dev.
- `src/index.css` — estilos dos chips de diff e da barra de ações do seletor.

## Validação
- Typecheck limpo.
- Playwright autenticado: editar o evento LÉO SISTEMA FENASOJA trocando responsável, salvar e confirmar ausência de toast/erro; selecionar 3 comissões seguidas e confirmar que a lista não rola; usar "Comissões"/"Tudo" e conferir seleção em massa; abrir o histórico e conferir o diff "antes → depois" com nomes.
