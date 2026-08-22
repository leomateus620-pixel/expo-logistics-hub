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
| 9,4–11,4 s | `org-transition` | marca se conecta ao CCP e revela a rede |
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

Autoridade renderizada:

- nível 1: CCP, com a marca oficial como ícone principal;
- nível 2: Presidente e Vice-Presidente localizados por cargos explícitos;
- nível 3: Comissão Central, sem repetir CCP ou executivos;
- nível 4: comissões e assessorias oficiais, atuais e não legadas;
- nível 5: voluntariado aceito pelo modelo e pelas relações, mas excluído da
  allow-list, busca, navegação, detalhes e renderer desta versão.

A Comissão Central é reconhecida por nome ou slug e não pode reaparecer como
unidade de nível 4. Valores de autorização como `admin`, `gestor` e `operador`
não são tratados como cargos institucionais.

Autenticação e organização também são estados explícitos do domínio. Enquanto
a sessão ou o membership resolvem, a marca permanece em hold; sessão anônima,
membership inválido ou organização ausente produzem erro recuperável, nunca um
grafo vazio apresentado como dado oficial. O retry abrange membership, membros,
enriquecimento de nomes e unidades. A consulta compartilhada de membros mantém
os registros-base disponíveis mesmo se somente o enriquecimento de comissão
falhar, preservando os consumidores legados.

## Composição e interação

O layout é determinístico, com CCP como âncora, Presidência no segundo anel,
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
- filtros de CCP, Presidência, Central, Comissões e Assessorias;
- pan, roda, zoom pelos controles, pinch com dois ponteiros e enquadramento;
- navegação espacial por setas, Home para CCP e Escape contextual;
- painel lateral no desktop e bottom sheet no mobile;
- focus trap do diálogo, retorno do foco ao nó após fechar detalhes,
  restauração de foco ao launcher, safe areas, forced colors e
  `prefers-reduced-motion`.

## Performance e lifecycle

- cidade, edifícios, terreno urbano, árvores, fonte 3D e título 3D não são
  montados nem prefetchados;
- o passe N8AO residual foi removido depois do perfil em 1920×1080; SMAA,
  vinheta e bloom por capacidade continuam disponíveis;
- a Terra é desmontada após a troca territorial e suas texturas são
  descartadas;
- o grafo é preparado invisível durante o hold estático da marca, evitando
  construção de 39 nós no início do reveal;
- o Canvas é desmontado em `org-ready`; pan, zoom e seleção não mantêm WebGL ou
  loops da intro residentes;
- mudanças de câmera do grafo são agrupadas por `requestAnimationFrame`;
- telemetria de Canvas e grafo expõe FPS, p95, frames longos e orçamento de
  render sem provocar `setState` por frame; no grafo, a amostragem encerra após
  seis segundos e não deixa um loop permanente no quadro estático;
- degradação adaptativa continua limitada a `high → medium → low`.

No navegador autenticado de QA, perfil médio e DPR controlado:

| Gate | Viewport | FPS | p95 | Observação |
| --- | --- | ---: | ---: | --- |
| território | 390×844 | 60 | 17,0 ms | 24.144 triângulos, 6 texturas |
| território antes da correção | 1920×1080 | 43 | 25,5 ms | N8AO ainda ativo |
| território após a correção | 1920×1080 | 60 | 17,4 ms | 0 frames longos, 1.679.616 pixels |
| grafo estabilizado | 390×844 | 60 | 16,8 ms | 0 frames longos; amostragem encerrada |
| grafo estabilizado | 1920×1080 | 60 | 16,8 ms | média 16,7 ms; amostragem encerrada |

Os números são diagnósticos comparativos deste navegador, não um benchmark
universal de hardware.

## Inspeção responsiva autenticada

O fluxo foi iniciado pelo launcher real em cada execução e a rota interna do
iframe permaneceu `/portal`.

| Alvo | Resultado observado |
| --- | --- |
| 1366×768 | 39 nós; CCP em foco sem colidir com masthead/filtros; sem overflow |
| 1440×900 | 39 nós; 13 nós no quadro narrativo inicial; sem overflow |
| 1920×1080 | 39 nós; 22 nós no quadro inicial; sem overflow |
| 390×844 | composição mobile dedicada; painel executivo 374×369 px; sem overflow horizontal |
| 393×852 | mesma composição; o navegador DPR 0,5 quantizou o viewport interno para 394 px |
| 430×932 | 9 nós no quadro; safe area e controles íntegros; sem overflow |

No snapshot autenticado de 22/08/2026, o resolver retornou 39 estruturas:
1 CCP, 2 executivas, 1 Comissão Central e 35 unidades operacionais. A origem
continha duas contas executivas com o nome exato Fabiano Soltis; o reparo
auditado produziu um único nó de Fabiano, preservando Presidente e
Vice-Presidente, e um único nó de Djeison Drey como Vice-Presidente. A busca por
`Fabiano` retornou uma opção com contexto `Presidente`; a busca por `Felipe`
retornou `Felipe Carpenedo Gabriel` e `Felipe Bortoli`, sem criar a variante
curta como segunda pessoa. O filtro Assessorias manteve 9 unidades e filtrou as
demais 30. O painel móvel coube integralmente no viewport e devolveu o foco ao
nó de origem ao fechar.

A telemetria de integridade do mesmo snapshot registrou 3 warnings e 35 infos.
Entre eles estão a cardinalidade executiva real (dois vínculos de
Vice-Presidência, um deles no registro canônico de Fabiano), contas homônimas
mantidas separadas e ausências de retrato tratadas pelo fallback neutro. Esses
casos permanecem observáveis; nenhum substituto foi inventado e nenhum UUID de
usuário ou comissão é publicado nos atributos DOM dos nós.

## Validação automatizada

Executada antes da publicação:

- `14` arquivos e `95` testes dedicados de timeline, fallback, recuperação
  WebGL, integração Portal, resolver, acesso à organização, layout, busca,
  acessibilidade e interação, todos aprovados;
- TypeScript `tsc -p tsconfig.app.json --noEmit` sem erros;
- ESLint em todos os arquivos alterados da feature e no hook compartilhado com
  zero warnings;
- build Vite de produção com `5.005` módulos transformados; chunk da experiência
  com `97,87 kB` (`31,57 kB` gzip) e CSS com `41,00 kB` (`9,02 kB` gzip);
- `git diff --check`, uma revisão independente do domínio e uma revisão final
  local do diff.

A suíte completa também foi executada: `95` arquivos passaram e `12` falharam;
`811` testes passaram e `35` falharam. As falhas são preexistentes e ficam fora
deste recorte — entre elas contratos legados de Cronograma sem `AuthProvider`,
expectativas antigas da Meeting Workspace, do Mapa Comercial e de Eventos de
espaço — sem serem apresentadas como sucesso desta feature.

## Limites honestos da validação

A inspeção usou uma sessão real autenticada no navegador integrado e tamanhos
CSS controlados. Não houve Safari/iPhone físico, medição direta de GPU pelo
driver ou gesto de dois dedos em tela física; pinch e ponteiros foram cobertos
por lógica/testes e a composição mobile foi exercitada no navegador. O alvo
ímpar 393 px é quantizado para 394 px pelo DPR 0,5 deste ambiente, assim como já
ocorre em instrumentações anteriores.

## Geografia e licenças

- limites de Brasil, Rio Grande do Sul e Santa Rosa: IBGE;
- marcador: `-27.8707, -54.4817`;
- detalhes: [`public/alvorada/ATTRIBUTION.md`](../public/alvorada/ATTRIBUTION.md).

O áudio opcional permanece fora de escopo. Nenhum asset das referências de jogo
é copiado ou distribuído pela aplicação.
