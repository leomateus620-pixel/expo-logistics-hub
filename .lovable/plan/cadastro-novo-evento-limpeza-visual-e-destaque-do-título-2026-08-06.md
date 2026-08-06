# Cadastro "Novo Evento" — limpeza visual e destaque do título

## O que muda

1. **Título "Novo evento" em destaque**: cabeçalho do diálogo ganha tratamento premium (ícone em placa dourada 3D liquid glass, título maior com peso forte e leve tracking), e a frase "Preencha as informações essenciais do evento." é removida.
2. **Bloco "Áreas e responsáveis" sem cabeçalho**: removidos o título, o ícone e a linha "Defina a área institucional e quem executará ou acompanhará o evento." O seletor "Comissão ou Assessoria responsável" passa a aparecer direto.
3. **Card verde "Responsáveis da área" removido** (o atalho "Adicionar N"). A vinculação de responsáveis segue feita pelo seletor "Responsáveis do evento".
4. **Vínculo visual no seletor de responsáveis**: os itens selecionados passam a exibir uma linha-guia (trilho vertical + conector horizontal) saindo do ícone/avatar até cada pessoa, deixando claro que aquelas pessoas pertencem ao mesmo grupo de responsáveis.
5. **Seção "Quando ainda não há data" removida** do formulário (campos "Motivo da pendência" e "Decisão necessária" saem da tela de cadastro/edição).

Nada muda no salvamento, permissões, backend ou nas telas de listagem/timeline.

## Detalhes técnicos

- `src/pages/CronogramaEventosPage.tsx` (~1016-1037): remover `DialogDescription`; reestilizar `DialogTitle` com a placa de ícone e tipografia de destaque. Manter acessibilidade (usar `sr-only` para a descrição do diálogo).
- `src/components/cronograma-eventos/mobile/MobileCreateEventScreen.tsx` (linha 78): remover a `description` equivalente.
- `src/components/cronograma-eventos/EventForm.tsx`:
  - remover o bloco `cronograma-relations-section__header` (linhas ~628-636) e o import de `UserRound` se ficar sem uso;
  - remover o bloco `missingOfficialResponsibles` / `cronograma-relation-institutional-action` (linhas ~654-665) e o helper `applyOfficialResponsibles` / cálculo `missingOfficialResponsibles` se ficarem sem uso;
  - remover a seção `is-pending` (linhas ~707-732). Os campos `pendingReason` e `decisionNeeded` permanecem no modelo e são preservados no submit dos eventos existentes.
- `src/components/cronograma-eventos/RelationalMultiSelect.tsx` + CSS (`src/styles/cronograma-registration-interactions.css` / `org-units.css`): adicionar a linha-guia na lista de selecionados da variante `person`, com tokens semânticos existentes e sem quebrar a variante `organization`.
- Ajustar testes que referenciem os textos removidos (`src/test/cronograma*`), rodando a suíte do módulo ao final.
