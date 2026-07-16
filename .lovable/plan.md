## Escopo
Refinar a barra superior do módulo **Cronograma e Eventos** (`src/components/cronograma-eventos/CronogramaModuleShell.tsx`) — hoje ela aparece opaca, com hierarquia visual fraca e o rótulo "Central temporal independente" poluindo a leitura.

## Diagnóstico do bug visual
- Fundo `.cronograma-module-bar` usa uma cor plana translúcida sobre o hero azul, sem contraste — os textos ficam apagados.
- O selo do calendário e o botão "Portal" competem visualmente com o título.
- Sobrescrita "Central temporal independente" é ruído; a informação relevante é apenas **Cronograma e Eventos** + ciclo.

## Mudanças

**1. `CronogramaModuleShell.tsx`**
- Remover completamente o parágrafo "Central temporal independente".
- Trocar o container `cronograma-module-mark` (ícone calendário) por uma tile 3D com física de luz (gradient + inset highlight + shadow ambient/contact).
- Reorganizar hierarquia: marca Fenasoja → divisor → tile 3D + título grande "Cronograma e Eventos" em uma única linha limpa.
- Bloco direito (ciclo oficial) ganha um chip 3D compacto com o mesmo tratamento (glass premium), visível também em breakpoints menores (sm+).
- Botão "Sair" recebe tratamento 3D consistente (borda superior clara, sombra de contato, hover press).

**2. `src/styles/cronograma-workspace.css`** (arquivo já dedicado ao módulo)
- Reescrever `.cronograma-module-bar`:
  - Fundo em degradê linear vertical (`oklch(var(--brand-navy-900)) → oklch(var(--brand-navy-950))`) + camada `radial-gradient` sutil laranja no canto ativo.
  - `backdrop-filter: blur(20px) saturate(1.4)`.
  - Sombra inferior de profundidade `0 12px 32px -18px rgb(0 0 0 / 0.6)` + linha inferior 1px `oklch(var(--brand-orange-500)/0.35)` para "acabamento" físico.
  - Highlight interno superior `inset 0 1px 0 oklch(1 0 0 / 0.08)` — luz simulada.
- Nova classe `.cronograma-module-tile-3d` (para o ícone calendário):
  - Fundo em degradê ouro→laranja com `inset 0 1px 0 rgb(255 255 255 / 0.35)`, sombra de contato `0 6px 12px -4px oklch(var(--brand-orange-500) / 0.5)` e sombra ambiente.
  - `transform: perspective(400px) rotateX(6deg)` em repouso, `hover: rotateX(0deg) translateY(-1px)` — física de "levantar".
  - `transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1)` (spring).
- Nova classe `.cronograma-module-chip-3d` (para o chip "Ciclo oficial"):
  - Glass escuro com borda `oklch(var(--brand-gold-500)/0.25)`, inset highlight, sombra de profundidade.
- `.cronograma-module-back` e `.cronograma-module-signout`:
  - Ganham `box-shadow` de contato + inset highlight superior + hover com `translateY(-1px)` e press `translateY(0)` (afundamento físico ao clicar via `:active`).

**3. Tipografia**
- Título "Cronograma e Eventos" para `text-base sm:text-lg font-bold tracking-tight text-white` com pequena `text-shadow: 0 1px 0 rgb(0 0 0 / 0.4)` para dar volume.
- Eyebrow "Ciclo oficial" mantém tracking wide, mas cor `oklch(var(--brand-gold-500) / 0.85)` para amarrar com o chip 3D.

## Fora de escopo
- Nenhuma alteração em rotas, dados do cronograma, timeline ou lógica.
- Sem tocar em tokens globais (`tokens.css`) — só CSS dedicado do módulo.
- Sem novas dependências (efeito 3D 100% CSS puro, sem libs de física).

## Resultado esperado
Barra superior com sensação tátil de material físico: relevo, luz superior, sombra de contato, chip do ciclo elevado, ícone calendário com leve inclinação que se nivela no hover. Sem o texto "Central temporal independente". Leitura limpa em mobile e desktop.
