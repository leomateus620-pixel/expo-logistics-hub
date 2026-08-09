# Financeiro Gerencial Fenasoja 2026 — arquitetura e validação

## Escopo entregue

O módulo `financeiro-gerencial` passou a renderizar uma experiência financeira dedicada sob o envelope protegido existente:

`AuthGuard → OrgGuard → ModuleAccessGuard → CommissionLayout`

Foram preservados o slug, a base `/comissoes/financeiro-gerencial`, os nove caminhos registrados, a capability `financial_access`, a autenticação, as permissões e o ambiente Supabase. Não foram criadas migrations, tabelas, RPCs, mutations ou novos fluxos de persistência.

As visões entregues cobrem painel executivo, receitas projetadas e consolidadas, despesas previstas e realizadas, orçamento por comissão, patrocínios, cenários e catálogo de relatórios reais. A leitura é responsiva, com tabelas densas no desktop e cards intencionais no mobile.

## Fonte e reconciliação

A fixture tipada foi derivada da planilha `1 ORÇAMENTO FENASOJA2026.xlsx` sem alterar o arquivo de origem. Os principais anchors preservados são:

- teto das comissões: R$ 9.050.000,00;
- orçado das comissões: R$ 8.517.050,14;
- saldo: R$ 532.949,86;
- receita projetada: R$ 11.706.603,51;
- receita consolidada: R$ 11.301.543,34;
- lacuna de consolidação: R$ 405.060,17;
- A Receber explícito derivado dos dois blocos: R$ 900.531,50.

Orçado, realizado, períodos e A Receber são conceitos independentes no modelo. A soma dos períodos de despesas é R$ 8.519.650,14, enquanto a coluna realizado soma R$ 8.517.050,14. O delta de R$ 2.600,00 da linha 14 permanece visível e não é corrigido silenciosamente.

As origens Recurso Livre, Prefeitura/Plano de Trabalho e Rouanet são apresentadas como valores registrados não exaustivos. O serial de data em `Q75` é sinalizado como anomalia de qualidade e não é contabilizado como contrapartida.

## Arquitetura de frontend

- contratos financeiros tipados e fixture isolada;
- formatadores BRL/percentual/data centralizados;
- seletores puros para totais, filtros, agrupamentos, estados, cenários e orçamento geral;
- componentes reutilizáveis de KPI, estado, progresso, provenance, tabelas, cards, sheets e gráficos;
- valores compactos com valor exato acessível e números tabulares;
- status semânticos com texto, ícone e cor;
- animações baseadas em `transform`/`opacity`, com `prefers-reduced-motion`;
- CSS inteiramente escopado ao módulo e ao sheet financeiro.

## Validação executada

- `npm.cmd run build`: aprovado, 4.788 módulos transformados;
- `npx.cmd tsc -p tsconfig.app.json --noEmit`: aprovado;
- ESLint focado nos arquivos alterados: aprovado;
- 68/68 testes financeiros, portal, arquitetura e acesso sensível: aprovados;
- QA autenticado em todas as nove rotas;
- viewports exatas de 390 px, 430 px e 1.440 px;
- nenhuma rolagem horizontal de página, truncamento de valores ou tabela desktop excedente;
- menu mobile, filtros, estado sem resultados, drawers de comissão/patrocínio e alternância de cenários validados;
- execução pós-HMR sem erros no console; permanecem apenas avisos existentes de future flags do React Router.

A suíte global fecha com 532/563 testes aprovados. As 31 falhas restantes já pertencem a Cronograma, Login e Eventos e estão concentradas em seis arquivos fora do escopo financeiro.

## Limitação conhecida

Por restrição do escopo, os dados financeiros permanecem em uma fixture frontend somente leitura. O guard preserva a restrição de navegação e interface, mas uma fixture empacotada no bundle não equivale a confidencialidade imposta pelo servidor. Uma futura fonte financeira persistida deverá aplicar autorização e RLS no backend antes de substituir esta base.
