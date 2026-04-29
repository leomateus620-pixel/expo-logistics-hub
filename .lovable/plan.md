Vou corrigir o fluxo tratando o problema como falha funcional, não visual. A causa mais provável no código atual é dupla: o GPS ainda é iniciado por efeitos automáticos fora de um gesto direto do usuário, o que falha em navegadores móveis, e quando não há coordenada real o mapa ainda desenha uma rota/ícone usando origem/destino planejados, dando a impressão de rastreamento mesmo sem GPS real.

Plano de correção:

1. Garantir ativação real do GPS por gesto direto do motorista
- Remover a tentativa de iniciar `watchPosition` automaticamente por `useEffect` para viagens sem coordenada real.
- Fazer os botões “Ativar GPS” e “Iniciar meu GPS desta viagem” chamarem a geolocalização diretamente dentro do clique/toque do motorista.
- Reorganizar `locationTracker.start()` para abrir `getCurrentPosition`/`watchPosition` sem aguardar operações assíncronas antes, preservando o gesto exigido por iOS/Safari/Chrome mobile.
- Manter validação segura no publish: somente o motorista designado pode publicar no transporte correto.

2. Não mostrar marcador falso quando ainda não existe GPS real
- No card do transporte, quando não houver linha em `transport_locations` recente, não renderizar carro/marcador na origem.
- Substituir o mapa com carro falso por um estado explícito: “Aguardando GPS real do motorista”.
- Se quiser manter prévia da rota planejada, ela será visualmente separada e sem marcador de motorista, para não confundir origem planejada com posição real.

3. Corrigir rota ao vivo para partir da localização real do motorista
- Quando houver coordenada real, chamar `estimate-return` no modo `LIVE_ROUTE` usando:
  - origem = latitude/longitude reais do motorista;
  - destino = destino da ida ou origem/base no retorno.
- Enquanto a rota Google ao vivo ainda estiver calculando, desenhar no máximo uma linha temporária do GPS real até o destino, nunca a polyline antiga da origem planejada.
- Impedir que `rota_polyline`/`previewPolyline` sobrescrevam a rota ao vivo quando já existe GPS real.

4. Sincronizar painel/admin em tempo real
- Manter o listener realtime de `transport_locations`, mas melhorar o estado para diferenciar:
  - sem GPS recebido;
  - GPS tentando iniciar;
  - GPS bloqueado/negado;
  - GPS ao vivo;
  - GPS obsoleto.
- Invalidar/refazer dados quando a linha de localização muda, para o admin enxergar o motorista sem precisar recarregar.

5. Melhorar feedback e recuperação no celular do motorista
- Mostrar erro claro se a permissão de localização estiver bloqueada.
- Exibir botão “Tentar novamente” que reinicia o GPS diretamente no toque.
- Evitar esconder o banner de GPS apenas porque houve uma tentativa de tracking sem primeira coordenada.
- Exibir precisão/idade da última coordenada quando houver GPS real.

6. Ajustar navegação 3D em tela cheia
- A navegação 3D continuará abrindo ao tocar no mapa, mas só será considerada “Ao vivo” quando existir coordenada GPS real recente.
- Em modo ao vivo, a câmera 3D seguirá a posição real do motorista e a rota recalculada até o destino.
- Sem GPS real, a tela cheia mostrará aviso de GPS pendente em vez de simular navegação com origem planejada.

7. Revisão de backend/Cloud necessária
- Verificar e, se necessário, ajustar a função `publish_transport_location` para continuar aceitando apenas o motorista designado, sem enfraquecer permissões.
- Validar os dados atuais: há viagem ativa do LEONARDO sem linha de localização publicada, então a correção precisa fazer o celular dele conseguir publicar a primeira coordenada.
- Confirmar que a tabela `transport_locations` segue com RLS segura e realtime ativo.

Critério de aceite após implementar:
- O motorista LEONARDO toca em “Ativar GPS” no celular e uma linha `transport_locations` é criada/atualizada para o transporte ativo.
- O card deixa de mostrar carro fixo na origem quando não há GPS real.
- O mapa mostra o carro somente na coordenada real recebida do dispositivo.
- A rota exibida parte da posição real do motorista até o destino/retorno.
- O admin acompanha a posição em tempo real.
- Ao tocar no mapa, a navegação 3D abre e segue a coordenada real, sem usar origem/destino como posição falsa.