# Hero limpo Fenasoja 2028 — validação visual

Data: 1º de agosto de 2026

## Resultado

O hero do portal voltou à direção visual limpa das referências, preservando somente:

- o wordmark “FENASOJA” com a soja dourada no lugar do “O”;
- a edição “2028”;
- cinco raízes douradas partindo da soja;
- o badge “Gestão Operacional”;
- o fundo navy e os cantos de moldura premium.

Foram removidas integralmente as quatro cenas SVG de plantio, cultivo, colheita e distribuição mundial, incluindo máquinas, drone, brotos, lavoura, globo, rotas, grãos animados, recortes, nós terminais e o espaço artificial reservado para essa narrativa.

## Refinamento visual

- As cinco raízes usam curvas Bézier longas no `viewBox` `1120 × 270`, com núcleo nítido e halo secundário controlado.
- Um gradiente vertical e uma máscara de transparência criam espessura aparente e finais suaves, sem círculos ou efeito neon.
- A soja recebeu mais presença, contraste, riqueza de ouro, brilho superior, rim light, hilo e sombra curta.
- O título mantém o prata frio de alto contraste; “2028” usa ouro mais controlado e um filete de separação.
- O badge ganhou fundo navy mais protegido, borda dourada fina e tipografia mais legível.
- Não há animações contínuas: apenas entradas únicas da soja, raízes e badge.

## Responsividade autenticada

A rota `/portal` foi inspecionada com uma sessão real autenticada. As credenciais não foram persistidas no workspace, screenshots ou commit.

| Viewport | Altura do hero | Composição | Resultado |
| --- | ---: | --- | --- |
| 1440 × 900 | 282 px | Horizontal | Aprovado |
| 1366 × 768 | 200 px | Horizontal compacta | Aprovado |
| 390 × 844 | 230 px | Empilhada | Aprovado |
| 360 × 800 | 224 px | Empilhada compacta | Aprovado |

Em todos os viewports foram confirmados:

- cinco raízes e nenhuma cena ilustrativa;
- ausência de clipping indevido e overflow horizontal;
- soja, título, ano e badge legíveis e centralizados;
- cantos de moldura preservados;
- nenhuma mensagem de erro no console.

Com `prefers-reduced-motion: reduce`, as animações de soja, raízes e badge ficam com duração efetiva de `0.01ms`. O hero não renderiza `animateMotion` nem qualquer loop contínuo.

## Desempenho e escopo

- A solução usa somente SVG e CSS já suportados pelo projeto.
- Nenhuma biblioteca, imagem ou dependência foi adicionada.
- A remoção eliminou mais de mil linhas de narrativa SVG/CSS e os screenshots obsoletos da versão ilustrativa.
- Rotas, autenticação, Supabase, RLS, permissões, navegação e regras de negócio não foram alterados.

## Evidência técnica

- Testes focados do portal e acessibilidade: 37 de 37 aprovados.
- ESLint dos arquivos TypeScript/TSX tocados: aprovado.
- Build de produção: aprovado, com 4.739 módulos transformados.
- `git diff --check`: aprovado.
- O TypeScript global mantém três falhas preexistentes em `src/hooks/useVenueOperations.ts` (linhas 264, 266 e 268), fora do escopo deste hero.
