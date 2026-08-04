# Hero compacto Fenasoja 2028 — validação visual

Data: 3 de agosto de 2026

## Resultado

O hero do portal foi reduzido e reorganizado para priorizar, nesta ordem:

1. FENASOJA 2028;
2. contagem oficial;
3. ação “Abrir contagem”.

A soja dourada permanece no lugar do “O” e é o único foco ornamental da marca. As linhas amarelas em forma de raízes e o badge “Gestão Operacional” foram removidos integralmente, incluindo SVG, filtros, animações, wrappers, estilos e espaço residual.

## Refinamento visual

- Wordmark, soja e “2028” receberam escala menor e proporções mais próximas.
- O ano foi aproximado da marca e centralizado entre dois filetes dourados curtos.
- O brilho da soja foi contido, sem `blur` caro ou animação contínua.
- A moldura usa uma borda principal, realce interno discreto e ornamentos brancos alinhados ao padding.
- O desktop mantém duas colunas, com a marca em aproximadamente 54% e a contagem em 46%.
- Tablet e mobile usam composição empilhada intencional, células compactas e CTA com alvo mínimo de 44 px.
- A data aparece como “29 de abril de 2028, às 10h · Brasília”, preservando o rótulo acessível completo do fuso.

## Responsividade

A rota `/portal` foi inspecionada em navegador real, sem sessão autenticada disponível. A validação visual abaixo cobre o estado anônimo do mesmo hero; rotas e estados autenticados permanecem cobertos pelos testes focados.

| Viewport | Altura do hero | Agenda inicia em | Composição |
| --- | ---: | ---: | --- |
| 2560 × 1440 | 225,1 px | 352,1 px | Horizontal |
| 1920 × 1080 | 225,1 px | 344,1 px | Horizontal |
| 1680 × 1050 | 224,5 px | 343,5 px | Horizontal |
| 1536 × 864 | 224,5 px | 351,5 px | Horizontal |
| 1440 × 900 | 224,5 px | 343,5 px | Horizontal |
| 1366 × 768 | 198,5 px | 300,4 px | Horizontal compacta |
| 1024 × 768 | 198,5 px | 300,4 px | Horizontal compacta |
| 768 × 1024 | 285,4 px | 394,4 px | Empilhada |
| 430 × 932 | 339,3 px | 435,3 px | Empilhada 2 × 2 |
| 390 × 844 | 337,2 px | 425,2 px | Empilhada 2 × 2 |
| 375 × 812 | 331,8 px | 419,8 px | Empilhada compacta |
| 360 × 800 | 331,8 px | 419,8 px | Empilhada compacta |

Em todos os viewports foram confirmados:

- medidas exatas de `innerWidth` e `innerHeight`;
- ausência de overflow horizontal, título cortado, colisão ou clipping;
- ausência completa das raízes e do badge;
- quatro unidades legíveis, com numerais tabulares e células contidas;
- data, CTA e ornamentos dentro da moldura;
- Agenda visível ainda na primeira tela nos quatro viewports mobile.

## Interação, acessibilidade e desempenho

- O temporizador existente atualizou somente o valor de segundos durante a inspeção.
- O CTA foi acionado por teclado e abriu `/cronograma-eventos/contagem-oficial`; sem sessão, o guard existente apresentou o login do módulo.
- `aria-live="off"` continua impedindo anúncios a cada segundo, com resumo acessível separado.
- Com `prefers-reduced-motion: reduce`, animação e transições têm duração efetiva de `0.01ms`.
- O console não apresentou erros; permaneceram apenas avisos preexistentes das future flags do React Router 7.
- Nenhuma biblioteca, imagem, intervalo ou implementação alternativa de countdown foi adicionada.

## Evidência técnica

- 8 arquivos de teste focado / 68 testes aprovados.
- ESLint dos arquivos tocados: aprovado.
- Build de produção: aprovado, com 4.748 módulos transformados.
- `git diff --check`: aprovado.
- O TypeScript global mantém três falhas preexistentes em `src/hooks/useVenueOperations.ts` (linhas 264, 266 e 268), fora do escopo deste hero.

Rotas, autenticação, Supabase, RLS, permissões, data oficial, timezone, cálculo do countdown, navegação expandida e destinos dos módulos não foram alterados.
