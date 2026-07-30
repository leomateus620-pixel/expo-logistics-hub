# Fenasoja 2028 — Portal Access Hub

Validação executada em 30/07/2026.

## Diagnóstico e decisão

O `/portal` anterior promovia Cronograma e Restaurante/Arena como blocos principais e empurrava as comissões para uma segunda hierarquia agrupada por status. O Mapa Comercial ainda aparecia como atalho interno de Logística. Isso misturava destino, disponibilidade e permissão, além de impedir uma leitura imediata das quatro áreas de negócio.

A nova arquitetura usa uma única hierarquia, com quatro entradas principais na ordem exigida. Disponibilidade do módulo e autorização do usuário são apresentadas separadamente; rotas, guards, autenticação, Supabase e regras de negócio existentes não foram substituídos.

| Ordem | Entrada | Comportamento | Destino/origem |
| --- | --- | --- | --- |
| 01 | Agenda | Accordion exclusivo | `/cronograma-eventos` e `/eventos-restaurante-arena` |
| 02 | Mapa Comercial | Link direto | `/mapa-comercial` com `map.view` |
| 03 | Comissões | Accordion exclusivo | 8 módulos derivados do `commissionRegistry` |
| 04 | Financeiro | Link direto restrito | `/comissoes/financeiro-gerencial/dashboard` |

## O que foi reorganizado

- A hierarquia e os metadados do hub foram centralizados em `src/modules/portal/portalRegistry.ts`.
- Mapa Comercial saiu somente da apresentação do menu de Logística em `src/components/Sidebar.tsx`; sua rota, guard, login e deep links permanecem intactos.
- Financeiro continua no registry canônico, mas não é duplicado dentro do accordion Comissões.
- O mesmo predicado de `useModuleAccess` foi extraído para `resolveModuleAccess`, permitindo ao portal apresentar exatamente a decisão usada pelos guards existentes.
- Usuário anônimo segue para o login existente; usuário autenticado sem organização segue para a rota real e encontra o `OrgGuard`/`CreateOrgPage`; usuário sem permissão recebe estado estático e não enganoso.
- Escape fecha o accordion e devolve o foco ao seu botão controlador. Enter e Space permanecem providos pela semântica nativa de `<button>`.
- O acesso Administrador permanece no cabeçalho e mede no mínimo 44 px.
- O ativo remoto da marca continua prioritário; quando indisponível, um fallback vetorial interno evita ícone quebrado.

## Sistema visual

- Fundo fotográfico responsivo com céu azul profundo, sol realista e soja dourada natural.
- Composição horizontal 1672×941 e vertical 941×1672, servidas em AVIF, WebP e JPG.
- Superfícies navy unificadas, acentos semânticos por área e status sempre acompanhado de texto/ícone.
- Interações entre 170 e 250 ms; `prefers-reduced-motion` reduz tudo a 0,01 ms.
- Suporte explícito a transparência reduzida, forced colors, safe areas e foco visível.
- Prompts e fontes finais: `docs/image-prompts/fenasoja-portal-access-hub.md`.

## Evidências visuais

- Antes: `docs/screenshots/portal-access-hub-before-1228x587.jpeg`
- Depois, recolhido: `docs/screenshots/portal-access-hub-after-1366x768.png`
- Depois, Agenda aberta: `docs/screenshots/portal-access-hub-agenda-after-1366x768.png`
- Depois, mobile autenticado: `docs/screenshots/portal-access-hub-mobile-after-390x844.png`

As capturas posteriores usam uma sessão autenticada real e não exibem credenciais.

## QA autenticado

Rotas abertas com sessão real e sem bloqueio indevido:

- `/portal`
- `/cronograma-eventos`
- `/eventos-restaurante-arena`
- `/mapa-comercial`
- `/comissoes/logistica/dashboard`
- `/comissoes/gastronomia/dashboard`
- `/comissoes/financeiro-gerencial/dashboard`
- `/admin`

Deep links preservados:

- `/mapa-comercial?area=exporural`
- `/cronograma-eventos?timelineYear=2026&timelineMonth=2026-06`

Também foram confirmados voltar/avançar do navegador, remoção exclusiva do atalho de Mapa no menu de Logística, accordion único, Escape com restauração de foco, 8 comissões vindas do registry, fallback de marca, ausência de overflow horizontal e console sem erros. Permanecem apenas os avisos herdados de future flags do React Router.

## Matriz responsiva e zoom

Sem overflow horizontal e com as quatro entradas presentes em:

- 2560×1440, 1920×1080, 1680×1050, 1536×864, 1440×900 e 1366×768;
- 1024×768 e 768×1024;
- 430×932, 390×844, 376×812 e 360×800.

O controlador do navegador arredonda o meio pixel físico de 375 px para 376 px. O breakpoint de 375×812 foi corroborado pela regra `max-width: 380px` e pelos vizinhos 376×812/360×800; não é apresentado como medição física exata.

Zoom de layout equivalente, mantendo as quatro entradas, Administrador e zero overflow:

- 80%: viewport efetivo 1708×960;
- 100%: 1366×768;
- 125%: 1092×614;
- 150%: 910×512.

Desktop, tablet e mobile foram testados com Agenda e Comissões abertas. A grade de comissões responde em 4, 2 e 1 colunas, respectivamente.

## Validação automatizada

- Testes focados e de regressão adjacente: 7 arquivos, 54/54 testes aprovados.
- Build de produção: aprovado, 4728 módulos; chunk do portal com 13,73 kB de JS e 19,70 kB de CSS antes de gzip.
- ESLint dos 12 arquivos TypeScript/TSX tocados: aprovado sem ocorrências.
- `git diff --check`: aprovado.

Baseline global, fora do escopo desta entrega:

- Suíte completa: 338/367 testes aprovados; 29 falhas em 5 arquivos não tocados de Cronograma, majoritariamente por ausência de `AuthProvider` nos próprios harnesses.
- TypeScript global: 3 erros preexistentes em `src/hooks/useVenueOperations.ts` (linhas 264, 266 e 268).
- Lint global: 994 ocorrências preexistentes (963 erros e 31 avisos), concentradas em arquivos não tocados, inclusive funções Supabase.
- Build mantém o aviso existente de chunks grandes de mapas; não há novo bloqueio de produção do portal.

## Escopo preservado

Não houve alteração de schema, migration, RLS, RPC, query Supabase, callback de autenticação, regra financeira, persistência ou implementação interna dos módulos de destino.
