## Diagnóstico do erro

**Não é problema de permissão.** O usuário `fenasojalog@gmail.com` tem permissão para editar — basta ser membro ativo da organização (e ele é). O erro real é:

```
duplicate key value violates unique constraint "vehicles_org_id_placa_key"
```

A tabela `vehicles` tem uma constraint `UNIQUE(org_id, placa)`. No screenshot, o usuário estava editando a **AMAROK VW CINZA** (placa real `TQZ8B35`) e digitou no campo a placa `JDF6D47`. Como existe outro veículo na mesma organização com essa placa (ou a tentativa entrou em conflito por espaço/caracter invisível), o banco rejeitou.

O problema secundário e mais grave de UX: a mensagem técnica do Postgres aparece **literalmente** na tela do usuário, sem orientação do que fazer.

## O que será corrigido

### 1. Mensagem de erro amigável (UX)
Em `src/pages/VehiclesPage.tsx`, no `catch` de `handleEdit` e `handleAdd`, detectar o código de erro Postgres `23505` (unique violation) ou a substring `vehicles_org_id_placa_key` e exibir:

> "Já existe outro veículo cadastrado com a placa **XXX** nesta organização. Verifique se você não está duplicando um registro."

Aplicar o mesmo tratamento em `useVehicles.ts` para padronizar.

### 2. Normalização de placa (raiz do problema)
Antes de salvar (tanto no create quanto no update), normalizar a placa:
- `trim()` para remover espaços
- `toUpperCase()` (já existe parcialmente, garantir nos dois fluxos)
- Remover caracteres invisíveis (`\u200B`, etc.) com regex `/[^\w]/g` exceto traço

Isso evita "placas iguais" que parecem diferentes por espaço acidental.

### 3. Permissões (verificação, não alteração)
Confirmado via análise das RLS: a política de UPDATE em `vehicles` permite qualquer membro ativo da org. O usuário `fenasojalog@gmail.com` já é membro ativo da org Fenasoja — **não precisa "liberar" nada**. O bloqueio é puramente a constraint de unicidade.

## Arquivos modificados
- `src/pages/VehiclesPage.tsx` — tratamento amigável dos erros nos handlers + normalização da placa
- `src/hooks/useVehicles.ts` — normalização defensiva e tradução do erro 23505 no nível do hook

## Fora de escopo
- Não vou alterar a constraint UNIQUE — ela protege a integridade dos dados (duas Amarok com mesma placa não fazem sentido).
- Não vou alterar permissões RLS (já estão corretas).
