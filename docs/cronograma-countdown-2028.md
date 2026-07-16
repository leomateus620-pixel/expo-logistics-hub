# Contagem regressiva Fenasoja 2028

## Comparação de interface

O cabeçalho anterior priorizava a próxima ação operacional e quatro indicadores compactos. Era funcional e coerente com o módulo, mas oferecia pouca diferenciação visual, não comunicava a aproximação da feira em tempo real e perdia presença no layout móvel.

A nova seção mantém os comandos e sinais que ajudam a operar o cronograma, mas estabelece a abertura da Fenasoja 2028 como o principal marco narrativo. A hierarquia passa a ser: identidade institucional, contagem regressiva, progresso temporal e próximo marco operacional. O tratamento tridimensional é restrito ao relógio, enquanto o restante da composição preserva leitura rápida e continuidade com as áreas de filtros e linha do tempo.

## Decisões técnicas

- A abertura está centralizada em `2028-05-01T10:00:00-03:00`, no fuso `America/Sao_Paulo`, conforme a data e o horário já representados no módulo.
- O relógio usa um único temporizador alinhado ao próximo segundo, com limpeza completa no desmonte e valores limitados a zero após a abertura.
- A atmosfera agrícola usa luz e textura estáticas; a chuva contínua de partículas foi removida para reduzir trabalho de GPU e preservar causalidade visual.
- `prefers-reduced-motion` mantém uma composição estática e remove transições não essenciais.
- O conteúdo móvel respeita `safe-area-inset-left/right`, sem aproximar comandos ou números de recortes físicos da tela.
- O projeto não recebeu GSAP ou outra dependência de motion: CSS tokenizado atende às entradas curtas, enquanto a atualização de segundos permanece apenas funcional.
