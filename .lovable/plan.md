# Corrigir o nome de Fernanda Seckler Eich

## Onde liberar a permissão
A tela Cloud > Database (da captura) não tem esse controle. O controle fica em **Configurações > Conectores > Lovable Cloud > "Manage my agent's permissions"**. Ali, mude **"Add data"** (adicionar/alterar dados) para "Ask each time" ou "Always allow". Nenhuma outra permissão precisa mudar.

## Depois da liberação
1. Trocar "Fernanda Secklereich" por "Fernanda Seckler Eich" apenas na conta dela: cadastro na organização, perfil, comissão e os dez eventos onde ela é responsável.
2. Não mexer na outra Fernanda (Matarucco Meinertz) nem juntar contas.
3. Conferir no banco que nenhum registro dela ficou com a grafia antiga e que as fotos continuam aparecendo.

## Detalhes técnicos
- Conta `c00d04b3-...`: `org_members.nome_exibicao`, `profiles.full_name`, `commission_responsibles.display_name/normalized_name`, `cronograma_evento_responsaveis.name_snapshot`.
- Atualização filtrada por identificador e pelo valor antigo exato; contagem conferida antes e depois.
- Mapeamento de foto em `personPhotos.ts` já reconhece as duas grafias; manter.
