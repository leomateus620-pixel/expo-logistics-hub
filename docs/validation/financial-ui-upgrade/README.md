# Upgrade visual de Despesas e Receitas — PR #199

Validação local autenticada em 13/10/2026, com dados sintéticos identificados como **QA local**, PostgreSQL 16.15 e PostgREST 16.4. A comparação visual usa o código anterior congelado no commit `392744d8` e o código atual, consultando o mesmo banco e os mesmos contratos financeiros.

## Dados e limites da validação

Os registros financeiros são criados pelas RPCs reais do repositório. Receitas confirmadas geram obrigações reais; recebimentos usam movimentos com alocação e um recebimento estornado confirma a diferença entre entradas brutas e recebido líquido. O seed inclui 30 despesas, 6 receitas manuais e 3 patrocínios. Os testes HTTP preservam registros cancelados e seu histórico ao terminar.

| Indicador de receitas | Valor inicial esperado do servidor |
| --- | ---: |
| Projetado consolidado | R$ 770.000,00 |
| Projetado manual | R$ 445.000,00 |
| Projetado em patrocínios | R$ 325.000,00 |
| Confirmado consolidado | R$ 540.000,00 |
| Recebido líquido | R$ 235.000,00 |
| Saldo a receber | R$ 305.000,00 |

[Seed persistido e resumo](./seed-summary.json) · [Runtime e hashes das migrações](./runtime.json).

O preview conserva o cliente Supabase JS, APIs financeiras, hooks operacionais, RPCs, assinatura JWT e políticas RLS reais. Somente a identidade e a seleção de organização vêm do harness local. O endpoint `/qa/session` substitui login e refresh de Supabase Auth; login remoto e a versão do gateway remoto continuam pendentes. Não houve alteração de backend, migração nem conexão de escrita em produção nesta etapa.

## Verificações de banco

**47/47 verificações passaram**, incluindo **7 corridas com conexões de banco diferentes**, repetindo os controles da etapa de Despesas. [Relatório de banco](./authenticated-database-report.json).

O runner usa as mesmas quatro fontes SQL da etapa anterior, com hashes idênticos: fixture de dependências, migração financeira `20261006200356`, despesas `0004` e correção de categoria `0005`. O fixture não substitui tabelas, funções ou políticas financeiras.

## Verificações HTTP autenticadas

**27/27 checks de Receitas e 19/19 de Despesas passaram**, com JWTs assinados para administrador, leitor, editor, confirmador e operador sem acesso financeiro.

- Receitas: totais consolidados e subtotais do servidor, leitura via RLS, cadastro projetado, retry idempotente, edição com recarga, confirmação com obrigação única, recebimento parcial, saldo, limite de liquidação e estorno.
- Permissões: leitura não autoriza cadastro; edição não autoriza confirmação; confirmação não autoriza recebimento. Escrita direta na tabela e gravação na edição histórica de 2026 recebem HTTP 403.
- Concorrência: duas sessões autorizadas disputam a mesma versão de receita; uma revisão é aceita e a outra recebe `FINANCIAL_CONFLICT`. Redução do confirmado abaixo do recebido é rejeitada.
- Despesas: repetidos os 19 checks autenticados de criação, categoria, realização, pagamento parcial, reversão, cancelamento, recorte e conflito versionado da etapa anterior.

[Relatório de Receitas](./authenticated-revenue-http-report.json) · [Relatório de Despesas](./authenticated-http-report.json) · [Resumo final do servidor](./final-server-summary.json).

O conjunto final contém **7 receitas manuais e 31 despesas**: os testes preservam um registro cancelado em cada domínio, suas revisões e os movimentos estornados. Os totais financeiros da tabela acima foram restaurados integralmente. A interface anterior e a atual compartilham esse conjunto final para as capturas equivalentes.

A primeira execução dos checks de Receita encontrou uma expectativa incorreta no harness: o teste de edição histórica esperava HTTP 400, mas a migração preservada usa SQLSTATE `42501`, correspondente a HTTP 403. A expectativa foi corrigida e os dois últimos checks foram executados novamente contra o mesmo fixture; os 25 checks anteriores já haviam passado. Essa correção não alterou o backend nem adicionou outro registro de teste.

## Verificação de frontend

Tipos, build e lint dos arquivos alterados passaram. A suíte pertinente passou com **140 testes em 18 arquivos**, incluindo Despesas, Receitas, formulários, permissões, persistência do divisor e histórico de 2026. [Relatório da suíte](./frontend-tests-report.json).

## Conferência visual e interações — PASS

A comparação do Product Design foi concluída no navegador, com capturas do código anterior e da composição final contra o mesmo conjunto persistido de dados. Os menus receberam cabeçalho azul-marinho e indicador principal escuro: índigo para projeções, verde-petróleo para execução e recebido líquido. Indicadores secundários claros ficam agrupados; ranking e lista têm hierarquia própria. Explicações ficam em ícones de ajuda e detalhes contextuais.

| Comparativo | Desktop | Mobile |
| --- | --- | --- |
| Despesas | [Antes / depois](./comparison/expenses-desktop.jpg) | [Antes / depois](./comparison/expenses-mobile.jpg) |
| Receitas | [Antes / depois](./comparison/revenue-desktop.jpg) | [Antes / depois](./comparison/revenue-mobile.jpg) |

[Menus mobile finais](./comparison/final-mobile-menus.jpg) · [Detalhamento de Despesas](./comparison/expenses-detail-desktop.jpg) · [Detalhamento de Receitas](./comparison/revenue-detail-desktop.jpg). A [revisão da captura anterior](./direction-review/visual-review.md) preserva a evidência que orientou a composição final.

- **360, 390, 430, 1024 e 1440 px:** largura do documento igual à viewport em ambos os menus, sem overflow horizontal; textos verificados com mínimo de 12 px e controles de toque com mínimo de 44 px. O primeiro indicador aparece no mobile entre 443–561 px em Despesas e 389–507 px em Receitas, dentro da primeira tela. [Medições finais](./responsive-final.json).
- **Zoom nativo de 200% no Chrome:** viewport CSS de 600 × 322 px, sem overflow horizontal, rolagem disponível e rodapé do formulário preservado. O zoom foi restaurado a 100% após a checagem. [Medições de zoom](./zoom-200.json) · [Formulário](./after/expense-form-zoom-200.jpg).
- **Interações:** busca, filtros removíveis, expansão de registros, ajuda contextual, abas com teclado, formulários, erros próximos ao campo e retorno do foco foram conferidos. Duas edições reais de contraparte no registro Rouanet — alteração e restauração — preservaram os totais do servidor.
- **Perfis:** leitor, editor, confirmador e operador sem financeiro foram conferidos nos dois menus. O leitor consulta sem ações de escrita; o editor não confirma valores; o confirmador respeita as ações autorizadas. O perfil sem acesso recebe edição indisponível, sem dados, porque a RLS também impede enumerar a edição. [Matriz de perfis](./profiles.json).
- **Divisor:** teclado, arraste para 40,4/59,6 e persistência de 65/35 após recarga passaram sem novas RPCs. Restaurar, Enter e duplo clique retornam a 50/50. Receitas passou a gravar a última preferência no `pagehide`/desmontagem, preservando a recarga imediata antes do debounce de 180 ms; a chave exclusiva de Despesas foi preservada. [Despesas](./expense-resize.json) · [Receitas](./revenue-resize.json).
- **2026:** histórico conferido em capturas [antes](./before/history-2026.jpg) e [depois](./after/history-2026.jpg), além da suíte de regressão; a direção visual permanece restrita à área operacional de 2028.

Os limites de autenticação remota e de versão do gateway descritos acima permanecem.

## Reprodução

Pré-requisitos: Node.js, PostgreSQL 16+ e PostgREST 16+. O runner cria um cluster temporário exclusivo em loopback; não lê `.env` nem URL remota.

```sh
node scripts/financial-2028/expenses-db-run.cjs \
  --pg-bin /caminho/absoluto/postgresql/bin \
  --postgrest /caminho/absoluto/postgrest \
  --seed-script scripts/financial-2028/ui-upgrade-db-seed.cjs \
  --output docs/validation/financial-ui-upgrade --serve

npx vite --config scripts/financial-2028/expenses-auth-preview.vite.config.ts

node scripts/financial-2028/expenses-http-qa.cjs \
  --output docs/validation/financial-ui-upgrade
node scripts/financial-2028/ui-upgrade-http-qa.cjs
```

Preview atual em `http://127.0.0.1:5184/comissoes/financeiro-gerencial/receitas-projetadas?edicao=2028&profile=admin`; Despesas em `despesas-previstas`. Perfis: `admin`, `reader`, `editor`, `confirmer` e `denied`. Gateway 5580, PostgREST 5581 e PostgreSQL 5499 escutam em `127.0.0.1`.

Para reproduzir o código anterior com os mesmos dados, exporte `src` do commit `392744d8` para uma pasta temporária e disponibilize o `node_modules` do checkout na raiz dessa pasta. O conteúdo do Tailwind e o alias `@` seguem a fonte congelada:

```sh
FINANCIAL_QA_SOURCE=/caminho/absoluto/baseline/src \
  npx vite --config scripts/financial-2028/expenses-auth-preview.vite.config.ts --port 5194
```

A checagem HTTP de Receitas parte dos valores iniciais do seed; execute-a antes de cadastros manuais pelo navegador. Depois dos fluxos de escrita, recapture o código congelado e o atual contra o mesmo conjunto final de dados para garantir comparação equivalente.

O conflito versionado permanece validado no PostgREST 16.4. A limitação encontrada anteriormente em PostgREST 13, com repetição do SQLSTATE `40001`, segue documentada na [validação autenticada da etapa anterior](../financial-expenses-comparison/AUTHENTICATED_QA.md).
