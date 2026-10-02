# Checkbox "Atualizar também o cadastro do expositor" marcado por padrão

## O que muda para o usuário
- No diálogo "Editar dados do expositor", a opção **"Atualizar também o cadastro do expositor para futuras vendas"** abre já **marcada**. Desmarcar continua possível, caso o usuário queira corrigir apenas esta venda.

## Implementação
Arquivo: `src/features/commercial-map/sales/components/SaleExhibitorEditDialog.tsx`

1. Estado inicial marcado: `const [updateExhibitor, setUpdateExhibitor] = useState(true);` (linha 68).
2. Ajustar o cálculo de `dirty` (linha 76): com o checkbox marcado por padrão, ele não deve sozinho habilitar "Salvar alterações" nem disparar a confirmação de descarte. `dirty` passa a considerar apenas as alterações dos campos:
   `const dirty = JSON.stringify(draft) !== JSON.stringify(initial.current);`
   (Desmarcar o checkbox sem mudar campos também não conta como alteração pendente.)

## Regras preservadas
- Quando não há `exhibitorId`, o checkbox não aparece e `updateExhibitor: false` continua sendo enviado ao servidor (comportamento do `save` permanece; a RPC só atualiza o cadastro central quando `p_update_exhibitor` for verdadeiro e `exhibitorId` existir).
- Idempotência, bloqueio de duplo envio, confirmação de descarte e mensagens de erro permanecem iguais.
- Não alterar banco, vendas, preços ou outras telas.

## Validação
- Teste focado: abrir o diálogo e conferir que o checkbox inicia marcado, que "Salvar alterações" fica desabilitado sem alterações nos campos e que salvar sem tocar no checkbox envia `p_update_exhibitor = true`.
- Checar o build; não publicar e não criar vendas de teste.
