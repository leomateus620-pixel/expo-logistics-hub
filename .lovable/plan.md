# Portal: cronômetro em destaque e wordmark premium

Duas frentes no portal inicial (`/portal`): o card do hero (contagem oficial) e a marca "FENASOJA 2028" do cabeçalho.

## 1. Card da contagem oficial (anexos 1 e 3)

O que sai:
- O wordmark gigante "FENASOJA / 2028" com o grão de soja no "O" dentro do card do hero (`FenasojaPortalWordmark`). O card passa a ser exclusivamente o cronômetro.

O que entra, no espaço liberado:
- Cabeçalho do card com "ABERTURA OFICIAL EM" em tipografia dourada larga, com filete/brilho decorativo acima, e entrada em animação leve e fluida (fade + subida curta, escalonada com a linha de data), respeitando `prefers-reduced-motion`.
- Linha da data em pílula contornada: ícone de calendário dourado + "29 de abril de 2028, às 10h · Brasília".
- Quatro blocos DIAS / HORAS / MIN / SEG em vidro azul-noite com borda dourada, dígitos dourados de grande porte com brilho e sombra interna, filete luminoso sob cada número e rótulo em caixa alta espaçada.
- Botão "Abrir contagem" repaginado como pílula dourada sólida de alto contraste, com ícone circular escuro (seta) e halo suave.

Responsividade:
- Desktop: 4 colunas, dígitos grandes.
- Mobile (≤480px): grade 2×2 com escalas fluidas (`clamp`), altura de toque adequada e botão em largura total.

## 2. Marca do cabeçalho (anexos 2 e 4)

Refino de `FenasojaBrand` (variantes standard e compact) na barra do portal:
- "FENASOJA" com acabamento metálico prateado (gradiente claro com highlight superior e sombra inferior), peso 900, tracking apertado e contraste forte sobre o fundo navy.
- Pílula "2028" laranja sólida, texto navy escuro, com brilho externo suave e leve relevo — contraste conforme o anexo 4.
- Marca/ícone com halo sutil e alinhamento óptico com a linha de texto.
- Escalas fluidas para mobile e desktop, sem quebra de linha e sem alterar o subtítulo existente.

## Detalhes técnicos

- Componentes: `src/components/portal/FenasojaPortalHero.tsx` (remove o wordmark), `src/components/countdown/OfficialCountdownCompact.tsx` e `OfficialCountdownDigits.tsx` (estrutura do cabeçalho animado e dos blocos), `src/components/brand/FenasojaBrand.tsx` (classes da marca).
- Estilos: `src/styles/commission-portal.css` (hero + wordmark do cabeçalho), `src/styles/official-countdown-digits.css` (blocos de dígitos). Remoção das regras `.portal-wordmark*` / `.portal-soybean*` que ficarem sem uso no contexto do hero; `FenasojaPortalWordmark.tsx` é excluído se não houver outro consumidor.
- Cores via tokens existentes (`--brand-gold-*`, `--brand-orange-500`, `--brand-navy-900`, `--portal-*`); sem cores cruas novas fora do arquivo de estilos do portal.
- Nenhuma mudança de lógica: `useFenasojaCountdown`, rotas e navegação para `/contagem` permanecem iguais.

## Testes

- Atualizar `src/test/commissionPortal.test.tsx` (asserção de `[data-testid="portal-soybean"]` no hero) e `src/test/commissionPortalAccessibility.test.ts` (referências a `portal-wordmark`/`portal-soybean`) para o novo hero focado no cronômetro.
- Validar build/TypeScript e a suíte do portal.
