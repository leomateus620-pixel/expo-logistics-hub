# Pavilhão 1 / B1 — planta interativa com orientação canônica protegida

## Objetivo
Transformar o interior existente do Pavilhão 1 em uma planta comercial fixa, legível e navegável, reutilizando integralmente o motor compartilhado já aplicado aos B2–B6, sem alterar cartografia, dados comerciais ou rotas.

## Estado confirmado
- A referência oficial do B1 contém 189 módulos, 587,85 m² de área modular, dimensões 52,70 × 22,84 m e as faixas 01–06, 07–57, 58, 59–64, 65–102, 103–140, 141 e 142–189.
- A orientação permanece definida como `facingRadians: Math.PI / 2`, `interiorViewRotationRadians: Math.PI` e projeção `quarter-turn-clockwise`.
- O módulo 141 já possui `footprint`, dois `renderParts` e `labelAnchor` próprios; a projeção e a área de 19,35 m² já têm cobertura automatizada.
- Os quatro acessos oficiais são `west-upper-exit`, `west-main-entrance`, `east-upper-exit` e `east-lower-exit`.
- Hoje o plano derivado B1 ainda não recebe `interiorPresentation.mode = 'plan'`; por isso usa a câmera 3D anterior mostrada no anexo.
- O motor compartilhado já oferece PAN com mouse/toque, zoom limitado, rotação bloqueada, lotes planos, textura numérica única, seleção comercial e enquadramento contextual ao lado do painel.

## Implementação
1. Criar o perfil de apresentação plana do Pavilhão 1 na camada derivada, sem editar a referência oficial:
   - modo `plan` e navegação `locked-plan`;
   - rotação desativada;
   - PAN e zoom ativos e limitados;
   - mouse esquerdo/direito para PAN, roda para zoom;
   - um dedo para PAN e dois dedos para zoom/PAN;
   - orientação canônica preservada;
   - módulos planos, números em prioridade máxima e sem metragem sobre a superfície;
   - acessos incluídos no enquadramento.
2. Aplicar esse perfil somente ao B1 ao construir `COMMERCIAL_PAVILION_MODULE_PLANS`, mantendo intactos `pavilion1CommercialReference.ts`, as orientações em `commercialPavilions.ts`, IDs, células, corredores, áreas e relações comerciais.
3. Reutilizar sem duplicação `CommercialPavilionInteriorScene`, `CommercialPavilionModuleLayer`, `CommercialPavilionWayfindingLayer`, `InteriorCameraRequest` e `CommercialMapCanvas`.
4. Validar o enquadramento compartilhado contra o viewport útil à direita do painel. Ajustar o motor comum apenas se a prova visual demonstrar corte ou excesso de afastamento, preservando o comportamento aprovado de B2–B6.
5. Manter hover, seleção e carrinho por cor/borda, sem elevação física; preservar `InstancedMesh`, geometria compartilhada, ausência de sombras nos módulos planos e uma única `CanvasTexture` para toda a numeração.

## Testes e salvaguardas
- Adicionar uma suíte dedicada ao B1 cobrindo:
  - `Math.PI / 2`, `Math.PI` e `quarter-turn-clockwise` intactos;
  - 189 módulos, faixas oficiais, 587,85 m² e dimensões oficiais;
  - perfil plano, PAN/zoom e rotação bloqueada;
  - os quatro acessos após a projeção canônica, sem remapeamento manual;
  - módulo 141 irregular, dois `renderParts`, `labelAnchor`, área, ID e seleção preservados;
  - lotes planos, sem elevação em hover/seleção/carrinho;
  - `InstancedMesh`, textura única e ausência de labels individuais.
- Atualizar somente as expectativas que hoje classificam o B1 como não-planar.
- Executar as regressões de orientação, enquadramento, wayfinding, módulos, seleção/Vendas e os testes dedicados de B2, B3, B4, B5 e B6, além da verificação TypeScript.

## Validação visual
- Abrir efetivamente `Mapa Comercial → Pavilhão 1 → Ver interior` em desktop e mobile.
- Conferir orientação, entrada principal, três saídas, módulo 141 e sentido das sequências.
- Exercitar PAN nos quatro sentidos, zoom mínimo/máximo, seleção de módulos e acessos.
- Confirmar que o painel lateral não desloca nem reduz indevidamente o enquadramento.
- Capturar evidências quando o renderer WebGL automatizado responder; se o ambiente voltar a bloquear a renderização, registrar a limitação sem declarar validação visual concluída.

## Limites
- Nenhuma alteração em banco, migration, preços, vendas, status, áreas, IDs, geometrias oficiais, rotas ou vínculos comerciais.
- Nenhuma cena exclusiva para B1 e nenhuma rotação compensatória.
- Nenhuma publicação.
