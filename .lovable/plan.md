# Remover Contagem Regressiva do Dashboard

## Objetivo
Retirar o card "Fenasoja Countdown" do topo do Dashboard e garantir que os demais blocos (Header de saudação, Stat Cards 2x2, Acessos Rápidos, Seções) mantenham o alinhamento e espaçamento corretos.

## Mudanças

### `src/pages/Dashboard.tsx`
- **Remover** o import `import FenasojaCountdown from '@/components/dashboard/FenasojaCountdown';` (linha 11).
- **Remover** o bloco JSX do countdown e seu comentário (linhas 291–292):
  ```tsx
  {/* ─── Fenasoja Countdown ─── */}
  <FenasojaCountdown />
  ```
- O container pai já usa `space-y-5`, então a remoção fecha o gap automaticamente — Header → Stat Cards 2x2 → Acessos Rápidos ficam com o ritmo vertical correto sem ajustes adicionais.

### Arquivos preservados (NÃO deletar)
- `src/components/dashboard/FenasojaCountdown.tsx`
- `src/components/dashboard/SoybeanRain.tsx`
- `src/components/dashboard/SoybeanGrain.tsx`

Mantidos no repositório caso o usuário queira reativar futuramente. Apenas deixam de ser renderizados no Dashboard.

## Validação visual
- Verificar no preview mobile (393×697) que:
  - Saudação aparece no topo
  - Em seguida vêm os 4 StatCards (Veículos, Carrinhos, Transportes, Tarefas) em grid 2×2
  - Acessos Rápidos seguem logo abaixo
  - Sem espaço vazio extra entre o header e os stat cards

## Fora do escopo
- Nenhuma alteração em hooks, dados, rotas ou outros componentes do Dashboard.
- Nenhuma migração de banco.