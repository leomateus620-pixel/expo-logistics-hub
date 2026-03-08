

## Plano: Reformulação Completa da Dashboard Mobile — Fenasoja Logística

---

### Auditoria dos Dados Atuais

Após análise completa do código, a Dashboard **não usa dados mockados**. Todos os blocos derivam de hooks reais conectados ao banco:

| Bloco | Fonte (hook) | Regra atual | Status |
|---|---|---|---|
| Veículos Disponíveis | `useVehicles` → `vehicles` | `status === 'disponivel'` | Correto |
| Carrinhos em Uso | `useElectricCarts` → `carts` | `status === 'em_uso'` | Correto |
| Transportes Ativos | `useTransports` → `transports` | `status === 'em_andamento'` | Correto |
| Tarefas Pendentes | `useTasks` → `tasks` | `status === 'pendente'` | Correto |
| Próximos Transportes | `transports` | `status === 'pendente'`, ordenados por `inicio_em` | Correto |
| Eventos Hoje/Amanhã | `useEvents` → `events` | filtro por `todaySP()` / amanhã via `startsWith` | Correto |
| Equipe | `useOrgMembers` → `members` | filtro `commission_nome` contém 'LOG' | Correto |
| Status da equipe | `useSchedules` + `transports` | derivado de turnos ativos e transportes em andamento | Correto |

**Problemas identificados:**
1. Estimativa de retorno em "Próximos Transportes" usa mapa hardcoded `estDurationMin` com chaves por `titulo` (ex: 'Aeroporto': 120min). Isso é frágil — o título pode não bater. Deve usar `fim_em` quando disponível, e caso contrário mostrar "—" em vez de chutar.
2. Hooks não expõem `isLoading` de forma consistente — não há loading states na Dashboard.
3. Nenhum tratamento de erro ou empty states visuais premium.

---

### Plano de Implementação

#### 1. Redesign da Dashboard (`src/pages/Dashboard.tsx`) — Mobile-First

**Estrutura nova:**

```text
┌─────────────────────────┐
│  Saudação + Data atual  │
├─────────────────────────┤
│ ┌──────┐ ┌──────┐       │
│ │Veíc. │ │Carr. │  2x2  │
│ └──────┘ └──────┘  grid │
│ ┌──────┐ ┌──────┐       │
│ │Trans.│ │Taref.│       │
│ └──────┘ └──────┘       │
├─────────────────────────┤
│ Próximos Transportes    │
│  (liquid-glass cards)   │
├─────────────────────────┤
│ Agenda — Hoje / Amanhã  │
│  (liquid-glass cards)   │
├─────────────────────────┤
│ Equipe Logística        │
│  (avatares + status)    │
├─────────────────────────┤
│ Tarefas Pendentes       │
│  (top 5 com prioridade) │
├─────────────────────────┤
│ Atalhos Rápidos         │
│  (grid de ícones)       │
└─────────────────────────┘
```

**Mudanças:**
- Header com saudação contextual (Bom dia/tarde/noite) + data formatada
- Cards superiores com estilo Liquid Glass (backdrop-blur, bordas translúcidas, sombras suaves)
- Cada seção como bloco `liquid-glass-card` com bordas semi-transparentes
- Novo bloco "Atalhos Rápidos" com grid de ícones para todos os módulos
- Melhor espaçamento (`space-y-5`, padding `px-4`)
- Fontes otimizadas para mobile (valor do card em `text-2xl` em vez de `text-3xl`)
- Active states com `active:scale-[0.97]` nos cards clicáveis

#### 2. Reformulação do StatCard (`src/components/StatCard.tsx`)

- Aplicar estilo Liquid Glass: `backdrop-blur-xl`, `bg-white/8`, `border border-white/12`
- Ícone com fundo glassmorphism circular
- Transição suave no toque
- Tamanho do número `text-2xl` no mobile, `text-3xl` no desktop
- Micro-animação de entrada

#### 3. Correção da lógica de dados

- **Remover** o mapa `estDurationMin` hardcoded para retorno. Usar `fim_em` quando existir, senão exibir "—"
- **Adicionar** loading skeletons para cada seção usando `Skeleton` já existente
- **Adicionar** empty states elegantes com ícone + mensagem sutil
- **Expor** `isLoading` de todos os hooks na Dashboard

#### 4. Novo bloco: Atalhos Rápidos

Grid 4 colunas no mobile com ícones para: Veículos, Carrinhos, Patinetes, Transportes, Hóspedes, Agenda, Escala, Checklist, Equipe, Configurações. Cada ícone navega para a rota real.

#### 5. Sidebar Mobile refinada (`src/components/Sidebar.tsx`)

- Refinar cores: fundo mais suave com `hsl(var(--sidebar-background) / 0.85)`
- Aumentar blur: `backdrop-blur-2xl`
- Item ativo com fundo `bg-white/15` e borda lateral sutil
- Espaçamento entre itens `py-3.5` para toque confortável
- Logo com glow sutil
- Melhorar contraste do texto ativo

#### 6. Estilos globais (`src/index.css`)

- Refinar classes `.liquid-glass` e `.liquid-glass-card` com variações mais suaves para os cards da Dashboard
- Adicionar classe `.liquid-glass-stat` para os StatCards

#### 7. Loading & Empty States

- Skeleton com classe Liquid Glass (fundo translúcido + blur)
- Empty states: ícone cinza + texto "Nenhum X no momento" com estilo discreto
- Error state: ícone de alerta + "Erro ao carregar" com botão de retry

---

### Arquivos a modificar

1. **`src/pages/Dashboard.tsx`** — Reescrita completa: layout mobile-first, liquid glass, loading/empty states, atalhos rápidos, correção do `estDurationMin`
2. **`src/components/StatCard.tsx`** — Redesign Liquid Glass, responsive
3. **`src/components/Sidebar.tsx`** — Refinamento visual mobile (cores, blur, espaçamento, item ativo)
4. **`src/index.css`** — Adicionar/refinar classes de Liquid Glass para stat cards

### Sem alterações necessárias em:
- Hooks (dados já são reais e corretos)
- Banco de dados (schema adequado)
- Rotas (já existem todas)

