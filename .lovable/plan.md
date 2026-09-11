# Agenda Restaurante e Arena — requerente, tipo livre e leitura compacta

## O que já existe (verificado agora)

- O campo **requerente** já existe no banco (`venue_events.requester_name`, obrigatório) e está preenchido nos 100 eventos atuais (Acisap, Cotrirosa, Sicredi, Rotary…). O que falta é ele aparecer como campo editável no cadastro: hoje ele fica na aba **Vínculos**, apenas como cartão de leitura preenchido automaticamente com o usuário logado.
- O **tipo** hoje é uma lista fixa de 14 opções travada no banco. Só três valores estão em uso: externo (95), institucional (4), patrocinador (1).
- A busca já procura por título, requerente, patrocinador, espaço, contato e telefone.
- Já existe uma regra de maiúsculas do sistema (`toDisplayUpper`) que preserva acentos e não altera e-mails, links e identificadores — será reaproveitada, sem espalhar conversões soltas.
- Os filtros de ano (2026/2027/2028) e a agenda funcionam em memória sobre a lista já carregada, então incluir mês não custa desempenho.

## O que será feito

### 1. Requerente no primeiro passo
- Na aba **Evento**, a ordem passa a ser: Título → Requerente → Tipo do evento → Descrição executiva.
- Requerente vira um campo digitável, com sugestão automática dos requerentes já cadastrados (Acisap, Cotrirosa, Sicredi…) para evitar grafias diferentes da mesma empresa.
- Continua obrigatório, como já é hoje, e some o cartão duplicado da aba Vínculos (o responsável Fenasoja continua lá).
- Aparece nos cartões da Agenda e de Todos os eventos, no detalhe do evento e na busca.

### 2. Tipo do evento vira texto livre
- Campo digitável com sugestões (Jantar empresarial, Seminário, Confraternização, Formatura, Reunião, Palestra…).
- A trava do banco é removida e os valores atuais são convertidos para texto legível: externo → EXTERNO, institucional → INSTITUCIONAL, patrocinador → PATROCINADOR. Nenhum evento perde o tipo.
- O filtro de tipo dos relatórios passa a listar os tipos realmente usados, em vez da lista fixa.

### 3. Tudo em maiúsculas
- Título, requerente, tipo, descrição, observações, contato, área solicitada e notas passam a aparecer e a ser digitados em maiúsculas, com acentos corretos (REUNIÃO, CONFRATERNIZAÇÃO, SÃO JOSÉ).
- Links, e-mails, identificadores e dados técnicos ficam intactos.

### 4. Cartões muito mais compactos
Agenda:

```text
19:00 — 23:30            4H30
SEMINÁRIO
COTRIROSA · RESTAURANTE FENASOJA
                    SOLICITADO ›
```

Todos os eventos:

```text
[14   19:00 → 23:30 · 4H30
 JAN] SORTEIO DA CAMPANHA COMPRE AQUI
      COTRIROSA · RESTAURANTE FENASOJA
      SOLICITADO ›
```

- Menos pílulas, menos molduras dentro de molduras, menos sombra; hierarquia feita por tipografia.
- "Sem vínculo", "Não definido" e "Sem contrapartida" deixam de ocupar espaço próprio: informação ausente fica discreta ou simplesmente não aparece.
- Meta: passar de 1–2 cartões por tela para 4–5 em celulares de 375–430px, mantendo áreas de toque confortáveis.
- Desktop recebe o mesmo desenho, com respiro maior e melhor uso da largura.

### 5. Filtro rápido de mês
- Abaixo dos anos, uma faixa horizontal deslizante: TODOS · JAN · FEV … DEZ, com o mês ativo destacado.
- Tocar no mês filtra na hora, sem botão de aplicar. "TODOS" volta ao ano inteiro.
- Ao trocar de ano, o mês escolhido é mantido.
- Os contadores passam a refletir o resultado real ("SETEMBRO · 5 EVENTOS").
- Restaurante e Arena continuam separados, e ano/mês valem para os dois de forma independente.

### 6. Cabeçalho e resumo da Agenda mais enxutos
- O bloco "Janela / Ocupação" é condensado em uma linha só, e o topo da tela perde altura desnecessária, sem remover busca, logo, troca Restaurante/Arena ou sair.
- O formulário de novo evento recebe espaçamento mais econômico, mantendo os cinco passos e os botões fixos sem cobrir campos.

## Detalhes técnicos

- **Migração**: `venue_events` — remover `venue_events_type_check`, converter os três valores em uso para texto exibível, limitar tamanho (até 80 caracteres) e criar índice para o filtro de tipo. `requester_name` não muda de estrutura.
- **RPC `venue_save_event`**: trocar a validação de lista fixa por validação de texto (obrigatório, tamanho máximo, normalizado em maiúsculas no servidor) e normalizar `requester_name`.
- **Front**: `VenueEventFormDialog` (ordem dos campos, requerente editável com datalist, tipo livre), `venue-operations.ts` (schema Zod: `eventType` de enum para string), `VenueWorkspace.tsx` (estado de filtro ano+mês, contadores, cartões), novo `VenueMonthFilter`, e primitivas compartilhadas de cartão (data, horário, metadados, status) para Agenda e Registro mestre usarem os mesmos tokens.
- **Maiúsculas**: reaproveitar `toDisplayUpper` em um wrapper do módulo aplicado na renderização e na digitação; nada de `.toUpperCase()` espalhado.
- **Busca**: manter o índice em memória já existente, acrescentando tipo e área solicitada ao conjunto pesquisável.
- **CSS**: `venue-events-*.css` — reduzir paddings, alturas de chip e espaçamentos; garantir `min-width: 0`, quebra de texto e ausência de rolagem horizontal.
- **Validação**: testes de unidade (normalização, filtro ano/mês, contadores, tipo livre) e verificação no navegador em 320/375/390/430px, tablet e desktop, criando e editando evento de Restaurante e de Arena, comparando a densidade antes/depois. Nada é publicado em produção.

## Riscos

- Liberar o tipo como texto livre permite grafias diferentes para o mesmo tipo; as sugestões automáticas reduzem isso, mas não impedem.
- A conversão dos tipos é feita uma única vez e preserva os valores atuais; nenhum evento, status, vínculo ou contrapartida é alterado.
