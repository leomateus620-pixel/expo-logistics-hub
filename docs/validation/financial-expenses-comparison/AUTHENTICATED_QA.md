# Validação autenticada de despesas 2028

Executada em **13/10/2026**, em um cluster PostgreSQL 16.15 descartável, escutando exclusivamente em `127.0.0.1`. Os fixtures têm usuários, organização, comissões e despesas identificados como QA local. Não houve conexão de escrita com o projeto Supabase remoto.

As tabelas financeiras, RPCs, auditoria, idempotência e RLS são as migrações existentes do repositório: `20261006200356`, `0004_financial_expenses_2028_stage1` e `0005_financial_category_audit_entity_fix`. O fixture reproduz apenas as dependências de organização, comissões, despesas logísticas e `auth.uid()`. Nenhum contrato financeiro foi substituído.

## Resultado de banco

**47/47 verificações passaram**, incluindo **7 corridas reais com conexões e PIDs diferentes**. Evidência: [authenticated-database-report.json](./authenticated-database-report.json).

- Previsão, recarga, edição, versão desatualizada, idempotência e centavos inteiros.
- Realização preservando previsão; realizada direta com previsão nula; obrigação única por despesa.
- Pagamento parcial, saldo derivado, limite de quitação, estorno, cancelamento e reversão conforme os estados existentes.
- Categoria personalizada, renomeação versionada, arquivamento preservando vínculos e sugestões opcionais de nomes históricos.
- Recorte compartilhado de busca, categoria, comissão e período explicitamente por previsão ou realização; paginação restrita à lista.
- Leitor sem escrita, editor sem confirmação, operador logístico sem acesso financeiro, proteção da escrita direta e edição 2026 somente leitura.

| Corrida em duas sessões | Resultado |
| --- | --- |
| Mesma criação e chave de idempotência | Uma despesa e uma auditoria de criação |
| Edição com a mesma versão | Uma edição aceita; outra recebe `FINANCIAL_CONFLICT` |
| Realizar a mesma previsão | Uma realização e uma obrigação; segunda versão rejeitada |
| Dois pagamentos que ultrapassariam o saldo | Um pagamento aceito; outro recebe `FINANCIAL_OVER_SETTLEMENT` |
| Pagamento × cancelamento | Cancelamento rejeitado após a liquidação |
| Pagamento × reversão | Reversão rejeitada após a liquidação |
| Pagamento × redução do realizado | Redução abaixo do liquidado rejeitada |

## Resultado HTTP e sessão

**19/19 verificações passaram** por HTTP, com **PostgREST 16.4 real**, JWTs assinados, papel `authenticated` e permissões consultadas via `financial_can`. Evidência: [authenticated-http-report.json](./authenticated-http-report.json).

A assinatura adulterada foi rejeitada com HTTP 401; o operador sem financeiro recebeu 403; leitor, editor e confirmador respeitaram suas capacidades. As operações de cadastro, categoria, realização, pagamento, estorno, reversão e cancelamento passaram pelas mesmas RPCs usadas pela aplicação. Duas sessões JWT de usuários diferentes disputaram a mesma versão: uma foi aceita e a outra retornou o conflito existente.

O preview autenticado mantém `financialExpensesApi`, `financialOperationalApi`, `useFinancialExpenses` e o hook de permissões reais. O alias afeta somente o cliente Supabase, a seleção da organização e a identidade local de teste. O cliente Supabase JS envia o JWT ao PostgREST, que valida assinatura e aplica RLS no banco.

**Limite de autenticação:** o endpoint `/qa/session` emite identidades locais conhecidas para facilitar QA. Ele substitui o login/refresh do Supabase Auth; esse login remoto não foi validado. A autorização de escrita em produção dada pelo usuário não forneceu uma sessão autenticada. A tentativa somente leitura de metadados públicos do backend remoto retornou 401 e não revelou sua versão de PostgREST.

## Pendência dependente da versão do gateway

O teste encontrou uma diferença material entre runtimes. Em **PostgREST 13.0.4**, o conflito versionado das RPCs existentes (`FINANCIAL_CONFLICT`, SQLSTATE `40001`) provocou repetição contínua da transação em vez de devolver a resposta HTTP. A requisição de teste foi interrompida e o processo local encerrado. As mesmas duas sessões passaram com **PostgREST 16.4**, que contém a correção de retries.

O comportamento e a correção estão documentados pela [Supabase](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b) e no [changelog oficial do PostgREST 16](https://github.com/PostgREST/postgrest/blob/v16.4/CHANGELOG.md). A versão do gateway remoto permanece desconhecida. O backend do projeto foi preservado; nenhuma migração foi criada para trocar códigos de erro. Portanto, a validação SQL de concorrência está completa e a validação HTTP de concorrência é confirmada no runtime local 16.4, com essa ressalva para versões anteriores.

## Reprodução

Pré-requisitos: Node.js, PostgreSQL 16+ (`initdb`, `pg_ctl`, `psql`) e PostgREST 16+. O runner cria um diretório temporário novo e uma base com nome fixo; não lê `.env`, URL remota nem credencial de produção. Ele valida os fluxos de banco, descarta a base de checks, prepara 30 registros locais para o navegador e mantém o gateway até `Ctrl+C`. Encerrar o processo também para o cluster local.

```sh
node scripts/financial-2028/expenses-db-run.cjs \
  --pg-bin /caminho/absoluto/postgresql/bin \
  --postgrest /caminho/absoluto/postgrest \
  --serve

node scripts/financial-2028/expenses-http-qa.cjs
npx vite --config scripts/financial-2028/expenses-auth-preview.vite.config.ts
```

Abrir `http://127.0.0.1:5184/comissoes/financeiro-gerencial/despesas-previstas?edicao=2028&profile=admin`. Perfis disponíveis: `admin`, `reader`, `editor`, `confirmer`, `denied`. O gateway utiliza 5580, PostgREST 5581 e PostgreSQL 5499; todos escutam em loopback. O script não usa credenciais externas.

Os binários desta execução foram obtidos sem instalação global, a partir de [Postgres.app 2.9.6 com PostgreSQL 16](https://github.com/PostgresApp/PostgresApp/releases/tag/v2.9.6) e da [fórmula oficial Homebrew de PostgREST](https://formulae.brew.sh/formula/postgrest), com os digests SHA-256 verificados antes da execução. Digests de fixtures e migrações estão em [runtime.json](./runtime.json).
