import { beforeEach, describe, expect, it } from 'vitest';
import {
  FENASOJA_COUNTDOWN_ROUTE,
  consumeFenasojaCountdownLaunch,
  findFenasojaCountdownReturnFocus,
  peekFenasojaCountdownLaunch,
  rememberFenasojaCountdownLaunch,
} from '@/lib/fenasoja-countdown-navigation';

describe('navegação da contagem oficial', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(window, 'scrollX', { configurable: true, value: 24 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 });
  });

  it('mantém uma rota dedicada e diretamente endereçável', () => {
    expect(FENASOJA_COUNTDOWN_ROUTE).toBe('/cronograma-eventos/contagem-oficial');
  });

  it('restaura uma única vez o foco e a posição de origem', () => {
    rememberFenasojaCountdownLaunch('fenasoja-countdown-expand');

    expect(consumeFenasojaCountdownLaunch()).toEqual({
      focusId: 'fenasoja-countdown-expand',
      scrollX: 24,
      scrollY: 640,
    });
    expect(consumeFenasojaCountdownLaunch()).toBeNull();
  });

  it('preserva a origem do Portal durante um eventual fluxo de login', () => {
    rememberFenasojaCountdownLaunch('fenasoja-countdown-expand-portal', '/portal');

    expect(peekFenasojaCountdownLaunch()).toEqual({
      focusId: 'fenasoja-countdown-expand-portal',
      originPath: '/portal',
      scrollX: 24,
      scrollY: 640,
    });
    expect(peekFenasojaCountdownLaunch()).not.toBeNull();
    expect(consumeFenasojaCountdownLaunch()?.originPath).toBe('/portal');
    expect(peekFenasojaCountdownLaunch()).toBeNull();
  });

  it('ignora contexto adulterado sem interromper o retorno', () => {
    window.sessionStorage.setItem(
      'fenasoja-countdown-launch-context',
      '{"focusId":"cta","scrollX":"invalido","scrollY":10}',
    );

    expect(consumeFenasojaCountdownLaunch()).toBeNull();
  });

  it('recupera o controle responsivo quando a apresentação muda durante a expansão', () => {
    const desktopControl = document.createElement('button');
    desktopControl.id = 'fenasoja-countdown-expand-desktop';
    desktopControl.dataset.fenasojaCountdownExpand = '';
    document.body.append(desktopControl);

    expect(
      findFenasojaCountdownReturnFocus('fenasoja-countdown-expand-mobile'),
    ).toBe(desktopControl);

    desktopControl.remove();
  });
});
