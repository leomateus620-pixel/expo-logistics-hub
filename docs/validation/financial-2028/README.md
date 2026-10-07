# Financeiro Fenasoja 2028 — apresentação operacional

## Referência e diagnóstico

Base analisada: `1d9becff`, revisão atual de `main` no início da tarefa. O histórico 2026 usa `financial-management-page` e as camadas executiva, de receitas, despesas, orçamento, patrocínios e cenários. A apresentação operacional usava somente `financial-operational-2028`, indicadores básicos e listas sem a composição histórica. As declarações finais do CSS histórico aplicam Inter, numerais tabulares, azul-marinho/índigo, superfícies discretas e dourado seletivo; regras antigas com fonte monoespaçada não foram adotadas.

O diálogo global solicita `bg-card/88`, mas a configuração Tailwind não oferece a opacidade `88`. A superfície sem preenchimento efetivo deixa o overlay aparecer através do conteúdo. Além disso, diálogos e seletores usam portais fora da página, de modo que tokens declarados somente no workspace não chegam a eles. A correção usa um padrão Radix local aos quatro formulários financeiros, com fundo branco opaco e tokens próprios derivados da identidade financeira. O diálogo global foi preservado.

## Padrões reaproveitados

- `FinancialKpiCard`, `FinancialAmount` e `FinancialSectionHeader`: componentes de apresentação sem fonte histórica. A fronteira de renderização converte centavos inteiros para reais; valores canônicos e payloads continuam em centavos.
- Composição do painel executivo: grupos distintos de receitas, despesas e orçamento, com movimentação de caixa e acompanhamento separados. Destaques compactos sempre têm o valor integral com centavos visível abaixo.
- Hierarquia dos ledgers históricos: valores alinhados à direita, ênfase na coluna decisória, detalhes contextuais, síntese e filtros. Os modelos históricos têm semântica e campos diferentes; não foram usados como contratos da operação.
- Linguagem de portfólio, barras de composição e catálogo de consultas: construída com os registros operacionais disponíveis. Nenhum componente que importa `financial2026Data` é montado na operação 2028.

## Nove menus

| Menu | Entrega |
| --- | --- |
| Painel Financeiro | Síntese executiva, comparação de etapas e abrangência da consolidação canônica do servidor. |
| Receitas Projetadas | Expectativa, composição por origem, filtros, tabela e detalhes. Conserva receitas não canceladas, inclusive confirmadas. |
| Receitas Confirmadas | Ênfase no confirmado, composição por origem e acompanhamento; somente situação confirmada. |
| Despesas Previstas | Estado operacional indisponível, contextualizado com as etapas financeiras. Linhas de orçamento não substituem despesas. |
| Despesas Realizadas | Estado operacional indisponível; compromisso realizado permanece distinto de pagamento. |
| Orçamento por Comissão | Tetos, planejado por linhas ativas, utilização, composição por comissão e expansão contextual. |
| Patrocínios | Portfólio por categoria, recursos livres/Rouanet, negociação, filtros e contrapartidas separadas. |
| Simulações | Cenários descritos com indisponibilidade explícita, sem controles ou resultados fictícios. |
| Relatórios | Cinco acessos a consultas existentes; exportações e auditoria identificadas como pendentes. |

## Operação preservada

Criação/edição de orçamento, inclusão de linha, criação/edição de receita e criação/edição de patrocínio usam as mesmas RPCs, payloads, máscaras, `expectedVersion`, motivos obrigatórios, chave de tentativa e invalidação de consultas. Não há alteração de API, regras financeiras, autenticação ou permissões. Falhas e conflitos permanecem visíveis, com conteúdo digitado preservado; envio e fechamento ficam bloqueados até a resposta real.

Teto ausente permanece distinto de zero. Valores negativos, nulos e zero têm apresentações distintas. Confirmação não é recebimento; despesa realizada não é pagamento; etapas de patrocínio não são somadas. Composição e indicadores das listas de receitas e patrocínios declaram o recorte de até 500 registros. O painel continua independente das listas.

Os formulários têm rótulos permanentes, validação junto ao campo, seletor acima do diálogo, calendário nativo, restauração de foco sem rolar a página, corpo rolável e ações acessíveis. A página conserva o scroll principal de `CommissionLayout`/`CommissionSidebar`; tabelas têm rolagem local. Edição explícita, navegação, refresh e histórico do navegador mantêm o parâmetro `edicao`. A aparência de 2026 e as folhas de estilo históricas foram preservadas.

## Ambiente de verificação

O harness em `scripts/financial-2028` usa a página e o layout reais com API, identidade e comissões sintéticas. A fonte anterior foi congelada fora do repositório para comparação. Dados de teste existem somente no harness e nos testes, nunca na interface de produção. Nenhuma gravação financeira real foi realizada.

A validação local não certifica operação autenticada remota, permissões reais, aparelho físico, deploy ou migração. Os formulários foram exercitados com respostas sintéticas de sucesso, erro e conflito, sem gravar registros financeiros reais.

## Comparações visuais

Capturas com as mesmas dimensões: desktop 1366 × 768, notebook 1024 × 768 e celular 390 × 844. A API sintética é a mesma nas duas revisões; os dados históricos permanecem os do módulo de referência. Cada par abaixo mostra antes / depois.

| Menu 2028 | Desktop | Notebook | Celular |
| --- | --- | --- | --- |
| Painel | [Antes](before/desktop-2028-dashboard.png) / [Depois](after/desktop-2028-dashboard.png) | [Antes](before/notebook-2028-dashboard.png) / [Depois](after/notebook-2028-dashboard.png) | [Antes](before/mobile-2028-dashboard.png) / [Depois](after/mobile-2028-dashboard.png) |
| Receitas Projetadas | [Antes](before/desktop-2028-receitas-projetadas.png) / [Depois](after/desktop-2028-receitas-projetadas.png) | [Antes](before/notebook-2028-receitas-projetadas.png) / [Depois](after/notebook-2028-receitas-projetadas.png) | [Antes](before/mobile-2028-receitas-projetadas.png) / [Depois](after/mobile-2028-receitas-projetadas.png) |
| Receitas Confirmadas | [Antes](before/desktop-2028-receitas-confirmadas.png) / [Depois](after/desktop-2028-receitas-confirmadas.png) | [Antes](before/notebook-2028-receitas-confirmadas.png) / [Depois](after/notebook-2028-receitas-confirmadas.png) | [Antes](before/mobile-2028-receitas-confirmadas.png) / [Depois](after/mobile-2028-receitas-confirmadas.png) |
| Despesas Previstas | [Antes](before/desktop-2028-despesas-previstas.png) / [Depois](after/desktop-2028-despesas-previstas.png) | [Antes](before/notebook-2028-despesas-previstas.png) / [Depois](after/notebook-2028-despesas-previstas.png) | [Antes](before/mobile-2028-despesas-previstas.png) / [Depois](after/mobile-2028-despesas-previstas.png) |
| Despesas Realizadas | [Antes](before/desktop-2028-despesas-realizadas.png) / [Depois](after/desktop-2028-despesas-realizadas.png) | [Antes](before/notebook-2028-despesas-realizadas.png) / [Depois](after/notebook-2028-despesas-realizadas.png) | [Antes](before/mobile-2028-despesas-realizadas.png) / [Depois](after/mobile-2028-despesas-realizadas.png) |
| Orçamento | [Antes](before/desktop-2028-orcamento-comissoes.png) / [Depois](after/desktop-2028-orcamento-comissoes.png) | [Antes](before/notebook-2028-orcamento-comissoes.png) / [Depois](after/notebook-2028-orcamento-comissoes.png) | [Antes](before/mobile-2028-orcamento-comissoes.png) / [Depois](after/mobile-2028-orcamento-comissoes.png) |
| Patrocínios | [Antes](before/desktop-2028-patrocinios.png) / [Depois](after/desktop-2028-patrocinios.png) | [Antes](before/notebook-2028-patrocinios.png) / [Depois](after/notebook-2028-patrocinios.png) | [Antes](before/mobile-2028-patrocinios.png) / [Depois](after/mobile-2028-patrocinios.png) |
| Simulações | [Antes](before/desktop-2028-simulacoes.png) / [Depois](after/desktop-2028-simulacoes.png) | [Antes](before/notebook-2028-simulacoes.png) / [Depois](after/notebook-2028-simulacoes.png) | [Antes](before/mobile-2028-simulacoes.png) / [Depois](after/mobile-2028-simulacoes.png) |
| Relatórios | [Antes](before/desktop-2028-relatorios.png) / [Depois](after/desktop-2028-relatorios.png) | [Antes](before/notebook-2028-relatorios.png) / [Depois](after/notebook-2028-relatorios.png) | [Antes](before/mobile-2028-relatorios.png) / [Depois](after/mobile-2028-relatorios.png) |

| Formulário de criação | Desktop antes / depois | Celular antes / depois |
| --- | --- | --- |
| Receita | [Antes](before/desktop-create-revenue.png) / [Depois](after/desktop-create-revenue.png) | [Antes](before/mobile-create-revenue.png) / [Depois](after/mobile-create-revenue.png) |
| Orçamento | [Antes](before/desktop-create-budget.png) / [Depois](after/desktop-create-budget.png) | [Antes](before/mobile-create-budget.png) / [Depois](after/mobile-create-budget.png) |
| Linha | [Antes](before/desktop-create-budget-line.png) / [Depois](after/desktop-create-budget-line.png) | [Antes](before/mobile-create-budget-line.png) / [Depois](after/mobile-create-budget-line.png) |
| Patrocínio | [Antes](before/desktop-create-sponsorship.png) / [Depois](after/desktop-create-sponsorship.png) | [Antes](before/mobile-create-sponsorship.png) / [Depois](after/mobile-create-sponsorship.png) |

As pastas também incluem edição de receitas, orçamentos e patrocínios, seletores abertos, estados de ausência de dados e todas as nove telas de 2026 nos mesmos tamanhos.

## Checks locais

- Typecheck completo: passou na revisão final.
- ESLint dos arquivos de aplicação afetados, novo teste e harness TypeScript: passou.
- Operação e apresentação 2028: 23 testes passaram (8 existentes + 15 de apresentação/formulários).
- Referência histórica: 24 testes passaram, cobrindo flagship, despesas, patrocínios e cenários.
- Build de produção: passou, com 5.625 módulos. Permanecem os avisos de Browserslist desatualizado e chunks acima de 500 kB; não houve alteração de dependências ou configuração para ocultá-los.
- Auditoria do diff: APIs, math, máscaras monetárias, autenticação, permissões, layout/sidebar e fontes/estilos históricos preservados. Nenhuma mudança Supabase integra esta entrega.
- Capturas comparáveis: 90 antes e 90 depois, mais detalhes e estados de interação. As duas matrizes não tiveram erros JavaScript, rolagem horizontal de página ou acesso financeiro externo.
- Interação no Chromium: 36 verificações passaram, registradas em [interaction-results.json](after/interaction-results.json).
- Regressão visual 2026: [27 pares comparados](historical-comparison.json). Onze são idênticos pixel a pixel; nos outros 16, o maior desvio foi 198 pixels (0,0252% da imagem), com até 4/255 por canal. O [controle repetido no mesmo build](historical-raster-control.json) variou 302 pixels (0,0384%), também até 4/255. Os desvios antes/depois ficaram abaixo dessa variação de rasterização medida; não foi observada mudança de layout ou conteúdo.

Os 15 testes novos cobrem totais canônicos, fonte de despesas ausente, teto nulo/zero, seleção original de receitas, validação junto aos campos, payloads em centavos, criação de orçamento/linha/patrocínio, falha recuperável, conflito de versão, chave de tentativa estável, envio até resposta real e telas pendentes. Não constituem homologação de RPCs no ambiente remoto.

No navegador foram verificados links diretos, navegação pela sidebar, refresh, voltar/avançar, seleção da edição por teclado, cancelamento, foco inicial e restauração do foco/scroll/filtros, falha de receita seguida de retry com a mesma chave, `expectedVersion`, erro junto ao campo, conflito de patrocínio com preenchimento preservado e bloqueio de campos/seletores/fechamento durante envio. Também passaram detalhes expandidos, cinco destinos de consulta mantendo a edição, aviso de recorte de 500 registros, seletor sobre o modal, calendário como input nativo de data e ausência de resultados.

A redução de movimento foi verificada pelo estilo efetivo. Em viewport de 390 × 480, o corpo do diálogo continuou rolável e o rodapé permaneceu visível; isso emula a redução de área útil do teclado, sem certificar teclado de aparelho físico ou iOS. O componente nativo de data foi preenchido no Chromium; não foi validado o popup do calendário do sistema operacional.

Detalhes desktop: [receitas](after/desktop-ledger-revenue-details.png), [orçamento](after/desktop-ledger-budget-details.png) e [patrocínio](after/desktop-ledger-sponsorship-details.png). Falhas e estados do formulário: [erro recuperável](after/desktop-revenue-recoverable-error.png), [validação do campo](after/desktop-revenue-required-error.png) e [conflito](after/desktop-sponsorship-version-conflict.png).

A tabela extensa de orçamento tem rolagem horizontal local, sem ampliar a página. A [captura à direita](after/desktop-ledger-budget-details-scrolled.png) mostra a ação Editar e os valores integrais das linhas; no celular a apresentação usa uma lista estruturada em uma coluna.

O comparador PNG é estrito e retorna código 1 quando encontra qualquer pixel diferente. Esse resultado bruto está preservado; a interpretação visual usa também o controle repetido de rasterização, sem elevar a tolerância do script para ocultar diferenças.

## Execução reproduzível

```powershell
npm run typecheck
npx eslint src/features/financial-management/operational/Financial2028*.tsx src/features/financial-management/operational/FinancialEditionSwitch.tsx src/pages/commissions/FinancialManagementPage.tsx src/test/financial2028Presentation.test.tsx
npm test -- src/test/financialOperational2028.test.ts src/test/financial2028Presentation.test.tsx --no-file-parallelism --testTimeout=20000
npm test -- src/test/financialFlagshipExperience.test.tsx src/test/financialExpenseIntelligence.test.tsx src/test/financialSponsorshipScenarioInteractions.test.tsx --no-file-parallelism --testTimeout=20000
npm run build
```

O primeiro teste histórico com paralelismo e timeout padrão encontrou quatro timeouts na máquina com memória saturada; o rerun sequencial com 20 segundos passou nos 16 testes de despesas/patrocínios/cenários. Os oito testes flagship passaram na primeira execução. A mudança não aumenta os limites dos testes do projeto.

O harness pode ser compilado e servido isoladamente; seus aliases substituem somente os hooks de identidade/comissões e a API financeira por fixtures locais. Playwright e o decoder PNG vêm do runtime de QA do ambiente, fora das dependências da aplicação. Quando não estiverem resolvíveis por nome, configure `PLAYWRIGHT_MODULE` e `QA_PNG_MODULE` com seus caminhos.

```powershell
npx vite build --config scripts/financial-2028/preview.vite.config.ts
node scripts/financial-2028/preview-server.cjs dist-qa/financial-2028 5195
```

Em outro terminal, com o servidor local em execução:

```powershell
node scripts/financial-2028/browser-qa.cjs after http://127.0.0.1:5195
node scripts/financial-2028/interaction-qa.cjs http://127.0.0.1:5195
node scripts/financial-2028/compare-captures.cjs
```

Para recriar a fase anterior, `FINANCIAL_QA_SOURCE` aponta para uma cópia da revisão `1d9becff` e `FINANCIAL_QA_BUILD` para outra pasta de saída. A captura usa a fase `before`. O controle histórico espera a conclusão das animações de 2026, sem alterar suas regras de movimento.
