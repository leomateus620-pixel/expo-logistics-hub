import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import CommissionCard from '@/components/commissions/CommissionCard';
import { commissionModules } from '@/modules/commissions/commissionRegistry';

const module = commissionModules[0];

describe('CommissionCard — assessorias compartilhadas', () => {
  it('mostra todos os responsáveis principais lado a lado', () => {
    render(
      <MemoryRouter>
        <CommissionCard
          access={{ state: 'allowed', label: 'Disponível', target: '/x' }}
          module={module}
          onSelect={() => {}}
          responsible={{ id: 'a', name: 'José Mauro Barbieri', role: 'Principal' }}
          leads={[
            { id: 'a', name: 'José Mauro Barbieri', role: 'Principal' },
            { id: 'b', name: 'Sandra Lameira', role: 'Principal' },
          ]}
          members={[]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('José Mauro Barbieri')).toBeInTheDocument();
    expect(screen.getByText('Sandra Lameira')).toBeInTheDocument();
    expect(screen.getAllByText('Principal')).toHaveLength(2);
  });

  it('mantém o formato de responsável único quando há apenas um principal', () => {
    render(
      <MemoryRouter>
        <CommissionCard
          access={{ state: 'allowed', label: 'Disponível', target: '/x' }}
          module={module}
          onSelect={() => {}}
          responsible={{ id: 'a', name: 'Julio Bravo', role: 'Principal' }}
          members={[]}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('Principal')).toHaveLength(1);
  });
});
