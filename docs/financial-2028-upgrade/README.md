# Financeiro 2028 — cadastros, cronogramas e cabeçalhos

Base conferida: `main` em `7a7b2408d023f487a01c5493f5b916d5db01494a`. Implementação de 21/10/2026, em uma única PR. Não altera o Mapa Comercial nem os valores históricos de 2026.

## Estado da entrega

| Camada | Estado verificado |
|---|---|
| Restrição de acesso | Aplicada ao banco conectado em 21/10/2026, 15h21 BRT; quatro UUIDs conferidos, sem autorização por nome |
| Catálogos, planos, parcelas, RPCs e regras de liquidação | Migração `20261021210000` aplicada e registrada no banco conectado em 21/10/2026, 16h03 BRT |
| Registros financeiros existentes | Impressão digital de receitas, despesas, obrigações, movimentos, alocações, categorias, edições, auditoria e recibos de idempotência idêntica antes/depois |
| Novos lançamentos no banco conectado | Nenhum; planos e referências novos continuaram com contagem zero na conferência pós-COMMIT |
| Frontend | Implementado nesta PR; depende do merge e da publicação do aplicativo. A aplicação do schema não publica a interface |
| Cenários financeiros com gravação | PostgreSQL isolado, com dados fictícios; não foram criadas vendas, receitas, despesas ou liquidações de teste no banco conectado |

Evidências: [banco conectado](evidence/connected-database.json), [persistência pelo navegador](evidence/browser-persistence.json), [testes de banco](evidence/database-tests.json), [checks e comparação com a base](evidence/test-results.json) e [conferência visual](design-qa.md).

## Implementação

- `FinancialEntryComposer`: receitas/despesas em cards independentes, duplicação sem identidade persistida, remoção confirmada, revisão por estágio e uma chamada transacional para o lote inteiro. Erros preservam todos os rascunhos; resposta incerta repete a mesma chave/conteúdo.
- `FinancialEntryFields`: ajuda compartilhada e comboboxes pesquisáveis com criação explícita, referências estáveis e gestão administrativa. Digitar/apagar não grava sugestões. A criação durante o lançamento usa `financial_edit`; renomear/arquivar continua administrativo.
- `FinancialPaymentPlanEditor` e `financialEntryApi`: à vista/parcelado separados do meio previsto, datas civis, meses escolhidos e valores editáveis em centavos. Redistribuição exige confirmação; parcelas liquidadas têm valor, data, posição e meio protegidos.
- `FinancialPaymentPlanPanel`: leitura do plano confirmado, liquidação parcial pela RPC existente, atribuição explícita de movimentos legados e estorno dos mesmos detalhes. Meio previsto e execução/caixa permanecem distintos.
- `FinancialScheduleSummary`: consolidação integral no servidor, com vencimento, competência e caixa em colunas separadas; exportação da edição inteira. Linhas de parcelas têm colunas próprias e não repetem os valores do fato.
- `FinancialSectionHeader`: identidade, ferramentas e contexto no mesmo card. Despesas recebeu controles em azul acinzentado `#d8e2f2`, texto `#203a59`, foco visível e acento lilás; Receitas usa acento menta. Grafismos leves, entrada curta e movimento reduzido estático. Removidos os dois botões de restauração; o divisor conserva seus recursos de teclado e preferência interna.
- Catálogos, cronogramas, origens personalizadas, listagens, detalhes, Dashboard, relatórios e exportação compartilham as leituras persistidas e a invalidação `financial-operational`. Ranking/origens usam agregação completa do servidor, independente da página de até 500 receitas.

## Banco e compatibilidade

Migrações novas:

1. `supabase/migrations/20261021205900_financial_restricted_roster.sql`: organização restrita e roster privado. Mantém as capacidades anteriores das contas autorizadas; Marcos continua com consulta, sem edição, confirmação, administração ou liquidação. Contas homônimas não são incluídas automaticamente.
2. `supabase/migrations/20261021210000_financial_entry_composer.sql`: referências reutilizáveis, plano único por origem, parcelas e detalhes filhos da alocação existente. Usa `expenses.financial_category_id`; não cria outro livro de despesas.

As duas versões constam em `supabase_migrations.schema_migrations`, com suas fontes exatas. Não é necessário reaplicar migrações antigas. O runner deve reconhecer as versões já registradas. Uma reexecução da revisão foi ensaiada na base isolada sem novos registros, versões ou eventos.

Os contratos públicos de `financial_save`, `financial_save_expense`, `financial_transition_expense`, `financial_record_movement` e `financial_reverse_movement` permanecem compatíveis. Os corpos anteriores ficam em funções privadas `*_core_20261021`; guards recusam envolver um contrato-base diferente do inspecionado. Escrita nova só passa por RPC financeira autorizada, auditada, versionada e idempotente. As tabelas novas não permitem escrita direta pelo cliente. RLS de leitura usa o conjunto de organizações autorizadas.

Não há backfill de textos legados, meios, pagamentos ou obrigações projetadas. Contrapartida continua o texto relacionado à receita; não foi convertida em permuta ou classificação contábil. Uma origem personalizada mantém uma classificação técnica explícita ou `nao_identificado`.

## Matriz de validação

| Cenário | Banco isolado | Navegador local | Banco conectado |
|---|---|---|---|
| Quatro contas, contas duplicadas e admin não autorizado | RLS/RPC reais | Troca de conta; consulta sem ações; admin fora da lista bloqueado | Quatro contas autorizadas e três duplicadas negadas, sob papel `authenticated` com claims de teste |
| Criar/reutilizar referências | Concorrência, normalização, domínio/organização e arquivamento | Contrapartida, origem, categoria e fornecedor criados/reutilizados | Schema e leitura autorizada; nenhuma criação de teste |
| Parcelas, datas e centavos | Soma exata, 31/01 → 29/02 → 31/03, travas de saldo e versão | Receita R$ 1.000,00 em três parcelas Pix; despesa R$ 600,00 em seis boletos | Schema compilado; sem gravação fictícia |
| Lote, retry e falha no segundo item | Transações e conexões concorrentes; idempotência e rollback | Duas receitas salvas juntas e relidas; rascunhos preservados em erro | Nenhum fato existente modificado pela migração |
| Parcial/estorno e legado sem detalhamento | Alocação pai única, filhos e estorno reconciliados | Recebimento de R$ 100,00, saldo R$ 900,00 e estorno para saldo R$ 1.000,00 | Contratos anteriores e permissões preservados |
| Indicadores e exportação | Fato contado uma vez, agregação além da página e três bases temporais | Valores atualizados após gravação/releitura; exportação da base fictícia | Nenhuma reprecificação ou movimento retroativo |
| Histórico 2026 | Escrita recusada | Componentes históricos não alterados | Registros incluídos na conferência de integridade |
| Nova sessão/retorno de navegação | Dados persistidos em PostgreSQL | Recarregar, trocar seção e abrir nova aba relê os mesmos IDs e parcelas | Releitura do schema e autorização após COMMIT |
| Responsividade e ajuda | — | 1440/1280/390/430 px; área curta, zoom visual e movimento reduzido; mouse/teclado, testes de ponteiro/toque em DOM | Não houve teste em dispositivo físico |

O PostgreSQL isolado é 18.4; o conectado é 17.6. A ponte local usa o papel `authenticated` e claims controladas, não um login Supabase real. As capturas exibem apenas dados fictícios. Outra aba/conta no host local não equivale a outro aparelho físico.

## Reproduzir a validação isolada

Os scripts aceitam somente `127.0.0.1:55438` e os bancos descartáveis `financial_composer_test`/`financial_composer_acceptance`. Não aceitam uma URL de banco remoto. Dependências do runtime de teste ficam fora do projeto:

```sh
npm install --prefix /tmp/financial-postgres --no-save embedded-postgres@18.4.0-beta.17 postgres@3.4.9
node scripts/financial-2028/start-isolated-postgres.mjs
```

Em outro terminal, na raiz do repositório:

```sh
FINANCIAL_TEST_DATABASE=financial_composer_acceptance FINANCIAL_APPLY_COMPOSER=1 node scripts/financial-2028/isolated-bootstrap.mjs
FINANCIAL_TEST_DATABASE=financial_composer_acceptance node scripts/financial-2028/database-qa.mjs
```

O bootstrap recria exclusivamente o banco local escolhido. Para abrir os componentes reais sobre esse estado:

```sh
FINANCIAL_TEST_DATABASE=financial_composer_acceptance node scripts/financial-2028/review-server.mjs
npx vite --config scripts/financial-2028/review.vite.config.ts
```

Acesse `http://127.0.0.1:8087/scripts/financial-2028/review.html`. A ponte só expõe RPCs financeiras autorizadas e leituras financeiras permitidas, em loopback. O host de revisão não integra o bundle nem cria uma rota de produção.

## Implantação e limites

Publicar o frontend após o merge desta PR. O backend aditivo já foi aplicado e continua compatível com as chamadas anteriores. Não restaura administração geral irrestrita ao reverter apenas a interface.

Não remover planos, parcelas, vínculos ou funções privadas como forma de rollback depois de novos negócios. O ensaio cobre rollback transacional antes do COMMIT; uma reversão posterior exige uma migração compensatória que confira os movimentos posteriores e preserve auditoria/histórico.

Faltam testes em aparelho físico, teclado virtual real e login interativo de cada conta no aplicativo publicado. Não há alegação de certificação de acessibilidade. As 91 falhas preexistentes da suíte completa estão documentadas separadamente; os checks desta entrega não as ocultam.
