# Pavilhão 13 / B5 — planta comercial interativa

## Objetivo
Aplicar ao interior do Pavilhão 13 o perfil compartilhado de planta interativa já usado pelo B6, preservando integralmente a orientação canônica própria do B5, seus 103 módulos, geometrias irregulares, áreas, acessos, vendas e rotas.

## Estado atual confirmado
- O B5 está definido com `facingRadians: Math.PI` e `interiorViewRotationRadians: 0`; o B6 usa outra rotação. A orientação continuará vindo da definição de cada pavilhão, nunca do perfil visual.
- A referência do B5 contém 103 módulos e 351,30 m² de área modular, com dimensões métricas de 21,00 × 35,35 m.
- Os módulos 25, 26, 78 e 79 já usam polígonos, partes de renderização e âncoras de número próprios.
- Os seis acessos canônicos já existem: duas saídas ao norte, duas entradas ao sul e conexões laterais para B6/Pavilhão 3 e B4/Pavilhão 8.
- O motor compartilhado já suporta lotes planos, atlas numérico único, mouse em PAN, touch em PAN/DOLLY_PAN, limites de câmera, enquadramento contextual e preservação da vista manual. Hoje apenas o B6 ativa o perfil completo; o B5 usa somente o enquadramento por conteúdo oficial.

## Implementação
1. **Ativar o perfil compartilhado no B5**
   - Evoluir `pavilion13CommercialReference.ts` para combinar o `fit: 'official-content'` existente com `mode: 'plan'` e as opções de navegação, módulos planos, numeração prioritária, fit com wayfinding e limites de pan/zoom.
   - Manter `projection.coordinateTransform: 'identity'`, `facingRadians: Math.PI` e `interiorViewRotationRadians: 0` sem qualquer compensação de câmera, geometria ou textura.

2. **Generalizar sem duplicar cenas**
   - Reutilizar `CommercialPavilionInteriorScene`, `CommercialPavilionModuleLayer`, `CommercialPavilionWayfindingLayer`, `InteriorCameraRequest` e `CommercialMapCanvas`.
   - Remover pressupostos de testes ou configuração que tratem o modo plano como exclusivo do B6; o comportamento passará a ser compartilhado apenas por B5 e B6.
   - Não criar cena, renderer, materiais ou labels paralelos para o Pavilhão 13.

3. **Câmera e navegação do B5**
   - Aplicar câmera quase ortogonal alinhada à transformação canônica do B5, com rotação bloqueada.
   - Desktop: botão esquerdo e direito em PAN, botão central/scroll em zoom; trackpad preservado.
   - Mobile: um dedo em PAN e dois dedos em DOLLY_PAN, sem caminho de rotação.
   - Calcular enquadramento e limites pelo envelope completo de apresentação, incluindo shell, corredores, entradas, saídas e marcadores, respeitando os insets do painel lateral.
   - Manter limites confortáveis de deslocamento e zoom, sem recentralização após navegação manual.

4. **Apresentação dos módulos**
   - Ativar superfícies planas, sem elevação em hover, seleção ou carrinho e sem sombras desnecessárias.
   - Preservar cores, bordas, estados comerciais, seleção, filtros, tooltip e carrinho.
   - Reutilizar uma única `CanvasTexture` e os `InstancedMesh`; aumentar a prioridade da numeração sem criar labels DOM, `<Text />` ou materiais individuais.
   - Confirmar que 25, 26, 78 e 79 continuam usando seus polígonos e `labelAnchor` oficiais.

5. **Regressões automatizadas**
   - Criar cobertura específica do B5 para orientação canônica, perfil plano, 103 módulos, 351,30 m², ranges oficiais e dimensões métricas.
   - Proteger polígonos, diagonais, partes de renderização e âncoras dos módulos 25, 26, 78 e 79.
   - Proteger os seis acessos, seus destinos e a renderização do wayfinding.
   - Verificar mouse/touch, PAN real dentro dos limites, zoom, rotação bloqueada, atlas único, instancing e ausência de elevação.
   - Atualizar as salvaguardas do B6 para garantir que orientação, bounds, zoom, PAN e acessos permaneçam inalterados; confirmar que os demais pavilhões mantêm o comportamento anterior.

6. **Validação no mapa em execução**
   - Executar testes focados e verificação TypeScript.
   - Abrir `Mapa Comercial → Pavilhão 13 → Ver interior` em desktop e mobile.
   - Validar orientação, fit útil ao lado do painel, todos os acessos, seleção, links B5→B6/B4, PAN nas quatro direções, zoom mínimo/máximo, ausência de rotação e estabilidade após soltar o gesto.
   - Capturar visão inicial, três níveis de zoom, deslocamentos superior/inferior/lateral e mobile, comparando a orientação entre todas as imagens.

## Arquivos previstos
- `src/features/commercial-map/data/pavilion13CommercialReference.ts`
- Testes do perfil plano do B5 e ajustes pontuais nos testes que atualmente consideram o perfil exclusivo do B6
- Componentes compartilhados de câmera/renderização somente se a validação revelar uma lacuna real; nenhuma alteração específica duplicada para o B5

## Salvaguardas
- Nenhuma alteração em banco, migrations, áreas, preços, status, vendas, carrinho, IDs, rotas, corredores, coordenadas ou vínculos comerciais.
- Nenhuma alteração nos valores canônicos de orientação do B5 ou B6.
- Nenhuma publicação em produção.
