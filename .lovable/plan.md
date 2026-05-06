## Objetivo

Melhorar a UI/UX da seleção de **quem retira** o carrinho elétrico no diálogo "Registrar retirada". Hoje a lista aparece dentro de um `Select` nativo que estoura a tela no mobile (vide screenshots: as opções ficam cortadas pela direita e a busca/scroll ficam apertados acima do diálogo). A mudança é apenas em UI/UX — sem alterar regras de negócio, hooks, RLS ou banco.

## O que muda (resumo)

1. Substituir o `Select` da aba **Autorizado** por um **botão "QUEM RETIRA"** que abre um **menu dedicado** (Sheet bottom no mobile / Dialog no desktop) só para escolher a pessoa.
2. Esse menu terá:
   - Campo de **busca grande e fixo** no topo (autofocus desktop, sem autofocus mobile p/ não abrir teclado de imediato).
   - **Abas internas**: "Autorizados" (lista oficial de `mobility_authorizations` carro elétrico) e "Membros internos" (lista de `org_members`). Padrão: Autorizados.
   - **Lista em linhas grandes** (min-h 56px, full width, quebra de texto), mostrando: nome em destaque, comissão/cargo em segunda linha, badge de status quando não "liberado", e badge "já com carrinho" quando a comissão dela já tem retirada ativa.
   - **Empty state** amigável ("Nenhum resultado para 'X'").
   - Toque na linha **seleciona e fecha** o menu, voltando ao diálogo principal.
3. No diálogo principal, depois de selecionado, o botão "QUEM RETIRA" passa a mostrar o nome escolhido + comissão (chip), com um "x" para limpar.
4. O mesmo padrão é aplicado no `ScooterPickupDialog` (patinetes) para consistência, já que o problema é idêntico.

Tudo isso reaproveita os dados que o `ElectricCartsPage` já calcula (`sortedAuthorizations`, `members`, `getMemberCommission`, `activeByCommission`) — sem mexer nos hooks.

## Componente novo

`src/components/electric-carts/PersonPickerSheet.tsx`

Props:
```ts
{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  authorizations: any[];       // já ordenadas
  members: any[];
  activeByCommission: Map<string, Array<{ codigo: string; nome: string; retiradoPor: string }>>;
  onSelectAuth: (auth: any) => void;     // dispara lógica auth: já existente
  onSelectMember: (member: any) => void; // dispara lógica interna já existente
}
```

Comportamento mobile (priorizado):
- `Sheet side="bottom"` com `h-[92dvh]`, header fixo com título "Selecionar quem retira" + busca, conteúdo com `overflow-y-auto`, footer fixo com botão "Cancelar".
- Linhas com `py-3 px-4`, `border-b border-border/40`, alvo de toque ≥ 48px.
- Sem `autoFocus` no input no mobile (`useIsMobile`) para evitar teclado abrupto; com `autoFocus` no desktop.

Desktop:
- `Dialog` `sm:max-w-lg max-h-[80dvh]`, mesmo conteúdo.

Visual: Liquid Glass leve coerente com o app (`bg-card/95 backdrop-blur-xl`, `border-white/10`, chips para comissão em verde/dourado).

## Edições

- `src/pages/ElectricCartsPage.tsx`
  - Adicionar estado `personPickerOpen`.
  - Trocar o `Select` da aba "interno/Autorizado" (linhas 379–465) por um **trigger button** estilo input mostrando o selecionado (ou "Selecionar pessoa") com ícone de busca.
  - Renderizar `<PersonPickerSheet />` controlado, passando os mesmos handlers que o `onValueChange` atual já executa (apenas mover a lógica de seleção para callbacks).
  - Manter aviso "comissão já com carrinho retirado" igual ao atual logo abaixo do trigger.
  - Manter abas Empresa / Outros sem mudança.

- `src/components/scooters/ScooterPickupDialog.tsx`
  - Mesma substituição nas abas "Autorizado" e "Interno": trigger button + `PersonPickerSheet` (passando `authorizations` de patinete).
  - Reaproveitar o mesmo componente (props já cobrem o caso).

## Verificação

- Testar no preview no viewport 393×697 (atual do usuário): abrir Registrar retirada → tocar "QUEM RETIRA" → confirmar que o sheet ocupa altura adequada, busca funciona, linhas não cortam texto, seleção volta ao diálogo com chip do nome.
- Confirmar no desktop (≥768px) que abre como Dialog centralizado.
- Repetir o teste no `ScootersPage`.

## Fora do escopo

- Sem mudanças em hooks, RPC, RLS, banco ou regras de negócio.
- Sem mexer em outras abas (Empresa / Outros) além de coerência visual mínima do trigger.
