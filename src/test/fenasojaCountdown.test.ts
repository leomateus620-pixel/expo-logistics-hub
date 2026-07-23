import { describe, expect, it } from 'vitest';
import {
  FENASOJA_2028_CYCLE_START_ISO,
  FENASOJA_2028_OPENING_ISO,
  FENASOJA_2028_OPENING_LABEL,
  FENASOJA_2028_TIME_ZONE,
  formatFenasojaCountdownLabel,
  formatFenasojaCountdownSummary,
  getFenasojaCountdown,
  getFenasojaCountdownUpdateDelay,
} from '@/lib/fenasoja-countdown';

describe('contagem regressiva da Fenasoja 2028', () => {
  it('mantém a abertura centralizada no horário de Brasília', () => {
    expect(FENASOJA_2028_OPENING_LABEL).toBe('29 de abril de 2028, às 10h');
    expect(new Date(FENASOJA_2028_OPENING_ISO).toISOString()).toBe('2028-04-29T13:00:00.000Z');

    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
        minute: '2-digit',
        month: '2-digit',
        timeZone: FENASOJA_2028_TIME_ZONE,
        year: 'numeric',
      })
        .formatToParts(new Date(FENASOJA_2028_OPENING_ISO))
        .map(({ type, value }) => [type, value]),
    );

    expect(parts).toMatchObject({
      day: '29',
      hour: '10',
      minute: '00',
      month: '04',
      year: '2028',
    });
  });

  it('atinge 100% do ciclo somente no instante oficial da abertura', () => {
    const cycleStartTimestamp = Date.parse(FENASOJA_2028_CYCLE_START_ISO);
    const openingTimestamp = Date.parse(FENASOJA_2028_OPENING_ISO);

    expect(getFenasojaCountdown(cycleStartTimestamp - 1).cycleProgress).toBe(0);
    expect(getFenasojaCountdown(cycleStartTimestamp).cycleProgress).toBe(0);
    expect(getFenasojaCountdown(openingTimestamp - 1).cycleProgress).toBe(99);
    expect(getFenasojaCountdown(openingTimestamp).cycleProgress).toBe(100);
    expect(getFenasojaCountdown(openingTimestamp + 1).cycleProgress).toBe(100);
  });

  it('separa o tempo restante em dias, horas, minutos e segundos', () => {
    const openingTimestamp = Date.parse(FENASOJA_2028_OPENING_ISO);
    const referenceTimestamp = openingTimestamp - (((1 * 24 + 2) * 60 * 60 + 3 * 60 + 4) * 1_000);

    expect(getFenasojaCountdown(referenceTimestamp)).toMatchObject({
      days: 1,
      hours: 2,
      minutes: 3,
      seconds: 4,
      phase: 'countdown',
    });
  });

  it('arredonda o último segundo para cima sem antecipar a abertura', () => {
    const openingTimestamp = Date.parse(FENASOJA_2028_OPENING_ISO);
    expect(getFenasojaCountdown(openingTimestamp - 1)).toMatchObject({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 1,
      phase: 'countdown',
    });
  });

  it('mantém rollovers exatos de dia, hora e minuto', () => {
    const openingTimestamp = Date.parse(FENASOJA_2028_OPENING_ISO);

    expect(getFenasojaCountdown(openingTimestamp - 86_400_000)).toMatchObject({
      days: 1,
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
    expect(getFenasojaCountdown(openingTimestamp - 86_399_000)).toMatchObject({
      days: 0,
      hours: 23,
      minutes: 59,
      seconds: 59,
    });
    expect(getFenasojaCountdown(openingTimestamp - 3_600_000)).toMatchObject({
      hours: 1,
      minutes: 0,
      seconds: 0,
    });
    expect(getFenasojaCountdown(openingTimestamp - 3_599_000)).toMatchObject({
      hours: 0,
      minutes: 59,
      seconds: 59,
    });
    expect(getFenasojaCountdown(openingTimestamp - 60_000)).toMatchObject({
      minutes: 1,
      seconds: 0,
    });
    expect(getFenasojaCountdown(openingTimestamp - 59_000)).toMatchObject({
      minutes: 0,
      seconds: 59,
    });
  });

  it('nunca exibe valores negativos depois da abertura', () => {
    const snapshot = getFenasojaCountdown(Date.parse(FENASOJA_2028_OPENING_ISO) + 60_000);

    expect(snapshot).toMatchObject({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      remainingMilliseconds: 0,
      cycleProgress: 100,
      phase: 'open',
    });
    expect(formatFenasojaCountdownLabel(snapshot)).toBe('A Fenasoja 2028 está oficialmente aberta.');
  });

  it('gera uma descrição completa para tecnologias assistivas', () => {
    const snapshot = getFenasojaCountdown(Date.parse(FENASOJA_2028_OPENING_ISO) - 90_061_000);

    expect(formatFenasojaCountdownLabel(snapshot)).toBe(
      'Faltam 1 dia, 1 hora, 1 minuto, 1 segundo para a abertura oficial da Fenasoja 2028.',
    );
  });

  it('alinha a próxima atualização visual à fronteira real do segundo', () => {
    expect(getFenasojaCountdownUpdateDelay(10_250)).toBe(762);
    expect(getFenasojaCountdownUpdateDelay(10_000)).toBe(1_012);
  });

  it('reduz o anúncio assistivo para precisão de minuto', () => {
    const snapshot = getFenasojaCountdown(Date.parse(FENASOJA_2028_OPENING_ISO) - 90_061_000);

    expect(formatFenasojaCountdownSummary(snapshot)).toBe(
      'Contagem oficial: faltam 1 dia, 1 hora, 1 minuto para a abertura.',
    );
  });
});
