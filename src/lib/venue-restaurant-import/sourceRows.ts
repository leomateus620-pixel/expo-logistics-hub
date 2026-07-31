/**
 * Transcrição literal da AGENDA RESTAURANTE FENASOJA (DOCX).
 *
 * Cada item preserva o texto bruto de cada célula exatamente como consta no
 * documento, sem qualquer normalização. Toda a interpretação semântica acontece
 * em `parser.ts`, para que a fonte permaneça auditável.
 *
 * `row` é o número sequencial da linha no documento (1..99) e é usado tanto na
 * impressão digital de importação quanto no relatório de reconciliação.
 */

export const SOURCE_DOCUMENT = "AGENDA_RESTAURANTE_FENASOJA.docx";

export interface RestaurantSourceRow {
  /** Número sequencial da linha no documento (1-indexado). */
  row: number;
  /** Bloco de ano ao qual a linha pertence no documento. */
  year: number;
  /** Coluna DATA. */
  date: string;
  /** Coluna SOLICITANTE. */
  requester: string;
  /** Coluna EVENTO. */
  event: string;
  /** Coluna TURNO. */
  shift: string;
  /** Coluna CONF. */
  confirmation: string;
  /** Coluna CONT. */
  contract: string;
}

export const RESTAURANT_SOURCE_ROWS: RestaurantSourceRow[] = [
  // ---------------------------------------------------------------- 2025 (35)
  { row: 1, year: 2025, date: "26 e 27 de março", requester: "Acisap – Ana (entregam limpo) Patrocinador", event: "Almoço de Ideias", shift: "Meio-dia", confirmation: "OK", contract: "acerto" },
  { row: 2, year: 2025, date: "03 de abril", requester: "Coopermil – Iriceu (taxas)", event: "Almoço", shift: "Meio-dia", confirmation: "ok", contract: "pago" },
  { row: 3, year: 2025, date: "05 de abril", requester: "Rotary – Cassio Feltes (3 salários)", event: "Baile do Baltazar", shift: "Noite", confirmation: "OK", contract: "PAGO" },
  { row: 4, year: 2025, date: "12 de abril", requester: "Sandro Sawicki – 99986 9860 (6 salários)", event: "Aniversário 15 anos filha", shift: "Noite", confirmation: "OK", contract: "PAGO" },
  // Linha com colunas deslocadas no documento original: o evento ocupou a coluna
  // SOLICITANTE, o turno ocupou EVENTO e a confirmação ocupou TURNO.
  { row: 5, year: 2025, date: "15 de abril", requester: "Lançamento Indumóveis", event: "Noite", shift: "ok", confirmation: "", contract: "" },
  { row: 6, year: 2025, date: "01 de maio", requester: "Bárbara 991289567 F. Pedrinho (taxas)", event: "Evento Pedrinho Farmácias", shift: "Meio dia", confirmation: "ok", contract: "pago" },
  { row: 7, year: 2025, date: "16 a 25 de maio", requester: "INDUMOVEIS", event: "", shift: "", confirmation: "", contract: "" },
  { row: 8, year: 2025, date: "31 de maio", requester: "Rotary – Anelize 51 99724 9968 (2,5 salários)", event: "Feijoada da Cao", shift: "Meio-dia", confirmation: "ok", contract: "ok" },
  { row: 9, year: 2025, date: "03 de junho (terça)", requester: "Fenasoja", event: "Evento com imprensa e voluntários", shift: "18;30", confirmation: "ok", contract: "" },
  { row: 10, year: 2025, date: "07 de junho", requester: "Rotary S. Rosa Junior – Carol (3 salários)", event: "Café Colonial", shift: "Noite", confirmation: "ok", contract: "pago" },
  { row: 11, year: 2025, date: "12 Junho", requester: "Cotrirosa – Solange 99918 9983 – (taxas 1.500,00 – cobrar duas taxas 2 dias, 11 e 12)", event: "", shift: "Dia", confirmation: "ok", contract: "pago" },
  { row: 12, year: 2025, date: "19 a 22 de junho", requester: "Igreja Batista – Mathias 99118 6866 beneficente -(3 salários)", event: "Conferência Impacto", shift: "", confirmation: "Ok", contract: "PAGO" },
  { row: 13, year: 2025, date: "26 junho", requester: "Fiergs", event: "palestra", shift: "Dia", confirmation: "Ok", contract: "" },
  { row: 14, year: 2025, date: "27 junho", requester: "ALIBEM", event: "", shift: "", confirmation: "OK", contract: "" },
  { row: 15, year: 2025, date: "19 e 20 de julho", requester: "Cláudio Capaverde 9 8404 6667 Em nome da Câmara Vereadores 2 taxas – entregam limpo (cobrar luz)", event: "Campeonato Estadual de Truco 18h de sábado início", shift: "Dia/ noite", confirmation: "ok", contract: "PAGO" },
  { row: 16, year: 2025, date: "06 a 10 Agosto", requester: "HORTIGRANJEIROS", event: "", shift: "", confirmation: "", contract: "" },
  { row: 17, year: 2025, date: "16 de agosto", requester: "Rotary Santa Rosa (3 salários)", event: "Baile", shift: "Dia/ Noite", confirmation: "ok", contract: "" },
  { row: 18, year: 2025, date: "28 de agosto", requester: "Cotrirosa", event: "Noite do Agro", shift: "Noite", confirmation: "ok", contract: "" },
  { row: 19, year: 2025, date: "02 setembro(01)", requester: "Sicredi (Juliani) 999284739", event: "", shift: "", confirmation: "ok", contract: "" },
  { row: 20, year: 2025, date: "03 e 04 setembro", requester: "Aenorgs/Fenasoja /", event: "Encontro Aenorgs", shift: "noite", confirmation: "ok", contract: "" },
  { row: 21, year: 2025, date: "18 setembro (16 e17)", requester: "Acisap", event: "Almoço Ideias", shift: "", confirmation: "", contract: "" },
  { row: 22, year: 2025, date: "23 setembro", requester: "Cotrirosa – Dilmar 996312619", event: "Evento supermercado", shift: "", confirmation: "", contract: "" },
  { row: 23, year: 2025, date: "25 setembro", requester: "Hortigranjeiros", event: "Evento de Encerramento", shift: "", confirmation: "ok", contract: "" },
  { row: 24, year: 2025, date: "04 outubro Dia 03 decorar", requester: "Michelli (Mana) 99677 5272 Parceria Fenasoja cobrar taxas", event: "Evento mulheres", shift: "", confirmation: "ok", contract: "" },
  { row: 25, year: 2025, date: "09 outubro (08 p organizar)", requester: "Acisap", event: "Almoço de Ideias", shift: "", confirmation: "", contract: "" },
  { row: 26, year: 2025, date: "25 de outubro a 02 nov", requester: "Escoteiros/prefeitura – Alexandre Presidente Escot. 99735 8318 3 salários", event: "XIII Edição ENIESC – Enc. Int. Escoteiros", shift: "", confirmation: "ok", contract: "" },
  { row: 27, year: 2025, date: "05 e 06 nov. dia 04 p arrumar", requester: "Cotrirosa Fabíola 996990718 Cobrar duas taxas de 1500 cada", event: "2 dias de evento Congrega Coop mais almoço de ideias junto", shift: "", confirmation: "", contract: "" },
  { row: 28, year: 2025, date: "14,15 e 16 de novembro", requester: "Cooperluz – Julio (taxas)", event: "Encontro Estaual das Cooperativas de eletrificação", shift: "", confirmation: "ok", contract: "" },
  { row: 29, year: 2025, date: "20 a 24 de novembro", requester: "Evento Cooperluz – Carina (taxas)", event: "Evento Cooperluz", shift: "", confirmation: "", contract: "" },
  { row: 30, year: 2025, date: "29 novembro", requester: "Rotary Cruzeiro Roger (3 salários)", event: "Rota Choop", shift: "", confirmation: "ok", contract: "" },
  { row: 31, year: 2025, date: "05 dezembro", requester: "Da Paz – Jaqueline Michels 996943931 (6 salários colocar no contrato que deve entregar salão com tudo retirado até 10h do dia 06)", event: "Formatura Terceirão OBS.Festa termina às 5 e entrar com limpeza às 07h)", shift: "", confirmation: "ok", contract: "" },
  { row: 32, year: 2025, date: "06 dezembro", requester: "Fema - Monica Ofício (6 salários) Acerto c Da Paz organização espaço", event: "Formatura Terceirão", shift: "", confirmation: "ok", contract: "" },
  { row: 33, year: 2025, date: "09 de dezembro", requester: "Fenasoja - Vanessa", event: "Lançamento do Festival de Pratos à Base de Soja – 14h", shift: "", confirmation: "", contract: "" },
  { row: 34, year: 2025, date: "15 e 16 dezembro", requester: "Alibem (irão limpar) sem taxas", event: "Jantar 25 anos Alibem", shift: "", confirmation: "", contract: "" },
  { row: 35, year: 2025, date: "20 de dezembro", requester: "Menegazzo", event: "Evento da empresa", shift: "", confirmation: "", contract: "" },

  // ---------------------------------------------------------------- 2026 (46)
  { row: 36, year: 2026, date: "14 de janeiro", requester: "Sindilojas (Anderson – 996662 0539) Taxa Limpeza", event: "Sorteio da Campanha Compre Aqui", shift: "", confirmation: "", contract: "" },
  { row: 37, year: 2026, date: "24 janeiro", requester: "Simone Rosa", event: "Escritorio Guapore", shift: "", confirmation: "ok", contract: "" },
  { row: 38, year: 2026, date: "31 Janeiro", requester: "Rotary Amizade", event: "Aniversário do Clube", shift: "", confirmation: "", contract: "" },
  { row: 39, year: 2026, date: "21 fevereiro", requester: "Nutripampa", event: "Evento Corporativo", shift: "", confirmation: "", contract: "" },
  { row: 40, year: 2026, date: "23 fevereiro", requester: "Evento cooperativas Fenasoja", event: "", shift: "", confirmation: "", contract: "" },
  { row: 41, year: 2026, date: "24 de Fevereiro", requester: "Cresol - Eliar", event: "Evento Corporativo", shift: "", confirmation: "ok", contract: "" },
  { row: 42, year: 2026, date: "13 de Março", requester: "19º R C Mec", event: "Evento Interno", shift: "", confirmation: "OK", contract: "----" },
  { row: 43, year: 2026, date: "19 de março", requester: "ACISAP", event: "Almoço de Ideias", shift: "", confirmation: "ok", contract: "----" },
  { row: 44, year: 2026, date: "24 de Março", requester: "SINDILOJAS", event: "Café de Negócios", shift: "", confirmation: "", contract: "-----" },
  { row: 45, year: 2026, date: "28 de março", requester: "Rotary Cultural – Luis 99138 5263", event: "Baile do Baltazar", shift: "", confirmation: "ok", contract: "pg" },
  { row: 46, year: 2026, date: "01 de abril a 30 de maio de 2026", requester: "FENASOJA", event: "", shift: "", confirmation: "", contract: "" },
  { row: 47, year: 2026, date: "30 de maio", requester: "Rotary Club Santa Rosa Terra da Soja (Vini – 99906 9969)", event: "Feijoada da Cau", shift: "Contrato ok", confirmation: "", contract: "" },
  { row: 48, year: 2026, date: "06 de junho de 2026", requester: "Rotary Junior – Cristiano Rauber 99972 8155", event: "Café Colonial", shift: "", confirmation: "", contract: "" },
  { row: 49, year: 2026, date: "09 de junho", requester: "SICREDI", event: "REUNIÃO - TANIRA", shift: "", confirmation: "", contract: "pg" },
  { row: 50, year: 2026, date: "16 de junho", requester: "Jantar de encerramento Fenasoja", event: "Jantar Fenasoja (Zélia)", shift: "", confirmation: "", contract: "" },
  { row: 51, year: 2026, date: "17 e 18 de Junho", requester: "Acisap", event: "Almoço de Ideias", shift: "", confirmation: "", contract: "" },
  { row: 52, year: 2026, date: "26 Jun", requester: "Casa Rotária", event: "Posse", shift: "", confirmation: "ok", contract: "" },
  { row: 53, year: 2026, date: "04 de julho", requester: "Entidade Alvaro Eidt", event: "Evento", shift: "", confirmation: "ok", contract: "" },
  { row: 54, year: 2026, date: "08 e 09 de Julho", requester: "Sicredi", event: "Evento da Cooperativa", shift: "", confirmation: "", contract: "" },
  { row: 55, year: 2026, date: "10 julho", requester: "Alibem", event: "Reunião Jocelino", shift: "", confirmation: "", contract: "Sem contrato" },
  { row: 56, year: 2026, date: "14 julho", requester: "Indumoveis", event: "Lançamento", shift: "", confirmation: "", contract: "Sem contrato" },
  { row: 57, year: 2026, date: "16 julho", requester: "Acisap", event: "Almoço de Ideias", shift: "", confirmation: "", contract: "Sem contrato" },
  { row: 58, year: 2026, date: "18 e 19 de julho", requester: "Confraria do Truco (Capaverde)", event: "18º Mercosul de Truco", shift: "", confirmation: "", contract: "Contrato assinado" },
  { row: 59, year: 2026, date: "22 julho", requester: "Cotrirosa", event: "Seminário leite", shift: "pg", confirmation: "", contract: "Contr ass" },
  { row: 60, year: 2026, date: "11 agosto", requester: "Sicredi", event: "Ju", shift: "pg", confirmation: "", contract: "Sem contrato" },
  { row: 61, year: 2026, date: "19 e 20 de agosto", requester: "Acisap", event: "Almoço de Ideias", shift: "D", confirmation: "", contract: "Sem contrato" },
  { row: 62, year: 2026, date: "22 agosto", requester: "Rodrigo Dogoski 99634 2761", event: "Congresso", shift: "d/n", confirmation: "", contract: "Contrato assinado" },
  { row: 63, year: 2026, date: "26 agosto", requester: "Cotrirosa", event: "Noite do Agro", shift: "pg", confirmation: "", contract: "N Enviado" },
  { row: 64, year: 2026, date: "29 agosto", requester: "Rotary Santa Rosa", event: "Jantar Baile", shift: "ok", confirmation: "", contract: "N Enviado" },
  { row: 65, year: 2026, date: "09 e 10 setembro", requester: "AENORGS", event: "Seminário", shift: "", confirmation: "", contract: "" },
  { row: 66, year: 2026, date: "24 de setembro", requester: "Acisap", event: "Almoço de Ideias", shift: "", confirmation: "D", contract: "S/C" },
  { row: 67, year: 2026, date: "26 de setembro", requester: "Fenasoja", event: "Encontrão Voluntários", shift: "", confirmation: "", contract: "s/c" },
  { row: 68, year: 2026, date: "02 de Outubro", requester: "Secretaria da Educação", event: "Baile", shift: "", confirmation: "", contract: "" },
  { row: 69, year: 2026, date: "08 outubro", requester: "Sicredi", event: "Ju", shift: "pg", confirmation: "N", contract: "s/c" },
  { row: 70, year: 2026, date: "17 outubro (reservar dias 15, 16, 17 e 18)", requester: "Acisap", event: "Jantar 95 anos Acisap", shift: "", confirmation: "N", contract: "S/C" },
  { row: 71, year: 2026, date: "20 de Outubro", requester: "Cotrirosa", event: "Encontrão de Mulheres", shift: "", confirmation: "", contract: "" },
  { row: 72, year: 2026, date: "31 de out e 01 nov", requester: "Mana Micheli", event: "Café das Manas", shift: "ok", confirmation: "", contract: "" },
  { row: 73, year: 2026, date: "07 de novembro", requester: "Rotary Cruzeiro", event: "Evento Rotário", shift: "", confirmation: "", contract: "" },
  { row: 74, year: 2026, date: "12 DE Novembro", requester: "Rotary Amizade", event: "Carreteiro da Amizade", shift: "", confirmation: "", contract: "" },
  { row: 75, year: 2026, date: "15 de Novembro", requester: "Rotary Santa Rosa", event: "Parrilha", shift: "", confirmation: "", contract: "" },
  { row: 76, year: 2026, date: "20 de Novembro", requester: "Laboratório Ótica Santa Rosa", event: "", shift: "Pg 2 sal", confirmation: "N", contract: "Contrato ok" },
  { row: 77, year: 2026, date: "28 de Novembro", requester: "Escritório Anderson Schubert", event: "Evento Corporativo", shift: "Pg 2 sal", confirmation: "N", contract: "Contrato ok" },
  { row: 78, year: 2026, date: "04; de dezembro", requester: "Formatura terceirão Da Paz – Eliana", event: "Formatura Da Paz", shift: "Cont ok", confirmation: "ok", contract: "Pago" },
  { row: 79, year: 2026, date: "11 e 12 dez", requester: "Fema – Ofício Mônica", event: "Formatura Terceirão", shift: "", confirmation: "ok", contract: "" },
  { row: 80, year: 2026, date: "14 Dez", requester: "Alibem", event: "Jantar Jardel", shift: "", confirmation: "", contract: "" },
  { row: 81, year: 2026, date: "19 de Dezembro", requester: "Formatura Dom Bosco", event: "Formatura Terceirão", shift: "", confirmation: "ok", contract: "Pago" },

  // ---------------------------------------------------------------- 2027 (15)
  { row: 82, year: 2027, date: "13 Fevereiro", requester: "Fema – Joana - 99702-8153 (6 salários)", event: "Formatura Curso Enfermagem", shift: "", confirmation: "", contract: "" },
  { row: 83, year: 2027, date: "20 de fevereiro", requester: "Evento de Truco", event: "Parnov", shift: "", confirmation: "", contract: "" },
  { row: 84, year: 2027, date: "20 de Março", requester: "Casamento (Simene) 99924-5299", event: "Simone", shift: "", confirmation: "", contract: "" },
  { row: 85, year: 2027, date: "03 de Abril", requester: "Baile do Baltazar", event: "Rotary Cultural (Beto Vacari)", shift: "", confirmation: "", contract: "" },
  { row: 86, year: 2027, date: "24 de Abril", requester: "APROMES", event: "Evento de Mulheres", shift: "Cont ok", confirmation: "ok", contract: "Pg 1 salario" },
  { row: 87, year: 2027, date: "10 de abril", requester: "Baile do Baltazar", event: "Rotary Cultural (Beto Vacari)", shift: "", confirmation: "", contract: "" },
  { row: 88, year: 2027, date: "24 de abril", requester: "APROMES", event: "ANDREA BUSANELO", shift: "Pg 1 salário", confirmation: "ok", contract: "Contrato Assinado" },
  { row: 89, year: 2027, date: "14 a 23 de Maio", requester: "INDUMÓVEIS", event: "", shift: "", confirmation: "", contract: "" },
  { row: 90, year: 2027, date: "05 junho", requester: "Aniversário 15 anos", event: "Marcelo Steffen", shift: "", confirmation: "", contract: "" },
  { row: 91, year: 2027, date: "12 junho", requester: "Café colonial Rotary Junior", event: "Luis 98115-5000", shift: "", confirmation: "", contract: "" },
  { row: 92, year: 2027, date: "17 e 18 julho", requester: "TRUCO", event: "Claudio Capaverde", shift: "", confirmation: "", contract: "" },
  { row: 93, year: 2027, date: "10 A 15 DE Agosto", requester: "HORTIGRANJEIROS", event: "", shift: "", confirmation: "", contract: "" },
  { row: 94, year: 2027, date: "16, 17 e 18 de setembro", requester: "NERISON", event: "Aniversário", shift: "", confirmation: "", contract: "" },
  { row: 95, year: 2027, date: "03 de Dezembro", requester: "", event: "Carol Molinari", shift: "", confirmation: "", contract: "" },
  { row: 96, year: 2027, date: "11 de Dezembro", requester: "Formatura Fema", event: "Altair Lenz", shift: "", confirmation: "", contract: "" },

  // ----------------------------------------------------------------- 2028 (2)
  { row: 97, year: 2028, date: "12 de fevereiro", requester: "Formatura Fema", event: "Milton 99922-6326", shift: "", confirmation: "", contract: "" },
  { row: 98, year: 2028, date: "19 de fevereiro", requester: "Formatura Fema", event: "Grau Formaturas 99146-2860", shift: "", confirmation: "", contract: "" },

  // ------------------------------------------------- Observação final (não-evento)
  { row: 99, year: 2028, date: "OBS: 05 utilização p Cotrirosa gratuito", requester: "", event: "", shift: "", confirmation: "", contract: "" },
];
