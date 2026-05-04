# Redesign do menu Despesas — Liquid Glass 3D + Filtro Inteligente por Pessoa

## Objetivos
1. Elevar o design de toda a tela `/expenses` ao padrão Liquid Glass 3D do projeto (verde profundo + dourado), sem cair em "efeito IA genérico".
2. Padronizar todos os textos exibidos para **Sentence case** (primeira letra maiúscula, restante normal — exceto siglas e nomes próprios).
3. Tornar o CTA principal claro e objetivo.
4. Adicionar **filtro por pessoa** com cálculo correto do **total a receber** de cada uma, exibido tanto no seletor quanto em destaque ao filtrar.

## Mudanças visuais (Liquid Glass 3D real)

### Header da página
- Ícone do recibo com gradiente verde/dourado, sombra interna + halo (não plano).
- Título "Despesas" com tracking apertado, subtítulo objetivo:
  `8 lançamentos • R$ 1.901,37 no período`.
- CTA principal renomeado para **"Nova despesa"** (atualmente "Nova" — ambíguo). Botão maior (h-11), gradiente verde com leve elevação 3D, ícone `Plus` à esquerda.

### Cards de resumo (4 cards no topo)
Substituir cards "flat" por cards 3D com:
- `bg-card/70 backdrop-blur-xl`, borda `border-white/10`, sombra dupla (drop + inner glow).
- Mini-ícone colorido (Receipt, Clock, Banknote, CheckCircle) em chip arredondado dentro do card.
- Tipografia: número em `text-2xl font-extrabold` + label `text-[11px] uppercase tracking-wider`.
- Hover/active: leve `translate-y-[-2px]` + sombra crescente.
- Labels reescritos em sentence case: "Sem comprovante", "Em validação", "Ressarcimento pendente", "Já ressarcido".

### Tabs (Lançamentos / Ressarcimentos)
- TabsList em pílula glass (`bg-muted/40 backdrop-blur`), trigger ativo com gradiente verde sutil + sombra interna.

### Chips de status
- Mantém scroll horizontal, mas com chips arredondados maiores (h-9), tipografia em sentence case, ativo em verde profundo com sombra de cor.

### `ExpenseCard` (lista)
- Reescrever para card glass 3D: `rounded-2xl`, gradient sutil (`from-card/70 to-card/40`), borda interna iluminada, sombra macia.
- Ícone de categoria em "moeda 3D" (círculo com gradient + inner shadow + emoji).
- Linha 1: título em `font-semibold` (sentence case via util `toTitleCase` light).
- Linha 2: categoria · data curta · pago por.
- Linha 3 (chips contextuais): transporte / veículo só quando existirem, em mini-pills.
- Lado direito: valor `text-base font-extrabold` + Badge de status com ícone, ambos alinhados à direita.
- `active:scale-[0.98]` + `transition-all` para feedback tátil.

### `ExpenseDetailSheet`
- Header com valor gigante em `text-3xl` + chip de status.
- Cards de informação agrupados em "glass blocks" com headers em sentence case ("Detalhes do lançamento", "Comprovante", "Descrição").
- Botões de ação maiores (h-11), CTA primário "Aprovar despesa" / "Recusar despesa" / "Solicitar ressarcimento" — verbos claros.

## Filtro por pessoa com total a receber

### Cálculo (em `ExpensesPage.tsx`)
Para cada `paid_by_name` distinto entre os `expenses`, calcular:

```ts
// "A receber" = despesas validadas/aprovadas ainda não ressarcidas
const RECEIVABLE_STATUSES = new Set([
  'aprovado',
  'ressarcimento_solicitado',
]);

// Mapa: nome -> { total, aReceber, count }
const personSummary = useMemo(() => {
  const m = new Map<string, { total: number; aReceber: number; count: number }>();
  for (const e of expenses) {
    const name = e.paid_by_name?.trim();
    if (!name) continue;
    const cur = m.get(name) ?? { total: 0, aReceber: 0, count: 0 };
    const amt = Number(e.amount) || 0;
    cur.total += amt;
    cur.count += 1;
    if (RECEIVABLE_STATUSES.has(e.status)) cur.aReceber += amt;
    m.set(name, cur);
  }
  return m;
}, [expenses]);
```

> Observação: status `ressarcido` é descontado (já pago); `rascunho`, `pendente_comprovante`, `pendente_validacao`, `recusado`, `cancelado` não entram em "a receber" (ainda não validados ou já encerrados). Essa regra fica documentada em comentário no código.

### UI do seletor
- Substituir o `Select` atual por um **Combobox glass 3D** (mantendo `Select` do shadcn por simplicidade) com:
  - Trigger mostrando avatar inicial + nome + (se filtrando) `R$ X a receber` em verde.
  - Cada `SelectItem` exibe: nome à esquerda, `R$ X` em dourado à direita quando há valor a receber; cinza quando zero.
- Opção "Todos" no topo, mostrando total geral a receber.

### Banner de pessoa filtrada
Quando `personFilter` ativo, renderizar acima da lista um **card destaque 3D** mostrando:
- Nome da pessoa em `font-bold`.
- Linha 1 (verde, grande): "R$ X a receber".
- Linha 2 (cinza menor): "Y lançamentos · R$ Z no total".
- Botão `X` para limpar filtro.

## Padronização de textos (Sentence case)

Aplicar em todos os textos visíveis da página e componentes filhos:
- Labels de status: já estão em sentence case — verificar e ajustar pontuais.
- Headings: "Detalhes da despesa", "Registrar despesa", "Descrição", "Comprovante".
- Botões: "Nova despesa", "Aprovar despesa", "Recusar", "Solicitar ressarcimento", "Escanear nota".
- Empty state: "Nenhuma despesa encontrada", "Registre sua primeira despesa…".
- Não alterar nomes próprios vindos do banco (títulos digitados pelo usuário) — apenas os textos da UI.

## Arquivos a editar

- `src/pages/ExpensesPage.tsx` — header, cards de resumo 3D, CTA renomeado, cálculo `personSummary`, banner de pessoa filtrada, seletor com totais, padronização de textos.
- `src/components/expenses/ExpenseCard.tsx` — visual Liquid Glass 3D, hierarquia tipográfica, chips contextuais.
- `src/components/expenses/ExpenseDetailSheet.tsx` — header com valor grande, blocos glass, CTAs claros.
- `src/components/expenses/ReimbursementList.tsx` — alinhar visual ao novo padrão (cards glass + sentence case).

## Não-objetivos
- Não mexer em `useExpenses` (lógica/queries permanecem).
- Não alterar schema do banco.
- Não trocar shadcn por libs novas — usar componentes existentes com classes Tailwind do projeto.

Posso seguir com essa implementação?
