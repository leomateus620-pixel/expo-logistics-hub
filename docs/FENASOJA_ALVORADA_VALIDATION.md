# FENASOJA 2028 — Alvorada e Ecossistema Organizacional

## Resultado

`O Nascer da Alvorada` continua sendo aberto pelo launcher real `FENASOJA 2028`
no cabeçalho do Portal. A URL permanece `/portal`: nenhuma rota paralela, cópia
da experiência ou atalho de autenticação foi criado.

A antiga cidade 3D e o título tipográfico 3D saíram do runtime. A nova jornada
preserva amanhecer, Brasil, Rio Grande do Sul e Santa Rosa, apresenta a marca
oficial com o componente compartilhado `FenasojaBrand` e a transforma em um
ecossistema organizacional interativo alimentado pelos registros atuais da
Agenda FENASOJA.

## Cadeia preservada do Portal

1. `src/App.tsx` mantém `/portal` apontando para `CommissionPortalPage`.
2. O botão de marca em `CommissionPortalPage` mantém o rótulo acessível
   `Abrir O Nascer da Alvorada` e chama `openAlvorada`.
3. `openAlvorada` aquece os assets críticos e altera somente o estado local
   `alvoradaOpen`.
4. O lazy import existente monta `FenasojaAlvoradaExperience` como diálogo
   fullscreen por React Portal.
5. `AlvoradaCanvas` e `SceneController` executam a parte WebGL; a marca DOM e
   `OrganizationalEcosystem` assumem o quadro final.
6. Fechar restaura o foco ao mesmo launcher do Portal.

Auth, organização ativa, permissões, RLS, deep links e demais destinos do
Portal permanecem sob os contratos existentes.

## Timeline autoritativa

| Intervalo | Fase | Composição |
| --- | --- | --- |
| 0,0–1,6 s | `dawn` | amanhecer orbital, atmosfera e início da aproximação |
| 1,6–4,4 s | `territory` | Brasil, Rio Grande do Sul e percurso territorial |
| 4,4–5,8 s | `santa-rosa` | Santa Rosa como origem da narrativa |
| 5,8–7,4 s | `brand-reveal` | entrada responsiva da marca oficial |
| 7,4–9,4 s | `brand-hold` | marca hero integral por 2,0 segundos |
| 9,4–11,4 s | `org-transition` | marca dá lugar ao CCPF e revela a rede por nível |
| 11,4 s em diante | `org-ready` | ecossistema vivo e integralmente interativo |

Se os dados ainda estiverem carregando no limite da timeline, a marca permanece
em cena. Quando a consulta termina, uma transição DOM de dois segundos executa
`brand-hold → org-transition → org-ready`; o Canvas já liberado não é recriado.

## Dados organizacionais

O recurso não possui nomes, cargos, comissões, assessorias ou retratos de
exemplo. As fontes são as mesmas do sistema:

- `useOrgMembers` consulta membros ativos em `org_members_safe` e resolve o nome
  da comissão; erros de rede, RLS ou consulta agora são propagados, não
  convertidos silenciosamente em uma lista vazia;
- `useOrgCommissions` consulta unidades ativas em `commissions`, incluindo
  `commission_responsibles`;
- `personPhotos` e `avatar_url`/`photo_url` reaproveitam os retratos já
  registrados; ausência de foto usa um fallback neutro, nunca uma pessoa falsa.

O resolver mantém uma identidade canônica por `user_id`. Variações longas ou
abreviadas são conciliadas por subconjunto exato; uma aproximação pode corrigir
no máximo um caractere em um único token, somente quando a relação não traz
`user_id` e existe um único membro compatível. Contas distintas nunca são
fundidas por aproximação ou mera igualdade de nome.

Há um único reparo explícito e auditável para o par de contas executivas
duplicadas confirmado no snapshot autenticado de 22/08/2026: o registro
`efb4…` é conciliado ao registro canônico `b8fd…` de Fabiano Soltis, com guarda
do nome normalizado. Presidente, Vice-Presidente e todos os IDs/fontes reais
permanecem no objeto canônico, mas somente um retrato executivo é renderizado.
Qualquer outro homônimo com `user_id` distinto continua separado e gera alerta
de integridade.

Níveis renderizados:

- nível 1: CCPF — Conselho Consultivo Permanente FENASOJA, com a marca oficial
  como ícone principal;
- nível 2: Presidente e Vice-Presidente localizados por cargos explícitos;
- nível 3: Comissão Central, sem repetir CCPF ou executivos;
- nível 4: comissões e assessorias oficiais, atuais e não legadas;
- nível 5: voluntariado aceito pelo modelo e pelas relações, mas excluído da
  allow-list, busca, navegação, detalhes e renderer desta versão.

A Comissão Central é reconhecida por nome ou slug e não pode reaparecer como
unidade de nível 4. Na fronteira desta visualização, Ivan Squinzani é removido
da composição da Comissão Central por identidade normalizada, inclusive quando
o vínculo usa uma função composta que contém `Comissão Central`. Jardel
Hillesheim e a unidade vinculada são omitidos por nome, `user_id`, nome da
comissão e `commission_id`; assim, pessoas, responsabilidades, nós e busca não
mantêm resíduos mesmo quando o nome da unidade muda, sem alterar as tabelas
compartilhadas. Valores de autorização como `admin`, `gestor` e `operador` não
são tratados como cargos institucionais.

Nomes, cargos, papéis, unidades e responsabilidades são convertidos para
uppercase pt-BR somente depois da resolução de identidade. IDs, slugs, tipos e
matching continuam nos valores canônicos internos.

Autenticação e organização também são estados explícitos do domínio. Enquanto
a sessão ou o membership resolvem, a marca permanece em hold; sessão anônima,
membership inválido ou organização ausente produzem erro recuperável, nunca um
grafo vazio apresentado como dado oficial. O retry abrange membership, membros,
enriquecimento de nomes e unidades. A consulta compartilhada de membros mantém
os registros-base disponíveis mesmo se somente o enriquecimento de comissão
falhar, preservando os consumidores legados.

## Composição e interação

O layout é determinístico, com CCPF como âncora, Presidência no segundo anel,
Comissão Central no terceiro e agrupamentos operacionais no quarto. A linguagem
visual usa azul profundo, índigo, laranja e dourado FENASOJA; as referências de
Ghost Recon orientaram apenas legibilidade de hierarquia, retratos circulares e
leitura de conexões.

Interações implementadas:

- seleção por clique/toque, destaque de ancestrais e conexões diretas;
- busca por pessoa, cargo, unidade ou responsável, incluindo responsáveis
  secundários;
- combobox com `ArrowUp`, `ArrowDown`, Enter, Escape,
  `aria-activedescendant` e opção ativa;
- filtros de CCPF, Presidência, Comissão Central, Comissões e Assessorias;
- pan, roda, zoom pelos controles, pinch com dois ponteiros e enquadramento;
- navegação espacial por setas, Home para CCPF e Escape contextual;
- painel lateral no desktop e bottom sheet no mobile;
- focus trap do diálogo, retorno do foco ao nó após fechar detalhes,
  restauração de foco ao launcher, safe areas, forced colors e
  `prefers-reduced-motion`.

## Refinamento organizacional de 22/08/2026

O renderer mantém `org:ccp` e o tipo `ccp` como contratos internos, mas toda a
apresentação usa `CCPF` e o nome institucional completo. O masthead passou a
usar o lockup oficial `FenasojaBrand`; o contador genérico de estruturas e a
tecla decorativa do buscador foram removidos. Cada filtro possui ícone Lucide
próprio, label uppercase e estado `aria-pressed`.

Os textos `AUTORIDADE`, `FLUXO DE AUTORIDADE`, `RESPONDE A` e `CONECTA` não são
mais renderizados nem usados em nomes acessíveis. O painel continua exibindo
pessoas, papéis e responsabilidades úteis, sem reconstruir uma seção textual de
relações.

Para o snapshot de 35 unidades operacionais anterior ao filtro de Jardel, o
layout de stress distribui o nível 4 em 12 colunas e 3 linhas, com mundo de
`2192 × 1210`, posições únicas, linhas mais próximas e separação visual mínima
entre cartões. Grades esparsas de uma a seis unidades também permanecem
centralizadas. A
entrada é derivada do nível hierárquico: CCPF em 140 ms, Presidência em
480–640 ms, Comissão Central em 920 ms e nível 4 em 1120–1868 ms. Conexões usam
o nível e a ordem estável do destino, `pathLength`, traço não escalável de
1,8 px, glow transitório dourado de 3,4 px durante a revelação e glow persistente
somente no destaque.

A câmera ainda inicia no CCPF, mas executa `fit()` aos 2600 ms, depois do fim
das animações de nós e conexões. Qualquer interação de ponteiro, teclado,
busca, filtro ou zoom cancela esse timer; desmontagem e mudança de estado ativo
também limpam o agendamento. Se uma nova interação interrompe uma transição, a
câmera adota primeiro a matriz visual já renderizada, evitando saltos para o
alvo antigo. Pan, pinch e atualizações de câmera continuam agrupados por
`requestAnimationFrame`, sem loop React por frame.

## Performance e lifecycle

- cidade, edifícios, terreno urbano, árvores, fonte 3D e título 3D não são
  montados nem prefetchados;
- o passe N8AO residual foi removido depois do perfil em 1920×1080; SMAA,
  vinheta e bloom por capacidade continuam disponíveis;
- a Terra é desmontada após a troca territorial e suas texturas são
  descartadas;
- o grafo é preparado invisível durante o hold estático da marca, evitando
  construir a árvore durante o início do reveal;
- o Canvas é desmontado em `org-ready`; pan, zoom e seleção não mantêm WebGL ou
  loops da intro residentes;
- mudanças de câmera do grafo são agrupadas por `requestAnimationFrame`;
- telemetria de Canvas e grafo expõe FPS, p95, frames longos e orçamento de
  render sem provocar `setState` por frame; no grafo, a amostragem encerra após
  seis segundos e não deixa um loop permanente no quadro estático;
- degradação adaptativa continua limitada a `high → medium → low`.

A tabela abaixo preserva a referência de performance da rodada-base anterior,
em navegador autenticado, perfil médio e DPR controlado:

| Gate | Viewport | FPS | p95 | Observação |
| --- | --- | ---: | ---: | --- |
| território | 390×844 | 60 | 17,0 ms | 24.144 triângulos, 6 texturas |
| território antes da correção | 1920×1080 | 43 | 25,5 ms | N8AO ainda ativo |
| território após a correção | 1920×1080 | 60 | 17,4 ms | 0 frames longos, 1.679.616 pixels |
| grafo estabilizado | 390×844 | 60 | 16,8 ms | 0 frames longos; amostragem encerrada |
| grafo estabilizado | 1920×1080 | 60 | 16,8 ms | média 16,7 ms; amostragem encerrada |

Os números são diagnósticos comparativos deste navegador, não um benchmark
universal de hardware.

Na inspeção atual de 22/08/2026, a telemetria do grafo concluiu a janela de seis
segundos em 60,0 FPS, média de 16,7 ms, p95 de 16,8 ms e zero frames longos. O
estado passou a `complete`, confirmando que o sampler não manteve um loop
permanente depois da coleta.

## Inspeção responsiva autenticada

O fluxo foi iniciado pelo launcher real `Abrir O Nascer da Alvorada`, em uma
sessão já autenticada, e a experiência modal permaneceu na rota `/portal`.
Depois da cascata completa, o enquadramento foi exercitado em cada viewport:

| Alvo CSS | Escala final | Bounds renderizados | Resultado observado |
| --- | ---: | --- | --- |
| 1366×768 | 0,476 | x 195–1171; y 152–699 | 38 nós íntegros, sem corte ou colisão |
| 1440×900 | 0,59 | x 120–1320; y 154–827 | 38 nós íntegros, sem corte ou colisão |
| 1920×1080 | 0,734 | x 207–1713; y 157–1001 | 38 nós íntegros, sem corte ou colisão |
| 390×844 | 0,160 | x 31–359; y 381–564 | emulação móvel exata, sem corte ou colisão |
| 430×932 | 0,178 | x 32–398; y 414–619 | emulação móvel exata, sem corte ou colisão |

No snapshot autenticado atual, o resolver retornou 38 estruturas: 1 CCPF, 2
executivas, 1 Comissão Central e 34 unidades operacionais. Jardel Hillesheim e
a unidade vinculada não apareceram em texto, nomes acessíveis, nós ou busca;
Ivan Squinzani não apareceu na composição da Comissão Central. Os quatro textos
proibidos também estiveram ausentes de texto visível e labels acessíveis.

A busca por `Fabiano` retornou uma única opção uppercase, `FABIANO SOLTIS ·
PRESIDENTE`; a seleção abriu o detalhe com somente o papel institucional
`PRESIDENTE`, sem vazar um vínculo executivo duplicado. Escape fechou o painel
e devolveu o foco ao mesmo nó. O filtro Assessorias habilitou 8 unidades e
desabilitou as outras 30; todos os seis filtros exibiram exatamente um ícone e
estado `aria-pressed`. Em 1366×768, o zoom avançou de 0,476 para 0,571; o pan
alterou a translação de `(161, 142)` para `(216, 172)` sem alterar a escala; e o
reenquadramento retornou a `(161, 142)` em 0,476. Ao sair da experiência, o foco
retornou ao launcher.

O redimensionamento encontrou um defeito antes da conclusão: um foco de
controle podia rolar internamente o contêiner `overflow: hidden` e deslocar o
masthead 246 px para cima. O contêiner passou a `overflow: clip`; a repetição em
1366×768 confirmou `scrollTop = 0`, masthead em y 24 e mapa ocupando y 0–768.
Uma recarga limpa, seguida de nova entrada por todas as sete fases, não
registrou erros de console. Permaneceram somente dois avisos conhecidos das
future flags do React Router 7 e a mensagem de descarte do contexto WebGL quando
o Canvas da introdução é intencionalmente desmontado.

A telemetria de integridade do mesmo snapshot registrou 3 warnings e 35 infos.
Entre eles estão a cardinalidade executiva real (dois vínculos de
Vice-Presidência, um deles no registro canônico de Fabiano), contas homônimas
mantidas separadas e ausências de retrato tratadas pelo fallback neutro. Esses
casos permanecem observáveis; nenhum substituto foi inventado e nenhum UUID de
usuário ou comissão é publicado nos atributos DOM dos nós.

## Validação automatizada

Executada após o refinamento e antes da publicação:

- `14` arquivos e `111` testes dedicados de timeline, fallback, recuperação
  WebGL, integração Portal, resolver, acesso à organização, layout, busca,
  acessibilidade e interação, todos aprovados;
- TypeScript `npx tsc --noEmit` sem erros;
- ESLint em todos os arquivos alterados da feature e no hook compartilhado com
  zero warnings;
- build Vite de produção com `5.005` módulos transformados; chunk da experiência
  com `101,18 kB` (`32,93 kB` gzip) e CSS com `40,57 kB` (`8,93 kB` gzip);
- `git diff --check` no recorte intencional, preservando a alteração preexistente
  e fora de escopo em `supabase/functions/mcp/index.ts`.

Na rodada-base anterior, a suíte completa também foi executada: `95` arquivos passaram e `12` falharam;
`811` testes passaram e `35` falharam. As falhas são preexistentes e ficam fora
deste recorte — entre elas contratos legados de Cronograma sem `AuthProvider`,
expectativas antigas da Meeting Workspace, do Mapa Comercial e de Eventos de
espaço — sem serem apresentadas como sucesso desta feature.

## Limites honestos da validação

A inspeção usou uma sessão real autenticada no navegador integrado e tamanhos
CSS controlados. O override nativo desse navegador limita larguras a 480 px;
por isso, 390×844 e 430×932 foram validados com emulação CDP exata e DPR 1,
restaurada ao fim da rodada. Não houve Safari/iPhone físico, medição direta de
GPU pelo driver ou gesto de dois dedos em tela física; pinch e ponteiros foram
cobertos por lógica/testes, enquanto pan por ponteiro foi exercitado de fato.

## Geografia e licenças

- limites de Brasil, Rio Grande do Sul e Santa Rosa: IBGE;
- marcador: `-27.8707, -54.4817`;
- detalhes: [`public/alvorada/ATTRIBUTION.md`](../public/alvorada/ATTRIBUTION.md).

O áudio opcional permanece fora de escopo. Nenhum asset das referências de jogo
é copiado ou distribuído pela aplicação.
