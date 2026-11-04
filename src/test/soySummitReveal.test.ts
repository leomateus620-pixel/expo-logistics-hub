import { describe, expect, it } from 'vitest';
import { REVEAL_DURATION, revealPose } from '@/features/soy-summit/reveal-timeline';

describe('apresentação do Soy Summit', () => {
  it('mantém o painel coberto enquanto os homens se aproximam e seguram o tecido', () => {
    for (const seconds of [0, .5, 1.1, 2, 2.4]) expect(revealPose(seconds).gap).toBe(0);
    expect(revealPose(0).grasp).toBe(0);
    expect(revealPose(2.4).grasp).toBe(1);
    expect(revealPose(2.4).actorX).toBeCloseTo(.42);
  });
  it('preserva contato relativo das mãos durante o percurso de cada metade', () => {
    let lastGap = 0;
    for (let seconds = 2.4; seconds <= 10.2; seconds += .025) {
      const pose = revealPose(seconds);
      expect(pose.grasp).toBe(1);
      expect(pose.gap).toBeGreaterThanOrEqual(lastGap);
      expect(pose.actorX - pose.gap).toBeCloseTo(.42, 8);
      // The actors remain on the 21 m stage, away from the side stairs.
      expect(pose.actorX + .4).toBeLessThan(10.5);
      lastGap = pose.gap;
    }
  });
  it('libera os braços somente depois da abertura e deixa margem livre para o telão de 12 m', () => {
    expect(revealPose(10.2).gap).toBe(7.5);
    expect(revealPose(10.2).release).toBe(0);
    const final = revealPose(REVEAL_DURATION);
    expect(final.grasp).toBe(0);
    expect(final.turn).toBe(0);
    expect(final.gap - 6).toBeGreaterThan(1);
    expect(final.walking).toBe(false);
    expect(final.phase).toBe('complete');
  });
  it('clampa suspensão longa e permite salto determinístico para movimento reduzido ou pular', () => {
    expect(revealPose(-10)).toEqual(revealPose(0));
    expect(revealPose(900)).toEqual(revealPose(REVEAL_DURATION));
  });
});
