import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OfficialCountdownDigits } from '@/components/countdown/OfficialCountdownDigits';
import type { FenasojaCountdownSnapshot } from '@/lib/fenasoja-countdown';

const snapshot: FenasojaCountdownSnapshot = {
  days: 654,
  hours: 3,
  minutes: 2,
  seconds: 9,
  remainingMilliseconds: 1,
  cycleProgress: 6,
  phase: 'countdown',
};

describe('OfficialCountdownDigits', () => {
  it('mantém os quatro valores reais no DOM e em uma única fonte acessível', () => {
    render(
      <OfficialCountdownDigits
        snapshot={snapshot}
        accessibleLabel="Faltam 654 dias, 3 horas, 2 minutos e 9 segundos."
      />,
    );

    const timer = screen.getByRole('timer', {
      name: 'Faltam 654 dias, 3 horas, 2 minutos e 9 segundos.',
    });
    const units = Array.from(timer.querySelectorAll<HTMLElement>('[data-value]'));

    expect(units.map((unit) => unit.dataset.value)).toEqual(['654', '03', '02', '09']);
    expect(timer.querySelectorAll('.fenasoja-countdown-value-glyph')).toHaveLength(4);
    expect(timer).toHaveTextContent('654dias03horas02min09seg');
  });

  it('troca somente os rótulos de apresentação sem duplicar o relógio', () => {
    render(
      <OfficialCountdownDigits
        snapshot={snapshot}
        accessibleLabel="Contagem oficial da Fenasoja 2028"
        variant="immersive"
      />,
    );

    const timer = screen.getByRole('timer', { name: 'Contagem oficial da Fenasoja 2028' });

    expect(timer).toHaveAttribute('data-variant', 'immersive');
    expect(timer).toHaveTextContent('654dias03horas02minutos09segundos');
    expect(screen.getAllByRole('timer')).toHaveLength(1);
  });

  it('preserva os algarismos que não mudaram durante a atualização de segundo', () => {
    const { rerender } = render(
      <OfficialCountdownDigits
        snapshot={snapshot}
        accessibleLabel="Contagem em andamento"
      />,
    );
    const before = Array.from(
      screen.getByRole('timer').querySelectorAll('.fenasoja-countdown-value-glyph'),
    );

    rerender(
      <OfficialCountdownDigits
        snapshot={{ ...snapshot, seconds: 8 }}
        accessibleLabel="Contagem em andamento"
      />,
    );
    const after = Array.from(
      screen.getByRole('timer').querySelectorAll('.fenasoja-countdown-value-glyph'),
    );

    expect(after.slice(0, 3)).toEqual(before.slice(0, 3));
    expect(after[3]).not.toBe(before[3]);
    expect(after[3]).toHaveTextContent('08');
  });
});
