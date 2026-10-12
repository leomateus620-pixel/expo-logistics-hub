// Isolated diagnostic fixture. Never imported by the authenticated application.
//
// Default: the portal hero card ("ABERTURA OFICIAL EM") hosting the embedded
// Alvorada intro, exactly as the portal renders it, without authentication.
// `?graph`: the organizational ecosystem alone (37-node fixture).
import React, { lazy, Suspense, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { FenasojaPortalHero } from '../src/components/portal/FenasojaPortalHero';
import '../src/index.css';
import '../src/styles/commission-portal.css';

const EcosystemFixture = lazy(async () => {
  const [{ FenasojaEcosystemExperienceView }, { buildOrganizationalGraph }] = await Promise.all([
    import('../src/features/alvorada/FenasojaEcosystemExperience'),
    import('../src/features/alvorada/organizational/resolver'),
  ]);
  type OrganizationalUnitRecord = import('../src/features/alvorada/organizational/types').OrganizationalUnitRecord;

  const pairs = [
    ['Deise Anelise Froelich', 'Assessoria de Imprensa'], ['Valtair Dornelles', 'Serviços'],
    ['Leonardo Ruy Dambroz', 'Prevenção e Combate a Incêndio'], ['Felipe Bortoli', 'Indústria, Comércio e Serviços'],
    ['Leonardo Chitolina', 'Arte e Cultura'], ['Vanessa Matraszek Gnoatto', 'Agricultura, Soja e Derivados'],
    ['José Fernando Borella', 'Bilheteria'], ['Roberto Steffen', 'Segurança e Trânsito'],
    ['Thais Brodlo', 'Recepção e Eventos'], ['Cristina Scheuermann', 'Esporte e Lazer'],
    ['Júlio Bravo', 'Assessoria de Relações Internacionais'], ['Daniel U Ribeiro da Silva', 'Shows'],
    ['Paulo Miguel Nedel', 'Relações Estratégicas'], ['Fernanda Matarucco Meinertz', 'Relacionamento e Experiência'],
    ['Larissa Mello Dallalba', 'Credenciamento'], ['Cássio Ricardo Feltes', 'Soy Summit'],
    ['Alexandre Dall Agnese', 'Restaurantes'], ['Eduardo Santos', 'Infraestrutura'],
    ['Rosa Zorzan de Paula', 'Turismo'], ['Rodrigo Calixto', 'Gastronomia'],
    ['Estela Zamberlam Schwerz', 'Acessibilidade'], ['Jorge Luiz Viana', 'Assessoria de Protocolo'],
    ['Bruna Pacheco de Quadros', 'Acolhimento'], ['Vanessa Peripolli', 'Brigada'],
    ['Josyane Cristina Heck', 'Comunicação Visual'], ['Elton Luis Walker', 'Espaço Automóvel'],
    ['Felipe Carpenedo Gabriel', 'Inovação'], ['Germano Tessmer Buttow', 'Expocultural'],
    ['Elisandra Simão Reis', 'Pecuária'], ['Raul Dario Nunez', 'Mercosul'],
    ['Zélia Savoldi', 'Assessoria de Marketing/Comunicação'], ['José Mauro Barbieri', 'Assessoria Jurídica'],
    ['Roque Vanderlei Lugoch', 'Voluntariado'],
  ];
  const units: OrganizationalUnitRecord[] = pairs.map(([name, title], index) => ({
    id: `qa-unit-${index}`, name: title, slug: `qa-unit-${index}`, type: title.startsWith('Assessoria') ? 'assessoria' : 'comissao',
    displayOrder: index, isOfficial: true, isLegacy: false,
    responsibles: [{ id: `qa-resp-${index}`, displayName: name, responsibleType: 'pessoa', relationshipRole: index === 30 ? 'principal' : 'Responsável', isPrimary: true, userId: index === 30 ? '38e7e8d3-4c66-4279-92ea-961b70ee4e80' : `qa-person-${index}` }],
  }));
  units.unshift({ id: 'qa-central', name: 'Comissão Central', slug: 'central', type: 'comissao', displayOrder: -1, isOfficial: true, isLegacy: false, responsibles: [] });
  const raw = { units, members: [
    { user_id: 'qa-president', nome_exibicao: 'Fabiano Soltis', cargo: 'Presidente Fenasoja', commission_id: 'qa-central' },
    { user_id: 'qa-vice', nome_exibicao: 'Djeison Drey', cargo: 'Vice-presidente Fenasoja', commission_id: 'qa-central' },
    ...['Fernanda Seckler Eich', 'Zélia Savoldi', 'Cléo Antonio Rockenbach'].map((nome_exibicao, index) => ({ user_id: index === 1 ? '74a71a9f-c2a6-4ae1-baed-1e2d7b8bc07f' : `qa-central-${index}`, nome_exibicao, cargo: index === 1 ? 'Marketing e Comunicação' : 'Comissão Central', commission_id: 'qa-central', commission_nome: 'Comissão Central' })),
    { user_id: '38e7e8d3-4c66-4279-92ea-961b70ee4e80', nome_exibicao: 'Zélia Savoldi', cargo: 'Assessoria de Marketing', commission_id: 'qa-central', commission_nome: 'Comissão Central' },
    ...['Marcos Eduardo Servat', 'Dário Júnior da Motta Germano', 'Elemar Antonio Lenz'].map((nome_exibicao, index) => ({ user_id: `qa-ccp-${index}`, nome_exibicao, cargo: 'CCPF' })),
  ] };
  const graph = buildOrganizationalGraph(raw);
  // Baseline asset gateway is public; the optimized renderer maps these same URLs
  // to packaged thumbnails. No authentication/session or production registry data.
  for (const person of Object.values(graph.people)) {
    if (person.avatarUrl?.startsWith('/__l5e/')) person.avatarUrl = `https://fenasojagestao.com${person.avatarUrl}`;
  }
  Object.assign(window, { __alvoradaQaGraph: graph, __alvoradaQaRaw: raw });

  function GraphDiagnostic() {
    const [open, setOpen] = useState(true);
    const [currentGraph, setCurrentGraph] = useState(graph);
    const opener = useRef<HTMLButtonElement>(null);
    Object.assign(window, { __alvoradaQaRefresh: () => {
      const refreshed = buildOrganizationalGraph({ members: [...raw.members].reverse(), units: [...raw.units].reverse() });
      Object.assign(window, { __alvoradaQaGraph: refreshed });
      setCurrentGraph(refreshed);
    } });
    return <>
      <button ref={opener} hidden={open} onClick={() => setOpen(true)}>Abrir ecossistema</button>
      {open && <FenasojaEcosystemExperienceView
        onComplete={() => { setOpen(false); window.requestAnimationFrame(() => opener.current?.focus()); }}
        organizationalData={{ graph: currentGraph, isLoading: false, error: null, refetch: async () => {} }}
      />}
    </>;
  }
  return { default: GraphDiagnostic };
});

export function Diagnostic() {
  if (new URLSearchParams(location.search).has('graph')) {
    return (
      <Suspense fallback={null}>
        <EcosystemFixture />
      </Suspense>
    );
  }
  // The portal shell reproduces the card width the hero receives in production.
  return (
    <MemoryRouter initialEntries={['/portal']}>
      <div className="fenasoja-portal">
        <main className="fenasoja-portal__shell" style={{ position: 'relative', zIndex: 1 }}>
          <FenasojaPortalHero />
        </main>
      </div>
    </MemoryRouter>
  );
}

createRoot(document.getElementById('root')!).render(<Diagnostic />);
