// @vitest-environment jsdom

import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { CycleYearMark } from '@/components/cronograma-eventos/CycleYearMark';

describe('marca do ano 2028', () => {
  it('substitui o zero pelo grão e preserva a leitura acessível do ano', () => {
    const { container } = render(<CycleYearMark year={2028} />);
    const visualYear = container.querySelector('.cronograma-cycle-year-glyphs');
    const soybean = container.querySelector('.cronograma-cycle-soy-glyph');

    expect(visualYear).toHaveAttribute('aria-hidden', 'true');
    expect(visualYear).toHaveTextContent('228');
    expect(visualYear?.textContent).not.toContain('0');
    expect(visualYear?.querySelectorAll('.cronograma-cycle-year-digit')).toHaveLength(3);
    expect(soybean).toContainElement(container.querySelector('.cronograma-cycle-soy-kernel'));
    expect(container.querySelector('.sr-only')).toHaveTextContent('2028');
  });

  it('mantém os demais anos como texto simples', () => {
    const { container } = render(<CycleYearMark year={2027} />);

    expect(container).toHaveTextContent('2027');
    expect(container.querySelector('.cronograma-cycle-soy-glyph')).not.toBeInTheDocument();
  });
});
