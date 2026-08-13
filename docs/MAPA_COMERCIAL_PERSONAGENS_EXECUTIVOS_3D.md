# Personagens executivos 3D — Mapa Comercial Fenasoja

## Objetivo e limite desta entrega

Esta experiência adiciona Fabiano Soltis e Djeison Drey ao Mapa Comercial como dois personagens independentes, com identidade visual, proporção, roupa, acessórios, animação e comportamento próprios. Eles percorrem juntos um circuito guiado a partir da Casa da Soja, carregam chimarrão e reconhecem discretamente a aproximação do visitante.

A implementação pertence à camada de apresentação 3D. Ela **não cria nem renomeia `MapEntity`**, não altera lotes, geometrias oficiais, segmentos, permissões, persistência ou inventários do parque. A revisão cartográfica vigente continua sendo a fonte de verdade para o mapa.

## Decisão de identidade das referências

A separação correta das pessoas é um requisito de qualidade, porque misturar fotografias de indivíduos diferentes produziria um rosto genérico e reduziria a reconhecibilidade.

| Referência fornecida | Pessoa interpretada | Uso no refinamento |
| --- | --- | --- |
| Foto 1 | Fabiano ao centro; Djeison à direita | Relação de altura, postura, cabelo, roupa formal e contexto conjunto |
| Foto 2 | Fabiano | Face frontal, cabelo, mandíbula, olhos, nariz, boca e barba curta |
| Foto 3 | **Fabiano novamente** | Três-quartos, volume do rosto, cabelo, pele, corpo e gestual |
| Fotos 4 e 5 | Djeison | Corpo inteiro, altura, cabelo claro, barba ruiva, óculos, mãos e chimarrão |

Embora o agrupamento textual inicial associasse a terceira foto a Djeison, a comparação facial e a legenda pública do registro coletivo confirmam que ela repete Fabiano. Por isso, a terceira foto foi retirada do perfil de Djeison e incorporada ao de Fabiano. Essa correção impede a fusão de identidades. A legenda pública usada para conferência está no [Jornal Noroeste](https://jornalnoroeste.com.br/noticia/fenasoja/em-evento-com-expositores-e-liderancas-foi-anunciado-o-presidente-da-fenasoja-2030), e a composição atual de Presidência e Vice-Presidência também aparece no [Portal Oficial da Fenasoja](https://fenasoja.com.br/portal-oficial/geral/resultados-da-fenasoja-2026-sao-enaltecidos-em-evento-de-encerramento/).

As fotos enviadas permanecem como referências oficiais de semelhança. Turnarounds gerados durante a produção são apenas vistas auxiliares para modelagem; não substituem as fotografias nem têm autoridade para redefinir traços.

## Perfis individuais de refinamento

Os perfis executáveis ficam em `src/features/commercial-map/data/executiveCharacters.ts`. Cada um mantém os oito campos exigidos pelo supervisor visual: traços faciais, corpo, roupa, acessórios, animação, fraquezas atuais, correções aplicadas e oportunidades remanescentes.

### Fabiano Soltis — Presidente da Fenasoja

1. **Características faciais definidoras**
   - rosto oval-alongado, testa de largura média, mandíbula afunilada e queixo arredondado-quadrado;
   - olhos castanho-escuros amendoados e sobrancelhas escuras quase retas;
   - nariz médio e estreito, ponte reta e ponta arredondada;
   - lábio superior mais fino, inferior mais cheio e sorriso contido;
   - cabelo castanho muito escuro, laterais curtas e topo denso elevado para o lado;
   - barba curta entre um e três milímetros, mais marcada no queixo e na mandíbula;
   - pele clara-média com subtom quente, sem apagar a assimetria natural.
2. **Características corporais definidoras**
   - porte esbelto-atlético, ombros médios, cintura estreita e relação aproximada de 7,5 cabeças;
   - postura executiva madura e ereta, mas sem rigidez militar;
   - altura visual discretamente inferior à de Djeison.
3. **Roupa**
   - terno azul-marinho, camisa branca, gravata verde-escura e sapatos sociais castanho-escuros;
   - paletó, camisa e gravata como volumes separados, com espessura, gola e queda perceptíveis;
   - dobras controladas em cotovelos, cintura, joelhos e barra.
4. **Acessórios distintivos**
   - óculos leves de aro metálico/rimless, seguindo a direção explícita do produto sem encobrir olhos ou sobrancelhas.
5. **Considerações de animação**
   - passada contida, tronco estável, respiração sutil e gesto de baixa amplitude;
   - aceno curto com a mão livre e retorno sem corte para a caminhada.
6. **Fraquezas visuais atuais**
   - não há vistas ortográficas reais de frente, perfis e costas nem medidas oficiais de altura;
   - os óculos fazem parte do briefing, mas não aparecem nas fotos frontais de Fabiano.
7. **Correções aplicadas**
   - a foto 3 foi corretamente reatribuída a Fabiano;
   - proporção de cabeça, largura dos ombros, cabelo e distribuição da barba foram individualizadas;
   - roupa e silhueta foram separadas do preset de Djeison.
8. **Oportunidades remanescentes**
   - aprovação humana de turntable em frente, três-quartos e perfis;
   - scan ou escultura supervisionada quando houver referências ortográficas e medidas;
   - blend shapes corretivos específicos para sorriso e pálpebras.

### Djeison Drey — Vice-Presidente da Fenasoja

1. **Características faciais definidoras**
   - rosto retangular-oval mais longo, testa alta, bochechas médias e queixo arredondado;
   - olhos claros azul-acinzentados e nariz médio-longo, de dorso quase reto;
   - cabelo loiro-escuro/castanho-claro, curto, texturizado e elevado para o lado;
   - barba cheia curta ruiva, com variação loira e discretamente grisalha;
   - pele clara com subtom rosado e sorriso expressivo.
2. **Características corporais definidoras**
   - porte alto e longilíneo, pernas longas, ombros médios e relação aproximada de 7,7 cabeças;
   - postura executiva relaxada;
   - altura visual cerca de 7% maior que a de Fabiano.
3. **Roupa**
   - terno cinza médio, camisa branca, gravata verde-escura e sapatos sociais castanhos;
   - alfaiataria ajustada com espessura visível, tecido fosco e vincos de queda;
   - roupa separada do corpo para evitar aparência de textura pintada na pele.
4. **Acessórios distintivos**
   - óculos executivos de aro metálico claro, arredondado-retangular;
   - cuia escura na mão esquerda, erva-mate visível e bomba metálica.
5. **Considerações de animação**
   - passada ligeiramente mais longa e em fase diferente da de Fabiano;
   - estabilização da mão esquerda para a cuia não atravessar o corpo;
   - aceno com a mão direita.
6. **Fraquezas visuais atuais**
   - as referências combinam lentes, iluminação e perspectivas diferentes, sem um perfil ortográfico puro;
   - dedos e pega do chimarrão dependem de aproximação a partir das fotos disponíveis.
7. **Correções aplicadas**
   - cabelo claro, barba ruiva, olhos claros, óculos e altura foram preservados como marcadores primários;
   - a foto 3 foi excluída deste perfil;
   - cuia e bomba foram dimensionadas pela mão e vinculadas ao membro, em vez de flutuar junto ao corpo.
8. **Oportunidades remanescentes**
   - aprovação humana da espessura dos aros, densidade da barba e tom dos olhos;
   - refinamento de IK dos dedos com captura de mão em repouso;
   - scan facial e groom de fios para uma versão de produção cinematográfica.

## Contrato do Visual Character Refinement Agent

O **Visual Character Refinement Agent** é uma camada de qualidade especializada e não um gerador genérico de NPC. Seu contrato é executar continuamente o ciclo:

> Referência → Modelo atual → Análise de diferenças → Correção → Validação no sistema → Refinamento final

Para cada pessoa, o agente deve:

1. carregar somente as referências atribuídas ao perfil correto;
2. comparar silhueta frontal, três-quartos e lateral, priorizando cabeça, olhos, nariz, boca, mandíbula, cabelo, barba e óculos;
3. medir relação cabeça/corpo, largura dos ombros, comprimento de braços e pernas, escala das mãos e contato dos pés;
4. verificar se roupa, corpo, cabelo e acessórios são volumes e materiais distintos;
5. revisar a pega da cuia, a inserção da bomba e a superfície da erva-mate;
6. inspecionar clips de caminhada, idle e aceno sem sincronizar os dois corpos mecanicamente;
7. renderizar o modelo no ambiente real do Mapa Comercial e revisar luz, sombra, oclusão, escala e legibilidade por distância;
8. registrar fraquezas, correções e oportunidades no perfil correspondente;
9. repetir a comparação após toda mudança relevante, sem aceitar o primeiro render tecnicamente válido como resultado final.

### Critérios de bloqueio do agente

Uma versão não pode ser aprovada como “premium final” se apresentar qualquer um destes problemas:

- rosto genérico ou identidade cruzada;
- cabeça superdimensionada, ombros estreitos, braços rígidos, mãos fora de escala ou pés flutuantes;
- óculos atravessando a face, cabelo em bloco ou barba pintada sem volume;
- tecido fundido ao corpo, ausência de espessura ou dobra incoerente;
- cuia sem erva, bomba sem resposta metálica ou pega fisicamente impossível;
- mesma fase de passada e mesmo gesto nos dois personagens;
- aceno exagerado, giro instantâneo, clipping ou deslizamento dos pés;
- escala incompatível com B12, vias e edifícios;
- rota atravessando lote, edificação ou objeto de circulação.

## Modelos, materiais e chimarrão

Os ativos de runtime são dois GLBs separados:

- `public/models/executives/fabiano-soltis.glb`;
- `public/models/executives/djeison-drey.glb`.

Cada personagem possui esqueleto e clips nomeados `Idle`, `Walk` e `Wave`. Materiais separam pele, olhos, cabelo/barba, tecido do terno, camisa, gravata, sapatos e metais. Essa separação permite correções individualizadas e evita um único shader com aparência plástica.

O conjunto de chimarrão é tratado como objeto físico: cuia escura com boca e espessura, volume interno de erva-mate, bomba fina de resposta metálica e pega vinculada à mão. A mão que sustenta a cuia não executa o aceno. A bomba não deve atravessar face, gravata ou antebraço durante a caminhada.

## Origem Casa da Soja e contrato cartográfico

O briefing solicita início na **Casa da Soja**. No cadastro oficial do mapa não existe uma entidade com esse nome literal. A origem foi resolvida como o identificador **B12 — Sede Fenasoja / Comissão Central**, onde a experiência pública associa a Casa da Fenasoja e o espaço de memória da soja.

“Casa da Soja” é, portanto, um **alias exclusivamente de apresentação**:

- a interface mostra “Casa da Soja” ao visitante;
- o contrato interno mantém `publicIdentifier: 'B12'` e o nome oficial;
- nenhuma entidade, tabela, migração, consulta ou inventário é renomeado;
- portais isolados que não contêm B12 não renderizam um circuito descontextualizado.

## Construção e validação da rota

A rota canônica está em `src/features/commercial-map/data/executiveRoute.ts`. Ela sai do apron externo de B12 e percorre a rede de circulação central, usando Rua Argentina, Alameda Mercosul, Rua Bolívia, Rua Brasília, Rua Brasil, Rua Montevidéu e Rua Uruguai. O trajeto é fechado e intencional, não aleatório.

O interpolador preserva os corredores com segmentos lineares e curvas quadráticas curtas nas esquinas. O raio de arredondamento é limitado para que uma curva visualmente suave não corte o canto de um lote. A formação compartilha o mesmo progresso de rota, mas aplica:

- deslocamento lateral próprio para cada personagem;
- pequeno deslocamento longitudinal;
- variação individual de velocidade e fase de passada;
- orientação calculada pela tangente local da rota;
- distância de convivência estável, sem colisão ombro a ombro.

A validação amostra o percurso e as duas trajetórias laterais ao longo de toda a curva, testando limites do parque, distância máxima entre waypoints, contato com polígonos sólidos e folga de segurança. O conector nasce no apron externo de B12 e contorna integralmente sua geometria; nenhuma exceção de colisão cadastral é aplicada.

## Animação e comportamento de proximidade

Os personagens compartilham o percurso, não a mesma performance. O relógio da rota alimenta dois ciclos com offsets de fase, evitando o efeito de marcha sincronizada. As transições entre `Walk`, `Idle` e `Wave` usam crossfade, com respiração e movimento de cabeça discretos.

O comportamento do visitante é uma máquina de estados determinística:

1. `walking`: caminhada normal;
2. `orienting`: ao detectar proximidade ou zoom suficiente, reduz gradualmente a velocidade e orienta cabeça/torso;
3. `waving`: a dupla para sem deslizamento dos pés; um personagem realiza um aceno curto enquanto o outro mantém presença natural;
4. `cooldown`: a dupla retoma velocidade e direção suavemente;
5. após o intervalo de repetição, o próximo aceno alterna o personagem.

Há histerese entre entrada e saída para impedir que pequenas oscilações de câmera reiniciem o gesto. A reação também exige visibilidade no frustum ou tamanho projetado suficiente, de modo que mera proximidade matemática atrás da câmera não dispare um aceno invisível.

Quando `prefers-reduced-motion: reduce` está ativo, os acenos automáticos e transições não essenciais são pausados. O controle DOM informa essa adaptação sem depender apenas de cor. O modo de gráficos reduzidos preserva identidade, roupa e prop, reduzindo primeiro custo de atualização e detalhes secundários.

## Acompanhamento de câmera e acessibilidade

O controle `ExecutiveCharacterControls` expõe a experiência fora do canvas:

- nomes e cargos completos dos dois executivos;
- origem “Casa da Soja”;
- estado atual em português, anunciado por uma região `aria-live="polite"`;
- botão “Acompanhar no mapa”, com alvo de toque de pelo menos 44 px;
- botão “Voltar à visão geral” no estado acompanhado;
- `aria-pressed`, rótulos explícitos, foco visível, suporte a alto contraste e layout responsivo;
- texto específico para movimento e qualidade reduzidos.

O acompanhamento segue o ponto médio da dupla e preserva orbitação controlada. Ao voltar, a câmera recupera o preset da Exporural quando esse segmento estiver ativo; nos demais contextos, retorna à visão geral. Selecionar uma entidade, entrar em interior, trocar o workspace ou pedir outro preset cancela o acompanhamento para não manter dois alvos concorrentes.

## Integração ambiental

A validação em cena deve revisar:

- escala relativa a B12, portas, calçadas, ruas e outros visitantes;
- pés no nível do solo sem afundamento ou flutuação;
- sombras de contato suaves mesmo com o shadow map estático do parque;
- resposta de pele, tecidos e metais sob o tone mapping ACES existente;
- oclusão por edifícios e elementos urbanos;
- visibilidade da dupla e do traçado em visão geral, foco de segmento e zoom próximo;
- ausência da experiência nos portais isolados sem contexto cartográfico para B12.

## Estratégia de desempenho

O Mapa Comercial já possui uma carga 3D relevante; por isso, os personagens devem respeitar um orçamento próprio:

- GLBs separados e carregados sob `Suspense`, sem bloquear mapa, busca ou seleção;
- `ErrorBoundary` local: falha ou corrupção de um GLB remove somente a camada executiva, desativa o acompanhamento e preserva o restante do mapa;
- reutilização de geometria/material dentro de cada instância e texturas compactadas;
- atualização próxima em aproximadamente 24–30 fps e distante em 14–20 fps;
- pausa quando a aba está invisível;
- redução de frequência e detalhes em distância, com LOD antes de remover traços de identidade;
- `frameloop="demand"` preservado, invalidando somente quando animação visível exige quadro;
- animações desligadas em preferência de movimento reduzido;
- ausência de alteração em shadow-map global congelado; sombras de contato são locais e baratas.

Antes de aprovar ativos mais pesados, registrar separadamente tamanho do GLB, triângulos, materiais, texturas, joints e duração dos clips. A meta não é maximizar polígonos, e sim maximizar semelhança perceptiva por unidade de custo.

## Matriz de QA

### Contratos automatizados

- perfis diferentes, referências corretamente atribuídas e roupas distintas;
- rota fechada, origem B12 e alias de apresentação intactos;
- rota dentro dos limites e sem interseção com entidades sólidas;
- formação lateral, distância entre personagens e comprimento de curva válidos;
- transições `walking → orienting → waving → cooldown → walking`;
- cooldown, alternância do aceno, histerese e preferência de movimento reduzido;
- presença dos dois GLBs, clips e nomes de animação esperados;
- TypeScript, lint focado, testes do Mapa Comercial e build de produção.

Comandos de referência:

```powershell
npm.cmd test -- --run src/test/commercialMapExecutiveRoute.test.ts src/test/commercialMapExecutiveInteraction.test.ts
npx.cmd tsc --noEmit
npx.cmd eslint src/features/commercial-map/components/controls/ExecutiveCharacterControls.tsx src/features/commercial-map/data/executiveCharacters.ts src/features/commercial-map/data/executiveRoute.ts src/features/commercial-map/utils/executiveInteraction.ts src/features/commercial-map/utils/executiveRoute.ts
npm.cmd run build
```

### Inspeção visual obrigatória

1. abrir o mapa completo e confirmar saída externa de B12;
2. observar um ciclo em visão geral e em segmento relevante;
3. acompanhar a dupla em desktop e mobile;
4. aproximar e confirmar orientação, aceno curto e retorno;
5. verificar diferença de passada e que apenas a mão livre acena;
6. inspecionar rosto, cabelo, barba, óculos e alfaiataria em frente e três-quartos;
7. conferir cuia, erva, bomba, pega e clipping durante todos os clips;
8. repetir com movimento reduzido, gráficos reduzidos e aba reativada;
9. testar seleção, interior, Escape/preset e retorno à visão geral;
10. conferir que inventários, segmentos e geometrias oficiais permanecem idênticos.

Testes locais não substituem aprovação humana de identidade nem smoke autenticado no ambiente-alvo. Qualquer bloqueio de sessão deve ser registrado como validação não executada, nunca mascarado como sucesso.

## Honestidade sobre a fidelidade dos GLBs

Os GLBs desta entrega são **modelos procedurais rigados, individualizados a partir das referências**, com marcadores fortes de identidade, proporções diferentes, roupa separada, óculos, cabelo/barba, chimarrão e três clips funcionais. Eles são adequados para integrar e validar toda a arquitetura de rota, câmera, interação, materiais e animação dentro do mapa.

Eles **não são scans faciais, reconstruções fotogramétricas nem esculturas humanas finais aprovadas pelos retratados**. Fotografias frontais e três-quartos, sem perfis ortográficos, medidas ou captura de expressão, não permitem prometer identidade biométrica ou fidelidade cinematográfica absoluta. O termo “alta fidelidade” nesta fase descreve a intenção, os marcadores individualizados e o rigor da integração — não uma afirmação de que a escultura procedural já equivale a um digital double de estúdio.

Para atingir o último nível de reconhecibilidade, o pipeline deve manter os mesmos IDs, rig e nomes de clips e substituir somente os meshes/materiais após:

1. captura fotográfica controlada de frente, dois perfis, três-quartos, costas e expressões neutra/sorriso;
2. medidas de altura, ombros, torso, braços, pernas, cabeça, mãos e óculos;
3. escultura supervisionada ou scan, groom de cabelo/barba e texturas de pele autorizadas;
4. revisão conjunta com Fabiano e Djeison;
5. retarget dos clips e correções de cloth/IK;
6. nova rodada do Visual Character Refinement Agent e QA em cena.

Essa separação torna a implementação honesta e evolutiva: toda a experiência está pronta para receber ativos finais sem reescrever rota, interação, controles, mapa ou contratos cadastrais.

## Resumo operacional

- **Modelagem:** dois perfis separados; a foto 3 corrige e fortalece Fabiano, enquanto as fotos 4–5 definem Djeison. Roupa, cabelo, barba, óculos, corpo e chimarrão têm especificações individuais.
- **Rota:** circuito fechado e validado na circulação central, com início visual na Casa da Soja e âncora cadastral preservada em B12.
- **Interação:** proximidade/zoom reduz velocidade, orienta a dupla, alterna um aceno curto e retorna suavemente; movimento reduzido desativa reações não essenciais.
- **Qualidade:** perfis internos de refinamento, validação geométrica, materiais separados, clips distintos, integração com iluminação/sombra, orçamento adaptativo e controle DOM acessível.
- **Evolução:** GLBs procedurais validam o recurso completo, mas a aprovação premium final depende de escultura/scan supervisionado e validação humana de semelhança.
