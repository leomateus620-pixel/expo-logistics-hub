import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MoneyInput } from '@/features/commercial-map/sales/components/MoneyInput';
import { formatCents } from '@/features/commercial-map/sales/salesMoney';

function FeeFixture() {
  const [cents, setCents] = useState(0);
  return <>
    <MoneyInput id="fee" mode="reais" ariaLabel="Taxa" valueCents={cents} onChange={setCents} />
    <output aria-label="Total">{formatCents(cents)}</output>
  </>;
}

describe('digitação monetária na venda', () => {
  it('mantém 45 digitado até sair do campo e soma como R$ 45,00', () => {
    render(<FeeFixture />);
    const field = screen.getByRole('textbox', { name: 'Taxa' }) as HTMLInputElement;
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '45' } });
    expect(field.value).toBe('45');
    expect(screen.getByLabelText('Total').textContent).toBe('R$ 45,00');
    fireEvent.blur(field);
    expect(field.value).toBe('45,00');
  });

  it('preserva vírgula durante a edição e aceita colagem com milhar e centavos', () => {
    render(<FeeFixture />);
    const field = screen.getByRole('textbox', { name: 'Taxa' }) as HTMLInputElement;
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '45,' } });
    expect(field.value).toBe('45,');
    fireEvent.change(field, { target: { value: 'R$ 1.234,56' } });
    expect(screen.getByLabelText('Total').textContent).toBe('R$ 1.234,56');
    fireEvent.change(field, { target: { value: '' } });
    expect(field.value).toBe('');
    expect(screen.getByLabelText('Total').textContent).toBe('R$ 0,00');
  });

  it('não altera a entrada em centavos das parcelas', () => {
    const { container } = render(<MoneyInput id="installment" valueCents={0} onChange={(cents) => {
      container.dataset.cents = String(cents);
    }} />);
    const field = container.querySelector('input');
    expect(field).not.toBeNull();
    if (!field) return;
    fireEvent.change(field, { target: { value: '45' } });
    expect(container.dataset.cents).toBe('45');
  });
});