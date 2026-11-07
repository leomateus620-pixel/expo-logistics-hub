import { fireEvent, render, screen, waitFor, within, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSearchParams, MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { FenasojaEcosystemExperienceView } from '@/features/alvorada/FenasojaEcosystemExperience';
import { readEcosystemLocation, writeEcosystemLocation } from '@/features/alvorada/ecosystemNavigation';
import { timelinePieces } from './catalog';

vi.mock('./MemorialViewer', () => ({ default: () => <div data-testid="inspection-fixture">Inspeção isolada do teste</div> }));
afterEach(cleanup);
function Flow() {
  const [params,setParams] = useSearchParams();
  const location = useLocation(), go = useNavigate();
  const navigation = readEcosystemLocation(params);
  return <><output data-testid="location">{location.pathname}{location.search}</output><button onClick={() => go(-1)}>Browser back</button><button onClick={() => go(1)}>Browser forward</button>{navigation && <FenasojaEcosystemExperienceView
    onComplete={() => setParams(current => writeEcosystemLocation(current,null))}
    navigation={navigation} onNavigate={target => setParams(current => writeEcosystemLocation(current,target))}
    organizationalData={{ graph: null, isLoading: false, error: null, refetch: async () => undefined }}
  />}</>;
}

describe('Memorial direct inspection journey', () => {
  it('enters by icon, opens directly, preserves the gallery, restores focus and exits one layer at a time', async () => {
    render(<MemoryRouter initialEntries={['/portal?campanha=2028&ecossistema=organizacao']}><Flow /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button',{name:'Memorial do Voluntariado'}));
    await screen.findByRole('heading',{name:'Memorial do Voluntariado'});
    const links = within(screen.getByRole('list',{name:/Linha do tempo/})).getAllByRole('link');
    expect(links).toHaveLength(26);
    const gallery = document.querySelector('.memorial-gallery');
    const world = document.querySelector('.memorial-timeline') as HTMLElement;
    const before = world.style.transform;
    const origin = links[0];
    fireEvent.click(origin);
    await screen.findByRole('heading',{name:'1966 1ª FENASOJA'});
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Fechar Ecossistema Fenasoja'})).not.toBeInTheDocument();
    expect(gallery).toHaveAttribute('inert');
    expect(world).toBeInTheDocument();
    expect(world.style.transform).toBe(before);
    expect(screen.getByTestId('location').textContent).toContain('/portal?campanha=2028&ecossistema=memorial&edicao=fenasoja-1966');
    await waitFor(() => expect(screen.getByText('WILLY KLAUS')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button',{name:'Ler inscrições'}));
    expect(screen.getByRole('region',{name:'Inscrições de 1ª FENASOJA'})).toHaveClass('memorial-reading');
    fireEvent.keyDown(window,{key:'Escape'});
    await waitFor(() => expect(origin).toHaveFocus());
    expect(world.style.transform).toBe(before);
    expect(gallery).not.toHaveAttribute('inert');
    fireEvent.keyDown(window,{key:'Escape'});
    await waitFor(() => expect(screen.getByRole('button',{name:'Memorial do Voluntariado'})).toHaveFocus());
    expect(screen.getByTestId('location').textContent).toBe('/portal?campanha=2028&ecossistema=organizacao');
  });
  it('keeps the 2020 document with 2022 and returns from a direct link to the correct card', async () => {
    render(<MemoryRouter initialEntries={['/?ecossistema=memorial&edicao=fenasoja-2022']}><Flow /></MemoryRouter>);
    await screen.findByRole('heading',{name:'2022 23ª FENASOJA'});
    fireEvent.click(screen.getByRole('link',{name:'Documento de 2020'}));
    await screen.findByRole('heading',{name:'2020 Placa histórica de 2020'});
    expect(screen.getByTestId('location').textContent).toBe('/?ecossistema=memorial&edicao=fenasoja-2022&documento=2020');
    fireEvent.click(screen.getByRole('button',{name:'Fechar quadro'}));
    await waitFor(() => expect(screen.getByRole('link',{name:/2022 \/ 23ª/})).toHaveFocus());
  });
  it('restores mounted gallery on browser back and reopens on forward', async () => {
    render(<MemoryRouter initialEntries={['/?ecossistema=memorial']}><Flow /></MemoryRouter>);
    const origin = await screen.findByRole('link',{name:/2014 \/ 20ª/});
    fireEvent.click(origin);
    await screen.findByRole('heading',{name:'2014 20ª FENASOJA'});
    fireEvent.click(screen.getByRole('button',{name:'Browser back'}));
    await waitFor(() => expect(origin).toHaveFocus());
    fireEvent.click(screen.getByRole('button',{name:'Browser forward'}));
    await screen.findByRole('heading',{name:'2014 20ª FENASOJA'});
    expect(screen.getByRole('button',{name:'Fechar quadro'})).toHaveFocus();
  });
  it('maps every chronological card to its own identity and keeps the epilogue in the last usable cell', async () => {
    render(<MemoryRouter initialEntries={['/?ecossistema=memorial']}><Flow /></MemoryRouter>);
    await screen.findByRole('heading',{name:'Memorial do Voluntariado'});
    const links = within(screen.getByRole('list',{name:/Linha do tempo/})).getAllByRole('link');
    for (const [i,piece] of timelinePieces.entries()) {
      expect(links[i]).toHaveAttribute('href',expect.stringContaining(`edicao=${piece.id}`));
      expect(links[i]).toHaveAccessibleName(new RegExp(`^${piece.year}`));
    }
    fireEvent.click(links[25]);
    await screen.findByRole('heading',{name:'2028 FENASOJA 2028 · LOADING…'});
  });
});
