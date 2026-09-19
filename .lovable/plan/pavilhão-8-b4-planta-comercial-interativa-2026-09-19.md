# Pavilhão 8 / B4 — planta comercial interativa

## Objetivo
Aplicar ao Pavilhão 8 o motor compartilhado de planta interativa usado em B5/B6, preservando sua orientação canônica própria, os 114 módulos, o módulo irregular 90, os espaços de apoio, os cinco acessos e toda a operação comercial.

## Estado atual confirmado
- O B4 está definido com `facingRadians: Math.PI` e `interiorViewRotationRadians: 0`; esses valores permanecem independentes do bloqueio manual de rotação.
- A referência oficial usa 21,70 × 35,40 m, 114 módulos e 438,50 m² de área modular.
- As sequências atuais são 01–20, 21–25, 26–37, 38–63, 64–89, 90, 91–100 e 101–114.
- O módulo 90 já possui `footprint`, duas `renderParts` e `labelAnchor` próprios; o atlas numérico já usa essa âncora.
- Sanitários, Cozinha e Apoio de serviço ficam 7,40 m ao norte do salão medido. O `fit: 'official-content'` atual já amplia o envelope de B4 para incluí-los, resultando em proporção efetiva 21,70 × 42,80 m.
- Os cinco marcadores oficiais já estão protegidos: saída de emergência traseira, duas entradas/saídas frontais e conexões B4→B5 e B4→B3.
- O motor compartilhado já fornece câmera quase ortogonal, PAN por mouse/touch, zoom, rotação bloqueada, limites, módulos planos, atlas único e respeito aos insets do painel. O B4 ainda não ativa esse perfil.

## Implementação
1. **Ativar o perfil compartilhado no B4**
   - Manter `fit: 'official-content'` e adicionar `mode: 'plan'`, rotação bloqueada, PAN/zoom, navegação mouse/touch, módulos planos, numeração máxima, limites e preservação da orientação.
   - Acrescentar a opção semântica `includeSupportSpacesInFit` ao perfil e fazer o enquadramento compartilhado tratá-la explicitamente, sem duplicar cena ou lógica exclusiva do B4.

2. **Preservar a transformação espacial**
   - Manter `coordinateTransform: 'identity'`, `facingRadians: Math.PI` e `interiorViewRotationRadians: 0`.
   - Usar a mesma transformação canônica da planta para câmera, alvo, PAN e atlas numérico; não copiar nenhuma rotação de B5/B6 e não compensar números.

3. **Enquadramento e navegação**
   - Calcular o fit inicial pelo envelope de apresentação completo do B4: salão, módulos, corredores, espaços de apoio, paredes e wayfinding, com margem visual.
   - Respeitar a área útil restante ao lado do painel por meio dos insets e offsets já existentes.
   - Desktop: esquerda/direita em PAN, centro/scroll em zoom; mobile: um dedo em PAN e dois dedos em DOLLY_PAN; nenhum gesto poderá rotacionar.
   - Manter panBounds confortáveis sobre o envelope completo e zoom suficiente para leitura, sem permitir perder o pavilhão.

4. **Apresentação e performance**
   - Ativar módulos planos, sem elevação em hover, seleção ou carrinho e sem sombras dos módulos.
   - Priorizar os 114 números no único `CanvasTexture`, preservando `InstancedMesh`, geometrias e materiais compartilhados.
   - Manter os textos Sanitários, Cozinha e Apoio de serviço no mesmo atlas, legíveis e visualmente secundários.
   - Confirmar o número 90 na sua `labelAnchor`, dentro do polígono irregular.

5. **Proteções automatizadas**
   - Criar teste dedicado do B4 cobrindo orientação, dimensões, área, 114 módulos, ranges, perfil plano e navegação.
   - Proteger `MODULE_90_SHAPE`, `renderParts`, `labelAnchor`, área e interação.
   - Proteger os três espaços de apoio, sua extensão norte e sua inclusão no fit.
   - Proteger os cinco acessos, posições e destinos B5/B3.
   - Atualizar testes que hoje classificam B4 como “fora do modo plano”.
   - Confirmar B5/B6 sem regressão e os demais pavilhões sem ativação acidental.

6. **Validação no mapa em execução**
   - Executar testes focados e verificação TypeScript.
   - Abrir `Mapa Comercial → Pavilhão 8 → Ver interior` no viewport desktop atual e em mobile.
   - Conferir orientação, áreas de apoio, módulo 90, cinco marcadores, painel lateral, PAN nas quatro direções, zoom, seleção e acessos B5/B3.
   - Capturar evidências da visão inicial, zoom intermediário/próximo, PAN superior/inferior/lateral e mobile, verificando orientação idêntica em todas.
   - Se o navegador automatizado continuar incapaz de concluir o WebGL, registrar objetivamente o bloqueio e deixar a checagem manual na prévia como única pendência; não declarar validação visual concluída sem evidência.

## Arquivos previstos
- `src/features/commercial-map/data/pavilion8CommercialReference.ts`
- `src/features/commercial-map/data/commercialPavilionReference.ts`
- Motor compartilhado de enquadramento apenas se necessário para tornar `includeSupportSpacesInFit` efetivo
- Novo teste de apresentação plana do B4 e ajustes pontuais nos testes de B4/B5/B6

## Salvaguardas
- Nenhuma alteração em banco, migrations, IDs, posições, corredores, áreas, preços, status, vendas, seleção, carrinho, filtros ou rotas.
- Nenhuma alteração nas orientações canônicas de B4, B5 ou B6.
- Nenhuma nova cena, label DOM por módulo ou material individual por lote.
- Nenhuma publicação em produção.
