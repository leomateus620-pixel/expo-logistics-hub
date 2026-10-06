# Cabeçalho da Agenda em duas linhas

> Evidência histórica da primeira revisão da PR #187, em `ba6d9647`. A [revisão atual, com Sair na primeira linha e modos/preparação na segunda](../agenda-mobile-mode-row/README.md), tem relatório e capturas próprios; estas capturas originais foram preservadas.

Baseline revalidado: `3236f6905b53d9ebd84fcf2d80a2494fd17f2754` (merge da PR #186), em checkout independente. A evidência anterior da PR #186 foi preservada.

O harness monta os componentes reais da Agenda, com eventos sintéticos explicitamente identificados e hooks de leitura interceptados. Não cria rota da aplicação, não acessa um backend autenticado e não altera preferências de notificações, Google Agenda ou dados de produção.

## Resultado observado

| Conferência | Resultado |
| --- | --- |
| Checks de navegador após a alteração | **1429/1429 passaram** |
| Baseline do navegador | 454/458; quatro falhas de interseção já existentes em 1024 px |
| Larguras da matriz | 320, 360, 390, 430, 640, 767, 768, 820, 899, 900, 1023, 1024, 1280 e 1366 px |
| Modos e busca | Agenda geral/Sala dos Voluntários; busca aberta/fechada |
| Desktop 1024/1280/1366 | 12 capturas com **zero pixels alterados** e geometria dos controles idêntica ao baseline |
| Sino e estados | Ouro sobre azul, contraste **8,04:1**; quatro estados preservados, em 390 e 1023 px |
| Escritas externas ou mutações de push | Zero tentativas |

Abaixo de 1024 px, Portal, busca e modos compartilham a primeira linha. Preparação, Google Agenda, notificações e saída ficam na segunda. Os limites reais dos controles não se cruzam, e os alvos dos botões/links medem pelo menos 44 px. A busca ocupa o slot existente do resumo: o slot, as duas linhas e a altura do cabeçalho permanecem iguais. Em 320/360 px, o resumo pode medir 54,86 px; o campo de 44 px fica centralizado dentro dessa mesma região.

O resumo fica imediatamente invisível e fora da navegação enquanto a busca está aberta. A medição ocorre antes de concluir animações para as capturas: wrapper e botão apresentam `visibility: hidden`, `transition-property: none` e `aria-hidden="true"`. Ao fechar, o resumo volta visível e acessível.

Em 900–1023 px, apenas uma instância dos controles temporais aparece, após Sair. O resumo também permanece disponível em 768–1023 px. A auditoria adicional usa navegador desktop em 768/820/900/1023 px, com gutter de 15 px reservado somente pelo harness: o cabeçalho dispõe efetivamente de 753/805/885/1008 px. Seus dois modos e estados aberto/fechado passaram nas 16 medições adicionais.

Tab, Enter, Escape, limpeza, texto pesquisado, modo e filtro Semana atual foram conferidos. Abrir/fechar no topo mantém `scrollY`. Rotação 390×844 → 820×390 → 390×844 e redução da área disponível para 420/320 px preservam os controles e o texto. Cruzar 1023→1024→390 preserva a consulta; a digitação imediata em 1023→1280, antes de vencer o debounce mobile, conserva os caracteres mais recentes.

O skip link mantém o destino `#cronograma-main`, aparece com foco visível de teclado e continua oculto após rolagem, retorno ao topo e wheel para cima no topo.

## Arquivos da aplicação alterados

- `CronogramaModuleShell.tsx`: organiza as duas linhas, o slot compartilhado e os controles de período responsivos.
- `mobile/MobileSearchToggle.tsx`: apresenta o único campo no slot do resumo e preserva consulta e foco ao cruzar o breakpoint desktop.
- `CronogramaPushStatusButton.tsx`: identifica o botão de notificações para o estilo restrito ao cabeçalho.
- `cronograma-command-layer.css`: define a composição abaixo de 1024 px, os alvos de toque e o contraste do sino.

O runner visual e este relatório registram a verificação. As correções da Agenda Restaurante e Arena permanecem intactas; nenhum arquivo desses módulos, rota, permissão, backend ou fluxo de dados foi alterado.

## Limites preservados no desktop

Em 1024 px, o baseline aprovado já apresenta interseção entre os modos e o resumo da semana, além do campo desktop de busca com largura zero. Os mesmos limites foram medidos após a alteração; não são apresentados como corrigidos. No handoff mobile→desktop, o foco vai para Portal quando esse campo está colapsado, e a consulta é preservada. Em 1280 px, o foco vai para o campo visível e a digitação é exercitada.

## Evidências e verificações

- [Resumo compacto do navegador](browser-validation-summary.json)
- [Relatório completo após a alteração](evidence/after/browser-report.json)
- [Relatório completo do baseline](evidence/baseline/browser-report.json)
- [Comparação das 67 unidades com o baseline](unit-baseline-comparison.json): 52 passam e 15 falham de forma idêntica nas duas revisões; a suíte geral não é declarada verde.
- Typecheck, ESLint dos três componentes TSX alterados e build final passaram na revisão final, conferidos pela tarefa principal.
- Sintaxe do runner conferida com `node --check scripts/agenda-header/browser-qa.cjs`.

| Captura final | Busca fechada | Busca aberta |
| --- | --- | --- |
| 320 px / Sala | [Imagem](evidence/after/320-room-closed.png) | [Imagem](evidence/after/320-room-open.png) |
| 390 px / geral | [Imagem](evidence/after/390-general-closed.png) | [Imagem](evidence/after/390-general-open.png) |
| 768 px / Sala | [Imagem](evidence/after/768-room-closed.png) | [Imagem](evidence/after/768-room-open.png) |
| 1023 px / geral | [Imagem](evidence/after/1023-general-closed.png) | [Imagem](evidence/after/1023-general-open.png) |

| Comparação mobile | Antes | Depois |
| --- | --- | --- |
| 320 px / Sala | [Cabeçalho](evidence/baseline/320-room-closed-header.png) | [Cabeçalho](evidence/after/320-room-closed-header.png) |
| 390 px / geral | [Cabeçalho](evidence/baseline/390-general-closed-header.png) | [Cabeçalho](evidence/after/390-general-closed-header.png) |

O runner usa `AGENDA_QA_BASE`, `AGENDA_QA_SOURCE_ROOT` e `AGENDA_QA_PHASE` (`baseline`/`after`). O padrão é `http://127.0.0.1:5200`, compatível com `qa.vite.config.ts`; esta conferência passou explicitamente `5210` para baseline e `5211` para after. Com Node/Playwright configurados no ambiente, os comandos usados a partir do worktree da correção foram:

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

Os servidores Vite usam `scripts/agenda-header/qa.vite.config.ts`, no checkout correspondente. `AGENDA_QA_DESKTOP_AUDIT_ONLY=1` atualiza somente as medições de viewport desktop intermediário no relatório existente, preservando os demais resultados. Os servidores locais usados nesta conferência foram encerrados após o trabalho.

## Limitações

Chromium 154.0.8037.98, com DPR 1, emula viewport e toque abaixo de 1024 px; desktop usa viewport sem emulação de dispositivo. Isso não comprova comportamento em um aparelho físico. Reduzir o viewport emula o espaço disponível com teclado, sem abrir um teclado virtual real. A orientação foi exercitada por mudança efetiva de largura e altura.

Não havia iOS Safari/dispositivo físico disponível para reproduzir overscroll elástico ou o gesto real de puxar a tela. Clipping, foco por teclado, retorno ao topo e wheel foram conferidos; o gesto elástico não foi validado.
