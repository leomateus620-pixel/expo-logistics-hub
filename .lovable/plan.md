# Menu dedicado de Odômetro ao finalizar transporte

## Contexto atual (o que já existe)

- Ao **iniciar** um transporte: o sistema só registra `inicio_em` (não pede odômetro). O campo `km_retirada` existe no formulário de criação/edição, mas fica escondido no meio do `TransportForm`.
- Ao **finalizar** um transporte (ou na "volta" da janela Fenasoja): abre o `Dialog` grande de edição (`Finalizar Viagem`), reaproveitando `TransportForm`. Os campos `KM retirada` e `KM devolução` ficam no meio do formulário, sem destaque.
- Se o motorista preencher os dois KMs **e** houver veículo vinculado, o `TransportsPage` monta `vehicleUsage` e a edge `transport-lifecycle` grava em `vehicle_usage` (com `km_rodados` GENERATED).
- Se o motorista **não** preencher, hoje nada é gravado em `vehicle_usage` e o relatório de KM cai no fallback estimado (`getEffectiveEstimatedKm`).

O que está bom: máquina de estados (`pendente → em_andamento → chegou_destino → em_retorno → concluido`), edge `complete_return`, gravação em `vehicle_usage`, validações anti-overlap.

O que precisa melhorar: o menu de odômetro precisa virar um passo **explícito, dedicado e visualmente claro** — sem quebrar o fluxo atual.

## O que muda (UX)

1. Novo componente **`OdometerFinalizeSheet`** (Sheet no mobile, Dialog no desktop) no padrão Liquid Glass 3D do projeto:
   - Header: ícone de odômetro 3D + título "Registrar odômetro" + subtítulo com placa/modelo do veículo e nome do motorista.
   - Bloco "KM de retirada" (read-only se já preenchido na partida; editável caso vazio).
   - Bloco "KM de devolução" — **input grande, numérico, mobile-first** (`inputMode="numeric"`, `h-14`, fonte grande, placeholder com último KM conhecido do veículo).
   - Linha resumo viva: "KM rodados: X" calculado em tempo real (verde se positivo, vermelho se negativo/zero) + comparação com o KM estimado da rota (`getEffectiveEstimatedKm`) mostrando diferença em % e badge "Dentro do esperado / Acima / Abaixo".
   - Atalho "Pular e usar KM do transporte" — botão secundário discreto.
   - CTA primário: **"Finalizar viagem"** (full-width, h-12, gradient primário, ícone Check).

2. Esse sheet é acionado automaticamente quando o motorista clica em **Finalizar** no `TransportCard` / `TransportDynamicIsland` (estados `em_andamento` no fluxo legado e `em_retorno` no fluxo Fenasoja). O Dialog grande de edição continua existindo para edição manual via lápis, sem mudanças.

3. Se o transporte **não tem veículo vinculado**, o sheet pula direto para confirmação simples ("Finalizar sem registro de odômetro?") — não trava o fluxo.

4. Indicação visual no `TransportCard` quando o transporte está concluído mas sem `km_devolucao`: chip discreto "KM estimado" (vs "KM odômetro") para o usuário saber a origem do dado.

## Regra de fallback (lógica do KM final)

Ao finalizar:

- Se `km_devolucao` for preenchido **e** `km_retirada` existir: grava ambos em `transports`, monta `vehicleUsage` (já existe) → `km_rodados` real do odômetro.
- Se `km_devolucao` ficar vazio: **não** grava `vehicle_usage`, **não** grava `km_devolucao`, mas o transporte é concluído normalmente. Os relatórios continuam usando o helper atual `getEffectiveEstimatedKm(t.distancia_estimada_km, t.titulo, t.voo_cidade, t.destino)` — exatamente o comportamento que já existe hoje, só que agora explícito para o usuário.
- Se `km_retirada` estiver vazio e o motorista informar só o `km_devolucao`: aceitamos, gravamos `km_devolucao` em `transports` mas **não** criamos `vehicle_usage` (não dá para calcular rodagem). Mostramos aviso amigável no sheet.

Resumo da prioridade do KM rodado, em uso nos relatórios:
1. `vehicle_usage.km_rodados` (odômetro real) — quando ambos KMs informados.
2. `getEffectiveEstimatedKm(...)` (fallback estimado) — quando o odômetro não foi informado.

## Detalhes técnicos

- **Novo arquivo:** `src/components/transport/OdometerFinalizeSheet.tsx`
  - Props: `open, onOpenChange, transport, vehicle, driverName, estimatedKm, isReturnFlow, onConfirm({ km_retirada, km_devolucao, fim_em }), isPending`.
  - Mobile: `Sheet` side="bottom", `max-h-[92dvh]`, scroll interno, footer fixo com CTA.
  - Desktop: `Dialog` `sm:max-w-lg`.
  - Visual: `liquid-glass-card`, `backdrop-blur-xl`, gradiente verde/dourado nos blocos de resumo, ícone `Gauge` da `lucide-react`.

- **`src/pages/TransportsPage.tsx`:**
  - Em `cycleStatus`, quando o próximo passo for finalizar (`em_andamento` legado ou `em_retorno` Fenasoja), abrir o novo sheet em vez do `editOpen`.
  - Estados novos: `odometerOpen`, `odometerCtx` (`{ transportId, isReturnFlow, vehicle, driver, estimatedKm, kmRetiradaInicial }`).
  - Novo handler `handleOdometerConfirm`:
    - Reaproveita exatamente a lógica atual de `handleEditSave` para os dois ramos: `completeReturn.mutateAsync({ id, vehicleUsage })` ou `update.mutateAsync({ ..., status: 'concluido', km_retirada, km_devolucao, vehicleUsage })`.
    - `vehicleUsage` só é montado quando ambos KMs vierem preenchidos (mesma regra de hoje).
  - O `Dialog` antigo "Finalizar / Editar" permanece intocado para edições manuais via botão de lápis.

- **`TransportCard` / `TransportDynamicIsland`:** sem mudanças de assinatura — eles já chamam `onCycleStatus` que passa a abrir o novo sheet.

- **Acesso rápido:** no `TransportDetailView`, adicionar botão "Registrar odômetro" para transportes ativos (`em_andamento` ou `em_retorno`), abrindo o mesmo sheet.

## Design (Liquid Glass 3D, alinhado ao projeto)

- Container: `liquid-glass-card rounded-3xl border-white/10 backdrop-blur-xl shadow-[0_20px_60px_-15px_hsl(var(--primary)/0.35)]`.
- Header com "moeda 3D" verde/dourado (mesmo padrão do menu Despesas), ícone `Gauge`.
- Inputs altos (`h-14`), fonte tabular (`font-mono tabular-nums`) para os números.
- Resumo "KM rodados" com gradient `from-primary/15 to-accent/10`, badge de status (verde/âmbar/vermelho).
- Sentence case em todos os textos, conforme padrão do projeto.

## Arquivos previstos

- **Criar:** `src/components/transport/OdometerFinalizeSheet.tsx`
- **Editar:** `src/pages/TransportsPage.tsx` (acionar o sheet em `cycleStatus`, novo handler de confirmação)
- **Editar (opcional):** `src/components/transport/TransportDetailView.tsx` (botão "Registrar odômetro")
- **Editar (opcional):** `src/components/transport/TransportCard.tsx` (chip "KM estimado vs odômetro")

## Não muda

- Schema do banco, edge `transport-lifecycle`, RLS, hooks `useTransports`/`useVehicleUsage`.
- Fluxo de criação/edição manual via lápis (Dialog grande continua igual).
- Máquina de estados e regras de fluxo Fenasoja (janela 29/04 → 10/05).

Posso seguir com a implementação?
