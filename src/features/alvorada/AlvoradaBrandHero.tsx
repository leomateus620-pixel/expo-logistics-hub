import { FenasojaBrand } from '@/components/brand/FenasojaBrand';

type BrandStage =
  | 'dawn'
  | 'territory'
  | 'santa-rosa'
  | 'brand-reveal'
  | 'brand-hold'
  | 'org-transition'
  | 'org-ready';

interface AlvoradaBrandHeroProps {
  dataPending: boolean;
  stage: BrandStage;
}

const STAGE_COPY: Record<BrandStage, { eyebrow: string; title: string }> = {
  dawn: {
    eyebrow: 'O Nascer da Alvorada',
    title: 'Um novo ciclo desperta',
  },
  territory: {
    eyebrow: 'Rio Grande do Sul',
    title: 'Do território nasce a nossa força',
  },
  'santa-rosa': {
    eyebrow: 'Santa Rosa · RS',
    title: 'Aqui convergem pessoas, trabalho e futuro',
  },
  'brand-reveal': {
    eyebrow: 'Santa Rosa · Rio Grande do Sul',
    title: 'A organização por trás da maior feira multissetorial do Brasil',
  },
  'brand-hold': {
    eyebrow: 'Santa Rosa · Rio Grande do Sul',
    title: 'A organização por trás da maior feira multissetorial do Brasil',
  },
  'org-transition': {
    eyebrow: 'Ecossistema organizacional',
    title: 'A marca se transforma em estrutura, relações e responsabilidade',
  },
  'org-ready': {
    eyebrow: 'Ecossistema organizacional',
    title: 'FENASOJA 2028',
  },
};

export function AlvoradaBrandHero({ dataPending, stage }: AlvoradaBrandHeroProps) {
  const copy = STAGE_COPY[stage];
  const brandVisible = stage === 'brand-reveal'
    || stage === 'brand-hold'
    || stage === 'org-transition'
    || (stage === 'org-ready' && dataPending);

  return (
    <div
      className={`alvorada-brand-hero${brandVisible ? ' alvorada-brand-hero--visible' : ''}${stage === 'org-transition' ? ' alvorada-brand-hero--handoff' : ''}`}
      data-stage={stage}
      aria-hidden={!brandVisible}
    >
      <div className="alvorada-brand-hero__territory">
        <span aria-hidden="true" />
        <p>{copy.eyebrow}</p>
        <span aria-hidden="true" />
      </div>

      <FenasojaBrand
        className="alvorada-brand-hero__brand"
        scale="display"
        subtitle="Edição 2028 · Santa Rosa"
        tone="dark"
      />

      <p className="alvorada-brand-hero__statement">{copy.title}</p>

      <div className="alvorada-brand-hero__origin" aria-hidden="true">
        <span />
        <i />
      </div>

      {dataPending && (stage === 'brand-hold' || stage === 'org-ready') && (
        <p className="alvorada-brand-hero__sync" role="status">
          Sincronizando a estrutura organizacional registrada
        </p>
      )}
    </div>
  );
}
