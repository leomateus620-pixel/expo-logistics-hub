// Isolated diagnostic fixture. Never imported by the authenticated application.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FenasojaAlvoradaExperienceView } from '../src/features/alvorada/FenasojaAlvoradaExperience';
import { OrganizationalEcosystem } from '../src/features/alvorada/organizational/components/OrganizationalEcosystem';
import { buildOrganizationalGraph } from '../src/features/alvorada/organizational/resolver';
import type { OrganizationalUnitRecord } from '../src/features/alvorada/organizational/types';
import '../src/index.css';

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
  ['Zélia Savoldi', 'Assessoria de Marketing'], ['José Mauro Barbieri', 'Assessoria Jurídica'],
  ['Roque Vanderlei Lugoch', 'Voluntariado'],
];
const units: OrganizationalUnitRecord[] = pairs.map(([name, title], index) => ({
  id: `qa-unit-${index}`, name: title, slug: `qa-unit-${index}`, type: title.startsWith('Assessoria') ? 'assessoria' : 'comissao',
  displayOrder: index, isOfficial: true, isLegacy: false,
  responsibles: [{ id: `qa-resp-${index}`, displayName: name, responsibleType: 'pessoa', relationshipRole: 'Responsável', isPrimary: true, userId: `qa-person-${index}` }],
}));
units.unshift({ id: 'qa-central', name: 'Comissão Central', slug: 'central', type: 'comissao', displayOrder: -1, isOfficial: true, isLegacy: false, responsibles: [] });
const graph = buildOrganizationalGraph({ units, members: [
  { user_id: 'qa-president', nome_exibicao: 'Fabiano Soltis', cargo: 'Presidente Fenasoja', commission_id: 'qa-central' },
  { user_id: 'qa-vice', nome_exibicao: 'Djeison Drey', cargo: 'Vice-presidente Fenasoja', commission_id: 'qa-central' },
  ...['Fernanda Seckler Eich', 'Zélia Savoldi', 'Cléo Antonio Rockenbach'].map((nome_exibicao, index) => ({ user_id: index === 1 ? 'qa-person-30' : `qa-central-${index}`, nome_exibicao, cargo: 'Comissão Central', commission_id: 'qa-central' })),
  ...['Marcos Eduardo Servat', 'Dário Júnior da Motta Germano', 'Elemar Antonio Lenz'].map((nome_exibicao, index) => ({ user_id: `qa-ccp-${index}`, nome_exibicao, cargo: 'CCPF' })),
] });
// Baseline asset gateway is public; the optimized renderer maps these same URLs
// to packaged thumbnails. No authentication/session or production registry data.
for (const person of Object.values(graph.people)) {
  if (person.avatarUrl?.startsWith('/__l5e/')) person.avatarUrl = `https://fenasojagestao.com${person.avatarUrl}`;
}
const data = { graph, isLoading: false, error: null, refetch: async () => undefined };
Object.assign(window, { __alvoradaQaGraph: graph });
export function Diagnostic() {
  const [open, setOpen] = useState(true);
  const graphOnly = new URLSearchParams(location.search).has('graph');
  return <>{open ? graphOnly ? <div className="alvorada-overlay alvorada-overlay--ready" data-stage="org-ready"><OrganizationalEcosystem graph={graph}/></div> : <FenasojaAlvoradaExperienceView organizationalData={data} onComplete={() => setOpen(false)}/> : <button onClick={() => setOpen(true)}>Reabrir avaliação</button>}</>;
}
createRoot(document.getElementById('root')!).render(<Diagnostic/>);
