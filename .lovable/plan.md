# Upgrade do Menu Carrinhos Elétricos

## Objetivo

Três entregas em um pacote integrado:

1. **Cards 3D Liquid Glass Premium** com hierarquia visual distinta para "Em uso" (destaque para Devolver, hora, quem retirou) e "Disponível" (destaque para nome/descrição e badge "Disponível").
2. **Filtros** — busca por texto e segmented control (Todos / Disponíveis / Em uso).
3. **Relatório "Uso de Carrinhos Elétricos"** — tela dedicada com histórico completo (retirada → devolução) já alimentado pela tabela `cart_history` existente.

---

## 1. Cards 3D Liquid Glass Premium

### Design por estado

**Disponível** (verde, calmo, convidativo):
```text
┌──────────────────────────────────┐
│  ⚡ ELE-0003          [✎] [✓]    │ ← halo verde sutil
│                                  │
│   Carrinho do Pavilhão Azul      │ ← título grande (text-lg)
│   ELE-0003 · 4 lugares           │ ← descrição
│                                  │
│  ╔════════════════════════════╗  │
│  ║   ✓  DISPONÍVEL            ║  │ ← faixa verde gradiente
│  ╚════════════════════════════╝  │
└──────────────────────────────────┘
```

**Em uso** (azul/âmbar, foco em ação):
```text
┌──────────────────────────────────┐
│  ⚡ ELE-0001          [✎] [Em uso]│ ← halo âmbar
│                                  │
│  ┌────┐  Lucas Silva             │ ← avatar/logo grande
│  │ LS │  LOGÍSTICA               │
│  └────┘                          │
│                                  │
│  🕐  Retirado às 14:32           │ ← destaque hora
│      há 1h 12min                 │
│                                  │
│  ╔════════════════════════════╗  │
│  ║      ↩  DEVOLVER           ║  │ ← botão grande primário
│  ╚════════════════════════════╝  │
└──────────────────────────────────┘
```

### Técnica visual (Liquid Glass 3D)

- Container: `rounded-2xl border border-border/40 bg-gradient-to-br from-card/80 via-card/60 to-card/40 backdrop-blur-2xl shadow-[0_8px_32px_-12px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]`
- Halo de status: pseudo-elemento `::before` com gradiente radial colorido (verde para disponível, âmbar para em uso) com `blur-2xl opacity-40` posicionado no canto superior.
- Profundidade 3D: `transform-gpu transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.4)] hover:scale-[1.02]`
- Textura sutil: overlay `::after` com `bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_50%)] pointer-events-none`
- Faixa "Disponível": botão visual com gradiente `from-success/20 via-success/15 to-success/10`, borda interna brilhante, ícone `CheckCircle2`, font-bold uppercase tracking-wide.
- Botão "Devolver": `bg-gradient-to-r from-primary to-primary/80` h-12, ícone `Undo2`, sombra interna gold, ativa `active:scale-[0.97]`.
- Badge de tempo decorrido: cálculo `(now - retirada_em)` formatado "há Xh Ymin".

### Responsividade

- Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`
- Card: `min-h-[240px]` para "Disponível", `min-h-[280px]` para "Em uso" — alinhamento garantido.
- Mobile (390px): cards full-width, fontes responsivas (`text-base sm:text-lg`), botão Devolver `h-12` para toque confortável.

---

## 2. Filtros

Linha de filtros entre o header e o grid:

```text
┌─────────────────────────┐ ┌────────────────────────────┐
│ 🔍 Buscar por código... │ │ [Todos] [Disponíveis] [Em uso]│
└─────────────────────────┘ └────────────────────────────┘
```

- **Input de busca**: filtra por `codigo` ou `nome` (case-insensitive, debounce nativo via state).
- **Segmented control**: 3 botões com contadores (ex: "Disponíveis (8)"), estilo Liquid Glass com tab ativa em primary.
- Empty state aprimorado quando filtros não retornam nada.
- Estado vazio mostra contador zerado e botão "Limpar filtros".

---

## 3. Relatório "Uso de Carrinhos Elétricos"

### Origem dos dados

A tabela `cart_history` **já existe** e já registra automaticamente toda retirada (`action='retirada'`) e devolução (`action='devolucao'`) via o hook `useElectricCarts`. Cada linha tem `before_data` e `after_data` (JSONB completos do carrinho) + `actor_user_id` + `created_at`. **Nenhuma migration é necessária.**

### Nova rota: `/electric-carts/report`

Acesso via botão "Relatório" no header da página de carrinhos (ícone `FileText`).

### UI do relatório

```text
┌─────────────────────────────────────────────────────┐
│ Uso de Carrinhos Elétricos                          │
│ Histórico completo de retiradas e devoluções        │
│                                                     │
│ [Período: últimos 7 dias ▾]  [Carrinho: Todos ▾]   │
│ [🔍 Buscar responsável...]   [📥 Exportar PDF]     │
│                                                     │
│ ┌──────────────────────────────────────────────┐   │
│ │ ELE-0001 · Carrinho do Pavilhão Azul         │   │
│ │ 👤 Lucas Silva (LOGÍSTICA)                   │   │
│ │ 🕐 Retirado: 28/04 14:32                     │   │
│ │ ↩  Devolvido: 28/04 16:45  ·  Duração: 2h13m │   │
│ └──────────────────────────────────────────────┘   │
│ ┌──────────────────────────────────────────────┐   │
│ │ ELE-0002 · Em uso (sem devolução)            │   │
│ │ 🏢 Coopermil (Empresa parceira)              │   │
│ │ 🕐 Retirado: 28/04 13:10  ·  há 3h em uso   │   │
│ └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Lógica de pareamento

Para cada linha de `action='retirada'`, busca a `action='devolucao'` correspondente do mesmo `cart_id` cuja `created_at` seja a próxima posterior. Resulta em "sessões de uso" com:
- Carrinho (`codigo`, `nome` do `after_data`)
- Responsável: nome do membro (lookup em `org_members`) OU empresa parceira (via `empresa_slug` no `after_data` da retirada)
- Hora de retirada (`retirada_em` do `after_data`)
- Hora de devolução (`devolucao_em` do `after_data` da devolução) — null se ainda em uso
- Duração calculada

### Filtros do relatório

- **Período**: hoje, 7 dias, 30 dias, todo período.
- **Carrinho**: dropdown com todos os carrinhos.
- **Busca por responsável**: filtra por nome de membro ou empresa.
- **Status**: opcional — concluídas / em aberto.

### Exportação PDF

Botão "Exportar PDF" gera relatório usando `jsPDF` + `jspdf-autotable` (já no projeto, vide `src/lib/generateKmPdf.ts` como referência). Colunas: Carrinho, Responsável, Retirada, Devolução, Duração.

---

## Detalhes Técnicos

### Arquivos a criar

- **`src/components/electric-carts/ElectricCartCard.tsx`** — componente do card 3D Liquid Glass, recebe `cart`, `partner`, `responsavel`, callbacks `onEdit`, `onReturn`, `onHistory`.
- **`src/components/electric-carts/ElectricCartsFilters.tsx`** — input de busca + segmented control com contadores.
- **`src/pages/ElectricCartsReportPage.tsx`** — página do relatório com filtros, listagem de sessões e exportação.
- **`src/hooks/useCartUsageReport.ts`** — hook que faz query em `cart_history` (com filtros de data via `created_at`), faz o pareamento retirada→devolução em memória e retorna sessões prontas.
- **`src/lib/generateCartUsagePdf.ts`** — geração do PDF do relatório.

### Arquivos a editar

- **`src/pages/ElectricCartsPage.tsx`** — extrai card para componente, adiciona filtros (state local), botão "Relatório" no header, troca grid responsivo. Reduz tamanho do arquivo significativamente.
- **`src/App.tsx`** — registra rota `/electric-carts/report` com `AuthGuard` + `OrgGuard` + `Layout`.
- **`src/components/Sidebar.tsx`** — opcional: adicionar sub-item "Relatório de uso" sob Carrinhos Elétricos (ou apenas botão dentro da página — preferência por **botão dentro da página** para não poluir sidebar).

### Sem mudanças necessárias

- **Banco de dados**: `cart_history` já captura tudo (`action`, `before_data`, `after_data`, `actor_user_id`, `created_at`). RLS já permite SELECT por `is_org_member`. **Sem migration.**
- **Hook `useElectricCarts`**: já insere histórico em `pickup` e `returnCart`. Sem mudanças.

### Performance

- Query do relatório usa `staleTime: 60s` no React Query.
- Limite inicial de 500 registros (mais que o limite Supabase de 1000), com paginação futura se necessário.
- Pareamento retirada↔devolução é O(n) com Map por `cart_id`.

### Acessibilidade

- Todos os botões mantêm `min-h-[44px]` para toque.
- `aria-label` em ações ("Devolver carrinho ELE-0001", "Ver histórico de ELE-0001").
- Contraste mantido conforme tokens do design system (success, primary, info).

---

## Validação pós-implementação

1. Cards "Disponível" e "Em uso" renderizam com efeito 3D distinto e responsivo no mobile (390px) e desktop.
2. Filtros (texto + status) funcionam combinados, com contadores corretos.
3. Retirar um carrinho cria entrada visível no relatório imediatamente após.
4. Devolver um carrinho fecha a sessão no relatório com duração calculada.
5. Carrinho retirado por empresa parceira mostra logo no relatório.
6. Exportação PDF gera arquivo formatado corretamente.
7. Sem regressões nas abas "Frota" e "Autorizados" nem no histórico individual existente (botão de clique no card).
