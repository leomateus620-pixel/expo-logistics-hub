

# Separar campo de pesquisa e botão "Pesquisar"

## Mudança

O campo de pesquisa atual filtra em tempo real enquanto o usuário digita. O usuário quer que o input apenas receba o texto, e a busca só seja disparada ao clicar um botão "Pesquisar".

## Implementação em `src/pages/TransportsPage.tsx`

1. Adicionar um novo estado `searchInput` para o valor digitado (separado de `filterSearch` que é o valor efetivo do filtro)
2. Substituir o `onChange` do Input para atualizar apenas `searchInput` (sem filtrar)
3. Adicionar um `<Button>` "Pesquisar" ao lado do input que, ao ser clicado, copia `searchInput` para `filterSearch`
4. Permitir também disparar a busca com Enter (onKeyDown)
5. No "Limpar", resetar ambos `searchInput` e `filterSearch`

## Arquivo alterado
- `src/pages/TransportsPage.tsx`

