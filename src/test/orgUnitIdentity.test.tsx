// @vitest-environment jsdom

import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CCPF_IDENTITY_ID,
  ORG_UNIT_IDENTITIES,
  OrgUnitIdentityBadge,
  resolveOrgUnitIdentity,
} from '@/components/cronograma-eventos/org-unit-identity';
import {
  RelationalMultiSelect,
  type RelationalSelection,
} from '@/components/cronograma-eventos/RelationalMultiSelect';
import { buildCommissionOptions } from '@/components/cronograma-eventos/useCronogramaRelationOptions';
import type { OrgUnit } from '@/lib/org-units';

function unit(partial: Partial<OrgUnit> & Pick<OrgUnit, 'id' | 'name' | 'slug'>): OrgUnit {
  return {
    type: 'comissao',
    displayOrder: 1,
    isOfficial: true,
    isLegacy: false,
    responsibles: [],
    ...partial,
  };
}

const officialUnits: OrgUnit[] = [
  unit({ id: 'u-ccpf', name: 'CCPF — CONSELHO CONSULTIVO PERMANENTE FENASOJA', slug: 'ccpf', type: 'conselho' }),
  unit({ id: 'u-sys', name: 'Assessoria de Sistemas', slug: 'assessoria-de-sistemas', type: 'assessoria' }),
  unit({ id: 'u-mkt', name: 'ASSESSORIA DE MARKETING/COMUNICAÇÃO', slug: 'assessoria-de-marketing', type: 'assessoria' }),
  unit({ id: 'u-proj', name: 'Assessoria de Projetos e Captações', slug: 'assessoria-projetos-e-captacoes-institucionais', type: 'assessoria' }),
  unit({ id: 'u-log', name: 'Logística, Hotelaria e Turismo', slug: 'logistica-hotelaria-e-turismo' }),
  unit({ id: 'u-novo', name: 'Unidade Futura', slug: 'unidade-futura' }),
];

describe('registro de identidade iconográfica das unidades', () => {
  it('cobre cada entidade com identificador estável único e ícone próprio', () => {
    const ids = ORG_UNIT_IDENTITIES.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);

    const symbols = ORG_UNIT_IDENTITIES.filter((item) => item.icon).map((item) => item.icon);
    expect(new Set(symbols).size).toBe(symbols.length);

    expect(ORG_UNIT_IDENTITIES.filter((item) => item.kind === 'conselho').map((item) => item.id)).toEqual(['ccpf']);
    expect(ORG_UNIT_IDENTITIES.filter((item) => item.kind === 'assessoria')).toHaveLength(8);
    expect(ORG_UNIT_IDENTITIES.filter((item) => item.kind === 'comissao').every((item) => item.icon)).toBe(true);
  });

  it('reserva a marca oficial ao CCPF e nunca a um ícone genérico', () => {
    const ccpf = ORG_UNIT_IDENTITIES.find((item) => item.id === CCPF_IDENTITY_ID);
    expect(ccpf?.symbol).toBe('fenasoja');
    expect(ccpf?.icon).toBeNull();
    expect(ORG_UNIT_IDENTITIES.filter((item) => item.symbol)).toHaveLength(1);
  });

  it('resolve por slug canônico, slug histórico e nome oficial exato, nunca por trecho', () => {
    expect(resolveOrgUnitIdentity({ slug: 'assessoria-juridica', name: 'qualquer' })?.id).toBe('assessoria-juridica');
    expect(resolveOrgUnitIdentity({
      slug: 'assessoria-projetos-e-captacoes-institucionais',
      name: 'Assessoria de Projetos e Captações',
    })?.id).toBe('assessoria-de-projetos-e-captacoes');
    expect(resolveOrgUnitIdentity({ slug: 'x', name: 'ASSESSORIA DE MARKETING/COMUNICAÇÃO' })?.id).toBe('assessoria-de-marketing');
    expect(resolveOrgUnitIdentity({ slug: 'x', name: 'Comissão de Segurança Alimentar' })).toBeNull();
    expect(resolveOrgUnitIdentity({ slug: '', name: '' })).toBeNull();
  });

  it('anexa a identidade às opções sem alterar campos persistidos nem a ordem', () => {
    const options = buildCommissionOptions(officialUnits);
    expect(options.map((option) => option.id)).toEqual(['u-ccpf', 'u-sys', 'u-mkt', 'u-proj', 'u-log', 'u-novo']);
    expect(options.map((option) => option.identityId)).toEqual([
      'ccpf',
      'assessoria-de-sistemas',
      'assessoria-de-marketing',
      'assessoria-de-projetos-e-captacoes',
      'logistica-hotelaria-e-turismo',
      undefined,
    ]);
    expect(options[0].identityKind).toBe('conselho');
    expect(options[0].group).toBe('CCPF');
    expect(options[1].hint).toBe('Assessoria');
    expect(options[5].identityKind).toBe('comissao');
  });

  it('mantém a identidade ao reordenar a lista', () => {
    const reversed = buildCommissionOptions([...officialUnits].reverse());
    const bySlug = new Map(reversed.map((option) => [option.id, option.identityId]));
    expect(bySlug.get('u-proj')).toBe('assessoria-de-projetos-e-captacoes');
    expect(bySlug.get('u-ccpf')).toBe('ccpf');
  });
});

describe('badge de identidade', () => {
  afterEach(cleanup);

  it('renderiza ícone decorativo para unidades mapeadas', () => {
    const { container } = render(<OrgUnitIdentityBadge identityId="assessoria-juridica" kind="assessoria" />);
    const badge = container.querySelector('.org-unit-identity');
    expect(badge).toHaveAttribute('aria-hidden', 'true');
    expect(badge).toHaveAttribute('data-identity', 'assessoria-juridica');
    expect(badge?.querySelector('svg')).toBeInTheDocument();
    expect(badge?.querySelector('img')).toBeNull();
  });

  it('renderiza a marca oficial reduzida para o CCPF', () => {
    const { container } = render(<OrgUnitIdentityBadge identityId="ccpf" kind="conselho" />);
    const badge = container.querySelector('.org-unit-identity');
    expect(badge).toHaveAttribute('data-kind', 'conselho');
    expect(badge?.querySelector('img')).toHaveAttribute('alt', '');
    expect(badge?.querySelector('svg')).toBeNull();
  });

  it('usa fallback elegante para unidades ainda não mapeadas', () => {
    const { container } = render(<OrgUnitIdentityBadge kind="comissao" />);
    const badge = container.querySelector('.org-unit-identity');
    expect(badge).toHaveAttribute('data-identity', 'fallback');
    expect(badge?.querySelector('svg')).toBeInTheDocument();
  });
});

function Harness({ presentation = 'desktop' }: { presentation?: 'desktop' | 'mobile' }) {
  const options = buildCommissionOptions(officialUnits);
  const [value, setValue] = useState<RelationalSelection[]>([
    { id: 'u-proj', label: 'Assessoria de Projetos e Captações', hint: 'assessoria-projetos-e-captacoes-institucionais', isPrimary: true },
  ]);
  return (
    <RelationalMultiSelect
      id="areas"
      label="Comissão ou Assessoria responsável"
      placeholder="Buscar comissão, assessoria ou responsável"
      options={options}
      value={value}
      onChange={setValue}
      presentation={presentation}
      variant="organization"
    />
  );
}

describe('seletor de áreas com identidade', () => {
  beforeEach(() => {
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 0)));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((h: number) => window.clearTimeout(h)));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('mostra a mesma identidade na lista, na busca e na seleção, preservando nomes acessíveis', async () => {
    render(<Harness />);

    const selected = screen.getByRole('list', { name: /selecionados/i });
    expect(within(selected).getByText('Assessoria de Projetos e Captações')).toBeInTheDocument();
    expect(selected.querySelector('.org-unit-identity')).toHaveAttribute('data-identity', 'assessoria-de-projetos-e-captacoes');

    fireEvent.click(screen.getByRole('button', { name: /Selecionar|Adicionar ou alterar/ }));
    const listbox = await screen.findByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(6);
    options.forEach((option) => {
      const badge = option.querySelector('.org-unit-identity');
      expect(badge).toHaveAttribute('aria-hidden', 'true');
    });

    const ccpf = within(listbox).getByRole('option', { name: /CCPF/ });
    expect(ccpf.querySelector('.org-unit-identity')).toHaveAttribute('data-kind', 'conselho');
    expect(ccpf.querySelector('img')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sistemas' } });
    await waitFor(() => expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1));
    const found = within(screen.getByRole('listbox')).getByRole('option', { name: /Assessoria de Sistemas/ });
    expect(found.querySelector('.org-unit-identity')).toHaveAttribute('data-identity', 'assessoria-de-sistemas');

    fireEvent.click(found);
    expect(found).toHaveAttribute('aria-selected', 'true');
    expect(within(selected).getByText('Assessoria de Sistemas')).toBeInTheDocument();
  });
});
