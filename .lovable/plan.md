# Pavilhão 12 / B3 — planta comercial interativa horizontal

## Objetivo
Aplicar ao Pavilhão 12 o motor compartilhado de planta interativa já usado em B4/B5/B6, preservando integralmente sua apresentação canônica de 180°, os 257 módulos, a planta horizontal, os três acessos e toda a operação comercial.

## Estado atual confirmado
- O B3 mantém `facingRadians: Math.PI` e `interiorViewRotationRadians: Math.PI`; a câmera compartilhada já compõe essas transformações em `toWorld`.
- A referência oficial contém 257 módulos, 771 m² modulares, 1.650 m² totais, planta de 50 × 33 m e `moduleGap = 0`.
- As sequências oficiais são 01–22, 23–40, 41–82, 83–124, 125–166, 167–208 e 209–257.
- Os acessos são `right-central-entry-exit`, `bottom-central-entry-exit` e `pavilion-8-connection` → B4.
- As arestas locais esquerda/direita dos acessos foram intencionalmente invertidas para a apresentação interna de 180°; não devem ser “corrigidas”.
- O B3 ainda não ativa o perfil plano. O motor compartilhado já oferece rotação bloqueada, PAN/zoom, limites, atlas numérico único, `InstancedMesh`, módulos planos e enquadramento contextual ao lado do painel.

## Implementação
1. **Ativar o perfil visual sem alterar a referência oficial**
   - Manter `pavilion12CommercialReference.ts` intacto em módulos, células, posições, corredores, dimensões, áreas, gap, acessos e arestas.
   - Aplicar ao plano derivado do B3, na camada de apresentação compartilhada, `mode: 'plan'`, `navigationMode: 'locked-plan'`, `enableRotate: false`, `enablePan: true`, navegação mouse/touch, módulos planos, números prioritários e limites de PAN/zoom.
   - Não criar cena, renderer ou materiais exclusivos do Pavilhão 12.

2. **Proteger a orientação canônica de 180°**
   - Manter `facingRadians: Math.PI` e `interiorViewRotationRadians: Math.PI` como fontes únicas da orientação.
   - Usar a mesma transformação canônica para câmera, alvo, limites e planta; não aplicar compensações em módulos, wayfinding ou dados.
   - Manter o atlas numérico orientado pelo mecanismo compartilhado atual, sem inverter sequências nem criar labels paralelos.

3. **Enquadrar a planta horizontal na área útil**
   - Usar o envelope completo de apresentação do B3 — perímetro, módulos, corredores e marcadores — com margem segura, preservando a proporção horizontal de 50 × 33 m.
   - Respeitar os `viewportInsets` e o `viewOffset` já calculados para o painel lateral, centralizando na área realmente visível.
   - Ajustar o perfil compartilhado apenas se a validação mostrar excesso de margem no B3; qualquer ajuste será dirigido por configuração e não mudará B4/B5/B6.

4. **PAN, zoom e limites**
   - Desktop: botão esquerdo e direito em PAN, botão central/scroll em zoom; trackpad mantém PAN e pinch zoom.
   - Mobile: um dedo em PAN e dois dedos em `DOLLY_PAN`; nenhum gesto poderá rotacionar.
   - Calcular limites confortáveis pelo envelope completo, permitindo alcançar 01–40, 41–124, 125–208, 209–257 e todos os acessos sem perder a planta fora da tela.
   - Preservar zoom-out para a visão integral e zoom-in suficiente para leitura individual, sem recentralização após navegação manual.

5. **Leitura e performance**
   - Ativar lotes planos, sem elevação em hover, seleção ou carrinho e sem sombras desnecessárias.
   - Priorizar somente o número na superfície; a metragem permanece nos dados e painéis.
   - Reutilizar a única `CanvasTexture`, `InstancedMesh`, geometrias e materiais compartilhados; calibrar contraste, stroke e resolução do atlas para a densidade de 257 módulos sem labels DOM ou estado por frame.
   - Preservar contraste entre lotes, corredores e perímetro sem alterar suas geometrias.

6. **Proteções automatizadas**
   - Criar teste dedicado do B3 cobrindo orientação `Math.PI / Math.PI`, 257 módulos, áreas, dimensões, gap, ranges e perfil plano.
   - Proteger explicitamente as três arestas atuais dos acessos e a conexão B3→B4 após a rotação de 180°.
   - Confirmar motor compartilhado, PAN/zoom, zero rotação, módulos planos, atlas único e ausência de labels DOM.
   - Atualizar somente as expectativas que hoje classificam B3 como fora do modo plano.
   - Reexecutar regressões de B4, B5 e B6, além dos testes de módulos, wayfinding, seleção/vendas e TypeScript.

7. **Validação visual em execução**
   - Abrir `Mapa Comercial → Pavilhão 12 → Ver interior` em desktop e mobile.
   - Comparar com a imagem de referência e capturar evidências da visão inicial, PAN nas quatro direções, zoom integral/intermediário/próximo, seleção e acesso ao Pavilhão 8.
   - Conferir posições visuais das sequências 01–40, 41–124, 125–208 e 209–257, os três ícones e a ausência de rotação indevida dos números.
   - Se o navegador automatizado novamente não concluir o WebGL, registrar o bloqueio objetivamente e não declarar a validação visual concluída sem evidência.

## Arquivos previstos
- `src/features/commercial-map/utils/commercialPavilionModules.ts` — perfil de apresentação derivado do B3, sem tocar nos dados oficiais.
- Motor compartilhado de câmera/atlas somente se a validação do B3 exigir ajuste configurável.
- Novo teste dedicado do Pavilhão 12 e ajustes pontuais nos testes de B3/B4/B5/B6.
- `roadmap.md` para acompanhar a validação visual pendente, se necessário.

## Salvaguardas
- Nenhuma alteração em `pavilion12CommercialReference.ts`, banco, migrations, IDs, células, posições, corredores, áreas, preços, status, vendas, seleção, carrinho, filtros ou rotas.
- Nenhuma alteração em `facingRadians` ou `interiorViewRotationRadians` do B3; bloquear rotação manual não remove a orientação oficial.
- Nenhuma alteração nos perfis e orientações canônicas de B4, B5 ou B6.
- Nenhuma cena duplicada, label DOM por módulo, material individual por lote ou aumento de draw calls.
- Nenhuma publicação em produção.
