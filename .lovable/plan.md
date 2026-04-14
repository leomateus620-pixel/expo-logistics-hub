
# Correção das categorias duplicadas no formulário de despesas

## Diagnóstico
Encontrei a causa principal da duplicação:

- O hook `useExpenseCategories` faz **auto-seed no cliente** quando a lista vem vazia
- A tabela `expense_categories` **não tem proteção de unicidade por organização + nome**
- Como o app usa cache persistido e pode abrir múltiplas sessões/re-renderizações, o seed pode acontecer mais de uma vez em cenários de corrida
- O formulário (`ExpenseForm.tsx`) renderiza a lista exatamente como vem do banco, então duplicatas existentes aparecem no select

Isso explica o comportamento do print: o problema não é só visual, é **estrutural de dados**.

## O que vou implementar

### 1. Correção definitiva no banco
Criar uma migration para:
- remover categorias duplicadas já existentes por organização/nome
- manter apenas 1 registro ativo por categoria
- criar uma proteção de unicidade para impedir novas duplicações

Estratégia:
- normalizar por `org_id + name`
- apagar registros repetidos preservando o mais antigo ou mais consistente
- criar `UNIQUE INDEX` em `(org_id, name)`

Isso resolve a origem do bug.

### 2. Seed robusto e idempotente
Refatorar `src/hooks/useExpenseCategories.ts` para que o seed:
- use inserção idempotente
- não dependa apenas de `categories.length === 0`
- trate conflito sem gerar erro ou duplicação
- invalide o cache só quando necessário

Também vou adicionar proteção local para evitar nova tentativa redundante no mesmo ciclo de uso.

### 3. UX/performance no select de categorias
Refinar `src/components/expenses/ExpenseForm.tsx` para:
- deduplicar defensivamente as categorias recebidas antes de renderizar
- ordenar de forma estável
- evitar exibição repetida mesmo se houver resíduo temporário de cache
- manter o comportamento atual do formulário sem quebrar integrações

Assim, o usuário deixa de ver nomes repetidos imediatamente.

### 4. Compatibilidade e segurança
Vou preservar:
- arquitetura atual com React Query
- integração com o módulo de despesas já existente
- regras de RLS atuais
- categorias padrão e vínculos operacionais já implantados

Não vou alterar contratos do formulário nem o fluxo de criação de despesa além do necessário para robustez.

## Arquivos que serão alterados
- `supabase/migrations/...sql` — saneamento + trava de unicidade
- `src/hooks/useExpenseCategories.ts` — seed idempotente e mais resiliente
- `src/components/expenses/ExpenseForm.tsx` — renderização deduplicada e UX melhor no select

## Resultado esperado
Após a implementação:
- o select de categorias deixará de mostrar itens duplicados
- o banco ficará protegido contra novas duplicações
- o primeiro carregamento continuará funcionando sem erro
- a experiência ficará mais limpa, previsível e estável mesmo com cache/offline

## Detalhe técnico
A correção precisa acontecer em **duas camadas**:
1. **Banco**: remover duplicatas existentes e bloquear novas
2. **Frontend**: deduplicar a lista renderizada e tornar o seed seguro

Sem a trava no banco, o bug pode voltar. Sem a defesa no frontend, resíduos antigos ainda podem aparecer até o cache ser renovado.
