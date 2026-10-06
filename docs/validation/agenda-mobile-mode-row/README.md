# Revisão atual do cabeçalho mobile — PR #187

Esta revisão compara a composição aprovada em `ba6d9647e3c88bf9099a820aa1e68941ddfb0369` com a nova organização solicitada. A [evidência histórica da primeira revisão](../agenda-mobile-two-rows/README.md) permanece preservada, incluindo as capturas originais.

Abaixo de 1024 px, Portal e busca ficam à esquerda da primeira linha, com Sair à direita. A segunda linha contém Agenda geral, Sala dos Voluntários, preparação com mini barra flexível, Google Agenda e notificações. Em 900–1023 px, os controles temporais aparecem uma única vez, ao final dessa segunda linha. Desktop permanece igual ao baseline desta revisão.

Os arquivos da aplicação alterados nesta revisão são `CronogramaModuleShell.tsx` (instâncias únicas dos modos e Sair em hosts responsivos, com retorno de foco) e `cronograma-command-layer.css` (grid da segunda linha e preparação flexível com a barra existente). O runner visual registra a nova composição e a verificação. Componentes de preparação, notificações e busca mantêm seus cálculos e handlers; Restaurante/Arena, rotas, permissões e backend permanecem inalterados.

## Conferência

**1829/1829 checks finais de navegador passaram**, incluindo a matriz completa, foco no breakpoint, ordem de Tab, extremos da preparação e oito cenários de notificações.

O runner monta os componentes reais, com dados sintéticos explícitos e interceptação de hooks de leitura e requisições externas. O relógio é controlado; os casos 0/17/100% usam o hook e a fórmula reais de preparação, sem substituir seu cálculo. Nenhuma rota foi criada na aplicação, e nenhuma preferência ou dado de produção foi alterado.

A matriz cobre 320, 360, 390, 430, 640, 767, 768, 820, 899, 900, 1023, 1024, 1280 e 1366 px; os dois modos; busca aberta e fechada; os quatro estados de notificações; teclado e foco. São medidos os limites reais de cada controle, as interseções entre eles e os limites internos do valor e da trilha de preparação. Ausência de overflow é conferida separadamente.

O baseline tem 454/458 checks aprovados. As quatro falhas são as interseções já existentes em 1024 px, que permanecem idênticas no desktop preservado. As 12 comparações de capturas em 1024/1280/1366 px têm zero pixels alterados e geometria dos controles idêntica a `ba6d9647`.

Em 320 px, a trilha mede 47,19 px em 0%, 38,30 px em 17% e 27,27 px em 100%, acima do mínimo de 24 px. Valor e trilha ficam dentro do botão, sem avançar sobre Google Agenda. Os botões e links mobile mantêm alvos de pelo menos 44 px.

A ordem real de Tab acompanha a composição: Portal → busca → Sair → Agenda geral → Sala dos Voluntários → preparação → Google Agenda → notificações → controles temporais habilitados, quando presentes → resumo. Setas nativamente desabilitadas ficam fora de Tab. Abrir a busca oculta o resumo imediatamente, preserva o mesmo slot e a altura do cabeçalho; Tab no campo com texto chega a Limpar busca e depois ao conteúdo. Enter/Escape fecham e devolvem foco; texto, limpeza, filtro Semana atual e modo selecionado são preservados.

Os dois modos e Sair foram focalizados separadamente e atravessaram 1023↔1024 px nas duas direções. Cada controle mantém foco visível, sua instância única, a consulta e o modo selecionado após mudar de host DOM. A busca também preserva o texto ao atravessar o breakpoint antes de vencer seu debounce e permite digitação imediata no campo visível em 1280 px.

O audit de viewport desktop em 768/820/900/1023 px reserva gutter de 15 px somente no harness, com largura efetiva do cabeçalho de 753/805/885/1008 px. Os dois modos e busca aberta/fechada são medidos nesses cenários. Rotação 390×844 → 820×390 → 390×844 e redução de altura para 420/320 px verificam a área disponível com orientação e teclado emulados.

O sino mantém ouro sobre azul, com contraste 8,04:1. Os quatro sinais de estado conservam seus valores RGB originais. Enter e toque abrem o popover existente; o autofocus fica dentro dele, e Escape retorna ao botão, sem executar ações de ativação/desativação. O skip link mantém destino e foco visível; permanece oculto após rolagem, retorno ao topo e wheel para cima no topo.

## Evidência final

- [Resumo compacto do navegador](browser-validation-summary.json)
- [Relatório completo após a revisão](evidence/after/browser-report.json)
- [Relatório do baseline ba6d9647](evidence/baseline/browser-report.json)
- [Typecheck, ESLint e 23/23 unidades focadas](unit-and-static-checks.json)
- Build final aprovado pela tarefa principal; sintaxe do runner conferida com `node --check scripts/agenda-header/browser-qa.cjs`.

| Cenário | Antes | Depois |
| --- | --- | --- |
| 390 px / geral, 17% | [Imagem](evidence/baseline/390-general-closed.png) | [Imagem](evidence/after/390-general-closed.png) |
| 390 px / busca aberta | [Imagem](evidence/baseline/390-general-open.png) | [Imagem](evidence/after/390-general-open.png) |
| 320 px / Sala | [Imagem](evidence/baseline/320-room-closed.png) | [Imagem](evidence/after/320-room-closed.png) |
| 320 px / 100% | — | [Imagem](evidence/after/320-preparation-100-general-closed.png) |
| 320 px / 0%, busca aberta | — | [Imagem](evidence/after/320-preparation-0-room-open.png) |
| 1023 px / geral | [Imagem](evidence/baseline/1023-general-closed.png) | [Imagem](evidence/after/1023-general-closed.png) |

## Limites da validação

Em 1024 px, o desktop aprovado já tem interseção entre modos e resumo da semana, e o campo de busca pode ter largura zero. A revisão preserva essas medidas; não declara esse problema corrigido. O handoff devolve foco a Portal quando o campo desktop está colapsado e conserva a consulta.

Chromium 154.0.8037.98, DPR 1, emula viewport e toque abaixo de 1024 px. As verificações de teclado usam redução da área disponível; não houve teclado virtual de aparelho físico. Não havia iOS Safari/dispositivo físico disponível para reproduzir overscroll elástico ou o gesto real de puxar a tela. Clipping, foco, scroll/topo e wheel foram conferidos, sem apresentar o gesto elástico como validado.

As 15 falhas amplas anteriormente comparadas com o baseline continuam documentadas na evidência histórica; essas suítes não foram rerodadas para esta revisão. O resultado atual de unidades focadas é 23/23, e a suíte geral não é declarada verde. Prévias e tentativas locais ficam ignoradas pelo Git, fora da PR; links acima apontam somente para capturas finais válidas.

## Reprodução local

Servidores nos respectivos checkouts: `node node_modules/vite/bin/vite.js --config scripts/agenda-header/qa.vite.config.ts --port 5210` para baseline e `--port 5211` para after. Com Node/Playwright configurados, execute o runner a partir do worktree da revisão:

```powershell
$env:AGENDA_QA_BASE = 'http://127.0.0.1:5210'
$env:AGENDA_QA_SOURCE_ROOT = 'C:/Users/Leonardo/.codex/worktrees/agenda-mobile-two-rows-baseline/expo-logistics-hub'
$env:AGENDA_QA_PHASE = 'baseline'
node scripts/agenda-header/browser-qa.cjs

$env:AGENDA_QA_BASE = 'http://127.0.0.1:5211'
$env:AGENDA_QA_SOURCE_ROOT = 'C:/Users/Leonardo/.codex/worktrees/agenda-responsive-header/expo-logistics-hub'
$env:AGENDA_QA_PHASE = 'after'
node scripts/agenda-header/browser-qa.cjs
```

O runner continua compatível com a porta padrão 5200 do config quando `AGENDA_QA_BASE` não é fornecido. A saída atual é `docs/validation/agenda-mobile-mode-row/evidence`; a pasta da primeira revisão não é sobrescrita.

Os servidores locais usados na conferência foram encerrados após verificar seus processos e portas.
