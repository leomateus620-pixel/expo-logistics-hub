## Objetivo

Permitir que carrinhos elétricos sejam retirados por **empresas parceiras** (Coopermil, Banrisul, Celena, Sicredi), além do fluxo atual de membros internos da Fenasoja. Quando o carrinho estiver em uso por uma empresa, a logo da empresa aparece no card.

## Empresas Parceiras

Lista fixa, configurada em código (não exige cadastro pelo usuário):

| Slug | Nome | Logo |
|---|---|---|
| `coopermil` | Coopermil | `src/assets/partners/coopermil.png` |
| `banrisul` | Banrisul | `src/assets/partners/banrisul.png` |
| `celena` | Celena Alimentos | `src/assets/partners/celena.jpg` |
| `sicredi` | Sicredi | `src/assets/partners/sicredi.png` |

As 4 imagens enviadas serão copiadas de `user-uploads://` para `src/assets/partners/`.

## Mudanças no Banco

Migration adicionando 2 colunas em `electric_carts`:

- `tipo_responsavel` text — `'interno'` (padrão) ou `'empresa'`
- `empresa_slug` text — slug da empresa quando `tipo_responsavel = 'empresa'` (nulo caso contrário)

Ambos NULL-safe; nada quebra para registros existentes. O campo `responsavel_user_id` continua usado apenas no fluxo interno; o campo `comissao` permanece para o fluxo interno.

Sem CHECK constraint para evitar problemas; validação será feita no frontend e no hook.

## Mudanças no Backend (hook)

`src/hooks/useElectricCarts.ts` — atualizar `pickup`:

- Aceitar parâmetros opcionais `tipo: 'interno' | 'empresa'` e `empresa_slug`.
- Quando `tipo = 'empresa'`: gravar `empresa_slug`, deixar `responsavel_user_id` e `comissao` como NULL.
- Quando `tipo = 'interno'`: comportamento atual (grava `responsavel_user_id`/`comissao`, limpa `empresa_slug`).
- Em `returnCart`: limpar também `empresa_slug` e `tipo_responsavel`.
- Registrar `tipo` no `cart_history.action` e payload normalmente.

## Mudanças na UI — `ElectricCartsPage.tsx`

### 1. Catálogo de parceiros
Novo módulo `src/lib/partners.ts` exportando `PARTNERS` (slug, nome, logo importada como ES module) e helper `getPartner(slug)`.

### 2. Diálogo de Retirada
Adicionar um seletor de **tipo de retirada** no topo do diálogo:

```text
[ Membro Fenasoja ] [ Empresa Parceira ]   ← Tabs/SegmentedControl
```

- **Membro Fenasoja**: mantém UI atual (Carrinho + Quem retira + Comissão derivada + Horário).
- **Empresa Parceira**: mostra Carrinho + Select de empresa (cards com logo + nome) + Horário.

Validação:
- Interno: exige `cartId` + `userId`.
- Empresa: exige `cartId` + `empresa_slug`.

### 3. Card do Carrinho
Quando `status = 'em_uso'`:
- **Fluxo interno** (atual): avatar do responsável + comissão (sem alteração).
- **Fluxo empresa**: substitui o bloco do responsável por uma linha com:
  - Logo (32×32, `object-contain`, fundo branco com leve borda) + nome da empresa em destaque.
  - Badge "Empresa parceira" pequena.

Layout permanece idêntico em altura para não quebrar o grid.

### 4. Histórico
`CartHistoryContent` já lê `after_data`. Adicionar render: se entry tem `empresa_slug`, mostrar nome da empresa + logo mini em vez do nome do membro. Sem alteração estrutural.

## Estrutura visual (card em uso por empresa)

```text
┌────────────────────────────────────────┐
│ ⚡ ELE-0003           [✎] [Em uso]     │
│                                        │
│ ┌──────┐                               │
│ │ LOGO │ Coopermil                     │
│ │      │ Empresa parceira              │
│ └──────┘                               │
│                                        │
│ Retirado: 28/04/2026 14:32             │
│                                        │
│ [           Devolver           ]       │
└────────────────────────────────────────┘
```

## Arquivos afetados

- **Migration nova** — adiciona `tipo_responsavel` e `empresa_slug` em `electric_carts`.
- **Novos assets** — `src/assets/partners/{coopermil.png, banrisul.png, celena.jpg, sicredi.png}` copiados dos uploads.
- **Novo arquivo** — `src/lib/partners.ts` (catálogo + helpers).
- **Editado** — `src/hooks/useElectricCarts.ts` (pickup/returnCart com suporte a empresa).
- **Editado** — `src/pages/ElectricCartsPage.tsx` (Tabs no diálogo de retirada, render do card e do histórico).

## Validação pós-implementação

1. Retirar para membro interno → comportamento idêntico ao atual.
2. Retirar para Coopermil → card mostra logo Coopermil + nome.
3. Devolver carrinho de empresa → volta para "Disponível", sem dados residuais.
4. Histórico do carrinho registra ambos os fluxos corretamente.
5. Sem regressões nos contadores e na aba "Autorizados".
