# Mapa Comercial independente — validação

Data da revisão: 4 de agosto de 2026.

## Resultado

`/mapa-comercial` deixa de ser renderizado dentro do shell da Comissão de Logística e passa a usar uma composição própria, de tela inteira, mantendo a rota, o login, os três guardas e a autorização real por `map.view`.

Não foram alterados Supabase, RLS, queries, persistência, dados oficiais, nomes de rota, callbacks, permissões ou regras comerciais.

## Auditoria de dependências

| Item anterior | Decisão | Resultado |
| --- | --- | --- |
| `Layout` da Logística | Removido somente da árvore de `/mapa-comercial` | A rota não herda mais margem lateral, cabeçalho ou transição do módulo de Logística. |
| `Sidebar` | Removida da árvore do Mapa Comercial | O mapa não depende mais do estado aberto/recolhido do menu. |
| `OfflineBanner` e `DriverGpsBanner` | Removidos da árvore do Mapa Comercial | Alertas operacionais de transporte não ocupam o viewport comercial. |
| `useDriverAutoArm` | Removido da árvore do Mapa Comercial | Acesso ao mapa não inicializa comportamento de motorista. |
| Cabeçalho “Comissão de Logística” e `UpcomingEventsBell` | Removidos da apresentação do mapa | A identidade visual agora é “Mapa Comercial”. |
| Rótulo morto de `/mapa-comercial` no `Layout` | Removido | Elimina o último vínculo declarativo com a moldura de Logística. |
| `AuthGuard`, `OrgGuard`, `CapabilityGuard capability="map.view"` | Preservados | Autenticação, organização e permissão continuam sendo a fonte de verdade. |
| Workspace, store, queries, canvas e handlers atuais | Reutilizados | Não existe fluxo paralelo nem duplicação de estado ou navegação. |

## Shell e viewport

- O novo `CommercialMapShell` ocupa `100dvh` e oferece identidade própria, retorno ao Portal, saída pelo `useAuth().signOut()` existente e atalho de salto para o conteúdo.
- O workspace comercial preenche todo o espaço restante com `height: 100%` e `min-height: 0`, sem cálculos ligados à altura da navegação anterior.
- A câmera observa a dimensão real fornecida pelo canvas. Mudanças de largura, altura, orientação ou painel reenquadram a seleção, o segmento ativo ou o preset atual no próximo frame.
- O seletor Parque/Exporural continua separado dos controles de câmera e filtros.
- Ações administrativas ficam em “Gestão”; edição de geometria, calibração, publicação e implantação não competem mais com os controles cotidianos.

## Login dedicado

O formulário, validação, `signIn`, tratamento de erro e redirect para `/mapa-comercial` foram preservados. A composição visual foi simplificada para uma entrada dedicada em azul-petróleo, azul-claro e laranja institucional.

Foram removidos, apenas para o Mapa Comercial:

- “Acesso protegido”;
- “Capacidades do ambiente”;
- cartões “Parque mapeado”, “Disponibilidade”, “Contratos” e “Acesso controlado”;
- selo “Módulo selecionado”;
- nota redundante “Acesso restrito”.

### Evidência visual

| Estado | Evidência |
| --- | --- |
| Login anterior | [commercial-map-before-login.png](./screenshots/commercial-map-before-login.png) |
| Dependência anterior do shell de Logística | [commercial-map-before-logistics-shell.png](./screenshots/commercial-map-before-logistics-shell.png) |
| Desktop anterior com mapa comprimido | [commercial-map-before-constrained-desktop.png](./screenshots/commercial-map-before-constrained-desktop.png) |
| Login independente — 1366 × 768 | [commercial-map-independent-login-1366x768.png](./screenshots/commercial-map-independent-login-1366x768.png) |
| Login independente — 360 × 800 | [commercial-map-independent-login-360x800.png](./screenshots/commercial-map-independent-login-360x800.png) |

## Responsividade verificada

O login foi medido no navegador com os seguintes viewports CSS: 1920 × 1080, 1680 × 1050, 1536 × 864, 1440 × 900, 1366 × 768, 1024 × 768, 768 × 1024, 430 × 932, 390 × 844, 375 × 812 e 360 × 800.

Resultados:

- nenhuma rolagem horizontal ou vertical inesperada;
- painel e ação principal integralmente visíveis;
- composição em duas áreas no desktop e em uma coluna no tablet/mobile;
- campos com 16 px no mobile para evitar zoom automático;
- ação principal com 51 px de altura nos menores viewports;
- controles do mapa com alvo mínimo de 44 px em tablet/mobile;
- container queries preservam a adaptação quando painéis reduzem o espaço disponível.

## Acessibilidade e desempenho

- landmarks, títulos e nomes acessíveis em português;
- link “Ir para o mapa comercial” visível ao foco;
- foco de teclado completo e preciso; a sequência E-mail → Senha foi verificada com `:focus-visible` ativo;
- botões de retorno e saída com nome acessível e alvo de 44 px;
- `<details>/<summary>` nativo para as ferramentas administrativas;
- suporte a `prefers-reduced-motion`, contraste forçado e transparência reduzida;
- nenhum pacote, biblioteca de animação, consulta ou árvore mobile duplicada;
- transições novas limitadas a propriedades específicas;
- recomposição da câmera agendada em um único `requestAnimationFrame` por mudança de viewport.

## Validação funcional e técnica

- suíte focada do Mapa Comercial, login, arquitetura e integração com o Portal atual: **20 arquivos e 160/160 testes aprovados**;
- contrato visual compartilhado do login incluído nessa bateria: **7/7 testes aprovados**;
- TypeScript (`tsc --noEmit`): **aprovado**;
- ESLint dos arquivos alterados: **aprovado**, exceto dívida preexistente em `src/App.tsx:361` (`@typescript-eslint/no-explicit-any`), linha não alterada por esta entrega;
- `git diff --check`: **aprovado**;
- build Vite de produção: **aprovado** (`4751` módulos transformados);
- console do build atual em `127.0.0.1:4174`: **sem erros**;
- guardas e redirect dedicados: cobertos por testes de arquitetura e autenticação.

A suíte global terminou com **448 testes aprovados e 27 falhas em 4 arquivos do Cronograma não alterados nesta branch**. O diff contra `origin/main` confirma que esses quatro arquivos e o domínio do Cronograma permanecem intactos. O lint global também conserva a dívida ampla do repositório: **975 erros e 33 avisos**, enquanto o lint focado desta entrega está limpo.

O build mantém os avisos já existentes de `caniuse-lite` desatualizado e chunks de mapas maiores que 500 kB; nenhum chunk novo, dependência ou biblioteca foi introduzido por este trabalho.

## Limite de validação autenticada

Não havia sessão Supabase válida em `127.0.0.1:4174`, `127.0.0.1:4173` ou `127.0.0.1:8080`. O acesso real redirecionou para o login dedicado, confirmando que os guardas permanecem ativos. Nenhuma credencial foi inventada, nenhum estado visual autenticado foi simulado e nenhum guarda foi desativado para produzir screenshots.

Assim, a validação renderizada do workspace após autenticação continua sendo um smoke de ambiente para um revisor com conta autorizada. A implementação local foi validada por testes, inspeção estrutural, build, tipos, lint e pelo login real; a PR não afirma um smoke autenticado que não ocorreu.
