# Product Design — BOT FENASOJA

final result: passed (revisão visual local com dados sintéticos identificados)

O relatório anterior da faixa histórica do portal foi preservado em [QA de 14/10/2026](docs/portal-history/continuous/design-qa-root-20261014.md).

## Alvo e evidências comparadas

Direção: evoluir as capturas fornecidas pelo usuário, com abertura compacta à esquerda, mascote próprio, indicadores sem faixa colorida no topo e compositor mais claro. Trata-se de uma melhoria autorizada, não de uma reprodução pixel a pixel da interface anterior.

Foram abertos e comparados **na mesma imagem** os pares de origem à esquerda e implementação à direita:

- [Vendas](docs/workers/bot-fenasoja/captures/comparison-sales.png).
- [Abertura](docs/workers/bot-fenasoja/captures/comparison-intro.png).
- [Compositor em detalhe](docs/workers/bot-fenasoja/captures/comparison-composer.png).

As imagens de origem são recortes do usuário: vendas 250×376, abertura 360×292 e compositor 512×104. Foram normalizadas pela largura para 384 px, preservando proporção e preenchendo o espaço restante. A implementação mobile foi capturada em viewport CSS real 384×842, DPR observado 1,14; a captura recebida tem 384×842 pixels. Desktop: 1263×877 CSS/pixels, a partir do ajuste solicitado de 1440×1000 no navegador integrado. Os recortes de origem não incluem toda a viewport; não foi alegada igualdade de enquadramento ou precisão de métricas tipográficas baseada nesses recortes. As vendas usam os mesmos dois valores sintéticos visíveis na referência. O estado inicial e o compositor foram comparados também em regiões específicas porque o recorte completo não basta para ler os controles.

## Iterações e correções

| Prioridade | Achado | Correção | Evidência após correção |
| --- | --- | --- | --- |
| P2 | Título inicial grande e repetição da marca com estrela competiam com a conversa. | Mensagem inicial menor à esquerda, avatar separado, sem a linha decorativa. | comparison-intro.png; mobile-intro.jpg |
| P2 | Faixa superior colorida, tabela auxiliar e notas abertas tornavam a resposta de vendas mais pesada. | Indicadores alinhados sem faixa; somente os dois valores solicitados; detalhes metodológicos recolhidos. | comparison-sales.png; desktop-sales.jpg |
| P2 | Compositor sem hierarquia clara para destino, escrita e anexos. | Cabeçalho discreto, campo expansível, grupo de referências e envio principal; foco e atalhos preservados. | comparison-composer.png; mobile-sales.jpg |
| P2 | Barra horizontal aparecia na navegação desktop. | Overflow horizontal contido na própria sidebar. | desktop-sales.jpg; DOM verificado sem overflow da sidebar ou documento |
| P2 | Contexto compacto exibia uma rota técnica. | Frase de contexto em linguagem de produto; a rota permanece apenas no payload interno. | mobile-compact-pie.jpg; desktop-compact-pie.jpg |

Os dois últimos achados foram corrigidos e recapturados no mesmo tipo de viewport e estado. Não restaram diferenças P0/P1/P2 acionáveis nos estados locais revisados.

## Superfícies obrigatórias

- **Fontes e tipografia:** família efetiva Inter/system-ui; hierarquia de pergunta, resposta, indicador e nota; valores com algarismos tabulares; nomes completos do ranking quebram em linhas legíveis. Aumento de contraste e redução do título inicial são mudanças intencionais. A qualidade limitada dos recortes anteriores não permite identificar pesos ópticos com precisão absoluta.
- **Espaçamento e layout:** cards de valores com limites consistentes e profundidade discreta; conversa rolável e compositor no fluxo, sem cobrir a última linha do conteúdo. Desktop em duas colunas para indicadores; mobile empilhado. Compositor mobile observado com cerca de 159 px na viewport de 842 px.
- **Cores e tokens:** superfícies neutras, pergunta índigo e estados discretos; tokens `--worker-*` compatíveis com OKLCH do projeto. Sem novas faixas decorativas nos indicadores. Gráficos usam uma paleta fixa e texto com os valores.
- **Imagem e ativos:** personagem rasterizado próprio em dois WebP transparentes, sem halos visíveis nas capturas. Olhos, braços e corpo pertencem ao ativo gerado; não são uma aproximação por SVG/CSS. A marca institucional original permanece intacta. A piscada e movimento do contêiner têm pausa manual; a exceção à redução de movimento foi pedida explicitamente para esse mascote.
- **Texto e conteúdo:** resposta de vendas começa pelos valores pedidos; Agenda apresenta período, contagem e gráfico pertinentes. Fontes compactas e metodologia sob demanda. Sem códigos de situação, JSON bruto ou nomes de colunas internos nos estados revisados. A indicação “dados de teste” é exclusiva da prévia de QA.

## Interações e responsividade verificadas

Abertura, digitação, envio, estado de consulta, resposta, troca de especialista, histórico reaberto, comparação, pizza, ranking, tabela acessível e abertura/fechamento do copiloto foram exercitados no navegador integrado. O botão de pausa resultou em `data-animated=false` e `animation-name:none`. A ordem observada no mobile foi pergunta y≈122 e resposta y≈224, sem overflow horizontal. Os testes específicos cobrem atualização no mesmo artigo, timestamps iguais, paginação e movimento reduzido.

Capturas adicionais: [ranking mobile](docs/workers/bot-fenasoja/captures/mobile-agenda-ranking.jpg), [pizza desktop](docs/workers/bot-fenasoja/captures/desktop-agenda-pie.jpg), [comparação mobile](docs/workers/bot-fenasoja/captures/mobile-agenda-comparison.jpg), [copiloto mobile](docs/workers/bot-fenasoja/captures/mobile-compact-pie.jpg).

## Limites e checklist

Esta aprovação visual é local. Autenticação e transporte da prévia são sintéticos; não comprova dados reais, provedor publicado, RLS remota, teclado virtual físico, Safari/iOS ou performance de dispositivo. A homologação autenticada da versão nova depende das quatro migrations e do backend correspondente. A preferência reduzida é verificada por testes e não por alteração da preferência do computador do usuário.

- [x] Origem e implementação abertas e comparadas juntas.
- [x] Tipografia, ritmo, cores, imagem e texto revisados.
- [x] Achados visuais corrigidos e recapturados.
- [x] Desktop/mobile e chat completo/compacto.
- [x] Valores e alternativas acessíveis nos gráficos.
- [ ] Homologação autenticada da versão nova com backend publicado.
- [ ] Teclado virtual e Safari em aparelho físico.
