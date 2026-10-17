# BOT FENASOJA — diagnóstico e evolução da interface

## Diagnóstico confirmado antes das alterações

- `WorkersChat.tsx` reconstruía a lista após `chronological` e ordenava novamente por horário e `id.localeCompare`. A segunda ordenação podia colocar a resposta antes da pergunta quando os horários eram iguais. Os UUIDs não representam precedência do turno. O componente agora usa `orderWorkerThreadEntries`, mantendo `requestId`, papel e sequência persistida.
- `WorkerRichContent.tsx` aceitava apenas a existência de arrays: valores infinitos, colunas sem correspondência e estruturas incorretas chegavam à renderização. A leitura agora valida o contrato versionado por Zod e também os blocos legados.
- Os gráficos antigos eram recortados visualmente em dez registros e não possuíam informação de completude. Conversas antigas permanecem legíveis com indicação de abrangência desconhecida. Os gráficos novos exigem completude no contrato e exibem a mesma série em tabela acessível.
- `.worker-message__text` transmitia `overflow-wrap:anywhere` para tabelas sem largura mínima. Com quatro colunas, nomes e situações se quebravam dentro das palavras. As tabelas agora anulam a herança, estabelecem largura mínima e contêm sua própria rolagem. Tabelas de até três colunas usam apresentação vertical em celular.
- As regras de respostas usavam `hsl(var(--border))`, `hsl(var(--card))` e `hsl(var(--primary))`, enquanto os tokens do projeto são OKLCH. As respostas agora usam os tokens `--worker-*`, incluindo os modos claro e escuro.
- `WorkerTeamMark` usava `/fenasoja-bots.svg` e o nome visível variava entre Equipe IA e Equipe Fenasoja. A identidade final BOT FENASOJA usa os ativos específicos do mascote `/bot-fenasoja/mascot-open.webp` e `/bot-fenasoja/mascot-blink.webp` (aproximadamente 14 KB cada), com os detalhes do personagem rasterizados. A personalização fica restrita ao bot. `FenasojaBrand.tsx`, o símbolo institucional `/alvorada/fenasoja-symbol-official.png` e os demais usos da marca oficial permanecem preservados.
- `MotionProvider.tsx` forçava `reducedMotion="never"`. Agora usa `user` para o restante da experiência e dos especialistas. Por solicitação explícita do usuário, somente o mascote principal do bot pode animar mesmo com redução de movimento. Essa exceção não altera as demais animações. O mascote pausa fora de visibilidade, em aba oculta, pelo orçamento de animação e pelo controle manual Pausar/Animar, disponível na abertura e no cabeçalho durante a conversa.

## Proveniência do mascote do bot

Os dois ativos rasterizados foram gerados durante o trabalho iniciado em 16/10/2026 e concluído em 17/10/2026, no fuso `America/Sao_Paulo`, conforme a direção posterior e explícita do usuário para um personagem próprio do BOT FENASOJA. A referência visual de origem é o símbolo institucional oficial já validado do repositório (`/alvorada/fenasoja-symbol-official.png`); a variante do personagem permanece separada dos ativos institucionais. Não foi criado SVG redesenhando a marca.

- `/bot-fenasoja/mascot-open.webp`: quadro com olhos abertos, 14.374 bytes.
- `/bot-fenasoja/mascot-blink.webp`: quadro de piscada, 14.080 bytes.

A animação alterna esses quadros WebP e aplica movimento discreto ao contêiner. As datas identificam a geração nesta implementação, não uma nova aprovação institucional da variante. A marca oficial e seu uso global em `FenasojaBrand.tsx` não foram alterados.

## Apresentação final

A pergunta permanece alinhada à direita, em superfície índigo. A resposta ocupa desde o início um artigo estável abaixo da pergunta, com identificação discreta do especialista, estado de consulta e conteúdo validado. A atualização do texto não recria o artigo. A confirmação de conclusão ocorre brevemente no cabeçalho. Gráficos não reiniciam animação a cada atualização.

O formato `fenasoja-response` apresenta resumo, indicadores, tabela, barras horizontais, pizza, comparação, perfil, fontes, ausência e esclarecimento. Não recebe HTML ou configuração executável de gráfico. A interface formata reais, percentuais, duração e datas brasileiras; mostra edição, período, abrangência e atualização, sem mostrar IDs de organização ou projeto. A cópia inclui os valores dos blocos. A pizza usa uma partição completa, legenda com nomes e valores e a mesma tabela acessível; dados parciais não são transformados em proporção. Categorias com zero continuam disponíveis e uma série inteiramente zerada recebe mensagem explícita. A comparação apresenta os valores atuais e anteriores lado a lado no desktop e em sequência no celular, com tabela opcional, sem calcular diferenças ou percentuais na interface. Os rótulos explícitos dos dois lados, como outubro/setembro ou Confirmadas/Em andamento, acompanham cartões, tabela e cópia; conversas anteriores mantêm Período atual/Período anterior.

Tabelas e gráficos antigos permanecem compatíveis. Campos legados conhecidos recebem traduções explícitas, incluindo Venda em andamento, Venda confirmada, Espaços no pedido e Pedido. Blocos incompletos permanecem ocultos após interrupção. JSON inválido nunca aparece como conteúdo bruto.

A abertura é uma mensagem compacta alinhada à esquerda. Agenda e Mapa não exibem perguntas fixas; o catálogo de intenções é interno e não se converte em dezenas de botões. O seletor de especialistas e as sugestões dos demais especialistas permanecem disponíveis.

O compositor permanece em fluxo flexível após a região rolável. Seu desenho atual organiza destino, campo de escrita, referências secundárias e um único envio principal. O campo cresce com o conteúdo entre 56 e 144 pixels, mantém rolagem interna acima desse limite e usa fonte de 16 pixels no celular. Os atalhos Enter e Shift+Enter e a composição IME preservam o comportamento anterior; anexos e ditado mantêm suas validações e consentimento. Em telas pequenas, `visualViewport` limita a altura disponível, o teclado não encobre o compositor e a área segura é respeitada. A rolagem acompanha atualizações somente perto do fim; a leitura anterior permanece no lugar e oferece Novas mensagens. A paginação anterior preserva a posição pelo delta de altura.

## Evidência local identificada

`scripts/workers/preview-responses.ts` passa registros sintéticos pelo interpretador e compositor reais, e pela mesma validação Zod. Não consulta produção e não prova RLS remoto nem saída do provedor.

| Pergunta | Valores da fixture |
|---|---|
| Como estão as vendas do mapa comercial? | Fenasoja 2028; R$ 1.234.567,00 confirmados; R$ 345.678,00 em andamento; 124 pedidos com 321 espaços confirmados; 96 pedidos com 268 espaços em andamento; 57 históricos separados |
| Quantos eventos eu fiz neste mês? | 15 eventos distintos; 12 com data passada; 3 agendados; duração média 2h30 considerando 12 eventos com horário válido |
| Gráfico das pessoas com mais eventos neste mês | 120, 115, 115, 94 e 87 eventos; dois nomes semelhantes completos; empate explícito; população de 125 pessoas |
| Presidente atual da Fenasoja | Perfil de Fabiano Soltis, edição 2028, referência institucional de 08/09/2026, verificação da fixture em 16/10/2026; sem nascimento, profissão ou prazo de mandato inferidos |

## Verificação automatizada específica

- `workerUi.test.tsx`: pergunta e resposta com o mesmo horário e IDs em ordem inversa; reabertura; atualização no mesmo artigo; posição preservada ao ler mensagens antigas; mascote WebP do bot; abertura de Agenda/Mapa sem sugestões fixas; pausa durante a conversa; segurança de links; envio e consentimento de voz.
- `richResponse.test.tsx`: unidades, tabela acessível idêntica ao gráfico, nomes completos, pizza com partição completa e zeros, comparação atual/anterior, rejeição de contrato inválido/valor não finito/linhas incorretas, interrupção e compatibilidade legada.
- `mascotLife.test.tsx`: preferência de movimento reduzido, exceção explícita do mascote principal e pausa manual, visibilidade, aba oculta, orçamento de animação e limpeza de timers.

Verificação específica atualizada em 17/10/2026: 3 arquivos e 41 testes passaram (`workerUi`: 23; `mascotLife`: 6; `richResponse`: 12), executados com um worker por suíte. Foram conferidos também Shift+Enter, composição IME, manutenção do texto antes do envio e a presença da pausa após a primeira resposta. Nenhuma dependência nova foi adicionada para essas mudanças. Capturas e limites da revisão em navegador são registrados no relatório geral desta entrega. Testes DOM não comprovam teclado físico/iOS nem leitura autenticada em produção.
