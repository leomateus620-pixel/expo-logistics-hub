# Diretrizes de UI/UX — Sistema Modular de Comissões Fenasoja

## Conceito visual

O sistema modular adota uma linguagem **premium institucional**, com base em verde profundo, dourado elegante, superfícies neutras e o padrão de **liquid glass**. A meta é transmitir confiança, operação organizada e evolução contínua, mantendo a Comissão de Logística como referência visual de centro de comando.

Princípios principais:

- **Clareza antes do efeito:** blur, brilho e profundidade devem reforçar hierarquia, não competir com o conteúdo.
- **Vidro líquido controlado:** superfícies translúcidas com bordas finas, reflexos suaves e sombras físicas.
- **Profundidade operacional:** cards e botões têm hover com elevação curta, active com sensação de pressão e entrada suave.
- **Unidade institucional:** toda comissão compartilha base visual, tipografia, radius, espaçamentos e estados.
- **Sotaque por comissão:** cores de apoio diferenciam contexto sem criar identidades paralelas.

## Tokens e superfícies

Classes utilitárias globais:

- `surface-primary`: superfície principal elevada, indicada para headers e áreas estratégicas.
- `surface-secondary`: superfície de apoio para agrupamentos internos.
- `liquid-glass-card`: card translúcido com sombra premium e microinteração.
- `premium-surface`: bloco de destaque com borda refinada e brilho discreto.
- `glass-panel`: painel sobre imagem ou fundo escuro, usado no portal e login.
- `premium-shadow`: sombra padrão para hierarquia alta.
- `gold-outline`: contorno sutil em dourado.
- `interactive-lift`: hover/active padronizado para elementos clicáveis.
- `focus-ring`: foco acessível e consistente.

## Identidade por comissão

A diferenciação visual é centralizada no `commissionRegistry`, via `visual`:

- `accentColor`: cor de referência.
- `accentGradient`: gradiente sutil da comissão.
- `iconBackground`: fundo dos ícones.
- `surfaceTint`: tint de superfícies futuras.
- `chartThemeKey`: chave para gráficos futuros.
- `motionHint`: direção semântica da experiência.

Diretrizes por comissão:

| Comissão | Direção visual |
| --- | --- |
| Logística | Verde + dourado, centro de comando, mobilidade e profundidade 3D mais forte. |
| Gastronomia | Tom quente, acolhedor e sofisticado. |
| Infraestrutura | Sólido, técnico e estrutural. |
| Serviços | Limpo, funcional e operacional. |
| Arte e Cultura | Expressivo, elegante e orientado à programação. |
| Novas Gerações | Leve, otimista e educacional. |
| Segurança | Sóbrio, firme e orientado a monitoramento. |
| Limpeza | Claro, organizado e rotineiro. |
| Financeiro Gerencial | Executivo, dourado e restrito. |

## Menus e nomenclatura

- Rótulos devem estar em PT-BR com acentuação correta.
- O primeiro item deve indicar contexto de painel: `Painel Operacional`, `Painel da Comissão` ou `Painel Financeiro`.
- Menus devem usar linguagem orientada ao trabalho real da comissão.
- Rotas e slugs técnicos devem permanecer sem acento para preservar compatibilidade.
- A sidebar deve destacar claramente o item ativo com dourado, sombra sutil e barra lateral.

## Status

Status visuais atuais:

- `Ativo`: verde, para módulos operacionais.
- `Em estruturação`: dourado, para placeholders preparados para evolução.
- `Acesso restrito`: vermelho controlado, para áreas sensíveis.

Não usar status para simular dados reais. Status é institucional e derivado do registry.

## Componentes base

Componentes e padrões principais:

- `CommissionCard`: card de entrada do portal com badge, ícone, CTA e profundidade.
- `CommissionLayout`: canvas interno das comissões com fundo operacional e espaçamento responsivo.
- `CommissionSidebar`: navegação premium com estado ativo, versão mobile e agrupamento claro.
- `CommissionDashboardPlaceholder`: módulo realista sem dados reais, com hero, métricas previstas, menus e próximos passos.
- `AdminFrame`: estrutura executiva da área administrativa.
- Páginas admin: usar cards consolidados, leitura rápida e CTAs objetivos.

## Responsividade

Critérios mínimos:

- Portal: 1 coluna em mobile, 2 em tablets e 3/4 em desktop.
- Login: card único em mobile e composição editorial em desktop.
- Sidebar: drawer mobile com overlay, foco visível e botão de abertura persistente.
- Placeholders: hero empilha em mobile e cards mantêm leitura sem truncar conteúdo essencial.
- Admin: métricas em grid fluido e navegação com quebra segura de linha.

## Microinterações

- Hover: elevação curta e sombra mais definida.
- Active: leve compressão (`scale`) para feedback físico.
- Entrada: `soft-rise` ou `portal-card-enter` sem delays longos.
- Respeitar `prefers-reduced-motion`.
- Não aumentar blur de forma que prejudique performance mobile.

## Acessibilidade

- Usar `aria-label` em navegações contextuais e botões apenas com ícone.
- Manter `focus-ring` nos elementos interativos.
- Preservar contraste de texto sobre vidro.
- Campos de login devem ter labels visíveis, `autoComplete` e mensagens de erro com `role="alert"`.
- Evitar depender somente de cor para comunicar sensibilidade ou status.

## Boas práticas para evolução

1. Não duplicar temas fora do registry.
2. Não criar módulos funcionais completos dentro de placeholders.
3. Não alterar slugs/rotas para adicionar acentos.
4. Antes de criar novos cards, tentar compor com `liquid-glass-card`, `premium-surface` e `interactive-lift`.
5. Gráficos futuros devem usar a chave `chartThemeKey` e preservar legibilidade de eixos, tooltips e legendas.
6. A Logística deve continuar sendo a referência premium para dashboards executivos e operação em tempo real.
