# Refinamento do workspace de comissões e assessorias

Validação local de apresentação em 02/10/2026. Baseline: `3c653eb8d365b53736a12e1443e79b6c9eeb918e` (`origin/main`). Os arquivos do workspace no checkout original foram comparados com essa base antes das capturas, sem diferenças.

## Implementação

- Sidebar exclusiva de `variant="workspace"`, com uma navegação principal, estado ativo e menu mobile acessível. A sidebar compartilhada dos outros módulos foi preservada.
- Identificação compacta da frente; responsável principal, acesso aos demais e descrição sob demanda. As cinco páginas reutilizam a mesma apresentação.
- Visão geral com próximo compromisso em destaque, indicadores compactos e resumos proporcionais de agenda, documentos e equipe.
- Agenda inicia na timeline. Busca, ano, período, situação, filtros e alternância com calendário usam uma barra compacta; indicadores permanecem acessíveis em “Resumo”. Cartões apresentam mês/ano/dia, data própria, horários, duração, situação, responsáveis, local e vínculos. “+N” abre as listas completas.
- Formulário organizado por informações, data/horário, local e relações. Seletores pesquisáveis preservam IDs e ordem, distinguem pessoas de frentes participantes e mantêm a unidade obrigatória separada. Ações ficam visíveis durante a rolagem.
- Documentos com estado vazio único e ações existentes; equipe em linhas proporcionais; tarefas conservam o estado de preparação, sem dados ou persistência adicionais.

## Comparativos das cinco seções

Capturas de viewport com os mesmos dados e dimensões. Desktop: **1366 × 768**. Mobile: **390 × 844**.

| Seção | Desktop antes | Desktop depois | Mobile antes | Mobile depois |
| --- | --- | --- | --- | --- |
| Visão geral | [Antes](before/desktop-overview.png) | [Depois](after/desktop-overview.png) | [Antes](before/mobile-overview.png) | [Depois](after/mobile-overview.png) |
| Agenda | [Antes](before/desktop-agenda.png) | [Depois](after/desktop-agenda.png) | [Antes](before/mobile-agenda.png) | [Depois](after/mobile-agenda.png) |
| Documentos | [Antes](before/desktop-documents.png) | [Depois](after/desktop-documents.png) | [Antes](before/mobile-documents.png) | [Depois](after/mobile-documents.png) |
| Equipe | [Antes](before/desktop-team.png) | [Depois](after/desktop-team.png) | [Antes](before/mobile-team.png) | [Depois](after/mobile-team.png) |
| Tarefas | [Antes](before/desktop-tasks.png) | [Depois](after/desktop-tasks.png) | [Antes](before/mobile-tasks.png) | [Depois](after/mobile-tasks.png) |

O primeiro cartão da timeline passou a ocupar estas posições verticais aproximadas, medidas no DOM sem rolar a página e após `document.fonts.ready`:

| Cenário | Antes | Depois | Espaço recuperado |
| --- | ---: | ---: | ---: |
| Desktop 1366 × 768 | 756 px | 382 px | 374 px |
| Mobile 390 × 844 | 848 px | 492 px | 356 px |
| Assessoria de nome longo, 390 × 844 | 848 px | 517 px | 331 px |
| Assessoria de nome longo, 320 × 844 | 924 px | 558 px | 366 px |

No baseline, o primeiro evento ficava abaixo ou praticamente abaixo do viewport. Depois, título, horários e metadados do primeiro evento aparecem na tela inicial. Nomes longos continuam completos e demandam mais altura. Nenhuma das cinco seções apresentou rolagem horizontal da página nas dimensões verificadas.

## Casos adicionais e interações

| Caso | Antes | Depois |
| --- | --- | --- |
| Assessoria de Relações Internacionais, desktop | [Antes](before/desktop-long-advisory.png) | [Depois](after/desktop-long-advisory.png) |
| Assessoria de Relações Internacionais, mobile | [Antes](before/mobile-long-advisory.png) | [Depois](after/mobile-long-advisory.png) |
| Cadastro, desktop | [Antes](before/desktop-create.png) | [Depois](after/desktop-create.png) |
| Cadastro, mobile | [Antes](before/mobile-create.png) | [Depois](after/mobile-create.png) |
| Seleção de pessoas, desktop | [Antes](before/desktop-create-people.png) | [Depois](after/desktop-create-people.png) |
| Edição com seis responsáveis e quatro frentes, desktop | [Antes](before/desktop-many-responsibles-edit.png) | [Depois](after/desktop-many-responsibles-edit.png) |
| Edição com seis responsáveis e quatro frentes, mobile | [Antes](before/mobile-many-responsibles-edit.png) | [Depois](after/mobile-many-responsibles-edit.png) |
| Documentos vazios, mobile | [Antes](before/mobile-documents-empty.png) | [Depois](after/mobile-documents-empty.png) |
| Navegação mobile | [Antes](before/mobile-navigation.png) | [Depois](after/mobile-navigation.png) |

Evidências complementares: [14 pessoas selecionadas](after/mobile-fourteen-responsibles.png), [formulário de assessoria em 320 px](after/320-long-advisory-form.png), [viewport reduzido a 480 px](after/mobile-480px-form.png), [lista completa de responsáveis](after/desktop-responsibles-popover.png), [lista completa de frentes](after/desktop-fronts-popover.png), [calendário](after/desktop-calendar.png) e [filtros](after/desktop-filters.png).

As verificações de navegador exercitaram:

- Timeline inicial; busca nos eventos reais da fixture; calendário e filtros; fechamento com Escape.
- Abertura, fechamento, destino ativo, retorno de foco e ciclo de Tab/Shift+Tab no menu mobile.
- Acesso aos seis responsáveis e às quatro frentes de um evento pelo resumo “+N”, com retorno de foco.
- Digitação contínua nos seletores sem remontagem, perda de foco ou perda do título editado; seleção por teclado e remoção explícita.
- Edição do mesmo evento canônico `ev-06`, preservando a ordem de `peopleIds`, o primeiro responsável, a ordem de `unitIds`, a data e os horários.
- Criação somente em callback de prévia, selecionando as 14 pessoas já existentes na fixture: Raul primeiro e Bruna depois permaneceram nessa ordem, sem ordenação alfabética. A unidade obrigatória e a assessoria participante mantiveram IDs e papéis separados.
- Formulários em 320, 390 e 1366 px, erro junto ao campo, cancelamento e rodapé visível; altura de 480 px como aproximação de viewport com teclado.

Os resultados estruturados estão em [baseline](before/results.json), [depois](after/results.json) e [interações do formulário e relações](after/interaction-results.json). Os testes de componente também cobrem nomes iguais com IDs distintos, responsável principal, evento canônico e transformação do payload existente.

## Isolamento dos módulos excluídos

O diff de produção ficou limitado à apresentação de `src/features/commission-agenda`, aos três estilos exclusivos e ao ramo `workspace` de `CommissionLayout`. Rotas, hooks de dados, adaptadores de persistência, RPCs, Supabase, RLS e migrações não foram alterados. `CommissionWorkspacePage`, a sidebar compartilhada e os componentes/estilos da Agenda Fenasoja permaneceram iguais à base.

Além do diff, o harness carregou os estilos do workspace e comparou componentes reais que continuam usados nas áreas excluídas:

| Amostra | Antes | Depois | Resultado |
| --- | --- | --- | --- |
| `CommissionLayout` padrão + sidebar compartilhada de Logística | [Antes](before/excluded-standard.png) | [Depois](after/excluded-standard.png) | PNG com SHA-256 idêntico; dimensões, fonte e cores idênticas |
| `CommissionLayout` em modo mapa + sidebar compartilhada | [Antes](before/excluded-map.png) | [Depois](after/excluded-map.png) | PNG com SHA-256 idêntico; dimensões, fonte e cores idênticas |
| `CronogramaTimelineBoard` real da Agenda Fenasoja | [Antes](before/excluded-agenda-reference.png) | [Depois](after/excluded-agenda-reference.png) | PNG com SHA-256 idêntico; dimensões, fonte e cores idênticas |

Hashes e estilos computados: [excluded-results.json](excluded-results.json). A composição da Agenda foi carregada em ordem explícita, incluindo `cronograma-timeline-recovery.css`, `cronograma-timeline-flagship.css`, `cronograma-refino.css`, camada de comando e estilos mobile. A comparação usa a timeline real com os eventos oficiais estáticos do repositório, sem hooks de produção.

## Referência tipográfica consultada

A referência foi renderizada com os componentes reais `CronogramaTimelineBoard` e `MobileCronogramaTimeline`, em seus contêineres de apresentação e com a composição de estilos existente. A família computada foi Inter, com JetBrains Mono no marcador de data. No desktop, o título da Agenda resultou em 15 px/900 e entrelinha 20,625 px; no mobile, 14,4 px/900 e entrelinha 18 px. A composição final do workspace conserva essa linguagem e aumenta a legibilidade de títulos e horários conforme o ajuste de direção solicitado durante a revisão.

Evidências: [tipografia desktop](agenda-reference-typography.json), [tipografia mobile](agenda-reference-mobile-typography.json) e [referência mobile](agenda-reference-mobile.png). A fonte Hind aparece no repositório no contexto de login da Agenda; ela não foi a família computada das timelines verificadas.

## Checks e limites

Checks finais no worktree: **build de produção, typecheck e lint passaram**. Os testes pertinentes passaram com **26/26 casos**: 17 de dados/apresentação e 9 de formulário, com timeout padrão e dois workers. O navegador passou em **47/47 verificações**: 16 de navegação/agenda e 31 de formulário/relações. As **3/3 amostras de isolamento** apresentaram PNGs e estilos computados idênticos. O build concluiu em aproximadamente 2 min 27 s, com os avisos já existentes de Browserslist e tamanho de chunks.

As capturas usam exclusivamente as **fixtures DEV já existentes**: 19 eventos, 14 pessoas, 7 frentes, 6 documentos e data de referência fixa `2026-09-11`. O harness não altera fixtures nem rotas de produção; corrige apenas os caminhos da prévia para reproduzir o estado ativo e registra callbacks em memória. Nenhum evento ou documento foi gravado em Supabase.

Essa evidência comprova apresentação e interação locais. Não comprova salvamento autenticado em produção, sincronização externa real, upload/download de documentos, permissões sob contas reais, deploy nem funcionamento em aparelho físico. Os módulos excluídos foram verificados pelo diff e pelas amostras compartilhadas acima; suas páginas autenticadas completas não foram executadas. A altura reduzida de 480 px é uma aproximação e não substitui teste de teclado em aparelho físico.

O ViewModel existente não expõe o proprietário de cada vínculo entre evento e frente. O contrato atual de transformação recebe o workspace como unidade proprietária e foi preservado. Os checks verificam IDs, ordem e o payload desse contrato; não comprovam em produção a propriedade de um evento acessado por uma frente participante. Essa é uma limitação anterior do modelo disponível, sem alteração de dados ou contratos neste refinamento.

## Reprodução local

Use o Node disponível no ambiente e o Playwright com Chrome instalado. O harness é independente do build público e não utiliza o plugin MCP que gera funções durante o servidor padrão.

```powershell
# Baseline: aponte para o checkout original sem alterações.
$env:COMMISSION_QA_SOURCE = 'C:/Users/Leonardo/Desktop/expo-logistics-hub'
node node_modules/vite/bin/vite.js --config scripts/commission-workspace/preview.vite.config.ts --port 5190

# Em outro terminal, a versão refinada.
Remove-Item Env:COMMISSION_QA_SOURCE -ErrorAction SilentlyContinue
node node_modules/vite/bin/vite.js --config scripts/commission-workspace/preview.vite.config.ts --port 5191

# Execute na raiz do worktree.
$env:PLAYWRIGHT_MODULE = 'C:/Users/Leonardo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
node scripts/commission-workspace/browser-qa.cjs before http://127.0.0.1:5190
node scripts/commission-workspace/browser-qa.cjs after http://127.0.0.1:5191
node scripts/commission-workspace/interaction-qa.cjs http://127.0.0.1:5191
node scripts/commission-workspace/excluded-qa.cjs
```

Por padrão, os scripts resolvem o pacote `playwright`. `PLAYWRIGHT_MODULE` permite apontar para o runtime Codex ou outra instalação sem adicionar dependências ao projeto; `QA_BROWSER_CHANNEL` permite ajustar o canal nas capturas principais. Os caches privados do harness estão ignorados pelo Git e identificados pelo hash do caminho de origem.
