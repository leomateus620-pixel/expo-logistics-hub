# Construtor de Planejamento de Evento (Subeventos) — Agenda FenaSoja

Transformar a experiência de Subeventos em um construtor único de plano operacional: vários subeventos, com ações previstas, estrutura e providências e convidados, registrados em um só fluxo — reproduzindo um checklist como o "Roteiro para Planejamento de Evento".

## Hierarquia

```text
Evento principal
 └─ Subevento / bloco de planejamento
     ├─ Ações previstas (horário + título + responsável/comissão + estado)
     ├─ Estrutura e providências (checklist)
     └─ Convidados (lista rápida de nomes/grupos)
```

O vínculo atual com o evento principal permanece intacto; o subevento passa a ser um contêiner operacional.

## Banco de dados

Hoje existem `cronograma_subeventos`, `cronograma_subevento_comissoes` e `cronograma_subevento_responsaveis`. Serão criadas três tabelas filhas (com GRANTs, RLS por `org_id` e políticas iguais às atuais de subeventos):

- `cronograma_subevento_acoes` — `start_time`, `title`, `notes`, `responsible_name`, `responsible_user_id`, `commission_slug`, `is_done`, `sort_order`
- `cronograma_subevento_providencias` — `description`, `responsible_name`, `commission_slug`, `is_done`, `note`, `sort_order`
- `cronograma_subevento_convidados` — `name`, `category`, `sort_order`

RPC nova `cronograma_save_subevent_plan(payload jsonb)`: grava, em uma única transação, N subeventos com seus vínculos (comissões/responsáveis) e suas listas filhas (substituição completa por subevento), devolvendo o evento principal já recomposto. Mantém `lock_version` e registra log em `cronograma_evento_logs`.

## Interface do construtor

Novo componente `SubeventPlanBuilder` (substitui `SubeventComposer`), em rolagem única com seções colapsáveis por subevento:

1. **Dados do subevento** — título, descrição, data, horário inicial/final, status.
2. **Vínculos** — passa a usar os seletores oficiais já existentes na criação do evento principal (`RelationalMultiSelect`): Comissão/Assessoria (lista oficial com responsável, busca, limpar) e Responsáveis (membros do sistema, busca, múltipla seleção, avatar). O seletor antigo de subevento é removido.
3. **Ações previstas** — linhas compactas `horário | título`, com responsável, comissão, observação e estado opcionais; `+ Adicionar ação` cria a próxima linha vazia inline (sem modal), com reordenação por arrastar/setas.
4. **Estrutura e providências** — checklist rápido: descrição, responsável, comissão, checkbox, nota; `+ Adicionar providência`.
5. **Convidados** — entrada estilo tag: digitar nome + Enter adiciona o próximo; editar/remover; categoria opcional.

No rodapé do construtor: `+ Adicionar outro subevento` (Subevento 02, 03…), com duplicar, reordenar, remover e colapsar/expandir por bloco. Ações contextuais fixas (sticky) para salvar todo o plano de uma vez.

## Timeline e visualização do evento

- O card do evento na Timeline troca o indicador genérico `6/1` por um resumo com significado: `6 ações · 4 providências · 9 convidados`, mais uma barra de progresso quando houver itens concluídos.
- Ação de expandir controlada revela pré-visualização compacta: **PLANEJAMENTO DO EVENTO** com as primeiras ações (`10:30 Recepção`, `11:00 Lançamento`, `12:00 Encerramento`) e `3/4 providências concluídas`, com link para abrir o plano completo.
- No detalhe do evento (`EventDrawer` e `MobileEventScreen`), nova visão **Planejamento / Subeventos**: linha do tempo vertical das ações com responsáveis e comissões, checklist de providências com estados, e lista de convidados — apresentada como rundown operacional, não como formulário.

## Direção visual e responsividade

Superfícies navy/branco, acentos dourado/laranja controlados, tipografia hierárquica, bordas refinadas, sombras sutis, densidade compacta; sem cards gigantes, containers aninhados ou excesso de chips. Estilos concentrados em `src/styles/cronograma-workspace.css` e um arquivo dedicado ao construtor.

- Desktop: campos paralelos aproveitando a largura, linhas de ação compactas.
- Mobile: blocos verticais legíveis (horário + nome, responsabilidade abaixo), checklists compactos, controles grandes de adicionar/remover, sem overflow horizontal.

## Detalhes técnicos

- `types.ts`: novos tipos `CronogramaSubeventAction`, `CronogramaSubeventProvision`, `CronogramaSubeventGuest`, e `CronogramaSubeventInput` passa a carregar `commissions[]`, `responsibles[]`, `actions[]`, `provisions[]`, `guests[]`.
- `modelAdapter.ts` e `useCronogramaEventos.ts`: leitura das novas relações, mapeamento e mutação em lote (`saveSubeventPlan`) preservando o fallback offline/enfileirado atual.
- Permissões: mesmas regras já aplicadas hoje (escrita para papéis com acesso ao cronograma; exclusão de itens persistidos para admin/gestor).
- Validação visual: um subevento simples, vários subeventos, muitas ações, muitas providências, listas longas de convidados, desktop e mobile, prévia na Timeline e visão completa do evento.
