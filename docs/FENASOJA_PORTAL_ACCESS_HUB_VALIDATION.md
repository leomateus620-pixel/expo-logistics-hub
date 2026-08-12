# Fenasoja 2028 — sistema visual unificado dos acessos

Validação executada em 12/08/2026.

## Resultado

Os cinco acessos principais — Agenda Fenasoja, Agenda Restaurante e Arena, Mapa Comercial, Comissões e Financeiro — agora compartilham uma única linguagem de superfície, borda, profundidade, tipografia, ícone, ação e interação. A diferenciação permanece no nome, no ícone e no conteúdo de cada módulo, sem fundos temáticos concorrentes.

| Elemento | Antes | Depois |
| --- | --- | --- |
| Superfície | Navy, marrom, azul e teal por módulo | Base navy/blue-gray única (`#14283a`) |
| Borda | Intensidade e matiz variáveis | Borda premium neutra (`#607990`) |
| Ícones | Fundos, brilhos e tons distintos | Contêiner único de 46 px, mesma borda e peso visual |
| Títulos | Tratamentos especiais e truncamento | Tipografia de interface uniforme, forte e legível |
| Ações | Setas e destaques diferentes | Uma ação com seta horizontal e microdeslocamento comum |
| Expansão | Painéis com identidade paralela | Continuação tonal e estrutural do cartão pai |

O CSS de acesso tem agora um único proprietário: `portal-access-navigation.css`. O bloco legado duplicado foi removido de `commission-portal.css`, que continua responsável apenas pelo shell, hero, cabeçalho, rodapé e coreografia geral da página.

## Hierarquia e composição

- Cada acesso comunica somente índice, ícone, nome do módulo, descrição funcional curta e ação primária.
- O nome é o elemento de maior presença: peso 800, espaçamento óptico controlado, contraste alto e sombra de texto mínima.
- O tratamento é inspirado na clareza e na presença do wordmark FENASOJA, sem converter os nomes em logotipos metálicos.
- Metadados decorativos, contagens e variações visuais por `data-tone` foram removidos.
- As descrições foram reduzidas e mantêm quebra natural, inclusive em “Agenda Restaurante e Arena”.
- Altura, padding, alinhamento do ícone, baseline, descrição e ação seguem a mesma grade em todos os acessos.

## Interação e acessibilidade

- O cartão inteiro é a superfície interativa, tanto para links quanto para o controle expansível de Comissões.
- Hover eleva a superfície em 1 px, ilumina a borda de forma controlada e desloca a seta em 2 px.
- O estado pressionado elimina a elevação; o foco visível combina borda do cartão e anel interno sem depender de glow.
- Comissões mantém `aria-expanded`, `aria-controls`, painel com `aria-hidden` e `inert` quando recolhido.
- Enter expande; Escape recolhe e devolve o foco ao controlador.
- Alvos interativos preservam pelo menos 44 px e há tratamentos dedicados para `prefers-reduced-motion`, transparência reduzida, contraste aumentado e forced colors.
- Não há `transition: all`, animação de entrada por cartão, gradiente temático amplo, neon ou brilho contínuo.

## Estado expandido

- O pai expandido usa uma variação navy mais profunda (`#12293c`), mantendo a mesma borda e linguagem de profundidade.
- Os destinos internos usam superfície secundária comum (`#172d40`), ícones padronizados e a mesma seta dos acessos principais.
- As dez frentes continuam derivadas de `commissionRegistry`; não foi criado um segundo mapa de navegação ou permissão.
- Separação, espaçamento e tipografia são mais leves que no pai, mas pertencem ao mesmo sistema visual.
- A grade passa de cinco para duas e depois uma coluna, sem introduzir outra paleta.

## Matriz responsiva inspecionada

| Viewport | Cartões principais | Destinos expandidos | Overflow horizontal |
| --- | --- | --- | --- |
| 1920×1080 | 90 px, cinco alinhados | 5 colunas | Não |
| 1680×1050 | 90 px, cinco alinhados | 5 colunas | Não |
| 1366×768 | 76 px, cinco alinhados | 5 colunas | Não |
| 768×1024 | 90 px, cinco alinhados | 2 colunas | Não |
| 430×932 | 134 px, coluna única | 1 coluna | Não |
| 390×844 | 134 px, coluna única | 1 coluna; 116 px por destino | Não |
| 360×800 | 134 px, coluna única | 1 coluna | Não |

Nos três viewports mobile, os nomes permanecem integrais, os índices decorativos são ocultados, as descrições quebram naturalmente e os ícones não dominam a composição. Em 390×844, as dez frentes expandidas mantiveram a mesma altura de 116 px.

Evidências visuais:

- [desktop 1440×900](screenshots/portal-unified-cards-desktop-1440x900.png);
- [Comissões expandida](screenshots/portal-unified-cards-commissions-expanded.png);
- [mobile 390×844](screenshots/portal-unified-cards-mobile-390x844.png).

## Validação automatizada

- 49/49 testes focados e adjacentes aprovados em 6 arquivos, incluindo arquitetura, acesso sensível, estados do portal, acessibilidade e integração Alvorada.
- ESLint dos arquivos TypeScript/TSX tocados: aprovado sem ocorrências.
- TypeScript global (`tsc --noEmit`): aprovado.
- Build de produção: aprovado; 4.899 módulos transformados em 25,28 s.
- `git diff --check`: aprovado.
- Console do navegador: nenhum erro da aplicação. Permanecem somente avisos herdados sobre future flags do React Router.
- O build mantém os avisos herdados de Browserslist desatualizado e chunks de mapas acima de 500 kB; nenhum deles foi introduzido pelo sistema de cartões.

## Escopo funcional preservado

Ordem dos cinco acessos, rotas, nomes, guards, callbacks de autenticação, Supabase, RLS, permissões, `resolveModuleAccess`, disponibilidade de módulos, dados e regras de negócio não foram alterados. Agenda Fenasoja, Agenda Restaurante e Arena, Mapa Comercial e Financeiro continuam acessos diretos; Comissões continua sendo o único grupo expansível.

O navegador local estava sem sessão autenticada. Foram inspecionados o estado anônimo, a composição responsiva, as interações de teclado e o painel expandido; estados permitidos, loading, restritos e integrações de rota foram cobertos pelos testes automatizados. Smoke autenticado por perfil no ambiente-alvo não é apresentado como executado.
