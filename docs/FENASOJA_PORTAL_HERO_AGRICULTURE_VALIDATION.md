# Hero agrícola Fenasoja 2028 — validação

Data: 30 de julho de 2026

## Escopo entregue

- Três cenas agrícolas autorais integradas às raízes luminosas: plantio, colheita e abundância de grãos.
- Um mapa-múndi compacto com o Brasil destacado e exatamente três grãos seguindo rotas para Europa, África e Ásia.
- Direção de arte responsiva própria para desktop, notebook, tablet e celular.
- Tratamento estático equivalente para `prefers-reduced-motion`.
- Nenhuma alteração em rotas, autenticação, Supabase, RLS, permissões, módulos ou regras de negócio.

## Validação visual autenticada

O hero foi inspecionado na rota protegida `/portal`, usando uma sessão autenticada já existente, nas seguintes dimensões:

| Viewport | Resultado |
| --- | --- |
| 1920 × 1080 | Aprovado |
| 1536 × 864 | Aprovado |
| 1440 × 900 | Aprovado |
| 1366 × 768 | Aprovado |
| 1024 × 768 | Aprovado |
| 768 × 1024 | Aprovado |
| 430 × 932 | Aprovado |
| 390 × 844 | Aprovado |
| 375 × 812 | Aprovado |
| 360 × 800 | Aprovado |

Em todas as dimensões foram verificados:

- ausência de overflow horizontal;
- título, narrativas e card “Gestão Operacional” contidos no hero;
- continuidade visual entre a soja central, as raízes e os quatro nós narrativos;
- mapa e exatamente três grãos presentes;
- imagens carregadas;
- separação correta entre o hero e os cards de acesso abaixo.

Capturas:

- [`fenasoja-hero-agriculture-1366x768.png`](screenshots/fenasoja-hero-agriculture-1366x768.png)
- [`fenasoja-hero-agriculture-390x844.png`](screenshots/fenasoja-hero-agriculture-390x844.png)

## Movimento e acessibilidade

- Em movimento normal, os três grãos percorrem rotas diferentes com início escalonado.
- Com `prefers-reduced-motion: reduce`, os elementos de `animateMotion` não são renderizados e os três grãos permanecem posicionados estaticamente nos destinos.
- O mapa possui nome acessível e a narrativa permanece compreensível sem animação.
- As cenas usam textos em português, contraste reforçado e imagens decorativas com `alt=""`.

## Desempenho

- Os três WebP somam aproximadamente 294 KB.
- Cada imagem individual tem menos de 150 KB.
- As imagens usam `loading="lazy"` e `decoding="async"`.
- O movimento usa SVG e propriedades de composição (`transform` e `opacity`), sem biblioteca adicional, canvas contínuo ou re-renderização por frame.

## Evidência técnica

- Testes focados do portal: aprovados.
- ESLint dos arquivos alterados: aprovado.
- Build de produção: aprovado.
- O `tsc --noEmit` permanece bloqueado por três erros preexistentes em `src/hooks/useVenueOperations.ts`.
- A suíte global mantém débitos preexistentes fora deste escopo, incluindo testes do Cronograma sem `AuthProvider` e expectativas antigas da Timeline.
