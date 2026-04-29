Plano para eliminar os bloqueios atuais do GPS e estabilizar a navegação em tempo real

Diagnóstico confirmado

1. O principal bloqueio está na regra atual de rastreamento: o app e a função `publish_transport_location` só aceitam localização quando o usuário logado é exatamente o `motorista_user_id` cadastrado no transporte.
   - Se outro motorista/operação inicia a viagem, o app não publica GPS.
   - O banco rejeita a publicação com “Apenas o motorista designado pode publicar localização”.
   - Resultado: a viagem fica `em_andamento`, mas a tabela de localização fica vazia e o mapa mostra apenas “aguardando”.

2. Há transportes ativos sem linha em `transport_locations` e sem `rota_polyline` gravada.
   - A consulta confirmou transportes `em_andamento` sem localização ao vivo.
   - Também há pendentes/ativos sem rota gravada, apesar de a chamada à Maps API retornar rota corretamente no navegador.

3. A tela de mapa em fullscreen pode abrir centrada no destino quando não existe GPS ao vivo, o que cria uma visualização incorreta da navegação.

4. O mapa 3D (`NavigationMap3D`) não cria a camada de rota se a polyline chegar depois do carregamento inicial do mapa. Isso pode deixar a navegação sem linha mesmo quando a Maps API respondeu corretamente.

5. O hook de leitura de localização usa `.single()`, gerando 406 quando ainda não há localização. Isso não deveria ser tratado como falha real do fluxo.

Objetivo da correção

A partir da correção, qualquer membro operacional autenticado da organização que iniciar ou assumir o rastreamento de uma viagem ativa poderá publicar a própria localização para aquele transporte. O mapa deverá priorizar sempre a rota dinâmica via Google Maps Routes API entre a posição real atual e o destino, sem depender exclusivamente do motorista originalmente cadastrado.

Fluxo desejado após a correção

```text
Motorista/operador inicia a viagem
        ↓
App ativa GPS desse usuário imediatamente
        ↓
Banco aceita a localização se o usuário pertence à organização e o transporte está ativo
        ↓
Mapa recebe atualização em tempo real
        ↓
Maps API calcula rota atual → destino
        ↓
Tela exibe carro ao vivo + rota + ETA
```

Alterações planejadas

1. Remover o bloqueio “somente motorista cadastrado” no GPS

- Atualizar a função `publish_transport_location` para permitir publicação quando:
  - usuário está autenticado;
  - usuário pertence à mesma organização do transporte;
  - transporte está em status ativo: `em_andamento`, `em_retorno` ou `chegou_destino`.
- A localização publicada continuará registrando o `driver_user_id` real de quem está enviando o GPS.
- Isso permite que outro motorista assuma ou inicie a viagem sem travar o acompanhamento.

2. Ajustar o app para ativar o GPS de quem iniciou/assumiu a viagem

Em `TransportsPage.tsx`:

- Quando alguém clicar em “Iniciar”, o app passará a ativar o GPS desse usuário, mesmo que ele não seja o motorista originalmente cadastrado.
- O auto-resume continuará funcionando para o motorista cadastrado quando ele abrir o app, mas não limpará mais o rastreamento apenas porque o usuário atual é diferente do `motorista_user_id`.
- A validação local vai checar somente se o transporte ainda está ativo.
- Adicionar/ajustar ação visual para “Ativar meu GPS neste transporte” em viagens ativas, permitindo que um motorista assuma o rastreamento manualmente quando necessário.

3. Tornar o hook de GPS mais tolerante e confiável

Em `useLocationTracking.ts`:

- Remover a checagem local que bloqueia usuários diferentes do motorista cadastrado.
- Manter validação de status ativo para evitar GPS em viagens finalizadas/canceladas.
- Trocar a publicação para a RPC ajustada.
- Não apagar a última localização quando o usuário apenas desativa o rastreamento local; a localização só deve ser removida pelo fluxo de conclusão/cancelamento da viagem.
- Usar `maybeSingle()` na leitura inicial para evitar erro 406 quando ainda não existe localização.
- Adicionar tentativa inicial com `getCurrentPosition` antes/junto do `watchPosition`, para publicar uma primeira posição rapidamente.

4. Priorizar Maps API para rota ao vivo

Em `TransportDynamicIsland.tsx`:

- Sempre que houver localização ao vivo, chamar a Maps API via função backend para calcular:
  - polyline da posição atual até o destino;
  - distância restante;
  - tempo estimado;
  - horário aproximado de chegada.
- Se a rota dinâmica ainda estiver carregando, manter a rota planejada/preview como fallback visual, sem deixar o mapa em branco.
- Corrigir destino/origem com `!= null` para não ignorar coordenadas válidas.
- Corrigir o fullscreen para usar origem/última localização correta quando ainda não existe GPS, em vez de centralizar no destino como se o carro já estivesse lá.
- Exibir claramente quando é “Ao vivo” e quando é “rota prevista aguardando GPS”.

5. Corrigir renderização da rota no mapa 3D

Em `NavigationMap3D.tsx`:

- Se a polyline chegar depois do mapa carregar, criar a source/layer da rota dinamicamente.
- Atualizar a rota sempre que a Maps API retornar uma polyline nova.
- Garantir que a linha de navegação apareça no modo 3D e no modo dividido.

6. Melhorar geração e persistência de rotas

Em `transport-lifecycle`:

- Gerar coordenadas e rota no início da viagem de forma mais robusta.
- Evitar depender de chamada interna com token do usuário para gerar `rota_polyline`; a função pode consultar a Maps API diretamente com a chave backend já configurada.
- Ao iniciar ida ou retorno, preencher quando ausente:
  - `origem_lat/lng`;
  - `destino_lat/lng`;
  - `rota_polyline`;
  - duração e distância quando a Maps API retornar.

Em `estimate-return`:

- Manter Google Maps Routes API como prioridade.
- Conter falhas externas com resposta estruturada `{ fallback: true }`, sem quebrar a tela.
- Validar melhor coordenadas e retornar mensagens úteis para debug.

7. Reparar dados existentes

Criar uma nova migração para:

- Atualizar a função `publish_transport_location` com a regra sem bloqueio por motorista cadastrado.
- Garantir que `transport_locations` esteja com realtime adequado e, se necessário, `REPLICA IDENTITY FULL` para eventos mais completos.
- Backfill de coordenadas de origem/destino dos transportes pendentes/ativos.
- Limpar apenas localizações realmente inválidas de transportes finalizados/cancelados, sem apagar localização de viagens ativas.

8. Validação após implementação

Após aplicar as mudanças, validar:

- Transporte iniciado por usuário diferente do motorista cadastrado publica localização corretamente.
- `transport_locations` recebe/atualiza linha em tempo real.
- Card do transporte mostra “Ao vivo”.
- Rota da Maps API aparece no mini mapa e no fullscreen.
- Modo 3D recebe a polyline mesmo quando ela chega depois do carregamento.
- Transportes ativos sem GPS ainda exibem rota planejada correta, sem mapa em branco e sem centralizar erroneamente no destino.

Arquivos que serão alterados

- `src/hooks/useLocationTracking.ts`
- `src/pages/TransportsPage.tsx`
- `src/components/TransportDynamicIsland.tsx`
- `src/components/transport/NavigationMap3D.tsx`
- `supabase/functions/transport-lifecycle/index.ts`
- `supabase/functions/estimate-return/index.ts`
- nova migration em `supabase/migrations/`

Resultado esperado

O acompanhamento deixa de depender rigidamente do motorista cadastrado. Quem estiver com o app aberto e iniciar/assumir o transporte publicará o GPS, a localização aparecerá em tempo real para a operação, e a rota até o destino será recalculada prioritariamente pela Maps API.