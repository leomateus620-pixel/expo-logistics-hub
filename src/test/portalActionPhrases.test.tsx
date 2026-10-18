import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PortalActionPhrase } from '@/components/portal/actions/PortalActionPhrase';
import { resolvePortalActionPhrases } from '@/components/portal/actions/portalActionPhrases';
import { portalPrimaryEntries } from '@/modules/portal/portalRegistry';

const phraseStyles = readFileSync(resolve('src/styles/portal-action-phrase.css'), 'utf8');
const ids = portalPrimaryEntries.map((entry) => entry.id);

describe('microcopy animada dos cards do portal', () => {
  it('personaliza frases por módulo, sem repetir entre menus', () => {
    for (const state of ['allowed', 'login'] as const) {
      const all = ids.flatMap((id) => resolvePortalActionPhrases(id, state, false, 'fixo'));
      const perModule = ids.map((id) => resolvePortalActionPhrases(id, state, false, 'fixo'));
      perModule.forEach((phrases) => expect(phrases.length).toBeGreaterThanOrEqual(3));
      const rotating = perModule.flatMap((phrases) => phrases.slice(1));
      expect(new Set(rotating).size).toBe(rotating.length);
      all.forEach((phrase) => expect(phrase.length).toBeLessThanOrEqual(26));
    }
  });

  it('mantém rótulo fixo em estados com consequência', () => {
    for (const state of ['loading', 'denied', 'setup'] as const) {
      expect(resolvePortalActionPhrases('financeiro', state, false, 'Restrito ao perfil')).toEqual([
        'Restrito ao perfil',
      ]);
    }
    expect(resolvePortalActionPhrases('comissoes', 'group', true, 'Recolher comissões')).toEqual([
      'Recolher comissões',
    ]);
  });

  it('reserva a largura da frase mais longa e escreve caractere a caractere', () => {
    const { container } = render(
      <PortalActionPhrase phrases={['Abrir mapa', 'Consultar disponibilidade']} order={2} />,
    );
    const sizer = container.querySelector('.portal-action-phrase__sizer');
    expect(sizer).toHaveAttribute('data-text', 'Consultar disponibilidade');
    expect(sizer).toBeEmptyDOMElement();
    const text = container.querySelector('.portal-action-phrase__text');
    expect(text).toHaveTextContent('Abrir mapa');
    expect(text?.querySelectorAll('.portal-action-phrase__char')).toHaveLength('Abrirmapa'.length);
  });

  it('anima apenas transform/opacity e respeita movimento reduzido', () => {
    expect(phraseStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(phraseStyles).not.toMatch(/animation:[^;]*infinite/);
    expect(phraseStyles).not.toContain('transition: all');
    expect(phraseStyles).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
