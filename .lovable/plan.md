# Assessorias compartilhadas: nome completo e foto de cada responsável

Nos cartões de Assessoria de Imprensa, Assessoria Jurídica e Assessoria de Relações Internacionais, os nomes aparecem cortados com reticências e, quando os dados do registro ainda não carregaram, os responsáveis aparecem juntos numa única linha ("Fulano e Beltrano"). O objetivo é que cada pessoa apareça em sua própria linha, com foto (ou iniciais) e nome completo, no celular e no computador.

## O que muda

1. **Nome completo sempre visível**
   - Retirar o corte por reticências dos nomes dos responsáveis principais nos cartões; o nome passa a quebrar em até duas linhas quando necessário.
   - Vale igualmente para celular e computador; o cartão cresce em altura conforme o número de responsáveis.

2. **Uma pessoa por linha, com ícone**
   - Cada responsável principal continua com sua própria foto redonda (ou iniciais quando não houver foto) e o rótulo "Principal".
   - O alinhamento passa a ficar pelo topo quando houver mais de um nome, para o bloco não ficar torto.

3. **Lista de reserva corrigida**
   - No catálogo interno usado enquanto o registro oficial carrega, as três assessorias hoje trazem os responsáveis num único texto ("A e B", "A, B e C"). Passarão a ter a lista de nomes separada, para que mesmo nesse momento inicial cada pessoa apareça individualmente, igual ao que já está salvo no registro.

## Verificação

- Conferência visual dos três cartões em largura de celular (393 px) e em tela larga.
- Testes existentes do portal de comissões e do teste de responsáveis compartilhados atualizados/executados.
- Nenhuma mudança em permissões, acessos ou em quem recebe avisos.

## Detalhes técnicos

- `src/styles/portal-commission-groups.css`: `.commission-access-card__lead-name` deixa de usar `white-space: nowrap` / `text-overflow: ellipsis`, passando a `overflow-wrap: anywhere` com `-webkit-line-clamp: 2`; `.commission-access-card__people` alinhado ao topo também no estado compartilhado; ajustar `min-width` das grades para permitir quebra.
- `src/modules/commissions/officialCommissionCatalog.ts`: adicionar campo opcional `responsibles?: string[]` nas entradas de imprensa, jurídica e relações internacionais.
- `src/pages/commissions/CommissionPortalPage.tsx`: `fallbackPeople` gera um lead por item de `responsibles` quando existir, mantendo o comportamento atual quando não existir.
- `src/components/commissions/CommissionCard.tsx`: sem mudança de lógica; apenas se confirma que `leadList` renderiza uma linha por pessoa.
