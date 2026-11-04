# Soy Summit 2027 — Centro Cívico

## Diagnóstico antes da produção

Base: `ad82a829`, React 18, TypeScript, Vite 5, React Router 6, Three.js 0.170 já instalado. Cópia isolada em `expo-logistics-hub-soy-summit`; alterações locais do checkout original preservadas.

| Rota encontrada | Arquivo | Responsabilidade / alteração | Preservar |
| --- | --- | --- | --- |
| `/`, `/portal` | `CommissionPortalPage`, `FenasojaPortalHero` | Portal atual, introdução Alvorada e contador | menus, marca, introdução, autenticação |
| contador do portal | `components/countdown/OfficialCountdownCompact.tsx` | alternância local no mesmo espaço | expansão Fenasoja e `concealed` durante introdução |
| data Fenasoja | `config/fenasoja-2028.ts`, `lib/fenasoja-countdown.ts` | 29/04/2028 10h, America/Sao_Paulo | data, arredondamento e regras atuais |
| `/comissoes/:moduleSlug/*` | `App.tsx` | AuthGuard → OrgGuard → ModuleAccessGuard | todos os guards |
| `/comissoes/soy-summit/dashboard` | `CommissionWorkspacePage.tsx`, catálogo `officialCommissionCatalog.ts` | frente derivada; item Centro Cívico 3D | agenda, documentos, equipe e tarefas |
| nova subrota `centro-civico-3d` | `features/soy-summit` | visita sob demanda dentro dos mesmos guards | nenhum novo grant ou consulta de dados comerciais |

O telão não existia na base. Foi modelado em 12 × 5,4 unidades (20:9), dentro da boca de cena, com margem periférica de aproximadamente 7%. A visão frontal fica a cerca de 10,3 m no desktop; em retrato a câmera se afasta pelo corredor central para manter o telão inteiro no campo de visão. A altura acompanha o piso, aproximadamente 1,68 m acima dele. São estimativas, não levantamento do local. A arte foi produzida nessa proporção, sem esticar um formato 16:9.

O portal já baixa infraestrutura 3D da introdução **Alvorada**. A comparação de rede distingue esse comportamento prévio do novo Centro Cívico. A alternância não importa a nova cena. Não foi encontrado um serviço de hora pública genérica: o `serverTime` do mapa exige escopo/token. O relógio usa uma amostra esparsa do cabeçalho HTTP `Date` em uma resposta HEAD da origem existente, quando disponível e sem `Age` de cache; considera ida e volta e a precisão de um segundo do cabeçalho. Essa referência não é um serviço de horário certificado. Na ausência dela, usa o relógio do dispositivo; a precisão depende dele. Não há nova API, RPC ou consulta comercial.

## Referências por conteúdo

| Arquivo fornecido | Sustenta | Limites |
| --- | --- | --- |
| JPG `21_45_09` | fachada, marquise, expositores, mural, acesso, calçada | perspectiva; anúncio antigo não reutilizado |
| JPG `21_45_15` | lateral que recua, esquina, continuidade urbana | sem orientação geográfica confirmada |
| JPG `21_45_33` | lateral direita, canteiro, árvore, prédio ao fundo | distância estimada |
| JPG `21_45_39` | copa, tronco, vagas e profundidade | nome de rua sobreposto excluído |
| PNG `centro_civico_03_mar_25 (1)` | hall, madeira, rampas, corrimãos, teto | não comprova planta inteira |
| PNG `centro_civico_02_mar_25 (1)` | auditório, poltronas, desníveis, palco | não comprova lotação |
| JPG `21_45_48` | banner 2027, creme, verde, soja dourada | arte frontal reconstruída; sem parede/sombras da foto |
| JPG `21_45_54` | identidade e hierarquia Soy Summit | sem slogan, UI social, avatares ou indicação 1/4 |
| JPEG WhatsApp `22.34.57` | posição e desenho do mural, limite da marquise | arte reconstruída; inscrição descartada |
| PNG `23_07_28` + correção do solicitante | ala dos seis conjuntos de janelas compondo a frente | corrige a interpretação perpendicular anterior; recuo ainda estimado |

As inscrições da fachada variam entre as fotografias e divergem do briefing. Os novos textos usam **Centro Cívico Cultural Antônio Carlos Borges — Santa Rosa/RS**. Nenhum nome de rua é inferido. Os anexos integrais não são distribuídos como assets institucionais.

## Coordenadas e confiança

Uma unidade representa aproximadamente um metro; Y é vertical, mural no plano Z≈0 e interior em Z negativo. Não representa norte geográfico. Parâmetros em `src/features/soy-summit/venue-layout.ts`:

| Parte | Estimativa | Confiança / decisão |
| --- | --- | --- |
| frente principal | X=-15 a X=12; alturas 10,8–12,5 m | média na silhueta, baixa nas medidas |
| ala frontal direita | largura 8 m, altura 9,4 m, recuo 1,6 m, profundidade 7 m | orientação frontal determinada pela correção do solicitante; medidas baixas |
| janelas da ala | dois conjuntos por nível, três níveis, voltados à frente | relação visual observada; parede de retorno lisa |
| marquise | projeção 2,3 m; termina antes do extremo do mural | estimada pelas referências |
| hall | 24 × 8 m; rampas de 0,35 m | profundidade/planta não documentadas |
| auditório | aproximadamente 24 × 27 m; palco elevado 0,65 m | distribuição estimada; um único ambiente |
| árvore | tronco em X=20, Z=8,5; copa assimétrica por ramificações | porte aproximado; folhagem procedural |
| edifício de fundo | massa 16 × 22 × 12 m; frente em Z=-18 | afastamento e altura estimados |

O mural permanece no bloco avançado; os seis conjuntos de janelas estão numa ala **frontal recuada**, não na longa face perpendicular. Hall e auditório mantêm seus caminhos, sem ampliar áreas visitáveis para dentro dessa ala. Porta principal em X=-4; duas entradas ao mesmo auditório em X=±9,5. O FOV é 58° em desktop e 65° em telas estreitas. Fechamentos sem fotografia são discretos. As 216 instâncias de poltronas compõem uma reconstrução ilustrativa, sem capacidade oficial divulgada.

## Direção de arte / procedência

Skill utilizada: Creative Production `produce` 0.1.25, com contratos `source-preservation`, `exact-content`, `deterministic-exports` e modo `styles`. Board: `b3b18441-7867-4524-ab68-4ff43a9ef807`. Composição determinística: creme `#f5f1e5`, verde `#073d32`, dourado `#d8a52d`, realce `#fff1b3` e ouro escuro `#a26b18`; curvas vetoriais periféricas, sem textos gerados por IA. Símbolo oficial existente em `public/alvorada/fenasoja-symbol-official.png`, preservado; grão existente `src/assets/fenasoja-golden-soybean.png`. Fontes existentes Archivo Black e Hind: alternativas da composição, não alegadas como fonte oficial do evento. O arquivo chamado `fenasoja-logo-horizontal.png` contém uma captura de login e foi rejeitado após inspeção. A assinatura usa o símbolo original e a palavra institucional composta deterministicamente; obter o arquivo vetorial oficial completo continua sendo uma melhoria possível.

O mural foi reconstruído com a ferramenta nativa ImageGen a partir do recorte fornecido: arte plana, sem textos divergentes, sombras da fotografia, moldura ou sobreposições. É uma aproximação visual, não a obra original recuperada. Master `masters/mural-reference-v2.png`, 2020 × 778; derivado WebP para a cena. Curvas, logo composta e textos do banner/telão têm masters SVG em `masters/`; esses masters não são baixados no produto. Nenhum número fictício foi incorporado à arte estática.

Os quatro cards do telão são geometria com espessura, bordas arredondadas douradas e face verde. Valores e rótulos são texturas separadas; só os campos alterados são enviados à GPU. No portal a mesma identidade é feita com CSS, gradientes, bordas e sombras; sem Three. Há destaque por ponteiro/toque e teclado. O movimento reduzido desativa as transições de deslocamento. Os rótulos foram ampliados após inspeção em viewport móvel.

O fundo final das contagens usa uma composição de **grãos de soja abundantes, céu azul suave e nuvens claras**, produzida com o ImageGen nativo e a Creative Production, conforme a revisão do solicitante. Grãos nas laterais/base, iluminação natural, área central clara e cards opacos preservam a hierarquia. As faces dos cards têm acabamento verde acetinado, contorno interno dourado e uma curva discreta inspirada no grão; no telão, uma textura compartilhada e estática acrescenta esse acabamento sem custo a cada tick. A fotografia de colheitadeiras foi substituída e não integra os assets finais.

Master decorativo `masters/soy-grain-sky.png`, 1774 × 887; [prompt e procedência](masters/soy-grain-sky-prompt.md). Derivados próprios: portal 1400 × 700 (**53.762 bytes**), celular 720 × 720 (**17.604 bytes**), composição completa do telão 2000 × 900 (**123.468 bytes**). O recorte móvel mantém grãos na base e espaço para a grade 2×2; o desktop conserva os grãos maiores nas bordas. A logo e os textos seguem determinísticos e separados do fundo gerado. O banner externo mantém a composição creme/verde/dourado, com a data correta.

Matriz de exportação com dimensões, canal alfa, destino, procedência e **peso real**: [assets.json](assets.json). Fontes e licenças OFL em [licenses](licenses/). O exportador lê o instante e os tokens da configuração canônica. Não há alegação de detalhe 4K recuperado de fotografias pequenas; o telão usa 2000 × 900, banner 1400 × 1200 e os valores usam pequenos patches nítidos de 384 × 192. O DPR e a resolução interna são limitados por perfil.

## Execução e integração

Na comissão **Soy Summit → Centro Cívico 3D**, a rota real é `/comissoes/soy-summit/centro-civico-3d`, protegida pelos mesmos guards da frente. O link de retorno leva ao dashboard da comissão. Para revisão local sem sessão, `npm run dev -- --host 127.0.0.1 --port 8081` disponibiliza `/__dev/soy-summit`, **somente em desenvolvimento**, renderizando a mesma página e a mesma cena, sem dados privados. Esse atalho não existe no build de produção.

O portal `/portal` continua abrindo em Fenasoja. O botão circular com duas setas alterna o evento e anuncia o destino. A seleção é estado da visualização, sem persistência. O espaço reservado permanece 940 × 361,34 px no desktop de 1440 px e 323 × 320,31 px no viewport de 390 px. A configuração Fenasoja não foi alterada.

Responsabilidades:

- `config/soy-summit.ts`: configuração canônica, identidade e data formatada no fuso do evento.
- `lib/event-clock.ts`: timer compartilhado, cálculo por diferença, sincronização esparsa, suspensão e limpeza.
- `SoySummitCountdown.tsx` / `soy-summit-identity.css`: contagem DOM, cards e apresentação leve.
- `SoySummitVisitPage.tsx` / `VenueScene.tsx`: entrada lazy, estados de carregamento, falhas e controles.
- `scene/exterior.ts`, `hall.ts`, `auditorium.ts`: geometria e materiais por ambiente; hall/auditório carregados progressivamente.
- `venue-layout.ts`: pontos, conexões reversíveis, obstáculos e enquadramento em retrato.
- `scene/venue-renderer.ts`: um contexto WebGL, câmera, navegação, perfis, pausas, culling e descarte.
- `scene/stage-panel.ts`: superfície oclusiva em perspectiva, cards, valores e interação sem remontar a cena.

Não foram criadas migrações, tabelas, permissões, dados comerciais ou nova infraestrutura de portal. O mapa comercial, a agenda e os fluxos de vendas não foram editados.

## Apresentação de abertura no auditório

Na primeira chegada à plateia por qualquer porta, a contagem está oculta por uma cortina 3D verde profunda, com borda dourada, trama discreta, pregas, argolas e duas metades recolhidas sobre o trilho. Dois homens adultos genéricos, de pele clara, cabelo curto, rostos distintos, terno, camisa, gravata e sapatos sociais se aproximam da emenda e a abrem em sentidos opostos. Alturas virtuais aproximadas: 1,81 m e 1,78 m.

Sequência de 11,8 s: aproximação (1,1 s), alcance/pegada (até 2,4 s), caminhada lateral com abertura (até 10,2 s), soltura e postura final (até 11,8 s). A câmera permanece no ponto de chegada e permite olhar. Um trajeto que segue até o painel aguarda a apresentação antes de continuar. A apresentação ocorre uma vez por visita; sair e entrar pela outra porta não a reinicia. “Rever abertura” é explícito. “Pular apresentação” libera os controles e abre imediatamente. Movimento reduzido apresenta o resultado final sem executar a sequência; mudança dessa preferência durante a abertura também a encerra.

Cloth e esqueletos usam a mesma linha temporal (`reveal-timeline.ts`). A cortina é deformada por pregas e recolhimento determinísticos, não por uma simulação física de tecido completa. Mãos e pés usam IK de dois ossos; os alvos das mãos acompanham as bordas, com pegadas em alturas ligeiramente diferentes para evitar sobreposição. A passada deriva da distância percorrida, com apoio e elevação alternados. Não há captura de movimento, balanço artificial da câmera ou áudio automático. Perda de foco/aba oculta pausa tecido e pessoas juntos, sem saltar a apresentação ao voltar.

Os modelos são MakeHuman CC0, produzidos em Blender/MPFB; [procedência e licenças](licenses/MakeHuman-CC0.md). São GLBs de **4.018.336** e **4.094.680 bytes**, 46.820 e 47.154 triângulos. A otimização reduziu o total de 16.916.008 para 8.113.016 bytes, preservando rig e geometria. Mapas opacos JPEG, recortes de cabelo PNG com alfa; 1K/512 px conforme a superfície. Os dois modelos, GLTFLoader e código da apresentação são preparados apenas ao chegar ao hall; a entrada na plateia aguarda a preparação. Nada disso é solicitado pelo contador do portal ou pelo exterior inicial. Não há reprodução automática contínua após a abertura.

Falha de um GLB descarta o modelo já preparado e oferece a apresentação leve com contagem e tentativa novamente. Saída da visita libera esqueletos, materiais, texturas e contexto. [Validação da apresentação](evidence/reveal-validation.json) inclui as duas entradas, retorno sem repetição, movimento reduzido, pausa/retomada, salto, falha de modelo e capturas da sequência. Os personagens têm anatomia e texturas humanas para tempo real; não são escaneamentos fotorrealistas. A animação e a captura aproximada continuam disponíveis para revisão de direção artística.

## Desempenho e orçamento

Arquitetura criada por código; os dois personagens usam GLB carregado somente com o auditório, pelo GLTFLoader já disponível no Three. Não há novo decoder nem dependência de aplicação. Objetos arquitetônicos estáticos são agrupados por material; poltronas e folhagem usam instanciamento. Uma luz direcional tem sombras; os pontos internos são complementos sem sombras. Um ambiente de reflexão pequeno é preparado uma vez. Materiais de reboco, madeira, piso, tecido, asfalto e casca usam mapas procedurais compartilhados.

Orçamentos de referência: exterior até 250 mil triângulos / 80 draw calls / 1 MB de arte transferida; hall até 50 mil / 60 calls; auditório com apresentação até 380 mil / 70 calls / 8,5 MB adicionais (arquivos antes da compressão HTTP). Até 56 texturas residentes após aquecimento. O orçamento estimado de texturas, mipmaps, ambiente e sombras é 128 MiB no perfil equilibrado e 160 MiB no alto; isso é um **orçamento**, não leitura de VRAM, que não é exposta de maneira portátil por WebGL.

Automaticamente: equilibrado no desktop, econômico em tela estreita; rebaixa após duas janelas de queda sustentada e espera 15 s para nova mudança. DPR máximo 1,75 / 1,25 / 1, resolução interna limitada a 3,6 milhões de pixels; sombras 2048 / 1024 / 512. O modo econômico mantém os cards, rotas e geometria essencial. Em repouso, a cena só desenha por invalidação (inclusive o relógio a cada segundo); aba oculta pausa trabalho. Não há partículas, animação infinita da vegetação, pointer lock automático ou caminhada livre sem colisões.

Após culling por ambiente, o hall caiu de **406.210 para 11.906 triângulos**; a cena do auditório é preparada ao chegar ao hall e a entrada aguarda sua conclusão. O painel envia 73.728 pixels por campo alterado, geralmente apenas segundos, em vez de reenviar os 1.800.000 pixels da arte estática. Com personagens e cortina, quatro ciclos adicionais pelos dois lados mantiveram **124 geometrias, 52 texturas e 44 programas** após aquecimento. Nenhuma mudança de câmera ou criação de recursos foi observada durante os ticks.

A primeira medição da apresentação ficou em 44–49 FPS neste desktop. Uma rodada de otimização reduziu subdivisões ocultas nas 216 poltronas, mantendo bordas arredondadas, e habilitou culling conservador dos personagens. A vista frontal caiu de **363.846 para 260.166 triângulos** (−28,5%). Os rostos, cabelos, roupas e rig foram preservados. Nos acessos, hall e auditório podem coexistir: orçamento transitório de 95 calls, distinto do orçamento de um ambiente isolado.

Referência medida: Windows, Chrome 155.0.8059.85 headless, Intel i5-1035G1, 8 GiB RAM, ANGLE/Direct3D11 em **Intel UHD Graphics**. Capturas desktop 1440 × 960 e portal 1440 × 900; viewport móvel 390 × 844.

| Medição final | Resultado | Condições / interpretação |
| --- | --- | --- |
| exterior útil a partir da navegação | 2.751 ms | rota real de desenvolvimento, HTTP cache frio, transformações Vite aquecidas, loopback sem limitação; não representa produção pela internet |
| inicialização interna do renderizador | 1.214 ms | subconjunto do tempo acima |
| movimento, últimos 120 frames | média 52,6 FPS; mediana 16,7 ms; P95 33,4 ms | perfil equilibrado nesse desktop; amostra, não garantia para todo aparelho |
| apresentação, chegada pelas duas portas | 49,7–50,0 FPS; P95 33,4 ms | amostras de 120 frames; antes da otimização: 44–49 FPS |
| exterior | 153.412 triângulos / 62 calls | folhagem composta mais detalhada |
| hall | 11.906 / 49 calls | plateia e árvore ocultas atrás da arquitetura |
| painel | 260.166 / 58 calls | plateia instanciada, telão, cards, dois homens e cortina |
| portal base → implementação | 2.210 → 3.084 ms até contagem disponível | dois builds locais, rede CDP 10 Mbps / 80 ms; uma amostra por versão, introdução dispensada pelo mesmo controle |
| portal: corpos enviados até +1,2 s | 3.670.963 → 4.075.052 bytes | inclui galeria/introdução prévias e sua temporização; não atribuir toda a diferença ao contador |
| alternar para Soy pela primeira vez | **112.500 bytes** de corpos enviados | marca 11.846 + fundo 53.762 + fonte 46.892; HEAD sem corpo; nenhum modelo, telão, mural ou código da visita |

O contador novo acrescenta aproximadamente 3,4 KB gzip em seu JS/CSS compartilhado, além da pequena configuração; o chunk do portal muda em +425 bytes gzip. O chunk Three já usado pela Alvorada cresce 780 bytes gzip com os utilitários compartilhados. O grafo estático do portal não alcança `VenueScene`, `SoySummitVisitPage`, hall, auditório ou `stage-reveal`: [bundles.json](evidence/bundles.json). O contador não solicita esses chunks nem os GLBs ao alternar. O CDP desta máquina informou zero bytes para algumas imagens; por isso o benchmark também registrou os corpos enviados pelo servidor de prévia, sem confundir tamanho de arquivo com telemetria de transferência. Os registros excluem tráfego externo injetado pelo antivírus.

A meta inicial de 60 FPS não foi sustentada nessa Intel UHD durante a apresentação, mesmo após a rodada de otimização. O perfil econômico reduz resolução/sombras, e a sequência pode ser dispensada. Não há medição em celular físico; a meta de 30 FPS nesses dispositivos permanece sem comprovação.

## Validação

Resultados compactos e reproduzíveis: [validation-summary.json](evidence/validation-summary.json). Medições de rede/renderização, navegador, CPU, GPU e condições: [performance.json](evidence/performance.json). A medição da cena usa a rota real de desenvolvimento; não deve ser apresentada como carregamento de produção autenticado. A comparação de portal usa builds locais gzip, cache frio e rede CDP declarada.

- **46/46 testes focados**, incluindo os testes anteriores de contagem/navegação Fenasoja. Limites de data, um segundo e um milissegundo antes, instante exato, depois, outros offsets, suspensão, unsubscribe, alternância, reinicialização, obstáculos, tela estreita e sequência de apresentação.
- **88/92 testes das integrações existentes** de portal, Alvorada, workspace e acesso. As quatro falhas restantes têm os mesmos nomes de casos que falharam na base: contrato de acesso da Alvorada, posição/destino do quinto card de administração (dois casos) e revalidação de organização. Comparação nominal registrada no relatório, sem alterar esses testes para ocultá-las.
- Typecheck, build e lint dos arquivos alterados verificados; o build conserva o aviso prévio de chunks grandes da aplicação.
- Suíte ampla executada antes dos refinamentos finais e da apresentação de cortina: **4.153 passaram / 108 falharam, 498 arquivos**. Execução da base `ad82a829`, com dependências locais existentes: **4.132 passaram / 115 falharam, 495 arquivos**. A suíte global não está verde. As falhas da base, inclusive Agenda, Mapa Comercial e Alvorada, estão listadas no relatório; a contagem diferente não é prova de equivalência de cada falha nem de ausência universal de regressões. A versão final tem os checks focados e de navegador descritos acima.
- Navegação real pelos botões, duas portas para o mesmo auditório, ida e volta, painel frontal/oblíquo, perfis, repetição, relógio sem remontagem, entrada direta sem sessão e reload para login, alternância com teclado e dimensões estáveis.
- Falha de textura, perda de contexto, retry e indisponibilidade WebGL levam à apresentação leve com relógio e saída para a comissão.
- Desktop e viewport móvel 390 × 844 inspecionados. Toque emulado, cancelamento, ausência de overflow e controles de 44 px; não há prova em GPU de celular físico, iOS ou Safari.

Registros para comparação: [fachada](evidence/facade.webp), [esquina](evidence/corner.webp), [árvore e fundo](evidence/tree.webp), [hall](evidence/hall.webp), [porta esquerda](evidence/left-door.webp), [porta direita](evidence/right-door.webp), [auditório esquerdo](evidence/auditorium-left.webp), [auditório direito](evidence/auditorium-right.webp), [painel frontal](evidence/panel-frontal.webp), [oblíquo](evidence/panel-oblique.webp), [portal Fenasoja](evidence/portal-fenasoja-1440.webp), [portal Soy](evidence/portal-soy-1440.webp), [portal móvel](evidence/portal-soy-390.webp), [painel móvel](evidence/mobile-panel.webp).

Scripts em `scripts/soy-summit/`: baseline, browser-validation, performance, static-preview, export-assets e package-evidence. Ferramentas de QA/exportação instaladas fora das dependências da aplicação; `PLAYWRIGHT_MODULE`, `SHARP_MODULE` e `OPENTYPE_MODULE` podem apontar para instalações locais. O plugin Vite existente reescreve `supabase/functions/mcp/index.ts` ao executar; o arquivo gerado e a imagem de cloverleaf gerada pelos testes foram restaurados e excluídos do escopo.

## Limitações que permanecem

Esta entrega é uma reconstrução 3D funcional baseada em fotografias e correções do solicitante; **não é um levantamento técnico nem uma reprodução fotorrealista certificada**. Os materiais são procedurais, o mural é uma aproximação gerada e paisagismo/equipamentos distantes estão simplificados. Para aumentar a fidelidade faltam planta cotada, medidas de desníveis, conexão real entre hall/plateia, fotos das faces não documentadas e arquivo original do mural/assinatura institucional completa. Esses parâmetros permanecem ajustáveis.

Não foi disponibilizada uma sessão autenticada autorizada para validar os dados/permissões remotos dentro da comissão; a proteção sem sessão foi testada e os guards foram preservados. Não houve deploy, merge, aplicação de migrações ou alteração de produção. As metas de 30 FPS em celular físico e carregamento autenticado de produção em 3–5 s continuam dependendo de medição nesses ambientes. A PR e a prévia local permitem revisar a implementação e as limitações concretas.
