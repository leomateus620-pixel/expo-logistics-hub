import { describe, expect, it } from "vitest";

import {
  RESTAURANT_SOURCE_ROWS,
} from "@/lib/venue-restaurant-import/sourceRows";
import {
  parseAllSourceRows,
  parseDateExpression,
  parseFees,
  parsePhone,
  parseShiftToken,
  type ParsedRestaurantEvent,
} from "@/lib/venue-restaurant-import/parser";
import { deduplicate } from "@/lib/venue-restaurant-import/dedupe";

const parsed = parseAllSourceRows();
const byRow = (row: number): ParsedRestaurantEvent =>
  parsed.find((event) => event.sourceRows.includes(row))!;

describe("transcrição da agenda do restaurante", () => {
  it("mantém as 99 linhas do documento com numeração contínua", () => {
    expect(RESTAURANT_SOURCE_ROWS).toHaveLength(99);
    RESTAURANT_SOURCE_ROWS.forEach((row, index) => {
      expect(row.row).toBe(index + 1);
    });
  });

  it("distribui as linhas entre 2025 e 2028 conforme o documento", () => {
    const perYear = RESTAURANT_SOURCE_ROWS.reduce<Record<number, number>>(
      (acc, row) => ({ ...acc, [row.year]: (acc[row.year] ?? 0) + 1 }),
      {},
    );
    expect(perYear).toEqual({ 2025: 35, 2026: 46, 2027: 15, 2028: 3 });
  });
});

describe("interpretação de datas", () => {
  it("lê dias consecutivos escritos com 'e'", () => {
    const result = parseDateExpression("26 e 27 de março", 2025);
    expect(result.startDate).toBe("2025-03-26");
    expect(result.endDate).toBe("2025-03-27");
  });

  it("lê intervalos com 'a'", () => {
    const result = parseDateExpression("16 a 25 de maio", 2025);
    expect(result.startDate).toBe("2025-05-16");
    expect(result.endDate).toBe("2025-05-25");
  });

  it("lê intervalos que cruzam meses", () => {
    const result = parseDateExpression("25 de outubro a 02 nov", 2025);
    expect(result.startDate).toBe("2025-10-25");
    expect(result.endDate).toBe("2025-11-02");
  });

  it("lê listas com vírgula", () => {
    const result = parseDateExpression("14,15 e 16 de novembro", 2025);
    expect(result.startDate).toBe("2025-11-14");
    expect(result.endDate).toBe("2025-11-16");
  });

  it("respeita o ano explícito no texto", () => {
    const result = parseDateExpression("01 de abril a 30 de maio de 2026", 2026);
    expect(result.startDate).toBe("2026-04-01");
    expect(result.endDate).toBe("2026-05-30");
  });

  it("separa o dia de preparação do período do evento", () => {
    const result = parseDateExpression("04 outubro Dia 03 decorar", 2025);
    expect(result.startDate).toBe("2025-10-04");
    expect(result.endDate).toBe("2025-10-04");
    expect(result.preparationStartDate).toBe("2025-10-03");
  });

  it("separa o período de reserva do período do evento", () => {
    const result = parseDateExpression(
      "17 outubro (reservar dias 15, 16, 17 e 18)",
      2026,
    );
    expect(result.startDate).toBe("2026-10-17");
    expect(result.endDate).toBe("2026-10-17");
    expect(result.reservationStartDate).toBe("2026-10-15");
    expect(result.reservationEndDate).toBe("2026-10-18");
  });

  it("ignora o dia da semana entre parênteses", () => {
    const result = parseDateExpression("03 de junho (terça)", 2025);
    expect(result.startDate).toBe("2025-06-03");
    expect(result.preparationStartDate).toBeNull();
  });

  it("resolve todas as datas do documento sem deslocamento de fuso", () => {
    const semData = parsed.filter((event) => event.isEvent && !event.startDate);
    expect(semData).toHaveLength(0);
    for (const event of parsed) {
      if (!event.startDate) continue;
      expect(event.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(event.startDate.startsWith(String(event.sourceYear))).toBe(true);
      expect(event.endDate! >= event.startDate).toBe(true);
    }
  });
});

describe("turnos e horários", () => {
  it("normaliza os rótulos de turno do documento", () => {
    expect(parseShiftToken("Meio-dia")).toBe("meio_dia");
    expect(parseShiftToken("Meio dia")).toBe("meio_dia");
    expect(parseShiftToken("Noite")).toBe("noite");
    expect(parseShiftToken("Dia/ noite")).toBe("dia_noite");
    expect(parseShiftToken("d/n")).toBe("dia_noite");
    expect(parseShiftToken("D")).toBe("dia");
    expect(parseShiftToken("pg")).toBeNull();
  });

  it("converte turno em faixa horária padrão", () => {
    const almocoAcisap = byRow(1);
    expect(almocoAcisap.shift).toBe("meio_dia");
    expect(almocoAcisap.startTime).toBe("11:00");
    expect(almocoAcisap.endTime).toBe("15:00");
  });

  it("usa o horário explícito quando o documento informa", () => {
    const imprensa = byRow(9);
    expect(imprensa.startTime).toBe("18:30");
    expect(imprensa.endTime).toBe("23:30");
  });

  it("todo evento recebe início e fim para satisfazer o banco", () => {
    for (const event of parsed.filter((item) => item.isEvent)) {
      expect(event.startTime).toMatch(/^\d{2}:\d{2}$/);
      expect(event.endTime).toMatch(/^\d{2}:\d{2}$/);
    }
  });
});

describe("telefones, taxas e limpeza", () => {
  it("normaliza telefones em formatos diferentes", () => {
    expect(parsePhone("Sandro Sawicki – 99986 9860")).toBe("99986-9860");
    expect(parsePhone("Anelize 51 99724 9968")).toBe("(51) 99724-9968");
    expect(parsePhone("Joana - 99702-8153")).toBe("99702-8153");
    expect(parsePhone("sem telefone")).toBeNull();
  });

  it("extrai quantidade de salários e valores de taxa", () => {
    expect(parseFees("Rotary – Cassio Feltes (3 salários)")).toMatchObject({
      feeType: "salario",
      feeQuantity: 3,
    });
    expect(parseFees("Rotary – Anelize (2,5 salários)")).toMatchObject({
      feeQuantity: 2.5,
    });
    expect(
      parseFees("Cotrirosa – Solange – (taxas 1.500,00 – cobrar duas taxas)"),
    ).toMatchObject({ feeType: "taxa", feeAmount: 1500 });
  });

  it("identifica responsabilidade de limpeza e cobrança de energia", () => {
    expect(byRow(1).cleaningResponsibility).toBe("solicitante");
    expect(byRow(34).cleaningResponsibility).toBe("solicitante");
    expect(byRow(36).cleaningResponsibility).toBe("taxa_limpeza");
    expect(byRow(15).electricityFee).toBe("Cobrar energia elétrica");
  });

  it("marca eventos isentos de taxa", () => {
    expect(byRow(34).feeType).toBe("isento");
  });
});

describe("status de confirmação, contrato e pagamento", () => {
  it("classifica por conteúdo, mesmo com colunas trocadas", () => {
    expect(byRow(78)).toMatchObject({
      contractStatus: "assinado",
      confirmationStatus: "confirmado",
      paymentStatus: "pago",
    });
    expect(byRow(76)).toMatchObject({
      paymentStatus: "pago",
      feeQuantity: 2,
      confirmationStatus: "nao_confirmado",
      contractStatus: "assinado",
    });
    expect(byRow(58).contractStatus).toBe("assinado");
    expect(byRow(66).contractStatus).toBe("sem_contrato");
    expect(byRow(63).contractStatus).toBe("nao_enviado");
  });

  it("não inventa status quando o documento traz apenas traços", () => {
    expect(byRow(44)).toMatchObject({
      contractStatus: "nao_informado",
      confirmationStatus: "nao_informado",
      paymentStatus: "nao_informado",
    });
  });
});

describe("título, organização e contato", () => {
  it("corrige a linha com colunas deslocadas de 15/04/2025", () => {
    const lancamento = byRow(5);
    expect(lancamento.eventTitle).toBe("Lançamento Indumóveis");
    expect(lancamento.shift).toBe("noite");
    expect(lancamento.confirmationStatus).toBe("confirmado");
  });

  it("desinverte título e organização no padrão de 2027", () => {
    expect(byRow(85).eventTitle).toBe("Baile do Baltazar");
    expect(byRow(85).organizerName).toBe("Rotary Cultural");
    expect(byRow(90).eventTitle).toBe("Aniversário 15 anos");
    expect(byRow(90).organizerName).toBe("Marcelo Steffen");
  });

  it("deriva o título da organização quando o evento não tem nome", () => {
    const alibem = byRow(14);
    expect(alibem.eventTitle).toBe("Evento ALIBEM");
    expect(alibem.requiresReview).toBe(true);
  });

  it("extrai contato e telefone do solicitante", () => {
    expect(byRow(6)).toMatchObject({
      contactName: "Bárbara",
      contactPhone: "99128-9567",
    });
  });

  it("nunca coloca preparação ou reserva no título", () => {
    for (const event of parsed.filter((item) => item.isEvent)) {
      const title = (event.eventTitle ?? "").toLowerCase();
      expect(title).not.toContain("decorar");
      expect(title).not.toContain("reservar");
      expect(title).not.toContain("p organizar");
      expect(title).not.toContain("obs");
    }
  });
});

describe("deduplicação e reconciliação", () => {
  const result = deduplicate(parsed);

  it("descarta apenas a observação final como não-evento", () => {
    expect(result.summary.ignored).toBe(1);
    expect(result.summary.candidates).toBe(98);
  });

  it("funde as duas linhas do APROMES de 24/04/2027", () => {
    const apromes = result.events.filter(
      (event) => event.organizerName === "APROMES",
    );
    expect(apromes).toHaveLength(1);
    expect(apromes[0].sourceRows).toEqual([86, 88]);
    expect(apromes[0].contractStatus).toBe("assinado");
    expect(result.summary.merged).toBe(1);
  });

  it("não funde eventos homônimos em datas diferentes, apenas sinaliza", () => {
    const bailes = result.events.filter(
      (event) => event.eventTitle === "Baile do Baltazar" && event.sourceYear === 2027,
    );
    expect(bailes).toHaveLength(2);
    for (const baile of bailes) {
      expect(baile.reviewReasons.join(" ")).toContain("conflito de agenda");
    }
  });

  it("gera impressões digitais únicas e estáveis", () => {
    const fingerprints = result.events.map((event) => event.fingerprint);
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
    expect(deduplicate(parseAllSourceRows()).events.map((e) => e.fingerprint))
      .toEqual(fingerprints);
  });

  it("produz uma linha de reconciliação para cada linha do documento", () => {
    const cobertas = new Set(
      result.reconciliation.flatMap((entry) => entry.sourceRows),
    );
    expect(cobertas.size).toBe(99);
  });
});
