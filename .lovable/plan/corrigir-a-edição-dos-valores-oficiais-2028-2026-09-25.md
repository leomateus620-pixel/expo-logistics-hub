# Corrigir a edição dos Valores Oficiais 2028

## Objetivo
Tornar a edição de Renovação e 2ª Etapa estável, intuitiva e totalmente contida na lateral, especialmente no celular, sem alterar a regra de preços, permissões ou valores salvos.

## Alterações
- Ao editar uma etapa, expandir somente o formulário ativo para toda a largura disponível do bloco de preços, mantendo a outra etapa como referência sem sobreposição.
- Reorganizar campo, prévia de preço/m², botões e ação de restaurar em fluxo vertical responsivo, com larguras limitadas ao painel e alvos de toque adequados.
- Impedir estouro horizontal com dimensões mínimas corretas, quebra segura do texto de restauração e adaptação para laterais estreitas.
- Manter os comportamentos atuais de máscara monetária, valor zero válido, Enter para salvar, Escape/Cancelar, estado de carregamento e restauração do valor oficial.
- Remover dos cards de preço a linha “Vendido por R$ ...”. O card continuará indicando apenas a etapa confirmada; o valor histórico da venda permanece no registro/histórico canônico, sem ser confundido com o preço oficial editável.
- Aplicar o mesmo componente corrigido tanto na lateral de lotes externos quanto nos módulos internos dos pavilhões.

## Validação
- Testar edição de Renovação e 2ª Etapa, valor zero, cancelamento, salvamento, restauração e etapa confirmada.
- Confirmar que “Vendido por” não aparece mais nos cards após divergência entre preço atual e valor da venda.
- Verificar contenção e legibilidade em desktop e celular, sem deslocamento lateral ou sobreposição.
- Rodar os testes focais, verificação de tipos e compilação.

## Fora do escopo
- Nenhuma mudança no banco, histórico da venda, permissões, cálculo financeiro ou publicação em produção.
