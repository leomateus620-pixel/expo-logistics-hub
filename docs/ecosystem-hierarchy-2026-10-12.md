# Ecossistema FENASOJA — hierarquia e apresentação

Atualizado em 23/10/2026. Esta especificação substitui a apresentação anterior de raízes pares e a exploração vertical obrigatória no celular.

## Grafo e classificação

A cadeia resolvida é **CCPF → presidente → vice-presidente → Comissão Central → unidades**. Presidente e vice são identificados por `metadata.executiveRole` e identidades canônicas, sem comparar os nomes dos ocupantes. `parentIds` é a fonte das arestas e de `childIds`; não existe a ligação paralela CCPF → vice no cadastro completo.

Sem vice, a Central usa a presidência; sem presidente, a vice usa CCPF. As anomalias existentes continuam explícitas, inclusive cardinalidade executiva inesperada. Nenhum ocupante é fabricado nem escolhido silenciosamente entre múltiplos registros. Pessoas, responsabilidades, IDs e vínculos inferiores permanecem nas fontes existentes.

A profundidade de apresentação é independente de `AuthorityLevel`: conselho, Presidência (ambos os executivos), Central, Comissões e Assessorias mantêm suas classificações, filtros e regras de renderização. A posição não concede capabilities, gestão comercial ou acesso aos bots.

A deduplicação restrita da Zélia na lista apresentada pela Central permanece: somente a identidade histórica `38e7e8d3-4c66-4279-92ea-961b70ee4e80` é omitida dessa lista quando a conta da diretoria `74a71a9f-c2a6-4ae1-baed-1e2d7b8bc07f` também está presente e ambas mantêm o nome auditado. A conta da assessoria, suas responsabilidades e fontes continuam no grafo. Homônimos com outros IDs e cadastros incompletos não são suprimidos.

## Composição e leitura

Os quatro retratos superiores compartilham o mesmo eixo vertical, com conectores visíveis e legendas à direita. Pequenas diferenças nos medalhões e nas cores distinguem conselho, executivos e Central, sem cartões ou zigue-zague. As unidades usam uma grade ampla, com famílias identificadas pela cor e pelos filtros. Conectores partem dos pais reais, passam pelos corredores entre células e não ligam irmãos entre si.

O layout calcula dimensões e número de colunas com base no espaço disponível e na quebra dos nomes completos. Os nomes não usam reticências. Descrições de unidades podem ocupar duas linhas; seleção e painel disponibilizam o conteúdo completo. Retratos usam thumbnails locais e dimensões reservadas.

Quando todas as unidades não cabem com leitura adequada, a apresentação muda em vez de impor um zoom que corte o grafo. No celular, a visão geral mostra os quatro níveis e dois grupos com contagens reais. Tocar no grupo ou no filtro abre as unidades, com a cadeia superior como referência. Paginação mantém os nomes e retratos legíveis em telas baixas e em conjuntos grandes; nenhuma unidade é retirada do grafo canônico. “Ver todo o ecossistema” retorna ao grupo de origem e restaura o foco. No notebook de 1280×720 da fixture, as unidades são divididas em duas páginas, sem reduzir os nomes para caber.

Os seis filtros são ícones pequenos abaixo da marca, com nomes acessíveis, estado pressionado, tooltip por foco/hover e alvo de toque de pelo menos 44 px. A barra inferior ocupa espaço medido, sem cobrir os nomes. A busca não foi reintroduzida.

## Viewport e interação

`ResizeObserver` mede o container, o cabeçalho e o rodapé. Fontes, orientação e `visualViewport` provocam nova medição. A tela cheia usa `100dvh`, safe areas e bloqueio temporário do scroll do fundo. O fit usa o menor quociente entre largura/altura úteis e bounds do layout, sem um piso que corte conteúdo. O limite do zoom manual é separado da política de enquadramento.

O layout muda de nível de detalhe ou pagina quando necessário. Atualização de nome/foto ou refetch não reinicia a apresentação nem a câmera. Gesto manual interrompe a transição de câmera. O painel textual tem rolagem própria; ao fechar, recupera câmera e foco. Setas, Home, Escape, seleção e foco visível continuam disponíveis. Destaque de ascendentes e descendentes usa relações canônicas; pertencer ao coletivo não transforma uma pessoa em autoridade sobre todas as suas unidades.

## Entrada progressiva

`presentationPlan.ts` é a fonte única de tempos para nós e conexões: CCPF em 0 ms, presidente em 450 ms, vice em 1.050 ms, Central em 1.650 ms e ondas inferiores a partir de 2.250 ms. O conjunto termina em até 3.400 ms, independentemente da quantidade de unidades. Os conectores antecedem os filhos. As posições finais ficam reservadas desde o início; apenas opacidade, transformações locais e desenho SVG são animados.

O relógio roda uma vez por abertura. Pular, gesto, filtro ou seleção concluem a entrada. Nós invisíveis não recebem foco; aba oculta conclui o relógio e desmontagem cancela os timers. `prefers-reduced-motion` entrega o estado final imediatamente. Não há estado React por frame.

## Retratos e nome

Os retratos fornecidos de Elvio Becker, Jorge Luiz Viana, Jonas Santos e Francine Maria Boijink foram incluídos no registro compartilhado e em thumbnails WebP de 512 px. O nome corrigido é **Jonas Santos**, inclusive nas fontes persistidas usadas por outras telas. A correção é por IDs exatos, preservando aliases históricos para localizar o mesmo retrato.

A migração `20261023050000_register_official_people_portraits.sql` registra somente esses quatro retratos no cadastro vinculado e corrige o nome de Jonas nos metadados da conta, perfil, membro e responsável. Foi aplicada e conferida na base durante esta execução. Não altera estrutura, senha, autenticação, capabilities ou RLS. As URLs apontam para os assets de um commit imutável já publicado. Layout e hierarquia não exigem mudança de banco.

## Alterações associadas

Em Vendas e contratos, a faixa recebeu mais largura horizontal e espaçamento menor entre título e métricas. Área comercial passou a ocupar uma coluna menor, sem stretch que iguale artificialmente alturas. A média de assinatura continua usando o mesmo provider, amostra, estados, permissões, detalhes e retorno de foco.

O Bot FENASOJA passou a usar o mascote compacto: ao lado do Ecossistema no portal, da Dashboard no Mapa e da busca na Agenda. Slots leves recebem a única instância do botão; elegibilidade, reconfirmação de senha, atalho e sessão permanecem no launcher existente. Não há novo provider ou consulta. O piscar respeita movimento reduzido.

## Evidência e reprodução

As medidas, capturas comparáveis, limitações e verificações estão em [design-qa.md](validation/ecosystem-fit/design-qa.md). A comparação usa main `9e8e35b4ef235131059f3a6fd3c1caa0a5951b5c` e a mesma fixture de 41 pessoas e 33 unidades inferiores. Esses números descrevem a fixture, não são limites do produto nem contagens fixas do cadastro.

```sh
node scripts/prepare-ecosystem-qa.mjs
node scripts/dashboard/prepare-compact-qa.mjs
npx vite --config scripts/alvorada-qa.config.ts --port 8089
npx vite --config scripts/dashboard/compact-qa.vite.config.ts --port 8088
# /scripts/alvorada-qa.html?graph e /scripts/ecosystem-before.html?graph
# /scripts/responsive-review.html?target=... para medidas de DOM
# /scripts/workers-launcher-qa.html?surface=portal|map|agenda
npm run typecheck
npm run build
npm test
```

O script opcional `check-alvorada-interactions.mjs` contém as expectativas atualizadas para reprodução em ambiente com Playwright. As verificações de navegador desta entrega foram feitas pela ferramenta de navegador/computador do Codex, incluindo Chrome no perfil Leo. Não houve teste físico em iPhone ou Safari iOS, merge ou deploy da interface.
