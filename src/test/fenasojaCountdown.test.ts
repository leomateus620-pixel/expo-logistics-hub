import { describe, expect, it } from 'vitest';
import {
  FENASOJA_2028_OPENING_ISO,
  FENASOJA_2028_TIME_ZONE,
  formatFenasojaCountdownLabel,
  formatFenasojaCountdownSummary,
  getFenasojaCountdown,
  getFenasojaCountdownUpdateDelay,
} from '@/lib/fenasoja-countdown';

describe('contagem regressiva da Fenasoja 2028', () => {
  it('mantém a abertura centralizada no horário de Brasília', () => {
    expect(new Date(FENASOJA_2028_OPENING_ISO).toISOString()).toBe('2028-05-01T13:00:00.000Z');

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
      day: '01',
      hour: '10',
      minute: '00',
      month: '05',
      year: '2028',
    });
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
