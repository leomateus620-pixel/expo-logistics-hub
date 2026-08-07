# Login "Agenda Restaurante e Arena" — limpeza e destaque tipográfico

## Objetivo
Deixar a tela de login do módulo Restaurante e Arena limpa, premium e focada apenas no essencial: a marca, a assinatura "Agenda Restaurante e Arena" e os campos de credenciais.

## O que sai
- Os 4 cards de capacidades do lado esquerdo (Restaurante e Arena, Conflitos em tempo real, Operação rastreável, Contrapartidas seguras).
- Badge "Módulo selecionado / Agenda Restaurante e Arena" no topo do cartão de login.
- Selo "Identificação segura".
- Bloco "Acesso restrito — solicite suas credenciais ao administrador".
- Texto redundante "Use suas credenciais institucionais para continuar em Agenda Restaurante e Arena".

Tudo isso apenas para este módulo — os demais logins (Fenasoja, Mapa Comercial, comissões) permanecem exatamente como estão.

## O que fica e ganha destaque
- Lado esquerdo: marca FENASOJA + assinatura "Agenda Restaurante e Arena" em escala maior, com uma linha de apoio curta abaixo.
- Cartão de credenciais: título "Entrar" com maior peso tipográfico, rótulos E-mail/Senha mais nítidos, campos com altura e respiro maiores, foco em âmbar/cobre, e botão principal com mais presença.
- Rodapé do cartão mantém apenas o link "Voltar ao portal", discreto e alinhado.

## Assinatura "Agenda Restaurante e Arena"
Tratamento exclusivo do módulo, construído sobre o componente de wordmark existente:
- "Agenda" em creme claro, peso médio, com leve espaçamento de letras — funciona como sobrelinha.
- "Restaurante e Arena" em bloco maior, gradiente cobre/âmbar quente, com brilho suave e sombra de profundidade contida (clean, sem exagero).
- Filete horizontal fino sob o nome, do cobre ao transparente, criando a "cobertura" organizada.
- Selo/etiqueta discreta acima da assinatura ("Operação de espaços") para dar hierarquia sem poluir.
- Escala responsiva: assinatura ocupa protagonismo em desktop e reduz de forma proporcional no mobile, sem quebrar em três linhas.

## Detalhes técnicos
- `src/components/auth/VenueEventsLoginHero.tsx`: remover a lista `venueCapabilities` e sua renderização; reorganizar a hierarquia (etiqueta, wordmark, subtítulo).
- `src/pages/LoginPage.tsx`: para `isVenueEventsLogin`, ocultar `auth-panel__brand-row` (badge de módulo), o eyebrow "Identificação segura", a `auth-restricted-note` e simplificar o parágrafo de apoio — seguindo o mesmo padrão condicional já usado por `isCommercialMapLogin`/`isCommissionMapLogin`. Remover também a constante `venueCapabilities` não utilizada.
- `src/styles/agenda-wordmark.css`: nova escala `hero` para a variante `venue` (tamanho maior, sobrelinha "Agenda", filete refinado).
- `src/styles/login-experience.css`: bloco `[data-module='eventos-restaurante-arena']` com espaçamento do herói sem os cards, tipografia reforçada do "Entrar", campos e botão com tratamento cobre/âmbar, e ajustes responsivos.
- Sem mudanças de rota, autenticação ou lógica de negócio.
