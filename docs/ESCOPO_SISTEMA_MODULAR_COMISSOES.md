# Escopo do Sistema Modular de Comissoes

## 1. Objetivo

Esta etapa cria a primeira camada modular do Sistema Integrado de Gestao Operacional da Fenasoja. O sistema deixa de ser apenas uma entrada direta para a Comissao de Logistica e passa a ter um portal central com acesso por comissao, base administrativa e rotas preparadas para novos modulos.

A Comissao de Logistica foi preservada: as paginas, hooks, dashboards, permissoes, relatorios e rotas antigas continuam existindo. Para a nova arquitetura, foram adicionados aliases em `/comissoes/logistica/...` que apontam para as mesmas paginas atuais.

## 2. Fluxo de acesso por card de comissao

1. O usuario acessa `/` sem estar autenticado.
2. O portal exibe cards publicos das comissoes.
3. Ao clicar em um card, o slug do modulo e salvo em `localStorage` com a chave `fenasoja-selected-commission-module`.
4. O usuario e enviado para `/login/:moduleSlug`.
5. O login mostra o contexto selecionado, por exemplo `Comissao de Gastronomia`.
6. Apos autenticar, o sistema direciona para a rota principal do modulo.

O portal tambem esta disponivel diretamente em `/portal`.

## 3. Fluxo do administrador

O card `Administrador` direciona para `/login/admin`. Apos autenticacao, usuarios com perfil administrativo entram em `/admin`.

O admin pode:

- visualizar todas as comissoes cadastradas;
- abrir a visao consolidada em `/admin/geral`;
- acompanhar uma comissao especifica em `/admin/comissoes/:moduleSlug`;
- abrir o modulo operacional correspondente sem perder o contexto.

## 4. Registry de modulos

A fonte central fica em:

- `src/modules/commissions/commissionRegistry.ts`

Cada modulo define:

- `slug`;
- `name` e `shortName`;
- `description`;
- `icon`;
- `accentClass`;
- `status`;
- `capability`;
- `sensitive`;
- `adminOnly`;
- `basePath`;
- `order`;
- `publicPortal`;
- `legacyRoutes`;
- `menus`.

Esse registry alimenta o portal, o admin, a sidebar modular e os dashboards placeholder. Novos arrays locais devem ser evitados quando os dados ja existirem no registry.

## 5. Rotas criadas

Entrada e login:

- `/`
- `/portal`
- `/login/:moduleSlug`
- `/login/admin`

Admin:

- `/admin`
- `/admin/geral`
- `/admin/comissoes/:moduleSlug`

Logistica:

- `/comissoes/logistica`
- `/comissoes/logistica/dashboard`
- `/comissoes/logistica/transportes`
- `/comissoes/logistica/veiculos`
- `/comissoes/logistica/carrinhos-eletricos`
- `/comissoes/logistica/hospedes`
- `/comissoes/logistica/agenda`
- `/comissoes/logistica/checklist`
- `/comissoes/logistica/equipe`
- `/comissoes/logistica/despesas`
- `/comissoes/logistica/relatorio`

Novos modulos:

- `/comissoes/gastronomia/*`
- `/comissoes/infraestrutura/*`
- `/comissoes/servicos/*`
- `/comissoes/arte-cultura/*`
- `/comissoes/novas-geracoes/*`
- `/comissoes/seguranca/*`
- `/comissoes/limpeza/*`
- `/comissoes/financeiro-gerencial/*`

As subrotas de cada modulo sao derivadas de `menus` no registry.

## 6. Permissoes e capabilities

A camada modular usa:

- `admin_access`;
- `full_access`;
- `logistica_access`;
- `gastronomia_access`;
- `infraestrutura_access`;
- `servicos_access`;
- `arte_cultura_access`;
- `novas_geracoes_access`;
- `seguranca_access`;
- `limpeza_access`;
- `financial_access`.

O admin modular considera acesso administrativo quando o usuario tem papel `admin`, papel `gestor`, capability `admin_access` ou capability explicita `full_access`.

O modulo financeiro exige acesso administrativo ou `financial_access`. Ele aparece como sensivel e nao possui dados reais nesta etapa.

As rotas antigas da Logistica continuam usando `CapabilityGuard` como antes, preservando `full_access` e `mobility_access`.

## 7. Como a Logistica foi preservada

As paginas existentes nao foram reescritas:

- Dashboard;
- Transportes;
- Veiculos;
- Carrinhos Eletricos;
- Hospedes;
- Agenda;
- Checklist;
- Equipe;
- Despesas;
- Relatorio do Sistema;
- Mobilidade.

As rotas antigas continuam ativas:

- `/dashboard`;
- `/transports`;
- `/vehicles`;
- `/electric-carts`;
- `/guests`;
- `/agenda`;
- `/checklist`;
- `/team`;
- `/expenses`;
- `/system-report`;
- `/mobility-auth`.

A raiz `/` agora mostra o portal para usuarios nao autenticados, mas preserva o dashboard de Logistica para usuarios ja autenticados.

## 8. Como adicionar uma nova comissao

1. Adicionar um novo objeto em `commissionModules`.
2. Definir `slug`, `name`, `description`, `capability`, `basePath` e `menus`.
3. Definir se o modulo e `sensitive` ou `adminOnly`.
4. Adicionar a capability no banco quando houver usuarios reais.
5. Implementar paginas reais substituindo o placeholder quando o fluxo estiver validado.

## 9. Proximos passos para dados reais

Os novos modulos ainda nao criam tabelas especificas. Antes de dados reais, validar:

- escopo operacional por comissao;
- responsaveis e capabilities;
- necessidade de tabelas genericas ou especificas;
- filtros por `org_id`;
- auditoria e anexos;
- indicadores reais para o admin.

Tabelas futuras possiveis:

- `module_activity_summary`;
- `module_status_snapshots`;
- `module_notes`;
- `module_tasks`;
- `module_attachments`;
- `module_audit_events`.

## 10. Financeiro Gerencial

O Financeiro Gerencial foi criado apenas como estrutura inicial restrita. Ele nao exibe nem inventa dados financeiros reais.

Regras desta etapa:

- status visual `Restrito`;
- alerta de modulo sensivel;
- acesso por `financial_access` ou nivel administrativo;
- dashboards e rotas apenas placeholder;
- implementacao real depende de validacao de regras, permissoes e fonte de dados.
