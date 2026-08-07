# Separação das agendas no portal e nos logins

## Objetivo

No portal inicial, "Agenda" deixa de ser um grupo expansível com dois destinos internos. Passam a existir dois acessos independentes, lado a lado com os demais:

- Agenda Fenasoja (antigo "Cronograma e Eventos")
- Agenda Restaurante e Arena (antigo "Eventos Restaurante e Arena")

Cada um leva a sua própria tela de login, separada da outra. As rotas continuam exatamente as mesmas.

## Rotas (inalteradas)

| Acesso | Login | Destino |
| --- | --- | --- |
| Agenda Fenasoja | `/login/cronograma-eventos` | `/cronograma-eventos` |
| Agenda Restaurante e Arena | `/login/eventos-restaurante-arena` | `/eventos-restaurante-arena` |

## Portal inicial

- Remoção do card expansível "Agenda" e da lista de destinos que abria abaixo dele.
- Ordem final dos acessos: 01 Agenda Fenasoja, 02 Agenda Restaurante e Arena, 03 Mapa Comercial, 04 Comissões, 05 Financeiro.
- Cada um dos dois novos cards é do tipo direto ("Entrar para acessar"), com a mesma verificação de permissão/capacidade que os destinos usavam hoje (`cronograma_eventos_access` e `venue_events_access`), o mesmo estado de carregando/negado e a mesma persistência do módulo selecionado.
- Descrições: Agenda Fenasoja — "Planejamento, linha do tempo, calendário e execução do ciclo oficial."; Agenda Restaurante e Arena — "Reservas, aprovações, contrapartidas e operação dos espaços."

## Destaque tipográfico dos dois nomes

Um tratamento visual dedicado, aplicado tanto no card do portal quanto no cabeçalho do login correspondente:

- Agenda Fenasoja: "Agenda" em creme claro, "Fenasoja" em dourado institucional com brilho suave e sublinhado em gradiente dourado; leve profundidade 3D (sombra interna + halo) sobre o fundo navy.
- Agenda Restaurante e Arena: "Agenda" em creme, "Restaurante e Arena" em gradiente âmbar/cobre, com o mesmo sistema de sublinhado e halo, porém em temperatura de cor distinta para diferenciar os dois domínios.
- Ambos com contraste verificado sobre fundo escuro e claro, versão reduzida para mobile, e respeito a `prefers-reduced-motion` (sem animação de brilho quando desativado).

## Telas de login separadas

Hoje as duas experiências dividem a mesma página com variações internas. Passam a ser duas composições distintas:

- `/login/cronograma-eventos`: identidade Agenda Fenasoja — hero de ciclo/cronograma já existente, título com o destaque acima, subtítulo institucional do planejamento 2028.
- `/login/eventos-restaurante-arena`: identidade Agenda Restaurante e Arena — hero próprio de operação de espaços, título com o destaque âmbar, capacidades voltadas a reservas, conflitos e contrapartidas.
- O formulário (e-mail, senha, validação, estados de erro/sucesso, redirect pós-login) permanece idêntico em comportamento nas duas telas; muda apenas a camada de apresentação.
- O link "Voltar ao portal" continua em ambas.

## Renomeações no restante do sistema

Onde os rótulos aparecem para o usuário, passam a usar os novos nomes: cabeçalho do módulo Restaurante e Arena, card do portal, títulos de login e a navegação lateral. Identificadores técnicos, slugs, capacidades e rotas não mudam.

## Detalhes técnicos

- `src/modules/portal/portalRegistry.ts`: `portalAgendaDestinations` deixa de alimentar um grupo; passam a existir duas entradas diretas (`agenda-fenasoja`, `agenda-restaurante-arena`) com `route`, `loginPath`, `capability` e `storageSlug` atuais preservados. O tipo `PortalEntryId` e o `tone` ganham os dois novos valores.
- `src/pages/commissions/CommissionPortalPage.tsx`: remove o ramo expansível de agenda e resolve o acesso dos dois novos cards diretos via `resolveModuleAccess`, reaproveitando os helpers de estado já existentes.
- `src/components/portal/PortalPrimaryEntry.tsx`: suporte ao título com marcação em duas partes (base + destaque) em vez de string simples.
- Novo `src/components/brand/AgendaWordmark.tsx` + `src/styles/agenda-wordmark.css` com as duas variantes (`fenasoja`, `venue`), usando tokens semânticos existentes de navy/creme/dourado; sem cores hardcoded.
- `src/pages/LoginPage.tsx`: separa a configuração das duas agendas em presets próprios (hero, título com wordmark, capacidades, copy), mantendo o mesmo fluxo de autenticação e redirecionamento.
- `src/components/venue-events/VenueModuleShell.tsx` e `VenuePortalCard.tsx`: título atualizado para "Agenda Restaurante e Arena".
- Testes: atualizar `src/test/loginExperience.test.tsx` para os novos títulos e adicionar cobertura de que cada login preserva seu redirect; adicionar teste do portal garantindo os dois acessos diretos e a ausência do grupo expansível.
