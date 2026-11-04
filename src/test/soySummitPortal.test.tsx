import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { OfficialCountdownCompact } from '@/components/countdown/OfficialCountdownCompact';

afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
it('defaults to Fenasoja, switches one visible clock with keyboard-capable buttons and resets on reopening',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2027-04-19T10:30:00Z'));
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));
  const mount=()=>render(<MemoryRouter><OfficialCountdownCompact /></MemoryRouter>);
  const first=mount();
  expect(screen.getByText('29 de abril de 2028, às 10h')).toBeVisible();
  expect(screen.getAllByRole('timer')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'Ver contagem do Soy Summit'}));
  expect(screen.getByRole('heading',{name:'SOY SUMMIT 2027'})).toBeVisible();
  expect(screen.getAllByRole('timer')).toHaveLength(1);
  expect(screen.getByRole('timer')).toHaveAccessibleName('1 dias, 0 horas, 0 minutos e 0 segundos');
  const dayCard = screen.getByRole('button', { name: 'Destacar dias: 1' });
  fireEvent.click(dayCard);expect(dayCard).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(dayCard);expect(dayCard).toHaveAttribute('aria-pressed', 'false');
  expect(screen.queryByRole('button',{name:'Abrir contagem oficial da Fenasoja 2028'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Ver contagem da Fenasoja'}));
  expect(screen.getByRole('button',{name:'Abrir contagem oficial da Fenasoja 2028'})).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'Ver contagem do Soy Summit'}));first.unmount();mount();
  expect(screen.queryByRole('heading',{name:'SOY SUMMIT 2027'})).toBeNull();
  expect(screen.getByRole('button',{name:'Ver contagem do Soy Summit'})).toBeVisible();
});
it('keeps switching inaccessible while the existing introduction conceals the clock',()=>{
  render(<MemoryRouter><OfficialCountdownCompact concealed /></MemoryRouter>);
  expect(screen.queryByRole('button',{name:'Ver contagem do Soy Summit'})).toBeNull();
});
