import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AlvoradaBrandHero } from './AlvoradaBrandHero';

describe('Alvorada brand composition', () => {
  it('presents the unchanged official symbol and a single edition without location bands', () => {
    const { container } = render(<AlvoradaBrandHero stage="brand-hold" dataPending={false} />);
    expect(screen.getByRole('img', { name: 'Fenasoja 2028' })).toBeVisible();
    expect(screen.getAllByText('2028')).toHaveLength(1);
    expect(container.textContent).not.toMatch(/Edição|Santa Rosa/);
    expect(container.querySelector('img')).toHaveAttribute('src', '/alvorada/fenasoja-symbol-official.png');
  });
  it('keeps pending-data status available until the organizational graph is ready', () => {
    const { rerender } = render(<AlvoradaBrandHero stage="brand-hold" dataPending />);
    expect(screen.getByRole('status')).toHaveTextContent('Sincronizando');
    rerender(<AlvoradaBrandHero stage="org-ready" dataPending={false} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Fenasoja 2028' })).not.toBeInTheDocument();
  });
});
