// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { EventLocationField } from './EventLocationField';

describe('EventLocationField', () => {
  it('exposes all four official locations and sends the stable code when selected', () => {
    const onChange = vi.fn();
    render(<EventLocationField value="" code={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Local Selecionar local/i }));
    expect(screen.getByRole('button', { name: 'SALA DOS VOLUNTÁRIOS' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'CASA FENASOJA' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'AUDITÓRIO-CENTRO ADMINISTRATIVO' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'CENTRO DE EVENTOS FENASOJA' }));
    expect(onChange).toHaveBeenCalledWith('CENTRO DE EVENTOS FENASOJA', 'centro_eventos_fenasoja');
  });

  it('keeps historical custom locations and lets a new event use or clear another location', () => {
    const onChange = vi.fn();
    const { rerender } = render(<EventLocationField value="Sala antiga" code={null} onChange={onChange} />);
    expect(screen.getByRole('textbox', { name: 'Outro local do evento' })).toHaveValue('Sala antiga');
    fireEvent.change(screen.getByRole('textbox', { name: 'Outro local do evento' }), { target: { value: 'Sala nova' } });
    expect(onChange).toHaveBeenCalledWith('Sala nova', null);
    rerender(<EventLocationField value="Sala nova" code={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Local Sala nova/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Sem local definido' }));
    expect(onChange).toHaveBeenCalledWith('', null);
  });

  it('opens a blank custom field and closes with Escape without changing the location', () => {
    const onChange = vi.fn();
    render(<EventLocationField value="" code={null} onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: /Local Selecionar local/i });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('button', { name: 'CASA FENASOJA' }), { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Outro local' }));
    expect(screen.getByRole('textbox', { name: 'Outro local do evento' })).toHaveValue('');
  });
});