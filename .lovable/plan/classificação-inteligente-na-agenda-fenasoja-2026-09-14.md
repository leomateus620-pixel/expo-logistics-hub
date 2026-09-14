# Classificação inteligente na Agenda Fenasoja

Transformar o bloco "Classificação" do cadastro de eventos em algo que o sistema resolve sozinho: o usuário escreve o título e Categoria e Tipo já aparecem preenchidos, sempre editáveis. Status e Prioridade continuam manuais.

## Situação atual (verificada)

- No formulário, os quatro campos (Categoria, Status, Prioridade, Tipo) são seletores manuais, lado a lado.
- Existem hoje 8 categorias: Governança, Programação, Infraestrutura, Logística, Comunicação, Comercial, Cerimonial, Representações.
- Os 5 Tipos (Evento, Reunião, Prazo, Decisão, Marco) existem só na tela — não há campo próprio no banco; eles são convertidos para um "tipo de origem" antigo (13 valores) ao salvar.
- No banco, a categoria é texto livre: há 51 variações entre os 244 eventos ("Reuniões institucionais", "Feriados e datas especiais", "Planejamento, comissões, mídia e captação"…). Existe uma coluna de chave canônica (`category_key`) criada, mas preenchida em apenas 20 eventos.
- A categoria escolhida na tela hoje só é usada para cor/filtro; ao salvar, o texto antigo prevalece — ou seja, trocar a Categoria manualmente num evento antigo não fica gravado. Isso será corrigido.

## O que será feito

### 1. Nova taxonomia (10 categorias)

Governança e Gestão · Programação e Eventos · Infraestrutura e Operações · Logística e Mobilidade · Comunicação e Marketing · Comercial e Patrocínios · Cerimonial e Protocolo · Relações Institucionais e Representações · Financeiro e Administrativo · Tecnologia e Sistemas.

As 8 antigas viram as novas equivalentes (Comunicação → Comunicação e Marketing, Representações → Relações Institucionais e Representações, etc.). Nada é apagado.

### 2. Conversão dos eventos existentes

Uma conversão única grava a categoria canônica nos 244 eventos, classificando as 51 variações de texto pelo próprio motor. O texto original é preservado (continua visível como "origem"), então nada se perde e nenhum evento some dos filtros ou painéis.

### 3. Motor de classificação

Quatro camadas, nessa ordem, com o resultado em milésimos de segundo:

1. Regras determinísticas de intenção — analisa a estrutura da frase, não palavras soltas ("Reunião para decidir patrocínio" = Reunião, não Decisão).
2. Contexto — comissões/assessorias vinculadas, pessoas, responsável, local.
3. Regra especial de Governança — Comissão Central, presidência, deliberação estratégica pesam alto, mas o significado do evento vence a simples presença de alguém da Central.
4. Reforço por IA apenas quando a confiança ficar baixa (raro), sem travar o formulário: a sugestão local já aparece e é substituída se a IA discordar.

Cada resultado carrega confiança e origem do sinal, usados internamente (sem porcentagem na tela).

### 4. Comportamento no formulário

- Classificação roda com atraso de ~450 ms depois da digitação, sem piscar nem mudar o tamanho do bloco.
- Categoria e Tipo mostram um selo discreto "✦ Sugestão automática".
- Ao trocar manualmente um dos dois, aquele campo congela e nunca mais é sobrescrito; aparece a ação "Usar sugestão automática" para voltar ao modo automático. Os dois campos são independentes.
- Ao editar um evento já salvo, os valores gravados são mantidos; só há reclassificação se o usuário tocar em "Atualizar classificação".
- No campo Tipo, um ícone de informação explica os 5 tipos; dentro do seletor cada opção traz uma linha de definição, com destaque para Marco (conclusão/abertura de etapa, não "evento importante").

### 5. Correção dos seletores no mobile

Seletores viram folha inferior (bottom sheet) no celular, com altura limitada, rolagem própria, área segura respeitada, sem cobrir Cancelar/Criar evento e sem conflito de camadas. Teclado, Tab, ESC, Enter, foco e leitor de tela mantidos.

### 6. Testes

- Unitários do motor: os ~20 casos citados, os 5 casos de ambiguidade e os 5 da regra da Comissão Central.
- Integração do formulário: sugestão ao digitar, refinamento, congelamento após edição manual, volta ao automático, persistência ao salvar e ao reabrir.
- Navegador real em 320/360/375/390/393/414/430 px e desktop, verificando seletor dentro da tela e botões acessíveis.
- Regressão: filtros, painéis, calendário, cards, linha do tempo e agendas das comissões.

## Detalhes técnicos

- Nova fonte de verdade: `src/lib/cronograma-classification/` com `taxonomy.ts` (10 categorias + mapa de compatibilidade), `intent-rules.ts`, `context-signals.ts`, `engine.ts` (retorna `{ value, confidence, source[] }`) e `ai-refine.ts` (edge function, só em baixa confiança, com cache e cancelamento).
- Hook `useEventClassification` no `EventForm`, com debounce, cancelamento e memo por assinatura de entrada; estado `autoClassification.{category,type}` por campo.
- Persistência: passa a gravar `category_key` (categoria canônica) e um novo `event_kind` para o Tipo, mais metadados não críticos `category_source`/`kind_source`. `category`, `event_type`, `status` e `priority` permanecem para compatibilidade; `visualEventToDraft`/`visualEventToSourceUpdates` deixam de sobrescrever a escolha do usuário com o texto de origem.
- Migração: colunas novas + backfill de `category_key`/`event_kind` para os 244 eventos, com GRANTs/RLS inalterados.
- Leitura: `fromDbRow` e `modelAdapter` passam a preferir os campos canônicos e só caem na heurística atual quando estiverem vazios, garantindo que eventos antigos continuem renderizando igual.
- Seletor mobile: componente `ClassificationSelect` baseado em Drawer/Sheet já existente no projeto, reutilizado pelos quatro campos.
- Observabilidade em desenvolvimento apenas (`import.meta.env.DEV`), sem logs em produção.
