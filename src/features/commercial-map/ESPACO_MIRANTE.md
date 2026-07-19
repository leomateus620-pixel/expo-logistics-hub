# D3 — Espaço Mirante

Este documento delimita a fonte de verdade e o contrato paramétrico do ativo
arquitetônico de D3. A cartografia oficial continua sendo a autoridade para
identidade, footprint, metadados, seleção e edição. `utils/mirante.ts` fornece
somente uma reconstrução visual determinística derivada desse contrato.

As unidades do mapa **não estão calibradas em metros**. Razões e dimensões
abaixo são conservadoras para representação visual; não constituem levantamento
cadastral, projeto estrutural, laudo de acessibilidade ou certificação de
conformidade.

## Contrato oficial preservado

- Entidade de referência: `reference:2026:d3`
- Identificador público: `D3`
- Nome oficial: `Espaço Mirante`
- Classificação: `ATTRACTION`
- Camada: `reference:structures`
- Revisão da fonte: `2026.2`
- Verificação: `NEEDS_REVIEW`
- Elevação cartográfica: `0`
- Rotação persistida: `0`
- Extrusão cartográfica original: `0.92`
- Footprint PDF: `[3990, 2440]–[4100, 2830]`
- Bounds locais:
  - X: `13.96363636` a `16.36363636`
  - Z: `-11.67272727` a `-3.16363632`
  - largura: `2.4`
  - profundidade: `8.50909095`
  - centro: `[15.16363636, -7.41818180]`
- Área cartográfica aproximada: `20.4218 un²`
- Confiança registrada: `official_visual_reference`
- Medidas oficiais registradas: `false`

O renderer deve resolver o ativo por `publicIdentifier === "D3"`, mesmo quando
o `id` real for um UUID do banco. Nenhum cálculo desta reconstrução altera a
geometria persistida.

## Evidência, inferência e limites

| Característica | Estado | Base da decisão | Regra de implementação |
|---|---|---|---|
| Footprint longo no eixo Z | Verificado | Referência cartográfica oficial 2026.2 | Conservar exatamente o polígono persistido e sua rotação |
| Arena Sicredi a leste de D3 | Verificado cartograficamente | Vetor entre centros D3 e F: aproximadamente `[23.945, 6.000]` | Usar o vetor normalizado para câmera e mobiliário; não girar o footprint para “apontá-lo” |
| Pavilhão elevado e aberto nas laterais | Verificado visualmente | Fotos 1–3 | Base de concreto, plataforma elevada e laterais permeáveis |
| Cobertura metálica de duas águas, baixa inclinação e beirais | Verificado visualmente | Fotos 1 e 3 | Duas águas, cumeeira longitudinal, espessura e sobreposição conservadoras |
| Pilares e treliças metálicas em ritmo repetido | Verificado visualmente | Fotos 1–3 | Vãos paramétricos e peças compartilhadas/instanciadas |
| Guarda-corpo, escada, rota inclinada e contenção | Verificado visualmente | Foto 3 | Representar os elementos e manter seus endpoints livres |
| Volume inferior com aberturas | Verificado visualmente | Foto 2 | Representar apenas a casca externa, sem atribuir função aos ambientes |
| Uso operacional de hospitalidade | Verificado por fonte institucional; mobiliário não fotografado | Lista oficial de expositores vincula operações ao “MIRANTE” | Inserir mobiliário neutro, sem marcas, logos ou lotação alegada |
| Quatro mesas e doze cadeiras | Inferência conservadora | Densidade compatível com o footprint visual e orçamento de renderização | Layout determinístico, com duas cadeiras por grupo voltadas à Arena e circulação desobstruída |
| Altura visual de aproximadamente `2.30 un` | Inferência conservadora | Razão `0.27` da maior dimensão cartográfica, limitada entre `2.16` e `2.42` | Comunicar a hierarquia arquitetônica sem afirmar altura real |
| Oito vãos estruturais | Inferência conservadora | Ritmo fotográfico e profundidade oficial | Derivar por `depth / 1.05`, com limite de 6–10 vãos |
| Lado `+X` para rampa e escada | Inferência apoiada pela cartografia | Rua Brasília quase encosta no lado `-X`; Q-R-04 e B17 afetam as pontas; a lateral `+X` é a faixa livre | Conter os acessos na faixa limpa e preservar seleção pelo footprint oficial |
| Inclinação aparente da rampa `≤ 1/12` | Guardrail visual, não confirmação da obra | Referência técnica de acessibilidade e exigência de modelagem | Dimensionar `run ≥ 12 × rise`, sem declarar atendimento normativo |
| Dimensões reais, seções metálicas, ligações e fundações | Não confirmado | Ausência de projeto executivo e escala métrica validada | Não apresentar o modelo como cálculo estrutural |
| Traçado completo, patamares e inclinação real da rampa | Não confirmado | Partes ocultas nas fotografias | Manter configuração localizada, reversível e explicitamente ilustrativa |
| Função dos ambientes inferiores | Não confirmado | Apenas portas/janelas externas são visíveis | Não modelar interior nem nomear depósitos, cozinhas ou sanitários |
| Acabamentos, cores finais, calhas, drenagem e capacidade | Não confirmado | Fotografias não sustentam especificação precisa | Usar materiais coerentes com o mapa e evitar detalhes assertivos |
| Quantidade, marca e arranjo reais do mobiliário operacional | Não confirmado | Fotos não mostram o espaço mobiliado | Usar módulos neutros e densidade contida |

## Relação cartográfica e acesso localizado

A revisão dos footprints persistidos mostra:

- Rua Brasília acompanha toda a lateral oeste (`-X`) com afastamento de apenas
  cerca de `0.044 un`;
- Q-R-04 toca a extremidade norte (`-Z`) em uma faixa mínima;
- B17 — Polícia Civil sobrepõe a terminação sul (`+Z`) do footprint D3;
- a lateral leste (`+X`), voltada aproximadamente para a Arena, é o único lado
  lateral sem conflito persistido equivalente.

Por isso, rampa e escada ficam externamente em `+X`, na faixa longitudinal
conservadora entre as bandas conflitantes. A rampa percorre o eixo Z; a escada
faz a conexão transversal com a borda leste da plataforma. Os dados expõem
`clearMinZ` e `clearMaxZ` para que o renderer e os testes mantenham os endpoints
na faixa analisada.

O acesso não autoriza mudança de terreno global. A integração deve ser uma base
local, contenção visual e pequenos encontros com o piso, sem inventar solução
geotécnica ou drenagem.

## Contrato paramétrico

Para o footprint oficial atual, `createMiranteLayout` deriva aproximadamente:

- altura visual: `2.30 un`;
- topo da plataforma: `0.432 un`;
- espessura da plataforma: `0.132 un`;
- cobertura ligeiramente maior que o footprint, com cumeeira longitudinal;
- oito vãos, nove planos de pilares/treliças;
- corredor longitudinal oeste contínuo de aproximadamente `0.576 un`;
- quatro grupos de mesas na metade leste;
- rampa ilustrativa com razão aparente `1:12`;
- escada independente ao sul do término da rampa.

Campos de alto nível:

- `platform`: laje, espessura e cota superior;
- `base`: casca inferior e espessura de contenção;
- `roof`: beirais, meia água, elevação de cumeeira, ângulo e espessura;
- `structure`: vãos, pilares, vigas, treliças e quantidade de terças;
- `railings`: altura visual, montantes, travessas e espaçamento;
- `aisle`: faixa oeste protegida e afastamento mínimo do mobiliário;
- `access`: limites livres, rampa e escada com endpoints `[x, y, z]`;
- `furniture`: dimensões dos módulos e quantidade de grupos.

`miranteStructuralBayPositions` retorna os planos estruturais crescentes dentro
do footprint. `createMiranteFurniturePlan` retorna tabelas e cadeiras com IDs,
transformações e dimensões determinísticas. Todos os itens permanecem fora do
corredor oeste e afastados da borda leste de acesso.

## Orientação para a Arena

`miranteArenaFacingDirection` calcula a direção unitária entre centros de
entidade. Para a referência atual, a componente X é positiva e dominante.
`miranteArenaFacingRadians` retorna aproximadamente `1.3253 rad`.

Esse ângulo deve orientar câmera, leitura e assentos. Ele não deve ser aplicado
como rotação do footprint: D3 já possui seu eixo longitudinal oficial em Z.

## Orçamento de renderização

| Nível | Draw calls incrementais | Triângulos | Texturas | Materiais | Mobiliário |
|---|---:|---:|---:|---:|---:|
| Overview | `≤ 5` | `≤ 5.000` | `0` | `≤ 5` | nenhum |
| Médio | `≤ 12` | `≤ 20.000` | `≤ 2` | `≤ 8` | 2 grupos |
| Selecionado | `≤ 24` | `≤ 50.000` | `≤ 4` | `≤ 10` | 4 grupos |
| Interior | `≤ 30` | `≤ 80.000` | `≤ 4` | `≤ 12` | 4 grupos |
| Reduzido | `≤ 18` | `≤ 35.000` | `≤ 2` | `≤ 8` | 2 grupos |

- Apenas o proxy pai derivado do footprint participa do raycast principal.
- Pilares, treliças, guarda-corpos, mesas e cadeiras devem reutilizar
  geometrias e materiais; repetições numerosas devem ser instanciadas.
- Mobiliário não projeta sombra individual em tempo real.
- Corrugação deve ser comunicada por resposta de superfície pequena e bordas,
  não por centenas de nervuras geométricas.
- A cena continua sob `frameloop="demand"` e deve permanecer sem frames após
  câmera e transições estabilizarem.
- O interior detalhado deve ser condicionado à seleção/inspeção e carregado
  sob demanda.

## Interação e validação

- Seleção, hover, busca e edição continuam vinculados a uma única entidade D3.
- Todas as peças visuais internas devem ignorar o raycast primário.
- O modo interno é explícito; seleção normal não deve entrar automaticamente.
- A saída deve restaurar câmera e foco, inclusive por `Escape`.
- `prefers-reduced-motion` deve remover transições não essenciais.
- `renderer.info` deve registrar draw calls, triângulos, geometrias, texturas e
  programas nos mesmos enquadramentos antes/depois.
- Após estabilização, o contador de frames não deve avançar durante uma janela
  ociosa de dois segundos.
- Dez ciclos de entrada/saída não podem produzir crescimento monotônico de
  geometrias ou texturas.

O teste `commercialMapMirante.test.ts` fixa identidade, footprint, resolução por
identificador público, vetor para a Arena, apoio estrutural, ritmo de vãos,
corredor oeste, contenção do mobiliário, endpoints de acesso, inclinação
aparente e budgets.

## Referências

### Arquitetura, circulação e estrutura

- [Lista oficial de expositores da Fenasoja](https://fenasoja.com.br/lista-de-expositores/)
- [ABNT NBR 9050:2020 — cópia institucional FADERS](https://faders.rs.gov.br/upload/arquivos/202208/31095657-abnt-nbr-9050-15-acessibilidade-a-edificacoes.pdf)
- [RT CBMRS nº 11, Parte 1 — saídas de emergência](https://admin.bombeiros.rs.gov.br/upload/arquivos/201706/01155612-rtcbmrs-n-11-parte-01-2016-saidas-de-emergencia-versao-corrigida.pdf)
- [Manual Técnico de Telhas de Aço — ABCEM/CBCA](https://www.abcem.org.br/lib/php/_download.php?arq=produtos%2Fprod_20221106183617_manual-tecnico-telhas-de-aco_nov2022.pdf&now=0)
- [SteelConstruction.info — Trusses](https://steelconstruction.info/Trusses)
- [SteelConstruction.info — Building envelopes](https://steelconstruction.info/Building_envelopes)

As normas são usadas somente como guardrails de representação. Sem escala
métrica validada, projeto original e vistoria, este modelo não declara
conformidade.

### WebGL, performance e carregamento

- [React Three Fiber — Scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance)
- [React Three Fiber — Canvas API](https://r3f.docs.pmnd.rs/api/canvas)
- [Three.js — InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html)
- [Three.js — LOD](https://threejs.org/docs/pages/LOD.html)
- [Three.js — Raycaster](https://threejs.org/docs/pages/Raycaster.html)
- [Three.js — WebGLRenderer e `renderer.info`](https://threejs.org/docs/pages/WebGLRenderer.html)
- [Three.js — Shadows](https://threejs.org/manual/en/shadows.html)
- [React — `lazy`](https://react.dev/reference/react/lazy)

### Design, interação e validação

- [pbakaus/impeccable — skill de design](https://github.com/pbakaus/impeccable/blob/main/.agents/skills/impeccable/SKILL.md)
- [pbakaus/impeccable — critique](https://github.com/pbakaus/impeccable/blob/main/.agents/skills/impeccable/reference/critique.md)
- [pbakaus/impeccable — optimize](https://github.com/pbakaus/impeccable/blob/main/.agents/skills/impeccable/reference/optimize.md)
- [emilkowalski/skill — design engineering](https://github.com/emilkowalski/skill/blob/main/skills/emil-design-eng/SKILL.md)
- [WCAG 2.2 — Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions)

Essas referências informam preservação do sistema visual existente, baseline
reprodutível, crítica comparativa, medição antes/depois, animação intencional e
interrompível, suporte a touch e alternativa de movimento reduzido. Elas não
fornecem uma estética genérica para copiar.
