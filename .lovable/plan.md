

# Plano: Melhorias no Agendar Transporte

## Alterações em `src/pages/TransportsPage.tsx`

### 1. Remover campo "Observações" do formulário de criação
- Remover `showObservacoes` e o `Textarea` de observações do `renderFormFields` (ambos os modos).

### 2. Campo "Título" como Select com opções predefinidas
- Substituir o `Input` de título por um `Select` com as opções: **Parque, Hotel, Aeroporto, Centro, Outros**.

### 3. Campo "KM Devolução" habilitado somente ao concluir
- No formulário de criação: mostrar apenas "KM Retirada", sem "KM Devolução".
- No formulário de edição: mostrar "KM Devolução" somente quando `status === 'concluido'`.
- Ao concluir via `cycleStatus`, abrir o dialog de edição para preencher KM Devolução + data/hora devolução antes de salvar.

### 4. Data e horário automáticos (horário atual) com opção de editar
- No formulário de criação, preencher `inicio_em` com `new Date().toISOString().slice(0, 16)` como valor padrão ao abrir o dialog.

### 5. Inserir data e horário de devolução
- Adicionar campo `fim_em` (datetime-local) no formulário de edição, visível quando `status === 'concluido'`. A coluna `fim_em` já existe na tabela `transports`.

### 6. Campo "Comissão" (auto-preenchido a partir do motorista)
- Ao selecionar o motorista, buscar automaticamente o `commission_id` do membro e exibir a comissão correspondente (read-only ou como badge).
- Importar `useCommissions` para exibir o nome da comissão.

### 7. Veículos: mostrar apenas com status "Disponível"
- No Select de veículo, filtrar `vehicles` para exibir apenas os que têm `status === 'disponivel'`.

### 8. Integração KM com veículo (já implementada)
- Manter a lógica existente de criar `vehicle_usage` e atualizar `km_atual` ao concluir com KM preenchidos.

## Refatoração do `renderFormFields`
- Separar em lógica mais clara com parâmetros: `isEdit`, `status` para controlar visibilidade condicional dos campos.

## Arquivos a modificar
- `src/pages/TransportsPage.tsx` — todas as alterações acima
- `src/hooks/useTransports.ts` — incluir `fim_em` no create/update

