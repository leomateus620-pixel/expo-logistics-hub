import automovel from '@/assets/public-share/espaco-automovel.jpg.asset.json';
import exporural from '@/assets/public-share/exporural.jpg.asset.json';
import industria from '@/assets/public-share/industria-comercio-servicos-externo.jpg.asset.json';
import p1 from '@/assets/public-share/pavilhao-1-v2.jpg.asset.json';
import p3 from '@/assets/public-share/pavilhao-3.jpg.asset.json';
import p5 from '@/assets/public-share/pavilhao-5-v2.jpg.asset.json';
import p7 from '@/assets/public-share/pavilhao-7-v2.jpg.asset.json';
import p8 from '@/assets/public-share/pavilhao-8.jpg.asset.json';
import p12 from '@/assets/public-share/pavilhao-12.jpg.asset.json';
import p13 from '@/assets/public-share/pavilhao-13.jpg.asset.json';
import p14 from '@/assets/public-share/pavilhao-14.jpg.asset.json';
import { PUBLIC_MAP_CANONICAL_ORIGIN } from './publicMapHost';
import { getPublicArea } from './publicAreaRegistry';

const IMAGES: Record<string, string> = {
  'espaco-automovel': automovel.url, exporural: exporural.url,
  'industria-comercio-servicos-externo': industria.url,
  'pavilhao-1': p1.url, 'pavilhao-3': p3.url, 'pavilhao-5': p5.url,
  'pavilhao-7': p7.url, 'pavilhao-8': p8.url, 'pavilhao-12': p12.url,
  'pavilhao-13': p13.url, 'pavilhao-14': p14.url,
};

/** Somente o escopo autorizado pode aparecer na prévia; nenhum token ou dado de venda na imagem. */
export function publicShareMetadata(slug: string, authorized: boolean, origin = PUBLIC_MAP_CANONICAL_ORIGIN) {
  const area = authorized ? getPublicArea(slug) : undefined;
  const imagePath = area ? IMAGES[slug] : undefined;
  return {
    title: area ? `Mapa Comercial Fenasoja 2028 — ${area.name}` : 'Mapa Comercial | Fenasoja 2028',
    description: area ? `Explore o mapa de ${area.name} da Fenasoja 2028 e consulte os espaços comerciais desta área.` : 'Consulte os mapas públicos autorizados da Fenasoja 2028.',
    image: imagePath ? new URL(imagePath, origin).href : null,
  };
}

function setMeta(selector: string, attribute: string, value: string | null) {
  const matches = [...document.head.querySelectorAll<HTMLMetaElement>(selector)];
  if (value === null) { matches.forEach(node => node.remove()); return; }
  const node = matches[0] ?? document.createElement('meta');
  if (!matches.length) {
    const separator = attribute.indexOf(':');
    node.setAttribute(attribute.slice(0, separator), attribute.slice(separator + 1));
    document.head.append(node);
  }
  node.content = value;
  matches.slice(1).forEach(duplicate => duplicate.remove());
}

/** Atualiza também a imagem genérica injetada pela hospedagem, sem deixar tags duplicadas. */
export function applyPublicShareMetadata(slug: string, authorized: boolean, url: string) {
  const metadata = publicShareMetadata(slug, authorized);
  document.title = metadata.title;
  setMeta('meta[name="description"]', 'name:description', metadata.description);
  setMeta('meta[property="og:title"]', 'property:og:title', metadata.title);
  setMeta('meta[property="og:description"]', 'property:og:description', metadata.description);
  setMeta('meta[property="og:type"]', 'property:og:type', 'website');
  setMeta('meta[property="og:image"]', 'property:og:image', metadata.image);
  setMeta('meta[name="twitter:image"]', 'name:twitter:image', metadata.image);
  setMeta('meta[name="twitter:title"]', 'name:twitter:title', metadata.title);
  setMeta('meta[name="twitter:description"]', 'name:twitter:description', metadata.description);
  setMeta('meta[name="twitter:card"]', 'name:twitter:card', metadata.image ? 'summary_large_image' : 'summary');
  setMeta('meta[property="og:url"]', 'property:og:url', authorized ? url : null);
  setMeta('meta[name="robots"]', 'name:robots', 'noindex, nofollow');
}