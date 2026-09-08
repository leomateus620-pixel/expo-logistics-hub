# Assessorias compartilhadas: todos como "Principal"

## Objetivo
Nas três assessorias compartilhadas — Imprensa, Jurídica e Relações Internacionais — todos os responsáveis passam a aparecer com o rótulo "Principal", sem hierarquia visual entre eles. Equipes de apoio continuam como apoio.

## Quem muda hoje
- Assessoria de Imprensa: Deise Anelise Froelich (já Principal) + Francine Maria Boijink (hoje Copresidência)
- Assessoria Jurídica: José Mauro Barbieri (já Principal) + Sandra Lameira (hoje Copresidência)
- Assessoria de Relações Internacionais: Julio Bravo (já Principal) + Roberto Adriano Racho e Sara Kirchhof Varela (hoje Copresidência)

## O que será feito
1. Ajuste nos dados: os responsáveis dessas três assessorias (exceto quem está como equipe de apoio) passam a ter papel "principal".
2. Ajuste no cartão da frente no portal: quando a frente tem mais de um responsável principal, o cartão mostra todos eles lado a lado com o rótulo "Principal", em vez de destacar apenas um nome e empilhar os demais como avatares secundários. Com um único principal, o cartão continua exatamente como está hoje.
3. Nada muda em permissões, acesso às frentes ou em quem recebe notificações.

## Detalhes técnicos
- Atualização de dados em `commission_responsibles` (`relationship_role = 'principal'`, `is_primary = true`) para os responsáveis das comissões de slug `assessoria-de-imprensa`, `assessoria-juridica`, `assessoria-de-relacoes-internacionais`, excluindo `relationship_role = 'equipe_apoio'`.
- `src/hooks/useCommissionPeople.ts`: além de `responsible`/`members`, expor `leads` (todos com `relationship_role === 'principal'`), mantendo `members` para os demais.
- `src/components/commissions/CommissionCard.tsx`: renderizar a lista de `leads` (nome + "Principal") quando houver mais de um; manter `CommissionPeopleStack` para os não-principais. Ajuste de estilo no CSS do cartão para acomodar dois ou três nomes sem quebrar o layout mobile.
- Atualizar/estender `src/test/commissionPortal.test.tsx` para cobrir o caso multi-principal.
