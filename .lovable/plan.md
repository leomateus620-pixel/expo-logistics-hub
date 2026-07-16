## Diagnóstico

Inspeção do DOM ao vivo revelou o bug real: **todos os itens inativos do menu estão com `color: oklch(0.2107 0.062 255.67)`**, exatamente a mesma cor do fundo azul-marinho da sidebar (`--brand-navy-900`). Por isso os nomes "somem" e sobram só os badges laranja "12" e "54" flutuando — dando a impressão de manchas/sobreposições estranhas.

Causa: as classes `text-sidebar-foreground/68`, `/45`, `/40`, `/42`, `/48` usadas em `src/components/Sidebar.tsx` não estão sendo geradas corretamente pelo Tailwind (valores de opacidade fora da escala padrão em combinação com token customizado), então a cor cai para o `foreground` herdado do Layout — que é navy. Os rótulos de grupo aparecem só porque `tracking-wider` + tamanho pequeno + antialias dão contraste residual.

## Correções

**`src/components/Sidebar.tsx`**
1. Trocar todas as classes de cor que usam opacidade não-padrão (`/68`, `/45`, `/40`, `/42`, `/48`) por uma abordagem confiável: usar o token `text-sidebar-foreground` puro em conjunto com opacidade padrão (`/70`, `/50`, `/40`) ou inline `style={{ color: 'oklch(var(--sidebar-foreground) / 0.75)' }}` nos elementos-chave (labels de grupo, itens inativos, botão Sair).
2. Item ativo: manter fundo `bg-sidebar-accent` mas usar `text-sidebar-accent-foreground` explícito com opacidade 1 e reforçar com `!important` via classe custom se necessário.
3. Ícone do item ativo: aplicar cor `text-action` (laranja) — o resto dos ícones herda a mesma cor do texto para consistência.

**Refinamento visual (harmônico, sem bugs)**
4. Barra indicadora do item ativo (`::before` em `.premium-nav-link[aria-current='page']`): manter a barra laranja lateral esquerda (3px, glow suave) — já existe em `src/index.css`, apenas garantir contraste.
5. Estado ativo: substituir o fundo sólido `bg-sidebar-accent` por um degradê sutil `linear-gradient(90deg, oklch(var(--sidebar-accent)/0.9), oklch(var(--sidebar-accent)/0.55))` com borda esquerda destacada — cria hierarquia sem parecer bloco pesado.
6. Hover inativo: `background: oklch(var(--sidebar-foreground) / 0.06)` + leve translação horizontal (`translate-x-0.5`).
7. Badges (contadores 12/54): reduzir para `h-4 min-w-4 text-[9px]`, alinhados verticalmente no meio da linha, para não parecerem soltos.
8. Espaçamento vertical dos itens: `py-2.5` → uniformizar em desktop e mobile; separadores de grupo com `mt-3` para respiro.

**Sem alterações fora da sidebar**
- Nenhum arquivo de rota, capabilities, backend ou dados é tocado.
- Não mexer em tokens globais (`tokens.css`) para não impactar outros componentes.

## Resultado esperado

- Todos os nomes de menu (Dashboard, Mapa Comercial, Transportes, Veículos, Configurações etc.) legíveis em creme sobre navy.
- Item ativo destacado com degradê suave + barra laranja lateral + ícone laranja.
- Badges compactos e alinhados dentro da linha.
- Sem "manchas verdes" ou textos apagados; visual coeso com a identidade Fenasoja (navy + creme + laranja de ação).
