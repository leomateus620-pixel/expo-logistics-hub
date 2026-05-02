# Plano de Atualização — Transportes ↔ Veículos, Despesas, Splash e Performance

## 1. Veículos Botolli — Detectar transportes em uso e bloquear/liberar veículo

**Comportamento atual:** o status "Em uso" só é detectado por `vehicle_usage` aberto (retirada manual sem devolução). Transportes em andamento (`status='em_andamento'` ou `'em_retorno'` ou `'chegou_destino'`) que apontam para `vehicle_id` não marcam o veículo como ocupado nem aparecem no card.

**Mudanças:**

- **`src/pages/VehiclesPage.tsx`** — `effectiveStatus` passa a considerar também transportes ativos:
  - Se existe transporte ativo (`em_andamento`/`em_retorno`/`chegou_destino`) com `vehicle_id = v.id` → status efetivo = `em_uso` (mesmo sem `vehicle_usage` aberto).
  - Quando o transporte é concluído/cancelado, o veículo volta automaticamente a `disponivel` (já que a regra deriva do estado do transporte em tempo real).
- **Card do veículo (lista):** quando ocupado por transporte, exibir uma faixa discreta abaixo do badge "Em uso" mostrando:
  - Ícone `MapPin` + `"Em transporte: {origem} → {destino}"` (truncado).
  - Motorista (avatar + nome) puxado de `motorista_user_id`.
  - Hora prevista de retorno/chegada quando disponível.
  - Botão clicável que navega para `/transports` filtrando aquele transporte.
- **Detalhe do veículo (`VehicleDetailContent`):** novo bloco "Transporte ativo" no topo (acima de Conferência de Odômetro), exibido apenas quando há transporte vinculado em andamento. Mostra origem, destino, motorista, ETA e link "Abrir transporte".
- **Form de Transporte (`TransportForm.tsx`):** o filtro de veículos disponíveis já considera `status === 'disponivel'`. Vamos refinar para também excluir veículos com transporte ativo em outro registro (anti-conflito visual), reaproveitando a mesma derivação. O Select continua permitindo o veículo já selecionado no próprio transporte sendo editado.

**Resultado:** o usuário vê em tempo real, no menu Veículos Botolli, qual carro está em transporte e qual está livre — sem depender de retirada manual paralela.

---

## 2. Excluir despesas de transporte dentro de Veículos Botolli

**Atual:** o detalhe do veículo não lista despesas vinculadas; só aparecem abastecimentos. Despesas de transporte (categoria pedágio, lavagem, estacionamento, etc.) ficam só no menu Despesas.

**Mudanças em `VehicleDetailContent`:**

- Adicionar uma terceira aba **"Despesas"** ao lado de Utilização / Combustível, com badge de contagem.
- Listar despesas onde `vehicle_id = vehicle.id` usando `useExpenses({ vehicle_id })` (filtro já suportado pelo hook).
- Cada item exibe: título, categoria, valor, data, status (badge colorido) e — quando vinculada a transporte — chip "Transporte" com origem→destino clicável.
- **Botão "Excluir"** (ícone `Trash2`) em cada despesa, visível apenas para Admin/Gestor (mesmo padrão do `expenses_delete` RLS). Confirmação via `AlertDialog` antes de chamar `expenses.remove.mutateAsync(id)`.
- A exclusão também limpa em cascata `expense_documents` e `expense_approvals` (já permitido pelas RLS para Admin/Gestor) — fazemos as três chamadas na ordem correta dentro de um único handler com tratamento de erro.
- Total de despesas do veículo aparece no resumo de métricas no topo (substitui ou complementa o card "Custo Real" para mostrar "Custo Real + Despesas").

---

## 3. Remover card de boas-vindas e animação de chuva de soja (carregamento mais rápido)

**Itens a remover:**

- **Splash screen ao entrar:** `src/components/AuthGuard.tsx` deixa de renderizar `<SplashScreen />`. O usuário vai direto para a Dashboard após o login. Remover também o gate `sessionStorage('fenasoja-splash-shown')` e o estado `showSplash`.
- **Componentes órfãos a deletar:**
  - `src/components/SplashScreen.tsx`
  - `src/components/dashboard/FenasojaCountdown.tsx` (já removido do Dashboard, agora não tem nenhum import)
  - `src/components/dashboard/SoybeanRain.tsx` (era usado só pelo countdown)
  - `src/components/dashboard/SoybeanGrain.tsx` (idem)
  - Asset `src/assets/fenasoja-splash-2026.png` (se não houver outros usos — confirmar com `rg` antes de excluir).
- **CSS:** remover do `src/index.css` as classes específicas do splash (`.splash-backdrop`, `.splash-perspective`, `.splash-card*`, `.splash-image*`, `.splash-shine`, `.soybean-grain`, `@keyframes` `shimmer-diagonal` e `gold-pulse` se não usadas em outro lugar — verificar antes).

**Ganho:** o app abre instantaneamente após login, sem 3 segundos de animação 3D + canvas com partículas.

---

## 4. Otimizações gerais de performance / praticidade

Aplicar em paralelo às mudanças acima:

- **Service worker:** revisar `public/sw.js` para garantir cache `stale-while-revalidate` nos assets estáticos (já configurado, validar precache list).
- **Dashboard:**
  - Garantir que `isLoadingAll` mostre o skeleton só enquanto os dados críticos (vehicles/transports) carregam — não bloquear a tela inteira esperando hooks secundários (`schedules`, `expenses`).
  - Fazer renderização progressiva: header + StatCards aparecem imediatamente assim que `vehicles`+`transports`+`carts`+`tasks` chegam; "Próximos" e "Equipe LOG" carregam em segundo plano com seus próprios skeletons.
- **`Section`/listas longas:** envolver os mapeamentos pesados (membros, transportes próximos, eventos por dia) em `useMemo` quando ainda não estiverem (já parcialmente feito) e marcar handlers com `useCallback`.
- **Splash inicial substituído por skeleton leve:** o spinner já existente em `AuthGuard` (loading) cobre o gap entre verificar sessão e mostrar a Dashboard — mantemos esse spinner pequeno (≤300ms na maioria dos casos).
- **Preview/imagens:** garantir `loading="lazy"` nas imagens dentro de cards do dashboard (rede hoteleira, etc.).
- **React Query `staleTime`:** elevar para 60s nas queries de baixa volatilidade (`vehicles`, `org_members`, `commissions`) para reduzir re-fetch ao trocar de tela.

---

## Detalhes técnicos resumidos

```text
Arquivos editados
├─ src/pages/VehiclesPage.tsx       (effectiveStatus + faixa "em transporte" + aba Despesas)
├─ src/components/transport/TransportForm.tsx   (exclui veículos ocupados por outros transportes)
├─ src/components/AuthGuard.tsx     (remove splash)
├─ src/pages/Dashboard.tsx          (loading progressivo, useCallback)
├─ src/index.css                    (remove CSS splash/soybean)
└─ src/hooks/useVehicles.ts | useTransports.ts (ajuste fino de staleTime)

Arquivos deletados
├─ src/components/SplashScreen.tsx
├─ src/components/dashboard/FenasojaCountdown.tsx
├─ src/components/dashboard/SoybeanRain.tsx
└─ src/components/dashboard/SoybeanGrain.tsx
```

Sem alterações de banco / migrações: tudo é leitura cruzada de tabelas já existentes (`transports.vehicle_id`, `expenses.vehicle_id`).

---

Posso seguir com a implementação?