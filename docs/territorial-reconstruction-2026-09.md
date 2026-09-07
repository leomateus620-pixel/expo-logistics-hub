# Reconstrução territorial — 7 de setembro de 2026

## Implantação e evidências

Base Git: `65ee7fe2`; branch `codex/territorial-road-reconstruction`. A implementação foi isolada para preservar alterações em andamento, inclusive o arquivo da função MCP do Supabase. Anexos 1–5 foram usados como diagnóstico; anexos 6–9 como referência visual. O anexo 10 não foi fornecido. Imagens privadas não foram copiadas para o repositório.

O plano oficial usa um recorte de 5.500 × 4.150 pontos, convertido para 120 × 90,545455 unidades locais. A origem local corresponde a `[3350,2975]` no plano. Não se assume que direita/esquerda da imagem sejam direções geográficas.

Três correspondências permitem uma transformação afim do extrato OSM para o plano existente:

| Marco | Longitude, latitude | Coordenadas do plano |
|---|---|---|
| Brasília / Benvenuto, junto a A3 | -54.4777125, -27.8434439 | 3964, 4200 |
| Rótula junto a A2 | -54.4756499, -27.8467157 | 1110, 4185 |
| Extremidade norte da Brasília | -54.4800196, -27.8446064 | 3964, 2440 |

Arena, pavilhões e limites do parque foram usados para conferir a orientação. Três pontos ajustam exatamente uma transformação afim; isso **não mede erro topográfico** nem comprova cada trecho oculto. Larguras, recuos, alturas e volumes externos são estimativas de modelagem. O arquivo `territoryRoadSource.json` registra os eixos, atributos, IDs OSM e âncoras, sem chamadas de rede em produção.

## Rede viária

- Retirados da apresentação a BR curta paralela e os três ramais do Y herdado, incluindo suas marcações e postes decorativos exclusivos. A parte norte da Ubiretama, antes escondida pela substituição da faixa cadastral inteira, também foi recomposta. Os antigos módulos de trevos permanecem como referência de código e testes históricos, sem montagem na cena.
- Uma superfície territorial consolidada representa a BR-472 junto ao parque, seus acessos e as ruas externas. Afastamento variável acompanha os eixos alinhados, preservando terreno entre a rodovia e as vias internas.
- A bifurcação norte e o encontro circular sul têm geometrias distintas. O encontro sul possui passagem axial no dado público (`334416404`), portanto é uma rótula vazada, e não uma rotatória fechada inventada. Não foram criados viadutos.
- Pavimento resulta de união poligonal; acostamentos são diferenças de superfícies. Ilhas permanecem como vazios, e as faixas são interrompidas nas bocas dos encontros. Normais horizontais explícitas evitam resíduos de triangulação com iluminação inválida.
- Trechos identificados como terra/cascalho têm material separado. A malha decorativa de ruas locais fica fora do raycasting comercial; uma geometria de interação restrita atende as vias comerciais existentes.

### Nomes e portões

Rua Brasil e Rua Brasília mantêm entidades distintas. A continuação transversal junto à arena segue os eixos públicos `571136681/682`, identificados como Brasil, corrigindo sua associação anterior à Ubiretama. A Ubiretama acompanha a faixa cadastral lateral, incluindo a continuidade norte antes omitida, e encontra o acesso junto à arena. Há ajuste visual de três postes para liberar os novos corredores; seus registros e conexões elétricas permanecem intactos.

O usuário confirmou Brasília ao lado do centro de eventos e da arena. Essa informação não permite substituir o nome Brasil em outra via. O anexo 9 identifica Portão 5 na saída norte para o bairro; o cadastro A5 está junto à arena. Ambos os acessos permanecem distintos. A continuação norte é identificada como Rua Alfredo Albino Meinertz no OSM. **Não houve migração ou renumeração de portões.**

Os anexos usam BR-472; OSM denomina o trecho RSC-472. Mantido BR-472 na apresentação solicitada. O projeto antigo usava BR-344; o [mapa municipal do Plano Diretor](https://prefeitura.santarosa.rs.gov.br/wp-content/uploads/2022/08/Mapa_Plano_Diretor.pdf) e OSM identificam ERS-344. A apresentação externa usa ERS-344, sem criar entidade comercial nova.

## Entorno e acabamento

Casas acompanham frentes de ruas, com variação determinística de volumes, altura, cobertura, recuos e quintais. Há galpões, pátios, vazios, áreas agrícolas, faixas de mata e jardins. A distribuição representa a organização territorial visível, não um inventário cadastral de cada casa. O Balneário Águas do Sul inclui três corpos d’água, áreas abertas, solo esportivo, construções e vegetação. Seu posicionamento é uma interpretação aproximada do anexo 8, que tem rotação e recorte independentes; não possui a mesma confiança dos eixos viários georreferenciados. A demarcação verde não foi convertida em rua nem exibida como limite permanente.

Superfícies de solo são recortadas contra vias e patches de maior prioridade. Bordas de pistas e patches fecham até o terreno base; fundações, quintais e troncos alcançam esse mesmo piso, evitando superfícies suspensas. Variação de material em coordenadas do mundo evita ladrilhamento de textura; mapas de asfalto existentes usam filtragem e rugosidade. Vegetação e envelopes de construções são afastados das pistas.

Elementos repetidos usam instancing, materiais/geometrias compartilhados e grupos espaciais. Detalhes das construções e troncos têm LOD com histerese. Sombras de novas construções são limitadas à proximidade; não há geração de geometria por frame. Recursos próprios são liberados, inclusive instâncias sob `dispose={null}`. Enquadramento inicial e limites comerciais continuam calculados a partir do parque.

## Validação

TypeScript, ESLint dos arquivos alterados (zero erros/avisos) e build de produção aprovados. O build mantém os avisos de tamanho de chunks e da base caniuse desatualizada. A suíte completa, executada sem build/browser concorrentes, passou **1.684 de 1.719 testes**. As **35 falhas são as mesmas da base** (1.680/1.715), sem falhas novas; nomes e comparação em [verification.json](screenshots/territory/verification.json). Os testes territoriais verificam cobertura da união, ilhas, orientação/normais, orçamento de triângulos, remoção dos objetos aposentados e afastamento de árvores/construções.

### Medição comparável

Chrome headless acelerado, Intel UHD via ANGLE/D3D11, qualidade HIGH, câmera oblíqua idêntica e movimento de seis segundos após aquecimento. O caminho direto e DPR adaptativo de 0,72 são os mesmos antes/depois. Viewports CSS: desktop 1366 × 768 e móvel 390 × 844; o canvas ocupa apenas a área disponível da página. A coleta mede intervalos entre frames, não tempo exclusivo da GPU. Heap JS varia com coleta de lixo e não equivale a memória de vídeo.

| Medida | Desktop antes | Desktop depois | Viewport móvel antes | Viewport móvel depois |
|---|---:|---:|---:|---:|
| Intervalo médio / p95 entre frames (ms) | 16.67 / 16.80 | 17.30 / 18.10 | 16.67 / 16.90 | 16.67 / 16.90 |
| Draw calls no frame amostrado | 729 | 877 | 558 | 601 |
| Triângulos no frame amostrado | 608373 | 621893 | 535024 | 496854 |
| Geometrias / texturas / programas residentes | 558 / 149 / 167 | 535 / 145 / 165 | 558 / 149 / 167 | 535 / 145 / 165 |
| Heap JS amostrado (MiB) | 113.1 | 109.6 | 112.4 | 137.4 |
| Buffer efetivo (pixels) | 972 × 500 | 972 × 500 | 270 × 490 | 270 × 490 |

O território aumenta o número de chamadas no desktop; geometrias, texturas e programas residentes diminuem com a retirada dos trevos anteriores. A amostra móvel mantém aproximadamente 16,67 ms por frame, executada no mesmo computador. São janelas curtas de medição, sem promessa de 60 FPS contínuos ou desempenho em telefone. A repetição adicional da base para a vista Ubiretama está preservada separadamente, sem substituir a série comparativa.

[Capturas antes/depois e relatórios completos](screenshots/territory/README.md) incluem vista inicial comercial, geral superior, BR, arena, Ubiretama, saída norte, os dois encontros rodoviários, balneário, perspectiva oblíqua e viewports móveis. A câmera inicial continua centrada no parque. A instrumentação de câmera é restrita a DEV e não é carregada na rota de produção.

### Estabilidade e funções comerciais

O roteiro final concluiu **40 ciclos / 80 transições** em 137,8 s, com zero erros de página, zero perdas de contexto e nenhum código de erro do renderizador. As quatro configurações aquecidas mantiveram recursos estáveis entre os ciclos 3 e 20:

| Configuração | Geometrias início → fim | Texturas início → fim | Programas início → fim |
|---|---:|---:|---:|
| Hidrologia ligada | 540 → 540 | 147 → 147 | 183 → 183 |
| Hidrologia desligada | 541 → 541 | 147 → 147 | 183 → 183 |
| Qualidade reduzida | 510 → 510 | 136 → 136 | 172 → 172 |
| Qualidade completa | 532 → 532 | 149 → 149 | 176 → 176 |

Os fluxos desktop e responsivo passaram em navegação por arraste/zoom, abertura e alternância de filtro, busca/seleção B10 e entrada/saída do interior. Mantiveram um canvas, estado de renderização ready, zero erros e zero chamadas de mutação ao backend sintético. Retrato 390 × 844 e paisagem 844 × 390 ficaram sem overflow horizontal. Os gestos foram automatizados no computador; isso não comprova multitouch físico.

A inspeção visual cobriu as vistas comparativas listadas, sem quadro vazio ou artefato de iluminação inválida nas superfícies novas. O escopo de evidência continua limitado às câmeras e configurações registradas; os recursos e estruturas internos preexistentes foram preservados.


## Reprodução

- `npx tsc --noEmit -p tsconfig.app.json`
- `npx vitest run src/test/commercialMapTerritorialReconstruction.test.ts src/test/commercialMapRearRoadNetwork.test.ts src/test/commercialMapRearRoadGround.test.ts src/test/commercialMapRearRoadTreeClearance.test.ts src/test/commercialMapAnnexSpatialCorrections.test.ts`
- `npm run build`
- Inicie Vite em cada checkout. `scripts/territory/capture.cjs before|after [--mobile]` usa `QA_URL`; `PLAYWRIGHT_MODULE` permite informar uma instalação externa de Playwright. Chrome com aceleração gráfica é necessário para comparação equivalente.
- `scripts/territory/functional.cjs territory URL [--mobile]` usa autenticação sintética e intercepta as chamadas ao backend; testa a base oficial de referência, com lotes bloqueados, sem publicar nem alterar disponibilidade comercial.
- `scripts/territory/stress.cjs` executa 80 transições de hidrologia/qualidade e salva metadados e recursos aquecidos.
- Os scripts Python de importação usam o XML público salvo em `artifacts/territory/osm-map.xml`. Execute parse → align → import, nessa ordem; o script de alinhamento também gera um desenho de conferência com Pillow. Reimportações futuras podem mudar os dados, portanto exigem revisão.

## Limites reais

Sem levantamento em campo ou teste em telefone físico. Viewports responsivos e eventos de toque em Chrome desktop não certificam Safari/iOS, GPUs móveis ou multitouch físico. Não se declara precisão de cadastro para casas, alturas, lagos ou trechos encobertos. A ausência de tags de ponte/nível no extrato OSM não substitui levantamento altimétrico.
