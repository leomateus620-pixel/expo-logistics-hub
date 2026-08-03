# Registro organizacional oficial Fenasoja 2028 (fonte única compartilhada)

Objetivo: uma única lista oficial de Comissões e Assessorias (com seus responsáveis institucionais) consumida por "Cronograma e Eventos" e "Eventos Restaurante e Arena", sem listas fixas no frontend e sem perder eventos já cadastrados.

## Diagnóstico do que já existe

- Tabela `commissions` (por organização, com `slug`, `is_active`) já é o registro central usado pelo Cronograma — hoje com 30 registros e nomes em caixa alta.
- Vínculos de evento já são relacionais: `cronograma_evento_comissoes` (68 vínculos, com papel `principal`/`participante`) e `cronograma_evento_responsaveis`.
- O módulo Restaurante e Arena não tem campo de comissão: usa `venue_stakeholders` (que já aceita o tipo `comissao`) como organização solicitante.
- Faltam na base: Soy Summit, Assessoria de Sistemas, Mercosul, Relacionamento e Experiência, Acolhimento e Bem Comum, Relações Estratégicas, Gastronomia (existe), Arte e Cultura (existe) e o cadastro de responsáveis.

## 1. Registro central

Reutilizar `commissions` (nada de tabela paralela), acrescentando:
- `unit_type`: `comissao` ou `assessoria`;
- `display_order`, `is_official` e `is_legacy` (unidade histórica que não aparece para novos cadastros);
- `normalized_name` gerado (sem acento, sem pontuação, caixa única) para deduplicação.

Nova tabela `commission_responsibles`: unidade, nome exibido, tipo (`pessoa` ou `equipe`), papel (`principal`, `corresponsavel`, `copresidente`, `equipe_apoio`), `user_id` quando o nome corresponder a um membro já cadastrado, ordem e ativo. Permissões: leitura para membros da organização; escrita apenas admin/gestor.

## 2. Sincronização idempotente

Migração + rotina de sincronização que:
- casa por `normalized_name`/slug e renomeia as unidades equivalentes para o nome oficial, preservando o `id` e todos os vínculos de eventos (ex.: "RECEPÇÃO e CERIMONIAL" → "Recepção e Eventos", "INOVAÇÃO E EXPERIÊNCIA" → "Inovação e Tecnologia", "ASSESSORIA PROJETOS e CAPTAÇÕES INSTITUCIONAIS" → "Assessoria de Projetos e Captações");
- cria as unidades oficiais faltantes (inclui Soy Summit);
- mantém CENTRAL, ETNIAS e RELAÇÕES INSTITUCIONAIS ativas, marcadas como legado;
- insere os responsáveis oficiais (7 Assessorias e 26 Comissões), incluindo os casos múltiplos: Imprensa (2), Projetos e Captações (1 pessoa + Equipe do EP como equipe), Jurídica (2), Relações Internacionais (3), Relações Estratégicas (2);
- espelha cada unidade oficial em `venue_stakeholders` com tipo `comissao`, reaproveitando o registro existente pelo nome normalizado;
- pode rodar quantas vezes for necessário sem duplicar nem apagar nada.

Nomes exibidos em capitalização normal ("Assessoria de Relações Internacionais"), acentuação e grafia oficiais preservadas.

## 3. Seletor "Comissão ou Assessoria responsável"

Componente único e pesquisável, usado nos dois módulos:
- resultados agrupados em Comissões e Assessorias, com rolagem controlada;
- cada opção mostra nome, tipo e responsáveis ("Relações Estratégicas · Comissão · Miguel Nedel e Diana Nedel");
- busca por nome da unidade ou do responsável, ignorando acentos e maiúsculas, com correspondência parcial;
- unidades legado só aparecem em eventos que já as usam;
- teclado, foco visível, rótulo associado e leitura por leitor de tela; no celular ocupa a largura toda, com alvos de toque de ~44px.

Após selecionar, um resumo abaixo do campo mostra a unidade e a lista completa de responsáveis institucionais (sem esconder nomes atrás de "+2"), com ação de trocar/remover.

## 4. Cronograma e Eventos

- `EventForm` passa a usar o novo seletor, mantendo o modelo relacional atual (unidade principal + adicionais, sem duplicar).
- Responsáveis oficiais podem ser sugeridos como responsáveis do evento, com confirmação — nunca sobrescrevendo um responsável já escolhido manualmente.
- Filtros da Timeline, do Dashboard, visões por comissão e resumos passam a ler o registro oficial; nenhuma lista fixa permanece.

## 5. Eventos Restaurante e Arena

- Campo de organização solicitante passa a usar o mesmo seletor, oferecendo as Comissões e Assessorias oficiais (espelhadas como stakeholders) junto dos patrocinadores/parceiros já existentes.
- Detalhe do evento, filtros e relatórios exibem unidade + responsáveis com os mesmos nomes do Cronograma.

## 6. Testes e validação

Testes automatizados para: presença das 7 Assessorias e das 26 Comissões (incluindo Soy Summit), busca por unidade e por pessoa, seleção com 1, 2 e 3 responsáveis, caso pessoa + equipe, edição de evento existente sem perder o responsável operacional, ausência de opções duplicadas, filtros usando o registro novo, idempotência da sincronização e restrição de permissões. Validação visual em 360px, 768px e 1440px nos dois módulos.

## Entrega final

Relatório com diagnóstico, entidades reaproveitadas/criadas, unidades registradas, casos de múltiplos responsáveis, mapeamento de nomes legados, componentes alterados e confirmação de que nenhum evento foi perdido ou duplicado.
