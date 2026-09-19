# Pavilhão 14 / B2 — planta interativa com quarter-turn protegido

## Objetivo
Aplicar ao interior do Pavilhão 14 o perfil compartilhado de planta fixa, legível e performática, preservando integralmente a cartografia própria do B2, seus 186 módulos, áreas, acessos, vendas, IDs e relações existentes.

## Estado confirmado
- O B2 mantém `facingRadians: Math.PI / 2` e `interiorViewRotationRadians: -Math.PI / 2` no cadastro canônico.
- A referência oficial usa `coordinateTransform: 'quarter-turn-clockwise'`, dimensões métricas 35 × 33 m, 186 células, 616 m² geométricos nominais e 616,16 m² modulares cadastrados.
- As seis sequências oficiais permanecem 01–35, 36–64, 65–93, 94–122, 123–151 e 152–186.
- Os três corredores transversais possuem acessos `front` e `rear`; o motor já projeta suas arestas por `transformCommercialPavilionReferenceWallEdge()`.
- O motor compartilhado já oferece câmera baseada em `facing + interiorViewRotation`, PAN/zoom bloqueados por limites, controles PAN/DOLLY/PAN, gestos PAN/DOLLY_PAN, ajuste ao painel lateral, lotes planos, InstancedMesh e uma CanvasTexture numérica.
- O B2 ainda não possui o perfil `mode: 'plan'`; atualmente usa a apresentação interior anterior mostrada no anexo.

## Implementação
1. **Ativar o perfil B2 sem tocar na referência oficial**
   - Criar uma configuração derivada exclusiva de apresentação para B2 no construtor compartilhado.
   - Ativar `mode: 'plan'`, `navigationMode: 'locked-plan'`, PAN desktop/mobile, zoom limitado, rotação desativada, módulos planos, prioridade máxima dos números, orientação canônica protegida e wayfinding incluído no enquadramento.
   - Não editar `pavilion14CommercialReference.ts`, `commercialPavilions.ts`, geometrias persistidas ou dados comerciais.

2. **Preservar a cadeia espacial canônica**
   - Manter a projeção `quarter-turn-clockwise` como única transformação do croqui oficial.
   - Manter a câmera derivada de `facingRadians + interiorViewRotationRadians`, sem rotação adicional de módulos ou compensação específica de labels.
   - Continuar usando o transformador compartilhado para os acessos; não introduzir mapeamentos manuais `front/rear`.

3. **Enquadramento e navegação**
   - Reutilizar o fit compartilhado sobre o envelope completo da estrutura, com margem segura e ajuste à área livre ao lado do painel.
   - Confirmar que paredes, corredores e os seis acessos projetados permanecem dentro do enquadramento inicial.
   - Manter mouse esquerdo/direito em PAN, roda/pinch em zoom, um dedo em PAN e dois dedos em DOLLY/PAN.
   - Preservar a visão após interação manual e limites confortáveis para alcançar todos os extremos sem perder a planta.

4. **Leitura visual e performance**
   - Reutilizar módulos planos e estados por cor, borda e contraste, sem elevação em hover, seleção ou carrinho.
   - Reutilizar uma única CanvasTexture com prioridade máxima de numeração, sem labels HTML/Text e sem materiais individuais.
   - Preservar InstancedMesh, geometrias/materiais compartilhados e o orçamento atual de draw calls.

## Testes
- Criar teste dedicado ao Pavilhão 14 cobrindo:
  - `Math.PI / 2`, `-Math.PI / 2` e `quarter-turn-clockwise` intactos;
  - 186 módulos, seis ranges, 35 × 33 m e áreas 616/616,16 m²;
  - perfil plan com rotação desativada e PAN/zoom ativos;
  - projeção espacial de cada acesso norte/central/sul nas arestas visuais corretas, não apenas sua contagem;
  - controles desktop/mobile, ajuste contextual ao painel e persistência da visão manual;
  - lotes planos, seleção/Vendas, InstancedMesh e CanvasTexture única.
- Executar regressões de B3, B4, B5 e B6, testes de módulos, wayfinding, projeção, seleção comercial e verificação TypeScript.

## Validação visual
- Abrir efetivamente o interior do B2 em desktop e mobile.
- Registrar visão inicial, zoom intermediário/próximo, PAN nos quatro extremos e seleção de lote.
- Comparar a orientação entre as capturas para confirmar zero rotação e ausência de cortes pelo painel.
- Se o WebGL automatizado voltar a parar no carregamento, registrar a limitação com evidência e não declarar a validação visual concluída.

## Salvaguardas
- Nenhuma alteração em banco, migrations, áreas, preços, status, regras comerciais, IDs, rotas, geometrias ou bindings.
- Nenhum componente paralelo ou duplicação da cena.
- Nenhuma publicação.
