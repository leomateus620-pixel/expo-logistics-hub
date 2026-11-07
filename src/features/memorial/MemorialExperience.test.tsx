import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSearchParams, MemoryRouter, useLocation } from 'react-router-dom';
import { FenasojaEcosystemExperienceView } from '@/features/alvorada/FenasojaEcosystemExperience';
import { readEcosystemLocation, writeEcosystemLocation } from '@/features/alvorada/ecosystemNavigation';
import { timelinePath } from './timelinePath';

vi.mock('./MemorialViewer', () => ({ default: () => <div data-testid="inspection-fixture">Inspeção isolada do teste</div> }));
// jsdom has no scrolling implementation; actual breakpoint return is checked in the browser.
const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
beforeAll(() => Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() }));
afterAll(() => {
  if (originalScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});
afterEach(cleanup);

function Flow() {
  const [params,setParams] = useSearchParams();
  const location = useLocation();
  const navigation = readEcosystemLocation(params);
  return <><output data-testid="location">{location.pathname}{location.search}</output>{navigation && <FenasojaEcosystemExperienceView
    onComplete={() => setParams(current => writeEcosystemLocation(current,null))}
    navigation={navigation} onNavigate={target => setParams(current => writeEcosystemLocation(current,target))}
    organizationalData={{ graph: null, isLoading: false, error: null, refetch: async () => undefined }}
  />}</>;
}

describe('Memorial ecosystem journey', () => {
  it('supports keyboard entry, linked detail, selectable inscription text, scroll/focus restoration and home return', async () => {
    render(<MemoryRouter initialEntries={['/portal?campanha=2028&ecossistema=organizacao']}><Flow /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button',{name:'Memorial do Voluntariado'}));
    const title = await screen.findByRole('heading',{name:'MEMORIAL DO VOLUNTARIADO'}, { timeout: 10000 });
    expect(title).toBeInTheDocument();
    const links = within(screen.getByRole('list',{name:/Linha do tempo/})).getAllByRole('link');
    expect(links).toHaveLength(26);
    expect(links[0]).toHaveAccessibleName(/^1966/);
    expect(links[24]).toHaveAccessibleName(/^2026/);
    expect(links[25]).toHaveAccessibleName(/^2028/);
    const gallery = document.querySelector('.memorial-gallery') as HTMLElement;
    gallery.scrollTop=721;
    const origin=links[0];
    fireEvent.click(origin);
    expect(await screen.findByRole('heading',{name:'1966 1ª FENASOJA'})).toBeInTheDocument();
    expect(screen.getByTestId('location').textContent).toContain('/portal?campanha=2028&ecossistema=memorial&edicao=fenasoja-1966');
    await userEvent.click(screen.getByRole('tab',{name:'Transcrição'}));
    await waitFor(() => expect(within(screen.getByRole('tabpanel')).getByText('WILLY KLAUS')).toBeInTheDocument(), { timeout: 5000 });
    fireEvent.keyDown(window,{key:'Escape'});
    await waitFor(() => expect(origin).toHaveFocus());
    expect(gallery.scrollTop).toBe(721);
    fireEvent.click(screen.getByRole('button',{name:'Voltar ao Ecossistema'}));
    await waitFor(() => expect(screen.getByRole('button',{name:'Memorial do Voluntariado'})).toHaveFocus());
    expect(screen.getByTestId('location').textContent).toBe('/portal?campanha=2028&ecossistema=organizacao');
  }, 15000);
  it('opens the separately sourced 2020 document through the 2022 detail', async () => {
    render(<MemoryRouter initialEntries={['/portal?ecossistema=memorial&edicao=fenasoja-2022']}><Flow /></MemoryRouter>);
    await screen.findByRole('heading',{name:'2022 23ª FENASOJA'});
    fireEvent.click(screen.getByRole('link',{name:/Placa histórica de 2020/}));
    await screen.findByRole('heading',{name:'2020 Placa histórica de 2020'});
    expect(screen.getByTestId('location').textContent).toBe('/portal?ecossistema=memorial&edicao=fenasoja-2022&documento=2020');
    expect(screen.getByText(/As datas e inscrições deste documento foram preservadas/)).toBeInTheDocument();
  });
  it('draws desktop turns outside the marker corridor and a native vertical path on mobile', () => {
    const points=[{x:70,y:360},{x:280,y:360},{x:280,y:830},{x:70,y:830}];
    const desktop=timelinePath(points,350,2);
    expect(desktop).toMatch(/Q 346 360 346 390/);
    expect(desktop).toMatch(/V 800 Q 346 830/);
    expect(timelinePath([{x:12,y:20},{x:12,y:420}],350,1)).toBe('M 12 20 L 12 420');
    expect(timelinePath([{x:70,y:360},{x:70,y:830}],350,2,true)).toBe('M 70 360 L 70 830');
  });
});
