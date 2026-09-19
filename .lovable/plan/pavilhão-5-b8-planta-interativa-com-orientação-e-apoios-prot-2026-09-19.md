# Pavilhão 5 / B8 — planta interativa com orientação e apoios protegidos

## Objetivo
Transformar o interior existente do Pavilhão 5 em uma planta comercial fixa, legível e navegável, reutilizando o motor compartilhado já adotado nos demais pavilhões, sem alterar referência oficial, dados comerciais, rotas ou banco.

## Estado confirmado
- O B8 mantém `facingRadians: 0`, `interiorViewRotationRadians: 0` e projeção `identity` com dimensões métricas de 25,50 × 43,50 m.
- A referência oficial contém 81 módulos nas faixas 01, 02–43, 44–62 e 63–81; áreas de 244,50 m² modular, 508,95 m² de exposição e 841,53 m² total.
- O corredor `central-commercial-aisle`, a abertura `west-cross-access` e os acessos `north-central-exit`, `west-central-entrance` e `south-central-exit` já estão definidos na referência.
- Os quatro apoios `deposito-fenasoja`, `deposito-hortigranjeiros`, `alojamento-peoes` e `alojamento-peoas` já são estruturas permanentes não comerciais, renderizadas separadamente dos lotes e incluídas no atlas único de labels.
- O módulo 28 já conserva `manual-confirmation-required` somente como discrepância documental, sem status comercial.
- O B8 já usa `fit: 'official-content'`; o envelope atual inclui boundary, módulos, corredores e apoios por padrão.
- O motor compartilhado já oferece PAN com mouse/toque, zoom no cursor, rotação bloqueável, limites de navegação, compensação do painel lateral, lotes planos, seleção/Vendas, `InstancedMesh` e uma única `CanvasTexture`. O B8 ainda não ativa `mode: 'plan'`.

## Implementação
1. Criar um perfil derivado exclusivo do B8 com:
   - `mode: 'plan'` e `navigationMode: 'locked-plan'`;
   - `enableRotate: false` e `enablePan: true`;
   - mouse em PAN/DOLLY/PAN e toque em PAN/DOLLY_PAN;
   - orientação canônica preservada;
   - `fit: 'official-content'`, wayfinding e apoios incluídos no enquadramento;
   - módulos planos, números em prioridade máxima, sem metragem sobre a superfície e limites de PAN/zoom.
2. Aplicar o perfil somente ao plano derivado B8 em `COMMERCIAL_PAVILION_MODULE_PLANS`, preservando integralmente `pavilion5CommercialReference.ts`, suas células, corredores, acessos, apoios, projeção e métricas.
3. Reutilizar sem duplicação `CommercialPavilionInteriorScene`, `CommercialPavilionModuleLayer`, `CommercialPavilionWayfindingLayer`, `InteriorCameraRequest` e `CommercialMapCanvas`.
4. Manter o enquadramento pelo conteúdo oficial completo e pelo viewport útil ao lado do painel. Ajustar lógica compartilhada apenas se a validação demonstrar corte da ala de apoio, dos acessos ou margem excessiva, sem mudar B1–B6.
5. Preservar a hierarquia existente dos apoios: cores neutras por tipo, borda tracejada e labels quebrados dentro do atlas. Refinar escala/contraste compartilhados somente se a prova visual mostrar ilegibilidade, sem criar labels DOM ou materiais individuais.
6. Manter hover, seleção e carrinho apenas por cor/borda/contraste no modo plano, sem elevação física e sem alterar elegibilidade, preço ou status.

## Testes e salvaguardas
- Criar suíte dedicada ao B8 cobrindo:
  - orientação `0 / 0` e projeção `identity` intactas;
  - 81 módulos, faixas oficiais, dimensões e três totais de área;
  - `central-commercial-aisle` e `west-cross-access` intactos;
  - quatro apoios, IDs, tipos não comerciais e labels preservados;
  - três acessos oficiais, posições/arestas e wayfinding;
  - módulo 28 com discrepância documental, área e ausência de status comercial;
  - perfil plano, PAN/zoom, rotação bloqueada, official-content e apoios no fit;
  - lotes planos sem elevação em hover/seleção/carrinho;
  - seleção e Modo Vendas preservados;
  - `InstancedMesh`, geometria/material compartilhados, textura única e ausência de labels individuais.
- Atualizar somente expectativas antigas que ainda classificam B8 como não-planar.
- Executar regressões de B1, B2, B3, B4, B5 e B6, enquadramento oficial, wayfinding, módulos, seleção/Vendas e TypeScript.

## Validação visual
- Abrir `Mapa Comercial → Pavilhão 5 → Ver interior` em desktop e mobile.
- Conferir orientação direta, leitura das sequências, corredor central, abertura oeste, três acessos e quatro apoios.
- Exercitar PAN nos quatro sentidos, zoom mínimo/máximo e seleção de módulos, confirmando ausência de rotação e elevação.
- Verificar que o painel lateral não corta nem afasta excessivamente a planta.
- Capturar evidências quando o renderer WebGL automatizado responder; se o ambiente repetir o bloqueio já observado nos outros pavilhões, registrar a limitação sem declarar validação visual concluída.

## Limites
- Nenhuma alteração em banco, migrations, áreas, preços, status, IDs, geometrias oficiais, rotas, vendas, reservas ou vínculos comerciais.
- Nenhuma alteração na orientação B8, nenhuma cena exclusiva e nenhuma rotação compensatória de labels.
- Nenhuma publicação.
