# Corrigir o nome exibido de Fernanda Seckler Eich

## Resultado esperado
- Substituir a grafia “Fernanda Secklereich” por **“Fernanda Seckler Eich”** nas exibições da pessoa indicada, inclusive na organização, comissão e eventos já cadastrados.
- Preservar a outra pessoa chamada Fernanda Matarucco Meinertz, contas, vínculos, fotos, acessos e demais dados.

## Situação verificada
- O cadastro de membro vinculado à conta que aparece com o sobrenome unido contém “Fernanda Secklereich”. A mesma grafia está no perfil, em um vínculo de comissão e em dez referências de eventos.
- Outra conta da Fernanda já tem o nome correto. Os dois identificadores de conta permanecem distintos; não haverá mesclagem.
- As telas da organização leem os registros de membro e comissão, não uma legenda fixa. O mapeamento de foto já reconhece as duas grafias.

## Execução e conferência
1. Atualizar apenas os campos de nome associados à conta com grafia incorreta, por identificador e valor anterior exato, incluindo as dez referências de eventos. Ajustar o campo de busca normalizada da comissão. Não alterar títulos de eventos ou registros de outras pessoas.
2. Usar a operação autorizada de atualização de dados, sem mudança de estrutura ou de permissões. Caso a ferramenta de escrita continue bloqueada, interromper e informar a restrição, sem contorná-la.
3. Conferir as contagens e a nova grafia na base, confirmar que a outra conta e seus vínculos continuam intactos e validar as telas afetadas quando houver acesso ao mapa/agenda.

## Detalhes técnicos
- Escopo da conta com erro: `c00d04b3-6b33-48f7-80c8-14c28bf7c90a` em `org_members.nome_exibicao`, `profiles.full_name`, `commission_responsibles.display_name`/`normalized_name` e `cronograma_evento_responsaveis.name_snapshot`.
- Não usar substituição global nem alterar os identificadores ou snapshots comerciais de vendas.
