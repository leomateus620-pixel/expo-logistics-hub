# Fenasoja 2028 — refinamento da navegação principal

Validação executada em 03/08/2026.

## Problemas visuais corrigidos

- Superfícies navy quase uniformes deixavam as quatro entradas pesadas e com pouca diferenciação.
- Barras laterais coloridas concentravam a identidade em uma faixa desconectada do restante do cartão.
- Rótulos como “Acesso direto”, “Acesso liberado” e “Acesso protegido” repetiam o estado já comunicado pela própria ação.
- Agenda e Comissões abertas acrescentavam contêineres escuros, numeração e metadados que aumentavam a densidade.
- Título, descrição, status e ação competiam pela mesma hierarquia tipográfica.
- O layout mobile reduzia o desktop sem uma composição própria para toque e leitura curta.

## Novo sistema visual

| Módulo | Superfície | Acento | Título | Intenção |
| --- | --- | --- | --- | --- |
| Agenda | `#2d3b45 → #172b3b` | `#dfc58d` | `#fff8e9` | Champanhe e âmbar suave para planejamento institucional |
| Mapa Comercial | `#214563 → #14334e` | `#83bdea` | `#f1faff` | Azul-celeste e cornflower para leitura espacial |
| Comissões | `#20444b → #12343e` | `#70c9bf` | `#f0fffb` | Turquesa mineral e teal para colaboração operacional |
| Financeiro | `#403b38 → #26323b` | `#d0a47e` | `#fff5ea` | Bronze e cobre contidos para confiança executiva |

Cada paleta atua sobre o cartão inteiro com gradiente tonal, camada de iluminação, borda e sombra próprias. Não há faixa lateral, neon contínuo, blur de grande área nem animação automática. Estados restritos preservam texto e semântica, com contraste neutro e sem depender apenas de cor.

## Superfície, tipografia e redução de ruído

- Os cartões recolhidos permanecem compactos e alinhados, com ícone de 44 px, título mais legível, descrição curta e uma única ação.
- Contagens aparecem somente em Agenda e Comissões, onde “2 destinos” e “8 frentes” ajudam a antecipar o conteúdo.
- Foram removidos da interface visível rótulos redundantes de liberação/proteção, numeração interna de destinos e comissões, subtítulos técnicos, rodapé de permissão e ações duplicadas.
- A informação de loading, restrição ou indisponibilidade só aparece quando muda o que o usuário pode fazer; a descrição completa permanece disponível para tecnologia assistiva.
- Títulos usam maior peso e contraste; descrições receberam linha mais confortável, largura controlada e quebra previsível.

## Agenda expandida

- O cartão pai mantém o champanhe como identidade e conecta visualmente o painel por borda e superfície contínuas.
- Cronograma e Eventos e Eventos Restaurante e Arena usam cartões internos mais claros, sem numeração e sem “Acesso liberado”.
- Cada destino tem ícone, nome, descrição concisa e apenas uma ação contextual.
- A grade usa duas colunas quando há espaço e uma coluna antes de o conteúdo comprimir.

## Comissões expandida

- As oito frentes continuam derivadas do `commissionRegistry`; não existe novo mapa de navegação ou permissão.
- A grade responde em quatro, duas e uma coluna, com cartões memoizados e densidade controlada.
- O estado acessível não recebe etiqueta redundante. “Em estruturação”, restrição e indisponibilidade aparecem somente quando afetam a ação e sempre incluem texto/semântica, não apenas cor.
- A ação é única em cada frente e o painel permanece ligado ao controlador principal.

## Interação, acessibilidade e desempenho

- Hover em 215 ms e expansão em 270 ms usam somente propriedades leves e específicas; não há `transition: all`.
- A superfície inteira responde com iluminação, borda e elevação; a seta se desloca poucos pixels e o pressionado reduz a elevação.
- Botões de expansão mantêm `aria-expanded` e `aria-controls`; painéis recolhidos usam `aria-hidden` e `inert`.
- Enter expande, Escape recolhe e devolve o foco ao controlador. O foco cobre a superfície interativa com contorno de 3 px.
- Alvos de toque têm pelo menos 44 px. Há suporte a `prefers-reduced-motion`, transparência reduzida, contraste aumentado e forced colors.
- O React usa limites estáveis e `memo` com comparadores focados para que a abertura de um grupo não recalcule cartões sem mudança. Nenhuma dependência visual ou de animação foi adicionada.

## Matriz responsiva e inspeção visual

Sem overflow horizontal, ações cortadas ou erros de console em:

- desktop/notebook: 1920×1080, 1680×1050, 1536×864, 1440×900 e 1366×768;
- tablet: 768×1024, com duas colunas para Agenda e Comissões;
- mobile: 430×932, 390×844, 376×812 e 360×800, com coluna única e ordem visual preservada.

O controlador arredonda a largura física solicitada de 375 px para 376 px; o breakpoint de 375×812 foi corroborado pelos vizinhos 376×812 e 360×800 e pela regra dedicada abaixo de 380 px.

Em 1366×768, Agenda aberta mantém os dois destinos e todas as ações visíveis, com apenas 6 px de rolagem vertical adicional. Em mobile, os destinos e frentes empilham sem perda de foco, corte ou overflow.

Evidências:

- recolhido: `docs/screenshots/portal-access-navigation-v2-desktop-1366x768.png`;
- Agenda aberta: `docs/screenshots/portal-access-navigation-v2-agenda-1366x768.png`;
- Comissões abertas: `docs/screenshots/portal-access-navigation-v2-commissions-1366x960.png`;
- mobile: `docs/screenshots/portal-access-navigation-v2-mobile-390x844.png`.

## Validação automatizada

- 74/74 testes focados e adjacentes aprovados em 7 arquivos.
- ESLint dos 7 arquivos TypeScript/TSX tocados: aprovado sem ocorrências.
- TypeScript global (`tsc --noEmit`): aprovado.
- Build de produção: aprovado, 4.748 módulos transformados; bundle do portal com 23,21 kB de JS e 60,88 kB de CSS antes de gzip.
- `git diff --check`: aprovado; busca negativa confirmou a ausência dos quatro rótulos redundantes na produção.

Baseline global fora deste escopo: 440/467 testes aprovados; 27 falhas em 4 arquivos de Cronograma não tocados por esta entrega. A maioria continua ligada a harnesses sem `AuthProvider`, além de expectativas antigas da timeline. O build mantém os avisos herdados de Browserslist desatualizado e chunks grandes de mapas.

## Escopo funcional preservado

As rotas, nomes, guards, callbacks de autenticação, Supabase, RLS, permissões, validação de acesso, disponibilidade de módulos, Administrator, dados, regras de negócio e destinos não foram alterados. O trabalho reutiliza `portalRegistry`, `commissionRegistry`, `resolveModuleAccess`, handlers e consultas existentes.

O navegador local estava sem sessão autenticada. Foram validados o estado anônimo e seus deep links de login, a navegação por teclado, a renderização responsiva e os estados permitidos/loading/restritos por testes automatizados. Smoke autenticado por perfil no ambiente-alvo permanece como evidência de release e não é apresentado aqui como executado.
