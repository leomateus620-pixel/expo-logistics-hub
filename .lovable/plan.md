Plano para corrigir o card abaixo da contagem oficial:

1. Corrigir a causa do baixo contraste
- Remover a dependência visual de transparência sobre o fundo claro.
- Recriar o card com base escura realmente opaca, usando verde profundo/navy institucional e dourado como destaque.
- Garantir que textos, ícones, trilha de progresso e divisórias tenham contraste alto mesmo sobre a área branca da página.

2. Melhorar a exibição dos dados
- Reorganizar o conteúdo interno em blocos mais legíveis: progresso do ciclo, próximo marco operacional, atrasadas e sem data.
- Dar mais peso visual ao “Próximo marco operacional”, evitando que ele pareça apagado.
- Ajustar tamanhos, pesos, espaçamentos e quebras para desktop e mobile sem cortar informações importantes.

3. Aplicar acabamento premium com efeito perceptível
- Adicionar profundidade real ao card: sombra projetada, borda dourada controlada, brilho interno, camada de luz e efeito 3D sutil.
- Criar microcards internos para as métricas com superfície própria, em vez de texto solto sobre um fundo apagado.
- Adicionar hover/press states nas métricas clicáveis, especialmente “Sem data”.

4. Corrigir seletores que não estão alcançando o card separado
- Substituir regras antigas que ainda miram apenas `.fenasoja-countdown-hero[data-presentation='mobile']` por regras que também funcionem no card independente `.fenasoja-countdown-ops-card`.
- Evitar duplicidade/conflito de CSS para que a correção apareça de fato no preview.

5. Validar visualmente
- Conferir o card no preview na rota `/cronograma-eventos?timelineYear=2026&timelineMonth=2026-06`.
- Verificar se o trecho abaixo da contagem oficial não fica mais branco/apagado e se todas as informações estão legíveis.