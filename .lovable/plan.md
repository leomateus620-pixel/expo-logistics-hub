# Incluir veículo na mensagem de WhatsApp do transporte

## Objetivo
Quando uma viagem é iniciada, a mensagem enviada ao hóspede (botão "Iniciar Viagem" / "Hóspede") deve incluir o nome do carro e a placa, por exemplo: *"Amarok Cinza, placa ABC-1234"*.

A mensagem é gerada em **dois lugares** distintos — ambos precisam ser atualizados para garantir consistência:

1. **Edge Function `transport-lifecycle` (action `start`)** — gera a mensagem mostrada no `StartTripDialog` após iniciar a viagem.
2. **`buildTripMessage` em `src/lib/whatsapp.ts`** — usado pelo botão "Hóspede" no `TransportCard` durante a viagem em andamento.

## Mudanças

### 1. `src/lib/whatsapp.ts`
Estender `buildTripMessage` para aceitar dados opcionais do veículo (`vehicleModel`, `vehicleColor`, `vehiclePlate`) e, quando disponíveis, acrescentar uma frase do tipo:
> "O veículo é um **Amarok Cinza**, placa **ABC-1234**."

Quando só houver placa ou só houver modelo, montar a frase com o que estiver disponível. Se nenhum dado existir, manter a mensagem atual.

### 2. `src/components/transport/TransportCard.tsx`
Na chamada de `buildTripMessage` (linha ~222), passar também:
- `vehicleModel: vehicle?.modelo`
- `vehicleColor: vehicle?.cor`
- `vehiclePlate: vehicle?.placa`

A variável `vehicle` já está disponível (linha 68).

### 3. `supabase/functions/transport-lifecycle/index.ts` (handleStart)
- Após buscar o `transport`, buscar também o veículo associado quando `transport.vehicle_id` existir:
  ```ts
  let vehicle = null;
  if (transport.vehicle_id) {
    const { data } = await admin
      .from('vehicles')
      .select('modelo, cor, placa')
      .eq('id', transport.vehicle_id)
      .single();
    vehicle = data;
  }
  ```
- Construir um sufixo `vehicleInfo` reutilizável:
  ```
  O veículo é um {modelo} {cor}, placa {placa}.
  ```
  (Adaptar conforme campos disponíveis; omitir frase inteira se não houver nenhum.)
- Concatenar ao texto enviado a cada hóspede no loop (linhas 183-186) e também no fallback sem hóspede (linha 212).

## Exemplo de resultado
> Olá, João Silva. Aqui é Carlos, motorista responsável pelo seu transporte da Fenasoja Logística. Estou iniciando agora o deslocamento para o Aeroporto de Porto Alegre. O veículo é um Amarok Cinza, placa ABC-1234. Qualquer necessidade, fico à disposição por aqui.

## Arquivos modificados
- `src/lib/whatsapp.ts`
- `src/components/transport/TransportCard.tsx`
- `supabase/functions/transport-lifecycle/index.ts`

Nenhuma migração de banco é necessária — `transports.vehicle_id` e a tabela `vehicles` já existem.
