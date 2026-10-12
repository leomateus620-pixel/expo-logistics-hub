# Critérios da comparação local

Definidos antes da série base/candidato. Base `8f3e871010ebfeab45824ba042183127da3b15e3`. Relato de acesso de aproximadamente 90% é estimativa, não medição.

- Correção equivalente: mesmos resultados numéricos da busca de superfície/sombra para todas as árvores canônicas, limites, sobreposições e fallbacks; preservação das matrizes instanciadas, geometrias, materiais e inventário. Mediana do resolver pelo menos 50% menor em 20 passes alternados, incluindo a preparação nova.
- Falha essencial: zero draws após erro/timeout antes de preparação válida; erro continua observável; recuperação explícita conserva renderer/câmera/seleção e reabre o gate apenas com preparação e draws válidos. Restauração opcional respeita fila existente e cancelamento.
- Saudável, qualidade HIGH fixa, mesmo DPR/buffer/câmera: nenhum desaparecimento de conteúdo/ações e nenhum resize adicional durante gesto. Regressão sustentada: aumento de mediana de boot ou mediana/p95 ativo acima de 10% **e** 5 ms em pelo menos duas de três repetições comparáveis, exigindo investigação/repetição. Poucas aberturas não estimam p95 populacional; publicar valores individuais e intervalos.
- Navegação: referência exploratória p50 ativo ≤33,3 ms e p95 ≤50 ms, com freezes >250 ms e máximos publicados. Não baixar gráficos para satisfazê-la. Não prometer fluidez física a partir desses ensaios.
- Simulações CPU 4×, rede 150 ms/1,6 Mbit/s, viewport móvel: boot repetível com barreira real e controles; separar espera de módulos de trabalho CPU/driver. Simulação não identifica GPU/driver, RAM ou térmica de aparelhos reais.
- Medições sequenciais, sem testes/build concorrentes. HTTP/cache do navegador explicitamente limpo na condição fria; quente no mesmo contexto. Cache de shader do driver, energia/clocks/térmica não controlados. Probes de shader/recursos, capturas e falhas são execuções separadas das séries de fluidez.
- Matriz física pendente: integrado antigo/4 GB, mais RAM/GPU limitada, Android 2–4 GB, Android intermediário, desktop/celular saudável e iPhone/Safari. Sessões físicas de 15–30 minutos e toque real continuam necessárias.

Esta entrega pode demonstrar correção comportamental e redução de um custo CPU equivalente; sucesso universal de abertura/fluidez exige a matriz física. Consulta em tabela não é aceita como paridade de Vendas/interiores.
