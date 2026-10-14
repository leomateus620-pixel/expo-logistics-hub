Reorganiza Despesas e Receitas de 2028 com presença visual definida e os totais financeiros em primeiro plano. A composição combina cabeçalho azul-marinho, cartão principal índigo para projeções e verde-petróleo para execução e recebimento, números grandes com alinhamento tabular e indicadores secundários claros em conjuntos compactos. Rankings recebem contraste e valores alinhados; filtros, ações e listas mantêm a leitura confortável. Explicações ficam em ícones de ajuda e detalhes contextuais para reduzir o texto permanente na tela.

Despesas preserva Projetado × Realizado, filtros do servidor, divisor persistido e abas em áreas estreitas. Receitas distingue o **Resumo da edição** dos **registros manuais carregados, até 500**: projetado, confirmado, recebido líquido e saldo continuam vindo do servidor; busca, ranking e Rouanet declaram o recorte manual. Cadastro, edição e confirmação respeitam `financial_can`, e cadastrar receita continua separado de registrar recebimento. Esta etapa mantém APIs, fórmulas, permissões, persistência financeira e histórico de 2026.

## Validação

- Tipos, build e lint dos arquivos alterados passaram.
- **140 testes em 18 arquivos** passaram, incluindo Despesas, Receitas, formulários, permissões, persistência do divisor e histórico de 2026.
- Banco local real: **47/47 verificações**, com **7 corridas concorrentes**.
- HTTP autenticado local: **27/27 checks de Receitas e 19/19 de Despesas**, usando PostgreSQL 16.15, PostgREST 16.4, JWTs assinados, RPCs e RLS reais.
- Product Design: comparação visual, interações, perfis e responsividade passaram em **360, 390, 430, 1024 e 1440 px**, com o primeiro indicador visível na primeira tela mobile, textos verificados de 12 px ou mais e controles de toque de 44 px ou mais.
- Zoom nativo de **200% no Chrome** passou sem overflow horizontal, com rodapé do formulário preservado. Teclado, arraste e recarga do divisor preservam a preferência sem novas consultas; o flush de Receitas também cobre a recarga imediata antes do debounce.

[Relatório e reprodução](./README.md) · [Testes](./frontend-tests-report.json) · [Banco](./authenticated-database-report.json) · [HTTP Receitas](./authenticated-revenue-http-report.json) · [HTTP Despesas](./authenticated-http-report.json) · [Responsividade](./responsive-final.json).

## Comparação visual

Capturas locais do código anterior e do upgrade consultam o mesmo conjunto final de dados:

| Menu | Desktop — antes / depois | Mobile — antes / depois |
| --- | --- | --- |
| Despesas | [Comparativo desktop](./comparison/expenses-desktop.jpg) | [Comparativo mobile](./comparison/expenses-mobile.jpg) |
| Receitas | [Comparativo desktop](./comparison/revenue-desktop.jpg) | [Comparativo mobile](./comparison/revenue-mobile.jpg) |

[Menus mobile finais](./comparison/final-mobile-menus.jpg).

A validação autenticada usa identidades sintéticas locais. Login/refresh do Supabase Auth remoto e versão do gateway remoto continuam pendentes. O conflito versionado está validado no PostgREST 16.4; a ressalva anterior sobre retries do SQLSTATE `40001` em PostgREST 13 permanece registrada nas evidências. Nenhuma validação remota é afirmada nesta etapa.
