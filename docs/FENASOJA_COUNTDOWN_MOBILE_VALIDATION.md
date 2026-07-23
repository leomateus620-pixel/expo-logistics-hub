# Contagem Oficial Fenasoja 2028 — correção móvel e validação visual

## Diagnóstico confirmado

O cálculo do cronômetro estava correto. A própria versão compacta móvel ainda exibia o resumo `654 dias`, produzido pelo mesmo `snapshot` usado pelos quatro cartões, enquanto apenas os algarismos dos cartões desapareciam.

A falha estava na camada visual compartilhada por compacto e expandido: o gradiente era recortado no elemento pai com `background-clip: text` e `-webkit-text-fill-color: transparent`, enquanto o texto real ficava em um filho transformado/animado. O WebKit móvel pode deixar de pintar esse filho composto e, como o preenchimento herdado era transparente, o resultado era uma coluna vazia. O comportamento é consistente com os relatos oficiais [WebKit Bug 189152](https://bugs.webkit.org/show_bug.cgi?id=189152) e [WebKit Bug 200705](https://bugs.webkit.org/show_bug.cgi?id=200705).

## Correção técnica

- Mantida uma única fonte de verdade em `useFenasojaCountdown` e `getFenasojaCountdown` para compacto, expandido, desktop, tablet e móvel.
- Removido o preenchimento transparente dependente de recorte do texto. Os glifos agora recebem uma cor dourada opaca e explícita.
- Separados o glifo e sua curta transição de entrada. A animação atua somente em `opacity` e `transform`, sem `filter`, máscara, desfoque ou `will-change` persistente.
- Cada unidade é memorizada; quando um segundo muda, os nós de dias, horas e minutos permanecem estáveis.
- O relógio da experiência expandida foi isolado em um componente memorizado, evitando que a página, a navegação e o ambiente de soja sejam renderizados novamente a cada segundo.
- O cálculo continua derivado do timestamp absoluto configurado para 29 de abril de 2028, às 10h em Brasília. O agendamento é reconciliado em foco, `pageshow` e retorno da aba, e suspenso enquanto a página está oculta.
- O anúncio para tecnologia assistiva não inclui segundos e, portanto, é atualizado no máximo uma vez por minuto.

## Refinamento visual

- `FENASOJA 2028` passou a ser o protagonista nos dois contextos; `Contagem oficial` tornou-se subtítulo.
- Os quatro cartões receberam superfície navy explícita, borda perimetral, realce interno, sombra de contato, reflexão dourada controlada e numerais tabulares.
- O CTA foi abreviado para `Abrir contagem` e o botão `Novo evento` foi visualmente subordinado à identidade da edição, sem alterar sua função.
- A experiência expandida ganhou composição própria para retrato, paisagem e alturas curtas, com `100svh`/`100dvh`, áreas seguras e retorno legível (`Voltar` em telas estreitas).
- O ambiente de soja permanece em camadas, não captura eventos de ponteiro e usa fallback fotográfico/estático em movimento reduzido ou quando o renderizador aprimorado não é adequado.

## Evidência anterior fornecida

- Desktop expandido: valores visíveis e atualizando.
- Móvel expandido: rótulos visíveis, mas algarismos ausentes.
- Móvel compacto: resumo em dias visível, mas algarismos ausentes.

## Evidência após a correção

- [Compacto móvel — viewport de 430 px](screenshots/fenasoja-countdown-after-compact-mobile-430.png)
- [Expandido móvel — viewport de 390 × 667 px](screenshots/fenasoja-countdown-after-expanded-mobile-390x667.png)
- [Expandido desktop — viewport de 1440 × 900 px](screenshots/fenasoja-countdown-after-expanded-desktop-1440x900.png)

## Matriz de validação autenticada

| Cenário | Resultado |
| --- | --- |
| Compacto desktop 1440 × 900 | Valores presentes; composição horizontal preservada |
| Compacto tablet 768 × 1024 | Valores presentes; título e relógio sem sobreposição |
| Compacto móvel 390 × 844 | Valores presentes; sem overflow horizontal |
| Compacto móvel 430 × 932 | Valores presentes; ações e cartões legíveis |
| Compacto paisagem 844 × 390 | Valores presentes; título e relógio separados |
| Expandido desktop 1440 × 900 | Valores presentes; ambiente de soja e foco central preservados |
| Expandido tablet 768 × 1024 | Valores presentes; conteúdo essencial dentro da viewport |
| Expandido móvel 390 × 844 | Valores presentes; retorno, relógio e status visíveis |
| Expandido móvel 430 × 932 | Valores presentes; hierarquia completa e sem truncamento essencial |
| Expandido com altura curta 390 × 667 | Valores presentes; `scrollWidth` e `scrollHeight` iguais à viewport |
| Expandido paisagem 844 × 390 | Valores presentes; palavra-marca e relógio sem colisão |
| Zoom equivalente a 125% | Sem overflow horizontal; valores presentes |
| Atualização contínua | Somente o segundo alterado troca de nó visual |
| Aba congelada e restaurada | Valor reconciliado com o timestamp absoluto ao retornar |
| Movimento reduzido | Renderizador estático; sem animação de dígitos; valores presentes |
| URL direta, expansão, retorno e botão Voltar | Fluxos preservados; foco restaurado ao CTA de origem |
| Console e hidratação | Sem erros; apenas avisos preexistentes de futuras flags do React Router |
| Rede no recarregamento | Sem falhas ou respostas HTTP 4xx/5xx; fontes e módulos em 200 |
| Atualizações por 5,2 s | Segundos avançaram normalmente; sem crescimento de heap ou trabalho contínuo anormal |

A validação foi executada na aplicação real autenticada. O ambiente local informou uso da base oficial consolidada/offline; por segurança, nenhuma gravação foi realizada e o fluxo existente de `Novo evento` não foi alterado.

## Cobertura automatizada

- Timestamp oficial e fuso de Brasília.
- Viradas exatas de dia, hora, minuto e segundo.
- Estado final em zero.
- Reativação por `visibilitychange`.
- Reconciliação a partir do relógio absoluto.
- Conteúdo acessível das quatro unidades.
- Estabilidade dos nós das unidades que não mudaram.
- Proteção contra retorno de preenchimento transparente e efeitos frágeis nos algarismos.

## Verificações de entrega

- `npm.cmd test -- --reporter=dot`: 23 arquivos e 192 testes aprovados.
- `npx.cmd tsc -p tsconfig.app.json --noEmit`: aprovado.
- `npm.cmd run build`: aprovado.
- ESLint focado nos componentes e testes alterados: aprovado.
- `git diff --check`: aprovado.

O build mantém avisos já existentes sobre a idade da base do Browserslist e chunks globais acima de 500 kB; nenhum deles foi introduzido pela contagem oficial, cujo chunk expandido permaneceu isolado.

## Limitação de ambiente

Não havia um binário WebKit/Safari disponível no ambiente local para uma segunda captura pós-correção em hardware iOS. A causa foi confirmada pela evidência real de iPhone fornecida, pelo compartilhamento do mesmo `snapshot`, pelos bugs oficiais do WebKit e pela remoção do padrão de pintura incompatível. As dimensões de Safari móvel foram validadas no navegador autenticado com emulação exata, incluindo altura curta, paisagem, áreas seguras e movimento reduzido.
