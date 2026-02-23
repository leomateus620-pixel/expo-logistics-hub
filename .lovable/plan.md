
# Plano de Melhorias: Dashboard, Agenda, Escala e Checklist

## 1. Dashboard com navegacao nos cards

Tornar os 4 cards de estatisticas (Veiculos Disponiveis, Carrinhos em Uso, Transportes Ativos, Tarefas Pendentes) clicaveis, redirecionando para a pagina correspondente:

- Veiculos Disponiveis --> `/vehicles`
- Carrinhos em Uso --> `/electric-carts`
- Transportes Ativos --> `/transports`
- Tarefas Pendentes --> `/checklist`

**Alteracoes:**
- `src/components/StatCard.tsx`: Adicionar prop `to?: string` e envolver o card com `useNavigate` ou `Link` do react-router-dom, aplicando `cursor-pointer` quando houver link.
- `src/pages/Dashboard.tsx`: Passar a prop `to` para cada `StatCard`.

---

## 2. Agenda com edicao de eventos (responsavel)

Permitir clicar em um evento existente na Agenda para edita-lo, incluindo alterar o responsavel da equipe.

**Alteracoes:**
- `src/pages/AgendaPage.tsx`:
  - Adicionar estado para evento selecionado (`editingEvent`).
  - Reutilizar o Dialog de criacao para edicao, pre-preenchendo o formulario com os dados do evento.
  - Ao salvar, chamar `update.mutateAsync` (ja disponivel no hook `useEvents`).
  - Cada card de evento tera um botao ou sera clicavel para abrir a edicao.

---

## 3. Escala unificada (Eventos + Transportes)

A pagina Escala (`VerEscalaPage`) passara a exibir tanto os eventos da Agenda quanto os transportes, todos juntos, ordenados por horario.

**Alteracoes:**
- `src/pages/VerEscalaPage.tsx`:
  - Importar `useTransports` e `useOrgMembers`.
  - Combinar os dados de `events` e `transports` em uma lista unificada, normalizando os campos (titulo, inicio_em, fim_em, responsavel).
  - Transportes usarao `motorista_user_id` como responsavel e terao uma badge "Transporte" para diferenciar.
  - Filtros por membro e data continuam funcionando sobre a lista unificada.

---

## 4. Checklist com itens da Escala

O Checklist passara a exibir, alem das tarefas, os itens da escala (eventos + transportes) como itens de referencia/acompanhamento.

**Alteracoes:**
- `src/pages/ChecklistPage.tsx`:
  - Importar `useEvents` e `useTransports`.
  - Adicionar uma nova aba "Escala" (ou seção) que lista os eventos e transportes do dia, similar a uma lista de verificacao (somente leitura, sem checkbox).
  - Manter as tarefas existentes nas abas "Hoje", "Amanha" e "Todas".

---

## Detalhes Tecnicos

### StatCard.tsx
```tsx
// Adicionar props: onClick ou to (string)
// Envolver com Link do react-router-dom quando 'to' estiver presente
// Adicionar cursor-pointer e hover effect
```

### AgendaPage.tsx
```tsx
// Novo estado: editingEvent (null | event object)
// Novo Dialog ou reutilizar o existente com modo create/edit
// Preencher form com dados do evento ao clicar
// Chamar update.mutateAsync no modo edicao
```

### VerEscalaPage.tsx
```tsx
// Importar useTransports
// Criar lista unificada:
// - events.map -> { tipo: 'evento', titulo, inicio_em, fim_em, responsavel_user_id }
// - transports.map -> { tipo: 'transporte', titulo: t.titulo || `${t.origem} -> ${t.destino}`, 
//     inicio_em, fim_em, responsavel_user_id: t.motorista_user_id }
// Ordenar por inicio_em, aplicar filtros existentes
```

### ChecklistPage.tsx
```tsx
// Importar useEvents e useTransports
// Nova aba "Escala" com eventos e transportes do dia
// Exibir como cards informativos (sem toggle de conclusao)
```
