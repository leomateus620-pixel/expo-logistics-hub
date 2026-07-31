# Hero ilustrativo Fenasoja 2028 — validação corretiva

Data: 30 de julho de 2026

## Correção entregue

- Os quatro cards fotográficos e todos os textos da camada ilustrativa foram removidos.
- As referências agrícolas deixaram de ser renderizadas como imagens no hero.
- Quatro cenas SVG premium representam plantio de precisão, cultivo, colheita com fluxo de grãos e distribuição mundial.
- As cinco linhas amarelas funcionam como divisores. Cada cena possui `data-root-between` e um `clipPath` de cunha que a restringe ao espaço azul entre duas raízes adjacentes (`1-2`, `2-3`, `3-4`, `4-5`).
- Paisagem, solo, fileiras de lavoura, canopy, poeira, maquinário com volume e luz atmosférica substituem a leitura de ícones isolados.
- As cinco raízes continuam partindo do mesmo ponto central da soja luminosa.
- A hierarquia visível do bloco contém somente “FENASOJA 2028” e “Gestão Operacional”.

## Validação visual autenticada

O resultado foi inspecionado na rota protegida `/portal`, com uma sessão autenticada existente.

| Viewport | Altura do hero | Resultado |
| --- | ---: | --- |
| 1920 × 1080 | 423 px | Aprovado |
| 1536 × 864 | 423 px | Aprovado |
| 1440 × 900 | 422 px | Aprovado |
| 1366 × 768 | 310 px | Aprovado |
| 1024 × 768 | 310 px | Aprovado |
| 768 × 1024 | 350 px | Aprovado |
| 430 × 932 | 244 px | Aprovado |
| 390 × 844 | 244 px | Aprovado |
| 375 × 812 | 236 px | Aprovado |
| 360 × 800 | 236 px | Aprovado |

Em todas as dimensões foram confirmados:

- ausência de overflow horizontal;
- título e soja como focos principais;
- cinco raízes visíveis e quatro cenas confinadas exatamente entre raízes adjacentes;
- zero elementos `<img>`, `<image>` ou `<text>` na camada ilustrativa;
- exatamente três grãos na vinheta de distribuição mundial;
- card “Gestão Operacional” contido no hero;
- separação correta entre o hero e os acessos do portal.

As inspeções visuais de desktop e mobile foram realizadas na sessão autenticada; as credenciais não foram registradas nos artefatos de validação.

## Movimento e acessibilidade

- Em movimento normal, os três grãos percorrem trajetórias distintas e todos tiveram deslocamento confirmado.
- Com `prefers-reduced-motion: reduce`, nenhum `animateMotion` é renderizado e os três grãos permanecem visíveis nos destinos.
- A animação de entrada das cenas é reduzida para `0.01ms` pela regra global do portal.
- As ilustrações são decorativas e não substituem informação necessária para navegação ou compreensão do portal.
- O `h1` semântico “FENASOJA 2028” e o contraste do conteúdo funcional foram preservados.

## Desempenho

- A camada narrativa usa apenas o SVG já renderizado pelo componente, sem fotos agrícolas, canvas, imagens externas ou biblioteca adicional.
- Os quatro recortes reutilizam o mesmo `viewBox` e não criam observadores, timers de renderização ou medições contínuas.
- O movimento permanece restrito ao SVG e às propriedades `transform` e `opacity`.
- Não há medição contínua de layout, listener de ponteiro ou re-renderização por frame.

## Evidência técnica

- Testes focados do portal: 26 de 26 aprovados.
- ESLint dos arquivos alterados: aprovado.
- Build de produção: aprovado.
- TypeScript (`tsc --noEmit`): aprovado.
- `git diff --check`: aprovado.
- A suíte global conserva 29 falhas preexistentes em cinco arquivos do Cronograma e 343 testes aprovados.
- Nenhuma rota, autenticação, consulta Supabase, RLS, permissão, navegação ou regra de negócio foi alterada.
