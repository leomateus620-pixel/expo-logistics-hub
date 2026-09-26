# Restaurar os links públicos do Mapa Comercial

## Diagnóstico confirmado
- Os dez links cadastrados estão ativos; suas chaves correspondem aos registros e o endereço público responde.
- Testei os dez links na consulta real: **todos falham** ao carregar o inventário e a revisão com o mesmo erro de banco: `column s.updated_at does not exist`. A consulta do contexto do parque funciona.
- A função de revisão consulta `lot_sales.updated_at`, mas essa coluna não existe na tabela. Como o inventário chama a revisão, o erro impede a exibição de todos os links. Não há motivo para trocar ou gerar novas chaves.

## Correção
1. Criar uma **nova migração** que substitua apenas a definição atual de `public_map_scope_revision`, usando a data existente da venda confirmada (`created_at`) no cálculo da revisão. Preservar escopo, autorização, retorno e os demais componentes da revisão; não editar migrações antigas nem dados de vendas.
2. Manter intactos os dez endereços, seus tokens, permissões e escopos. Não alterar o mapa administrativo nem a apresentação dos lotes nesta correção.
3. Conferir se a consulta de inventário e a consulta de revisão respondem para **todos os dez links**, sem expor as chaves nos resultados. Abrir um link de pavilhão e um de segmento em navegador sem login; verificar lista, mapa quando a cena carregar, seleção de lote e ausência de dados fora do escopo.
4. Conferir que chaves inválidas continuam rejeitadas e que os testes públicos existentes e a compilação não apresentam regressão.

## Publicação
A correção é no banco e entra em vigor ao aplicar a migração. **Não atualizar nem publicar a interface de produção.**
