# Hero ilustrativo Fenasoja 2028 — validação corretiva

Data: 30 de julho de 2026

## Correção entregue

- Os quatro cards fotográficos e todos os textos da camada ilustrativa foram removidos.
- As referências agrícolas deixaram de ser renderizadas como imagens no hero.
- Cinco vinhetas SVG representam plantio, cultivo, fluxo de grãos, colheita e distribuição mundial.
- Cada vinheta possui `data-root-path` próprio e um `clipPath` orgânico exclusivo, desenhado dentro da zona geométrica da raiz correspondente.
- As cinco raízes continuam partindo do mesmo ponto central da soja luminosa.
- A hierarquia visível do bloco contém somente “FENASOJA 2028” e “Gestão Operacional”.

## Validação visual autenticada

O resultado foi inspecionado na rota protegida `/portal`, com uma sessão autenticada existente.

| Viewport | Altura do hero | Resultado |
| --- | ---: | --- |
| 1920 × 1080 | 427 px | Aprovado |
| 1536 × 864 | 427 px | Aprovado |
| 1440 × 900 | 425 px | Aprovado |
| 1366 × 768 | 312 px | Aprovado |
| 1024 × 768 | 312 px | Aprovado |
| 768 × 1024 | 352 px | Aprovado |
| 430 × 932 | 244 px | Aprovado |
| 390 × 844 | 244 px | Aprovado |
| 375 × 812 | 236 px | Aprovado |
| 360 × 800 | 236 px | Aprovado |

Em todas as dimensões foram confirmados:

- ausência de overflow horizontal;
- título e soja como focos principais;
- cinco raízes e cinco vinhetas contidas no frame;
- zero elementos `<img>`, `<image>` ou `<text>` na camada ilustrativa;
- exatamente três grãos na vinheta de distribuição mundial;
- card “Gestão Operacional” contido no hero;
- separação correta entre o hero e os acessos do portal.

Capturas:

- [`fenasoja-hero-illustrative-roots-1366x768.png`](screenshots/fenasoja-hero-illustrative-roots-1366x768.png)
- [`fenasoja-hero-illustrative-roots-390x844.png`](screenshots/fenasoja-hero-illustrative-roots-390x844.png)

## Movimento e acessibilidade

- Em movimento normal, os três grãos percorrem trajetórias distintas e todos tiveram deslocamento confirmado.
- Com `prefers-reduced-motion: reduce`, nenhum `animateMotion` é renderizado e os três grãos permanecem visíveis nos destinos.
- A animação de entrada das vinhetas é reduzida para `0.01ms` pela regra global do portal.
- As ilustrações são decorativas e não substituem informação necessária para navegação ou compreensão do portal.
- O `h1` semântico “FENASOJA 2028” e o contraste do conteúdo funcional foram preservados.

## Desempenho

- Os três WebP agrícolas anteriores, que somavam aproximadamente 294 KB, foram removidos.
- As cenas usam apenas o SVG já renderizado pelo componente, sem canvas, imagens externas ou biblioteca adicional.
- O movimento permanece restrito ao SVG e às propriedades `transform` e `opacity`.
- Não há medição contínua de layout, listener de ponteiro ou re-renderização por frame.

## Evidência técnica

- Testes focados do portal: 26 de 26 aprovados.
- ESLint dos arquivos alterados: aprovado.
- Build de produção: aprovado.
- `git diff --check`: aprovado.
- A suíte global conserva 29 falhas preexistentes em cinco arquivos do Cronograma e 343 testes aprovados.
- O `tsc --noEmit` conserva três erros preexistentes em `src/hooks/useVenueOperations.ts`.
- Nenhuma rota, autenticação, consulta Supabase, RLS, permissão, navegação ou regra de negócio foi alterada.
