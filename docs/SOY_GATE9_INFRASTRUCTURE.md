# Cozinha da Soja, Portão 9 e estudo de orientação Lactalis

Base de comparação: `672b8a4ebd35a355d17ac0a37503f44878f2da3e` (PR #135 integrada). A implementação acrescenta o banheiro E-07, a conexão de asfalto e três reservatórios RES-A9. **O giro de B13 permanece pendente de uma decisão sobre suas dimensões. A PR é um rascunho; não representa conclusão integral do pedido.**

## Referências e implantação

As quatro imagens fornecidas estão em [refs-soy-gate9](refs-soy-gate9). As marcações verdes serviram apenas ao registro; não são elementos da cena. Os eixos das imagens não foram tratados como norte geográfico.

O banheiro foi registrado pela Cozinha da Soja `B7`, pelo identificador histórico `E-07`, pelas ruas Paraguai/Bolívia e pela continuação de Montevidéu. Na imagem anotada, o sentido em direção à cozinha corresponde a +X no mapa; a direita da imagem corresponde a −Z. O modelo usa frente local +Z, com yaw +π/2, portanto a entrada masculina em X local negativo fica à esquerda de quem olha da cozinha, e a feminina à direita.

| Elemento | Cadastro e coordenadas de origem | Interpretação dimensional |
| --- | --- | --- |
| Banheiro | `E-07`; retângulo PDF `[3300,2498,3396,2566]`; centro `[3348,2532]` | Implantação aproximada 13,96 × 9,89 m; corpo 12 × 8,67 m; parede 3,07 m; elevação do telhado 0,87 m |
| Conexão | `RUA-MONTEVIDEU-COZINHA`; retângulo PDF `[3441,2467,3482,2579]` | Largura 5,96 m e extensão 16,29 m, compatíveis com o trecho existente; altura de renderização 0,032 |
| Reservatórios | `RES-A9`; retângulo PDF `[3795,1195,3869,1227]` | Três corpos com diâmetro aproximado 2,27 m e altura próxima de 3 m; bases individuais de 2,53 m |

A escala de projeto é 0,15 unidade por metro (6,875 pixels PDF por metro). A barra de 10 m da fotografia ajuda a estimar as proporções do banheiro; não constitui levantamento cadastral. Alturas, espessuras, portas, ventilação, pintura e estrutura de suporte são interpretações discretas. A inclinação e a espessura das paredes ficam configuradas em `soyGateInfrastructure.ts`; as peças modulares ficam em `soyGateArchitecture.ts`.

Os três reservatórios reutilizam as posições calibradas dos marcadores **reservoir-elevated-01/02/03** da planta hidráulica A2, respectivamente X/Z `[9.996289,-38.513867]`, `[10.506895,-38.503718]` e `[11.021398,-38.503702]`. As notas existentes da planta informam base de 6,00 m, adotada nos suportes. O acabamento dos corpos, tampas, diâmetros e pequenas diferenças de altura é interpretado; não há nova afirmação de capacidade. A primeira tampa é terrosa, as outras duas cinza. O cadastro `A9` confirma o portão; a quarta imagem foi usada somente para B13.

## Construção e integração

- E-07 mantém a identidade histórica, agora restaurada como sanitário permanente. Os outros 25 sanitários temporários continuam removidos. Entradas têm vão real na alvenaria, portas recuadas, marcos, soleiras, placas físicas com pictogramas, ventilação alta, embasamento, empenas e cobertura de duas águas com beirais e cumeeira. Não foram inventadas divisões internas.
- A rua usa a geometria viária, material, elevação, união de interseções e recorte de terreno existentes. As extremidades coincidem com as bordas de Paraguai e Bolívia, sem duas superfícies de asfalto sobrepostas. Duas aproximações de concreto ligam as entradas à nova faixa e entram nas máscaras de superfícies duras. Não se desativou depth testing nem se elevou artificialmente a rua.
- Houve uma correção localizada comprovada: a representação de `transformer-ref-007`, recepção de fachada de B7, avançava 0,22 unidade de raio sobre a nova rua. Sua apresentação recebeu +0,232 em X (aproximadamente 1,55 m), sobre o acesso de B7. O marcador de origem, identificador, vínculos e rede elétrica permanecem iguais. Os demais postes e utilidades foram preservados.
- RES-A9 contém exatamente três corpos arredondados, tampas, suportes, bases e tubulações discretas. Os perfis têm 32 segmentos radiais e normais suaves. Nenhuma base ou suporte colide com a via, o portão ou um tronco nas verificações locais. O grupo B28, junto à cozinha, não foi movido ou duplicado.
- E-07 é `RESTROOM`; RES-A9 é `SERVICE`; ambos são infraestrutura não comercial. Seleção, busca, painel e foco reutilizam o fluxo existente. A etiqueta flutuante aparece por interação; as duas placas permanecem na fachada. Um conflito de classes CSS que deixava o nome selecionado de E-07 branco sobre branco foi corrigido.
- Geometria estática é combinada uma vez por material: sete grupos no banheiro mais uma malha de placas; cinco grupos para os três reservatórios. Materiais PBR compartilham o conjunto existente, sem reflexos adicionais ou luzes novas. A textura das placas é um atlas 1024 × 128 com mipmaps. Recursos possuem descarte explícito; decoração não participa do raycasting comercial; não há atualizações ou alocações por frame nos novos modelos.

## B13: orientação calculada, aplicação pendente

Foram resolvidos os lotes **Q-D-11 e Q-D-12**, ambos `SELLABLE_LOT`, bloco D, filhos de `reference:2026:quadra-d`. Seus centros são `[11.943636,14.945455]` e `[11.943636,12.545455]`; o ponto médio é `[11.943636,13.745455]`. B13 permanece centrado em `[16.472727,12.807273]`.

A frente local real é +Z; o eixo vertical é Y e o pai somente translada. `atan2(destinoX-centroX, destinoZ-centroZ)` produz **−78,296941°**, com vetor de frente `[-0.979212,0.202840]`. O estudo considera o envelope da cobertura, plataforma, fechamento e frente do conjunto inteiro, não uma rotação isolada do telhado.

**Com centro e dimensões atuais, esse giro invade a Rua Uruguai leste em 0,139106 unidade (~0,93 m) e o polígono cadastral de B12/Sede.** Uma busca geométrica indica escala de planta 0,871915: redução aproximada de **12,81% em largura e profundidade**, mantendo centro e altura, com folgas para os limites considerados. Isso altera dimensões que o pedido manda preservar; a autorização foi solicitada e ainda não recebida. Não se moveu a Sede nem a rua para acomodar o palco.

O código de produção mantém o palco original, incluindo seleção, foco e etiqueta. O cálculo fica em um módulo de estudo não importado pelo renderer. As imagens abaixo mostram uma **proposta temporária em tamanho integral, com conflito**, e não uma correção aprovada:

| Estudo | Evidência |
| --- | --- |
| Envelope e colisões | [JSON da proposta](screenshots/soy-gate9/stage-orientation-proposal.json) |
| Vista superior da proposta | [Captura](screenshots/soy-gate9/candidate-stageTop.png) |
| Frente a partir de Q-D-11 | [Captura](screenshots/soy-gate9/candidate-stageLot11.png) |
| Frente a partir de Q-D-12 | [Captura](screenshots/soy-gate9/candidate-stageLot12.png) |

## Persistência e preservação

O inventário anterior contém 1.733 entidades em [before-inventory.json](screenshots/soy-gate9/before-inventory.json). Os testes comparam todos os registros anteriores, exceto a alteração autorizada de E-07, incluindo geometrias, cadastros, metadados, alturas, vias e lotes. Há apenas duas novas entidades: a conexão e RES-A9. A implantação de B7, B28, B12, B13, A9 e demais vizinhos permanece igual.

Como o mapa persistido é a fonte autoritativa, foi incluída a migration `20260908010000_soy_restroom_gate9_infrastructure.sql`. Ela exige projeto 2026 ativo e coincidência das âncoras B7/A9, restaura o UUID de E-07, conserva a geometria anterior como versão histórica e recusa conflitos com entidade comercial ou geometria personalizada. Não muda permissões, RLS, vendas ou contratos. **A migration não foi aplicada a banco remoto.** Não basta publicar somente o frontend para atualizar uma instalação já persistida.

O ensaio isolado em PostgreSQL/PGlite aprovou nove verificações: duas entidades novas, histórico mantido, reativação, registros comerciais e vizinhos preservados, idempotência, recusa de conflito comercial, rollback atômico e exclusão de outro referencial de coordenadas. Esse ensaio não substitui a aplicação controlada em staging com o esquema completo Supabase/PostGIS e seus gatilhos.

## Capturas equivalentes

| Enquadramento desktop | Antes | Depois |
| --- | --- | --- |
| Banheiro, frente | [Antes](screenshots/soy-gate9/before-restroomFront.png) | [Depois](screenshots/soy-gate9/after-restroomFront.png) |
| Banheiro e via, superior | [Antes](screenshots/soy-gate9/before-restroomTop.png) | [Depois](screenshots/soy-gate9/after-restroomTop.png) |
| Banheiro, fundos | [Antes](screenshots/soy-gate9/before-restroomRear.png) | [Depois](screenshots/soy-gate9/after-restroomRear.png) |
| Cozinha e entorno | [Antes](screenshots/soy-gate9/before-kitchenContext.png) | [Depois](screenshots/soy-gate9/after-kitchenContext.png) |
| Portão 9, oblíqua | [Antes](screenshots/soy-gate9/before-gate9.png) | [Depois](screenshots/soy-gate9/after-gate9.png) |
| Portão 9, superior | [Antes](screenshots/soy-gate9/before-gate9Top.png) | [Depois](screenshots/soy-gate9/after-gate9Top.png) |
| B13 preservado, lote D11 | [Antes](screenshots/soy-gate9/before-stageLot11.png) | [Depois](screenshots/soy-gate9/after-stageLot11.png) |
| B13 preservado, lote D12 | [Antes](screenshots/soy-gate9/before-stageLot12.png) | [Depois](screenshots/soy-gate9/after-stageLot12.png) |
| Visão geral | [Antes](screenshots/soy-gate9/before-overview.png) | [Depois](screenshots/soy-gate9/after-overview.png) |

Os mesmos 11 enquadramentos também têm pares `before-mobile-*` / `after-mobile-*` na pasta de evidências. Os enquadramentos fixos da ferramenta DEV permitem inspecionar a geometria; os limites efetivos da câmera e a navegação foram exercitados separadamente no fluxo `/mapa-comercial`.

## Medições e verificações

Ambiente realmente utilizado: Windows, Chrome 152.0.7977.82 headless com aceleração ANGLE/Direct3D11, Intel UHD Graphics (0x8A56). Desktop 1366 × 768, framebuffer 972 × 500; mobile emulado 390 × 844, framebuffer 280 × 490; DPR de renderização 0,72 na ferramenta DEV. Cada medição usa a mesma câmera e uma oscilação horizontal de navegação por 6,8 s, descartando os primeiros 0,8 s. São intervalos de frames apresentados, não timestamps de GPU nem garantia de FPS contínuo em aparelho físico.

| Vista | Tempo médio antes → depois (ms) | P95 antes → depois (ms) | Draw calls antes → depois | Triângulos antes → depois |
| --- | --- | --- | --- | --- |
| Desktop, cozinha | 16,67 → 16,67 | 17,70 → 16,90 | 304 → 312 | 645.115 → 646.215 |
| Desktop, Portão 9 | 16,67 → 16,67 | 16,90 → 16,80 | 166 → 171 | 569.823 → 573.615 |
| Desktop, lote D11 | 16,67 → 16,67 | 18,00 → 16,90 | 495 → 505 | 859.979 → 863.799 |
| Mobile emulado, cozinha | 16,67 → 16,71 | 17,00 → 16,80 | 251 → 260 | 546.822 → 547.886 |
| Mobile emulado, Portão 9 | 16,67 → 16,67 | 17,00 → 16,80 | 116 → 120 | 541.381 → 545.161 |
| Mobile emulado, lote D11 | 16,67 → 16,67 | 17,60 → 16,90 | 452 → 463 | 846.649 → 851.381 |
| Mobile emulado, geral | 17,16 → 16,85 | 26,90 → 18,60 | 746 → 759 | 618.282 → 623.054 |

Todas essas amostras terminaram em HIGH, mesmo DPR e resolução. Os detalhes pequenos já usam o culling/LOD existentes, por isso o incremento de chamadas depende do enquadramento. A geometria adicional também aparece ao fundo de D11, embora B13 esteja preservado.

Na visão geral desktop, a primeira coleta passou de 22,64 para 18,98 ms, mas terminou em MEDIUM antes e HIGH depois: **não é uma comparação de qualidade equivalente**. Uma coleta complementar de três amostras com aquecimento idêntico variou de 19,20 a 23,00 ms antes e de 21,22 a 38,27 ms depois; houve transições HIGH/MEDIUM e um pico inicial depois. Esses dados não permitem afirmar ausência de regressão sustentada nesse enquadramento. O acréscimo geométrico registrado foi 13 chamadas (863 → 876) e 4.772 triângulos (696.667 → 701.439). Os resultados brutos, inclusive o pico, estão em [overview-comparison.json](screenshots/soy-gate9/overview-comparison.json).

Os relatórios [antes desktop](screenshots/soy-gate9/before-desktop.json), [depois desktop](screenshots/soy-gate9/after-desktop.json), [antes mobile](screenshots/soy-gate9/before-mobile.json) e [depois mobile](screenshots/soy-gate9/after-mobile.json) incluem memória JS amostrada e contagens de geometrias, texturas e programas. Na visão geral desktop, geometrias/texturas/programas passaram de 629/146/181 para 644/147/181. Memória JS instantânea varia com GC; a verificação de retenção usa um teste separado com coleta explícita. Não foi medida memória GPU em bytes.

Verificações concluídas: 178 testes focados aprovados, TypeScript, ESLint dos arquivos alterados e build. O build conserva os avisos existentes de chunks grandes. A suíte inteira do repositório não foi executada. Os testes novos verificam preservação do inventário, duas entidades adicionais, orientação das entradas, junções viárias, recortes, contatos, afastamento de utilidades/troncos, contagem de tanques e orçamento de geometria; dois testes verificam a proposta B13 e seu conflito.

Os testes funcionais desktop e mobile verificaram pan, órbita/zoom, limites de zoom, busca, filtros, entrada/saída de pavilhão, seis seleções alternadas E-07/RES-A9/B13, um único canvas, um renderer e um OrbitControls. A pinça emulada e a mudança retrato/paisagem passaram. Nenhum erro de página, perda de contexto, overflow horizontal ou escrita no backend ocorreu. Evidências: [desktop](screenshots/soy-gate9/functional-desktop.json) e [mobile](screenshots/soy-gate9/functional-mobile.json).

Limitações: não houve teste em telefone físico, Safari/iOS, GPU de entrada adicional ou sessão prolongada de uso real. As imagens mostram inspeção visual dos enquadramentos capturados; não certificam toda posição possível de câmera. O giro proposto não foi incorporado e exige decisão sobre as dimensões. A migration ainda precisa de validação de implantação no ambiente Supabase completo.

### Estabilidade e comparação complementar

O clique desktop e o toque emulado diretamente no volume 3D também foram verificados, partindo de seleção vazia: E-07 e RES-A9 retornaram os identificadores corretos nos quatro casos, sem depender dos resultados da busca. [Teste de picking](screenshots/soy-gate9/picking.json).

O ensaio de **40 ciclos / 80 transições** entre hidrologia e qualidade foi aprovado pelo verificador existente, com quatro configurações cobertas e 18 amostras aquecidas por configuração. Geometrias e texturas não cresceram nas séries aquecidas. Os programas tiveram uma única subida de seis compilações nas duas configurações de qualidade, sem tendência de crescimento repetido; esse comportamento não foi tratado como contagem perfeitamente constante. Nenhuma perda de contexto, erro de página ou falha de apresentação foi registrada. [Relatório completo](screenshots/soy-gate9/stress.json).

O teste de navegação/seleção alternou três vezes quatro enquadramentos. Depois do aquecimento, as contagens ficaram em **650 geometrias / 147 texturas / 181 programas** nas duas últimas voltas. O heap JS retido após GC passou de 74,49 para 74,89 MB (+0,41 MB); o armazenamento de buffers permaneceu em 70,09 MB. O teste ficou abaixo do limiar de 2 MB de crescimento entre voltas, sem perdas de contexto ou erros. É uma verificação curta de estabilidade, não prova de ausência de vazamento em uso prolongado. [Relatório](screenshots/soy-gate9/navigation-stress.json).

O modo reduzido foi ativado pela API já existente do store em dois navegadores novos, executados sequencialmente. As três amostras permaneceram com o mesmo tier HIGH, DPR e framebuffer. Tempos médios antes: **20,17 / 18,41 / 18,41 ms**; depois: **17,29 / 16,94 / 16,99 ms**. P95 antes: 26,30 / 20,80 / 20,70 ms; depois: 20,70 / 19,00 / 18,80 ms. Chamadas 839 → 852 e triângulos 495.769 → 500.533. Não houve piora nessas amostras; a variação de tempo não é prova de aceleração causada pela implementação. O modo reduzido é uma configuração distinta e não elimina a limitação da comparação adaptativa padrão. [Dados completos](screenshots/soy-gate9/overview-comparison-reduced.json).

## Comandos de reprodução

Instalar as dependências usuais do projeto. Os scripts de navegador usam Playwright com Chrome disponível, opcionalmente indicado por `PLAYWRIGHT_MODULE`; `QA_URL` aponta para o Vite local. Executar cada teste gráfico isoladamente, sem build concorrente:

```powershell
$env:QA_URL='http://127.0.0.1:4189'
node scripts/soy-gate9/capture.cjs after
node scripts/soy-gate9/capture.cjs after --mobile
node scripts/soy-gate9/functional.cjs run http://127.0.0.1:4189/mapa-comercial
node scripts/soy-gate9/functional.cjs run http://127.0.0.1:4189/mapa-comercial --mobile
node scripts/soy-gate9/navigation-stress.cjs
node scripts/soy-gate9/stress.cjs
node scripts/soy-gate9/picking.cjs
$env:QA_BASELINE_URL='http://127.0.0.1:4188' # checkout da base, árvore equivalente a 672b8a4e
node scripts/soy-gate9/overview-comparison.cjs
node scripts/soy-gate9/overview-comparison.cjs --reduced
npx tsx scripts/soy-gate9/placement-audit.ts
npx tsx scripts/soy-gate9/stage-proposal.ts
```

`generate-migration.ts` produz os três registros da migration a partir da referência; `migration-qa.cjs` requer `@electric-sql/pglite` disponível por `PGLITE_MODULE`. Nenhuma dependência de QA foi acrescentada ao runtime do aplicativo.
