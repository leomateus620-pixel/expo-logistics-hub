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


export function AlvoradaBrandHero({ dataPending, stage }: AlvoradaBrandHeroProps) {
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
      <FenasojaBrand
        className="alvorada-brand-hero__brand"
        scale="display"
        markSrc="/alvorada/fenasoja-symbol-official.png"
        editionLabel={false}
        tone="dark"
      />

      <p className="alvorada-brand-hero__statement">A organização por trás da maior feira multissetorial do Brasil</p>

      {dataPending && (stage === 'brand-hold' || stage === 'org-ready') && (
        <p className="alvorada-brand-hero__sync" role="status">
          Sincronizando a estrutura organizacional registrada
        </p>
      )}
    </div>
  );
}
