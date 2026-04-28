import coopermilLogo from '@/assets/partners/coopermil.png';
import banrisulLogo from '@/assets/partners/banrisul.png';
import celenaLogo from '@/assets/partners/celena.jpg';
import sicrediLogo from '@/assets/partners/sicredi.png';

export type PartnerSlug = 'coopermil' | 'banrisul' | 'celena' | 'sicredi';

export interface Partner {
  slug: PartnerSlug;
  nome: string;
  logo: string;
}

export const PARTNERS: Partner[] = [
  { slug: 'coopermil', nome: 'Coopermil', logo: coopermilLogo },
  { slug: 'banrisul', nome: 'Banrisul', logo: banrisulLogo },
  { slug: 'celena', nome: 'Celena Alimentos', logo: celenaLogo },
  { slug: 'sicredi', nome: 'Sicredi', logo: sicrediLogo },
];

export function getPartner(slug?: string | null): Partner | null {
  if (!slug) return null;
  return PARTNERS.find((p) => p.slug === slug) || null;
}
