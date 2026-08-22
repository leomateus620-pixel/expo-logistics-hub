import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OrgNode } from '../types';
import type { OrgSearchResult } from '../hooks/useOrgGraphInteraction';
import { OrgSearch } from './OrgControls';

function result(id: string, label: string, title: string): OrgSearchResult {
  const node: OrgNode = {
    id,
    type: 'commission',
    authorityLevel: 4,
    title,
    subtitle: null,
    personIds: [],
    parentIds: [],
    childIds: [],
    commissionId: id,
    advisoryId: null,
    sortOrder: 0,
    isRenderable: true,
    responsibilities: [],
    metadata: {},
  };
  return { id, label, meta: title, node };
}

const RESULTS = [
  result('logistics', 'Bruno Souza', 'Comissão de Logística'),
  result('press', 'Daniela Souza', 'Assessoria de Imprensa'),
];

function SearchHarness({ onSelect }: { onSelect: (result: OrgSearchResult) => void }) {
  const [query, setQuery] = useState('Souza');
  return (
    <OrgSearch
      query={query}
      results={RESULTS}
      onQueryChange={setQuery}
      onResultSelect={onSelect}
    />
  );
}

describe('OrgSearch combobox', () => {
  it('tracks ArrowUp/ArrowDown with aria-activedescendant and selects the active option', () => {
    const onSelect = vi.fn();
    render(<SearchHarness onSelect={onSelect} />);
    const combobox = screen.getByRole('combobox', { name: /Buscar pessoa/i });
    const options = screen.getAllByRole('option');

    expect(combobox).toHaveAttribute('aria-activedescendant', options[0].id);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    expect(combobox).toHaveAttribute('aria-activedescendant', options[1].id);
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveClass('org-search__result--active');

    fireEvent.keyDown(combobox, { key: 'ArrowUp' });
    expect(combobox).toHaveAttribute('aria-activedescendant', options[0].id);

    fireEvent.keyDown(combobox, { key: 'ArrowUp' });
    expect(combobox).toHaveAttribute('aria-activedescendant', options[1].id);
    fireEvent.keyDown(combobox, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(RESULTS[1]);
  });

  it('clears the query and collapses the list with Escape', () => {
    render(<SearchHarness onSelect={vi.fn()} />);
    const combobox = screen.getByRole('combobox', { name: /Buscar pessoa/i });

    fireEvent.keyDown(combobox, { key: 'Escape' });

    expect(combobox).toHaveValue('');
    expect(combobox).toHaveAttribute('aria-expanded', 'false');
    expect(combobox).not.toHaveAttribute('aria-activedescendant');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });
});
