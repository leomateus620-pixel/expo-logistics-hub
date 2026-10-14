/** Technical campaign catalog: runtime renders recovered records only. */
export type FenasojaHistoryArtKind = 'advertisement' | 'branding-project' | 'program-cover' | 'institutional-banner';

interface FenasojaEditionIdentity {
  readonly id: string;
  readonly editionNumber: number;
  readonly year: number;
}

export interface FenasojaHistoryArt extends FenasojaEditionIdentity {
  readonly status: 'recuperada';
  readonly kind: FenasojaHistoryArtKind;
  readonly source: string;
  readonly publication: string;
  readonly note: string;
  readonly alt: string;
  readonly src: string;
  readonly srcSet: string;
  readonly width: 256;
  readonly height: 192;
}

export interface FenasojaPendingEdition extends FenasojaEditionIdentity {
  readonly status: 'pendente';
  readonly kind: null;
  readonly source: null;
  readonly src: null;
}

export type FenasojaEditionRecord = FenasojaHistoryArt | FenasojaPendingEdition;

const recovered = (
  editionNumber: number,
  year: number,
  kind: FenasojaHistoryArtKind,
  source: string,
  publication: string,
  note: string,
): FenasojaHistoryArt => {
  const filename = `/portal/history/fenasoja-edicao-${editionNumber}-${year}`;
  const accessibleKind: Record<FenasojaHistoryArtKind, string> = {
    advertisement: 'Anúncio de campanha',
    'branding-project': 'Peça do projeto de identidade',
    'program-cover': 'Capa do programa oficial',
    'institutional-banner': 'Banner institucional',
  };
  return Object.freeze({
    id: `fenasoja-edicao-${editionNumber}`,
    editionNumber,
    year,
    status: 'recuperada',
    kind,
    source,
    publication,
    note,
    alt: `${accessibleKind[kind]} da FENASOJA, ${editionNumber}ª edição, ${year}`,
    src: `${filename}-256x192.webp`,
    srcSet: `${filename}-256x192.webp 256w, ${filename}-512x384.webp 512w`,
    width: 256,
    height: 192,
  });
};

const pending = (editionNumber: number, year: number): FenasojaPendingEdition => Object.freeze({
  id: `fenasoja-edicao-${editionNumber}`,
  editionNumber,
  year,
  status: 'pendente',
  kind: null,
  source: null,
  src: null,
});

/** 25 documented editions, including 13 gaps with no invented artwork. */
export const FENASOJA_EDITION_CATALOG: readonly FenasojaEditionRecord[] = Object.freeze([
  pending(1, 1966),
  pending(2, 1974),
  pending(3, 1976),
  pending(4, 1979),
  pending(5, 1981),
  pending(6, 1984),
  pending(7, 1987),
  pending(8, 1990),
  pending(9, 1992),
  pending(10, 1994),
  pending(11, 1996),
  recovered(12, 1998, 'advertisement',
    "https://zebu.org.br/PortalUploads/Revistas/A_Granja/1998_Abril/revista.pdf",
    "A Granja, abril de 1998, página PDF 36",
    "Anúncio publicado; recorte do anúncio completo em página digitalizada.",
  ),
  pending(13, 2000),
  pending(14, 2002),
  recovered(15, 2004, 'advertisement',
    "https://zebu.org.br/PortalUploads/Revistas/A_Granja/2004_Abril/revista.pdf",
    "A Granja, abril de 2004, página PDF 53",
    "Imagem do anúncio extraída diretamente do PDF.",
  ),
  recovered(16, 2006, 'advertisement',
    "https://zebu.org.br/PortalUploads/Revistas/A_Granja/2006_Mar%C3%A7o/revista.pdf",
    "A Granja, março de 2006, página PDF 75",
    "Imagem do anúncio extraída diretamente do PDF.",
  ),
  recovered(17, 2008, 'advertisement',
    "https://zebu.org.br/PortalUploads/Revistas/A_Granja/2008_Mar%C3%A7o/revista.pdf",
    "A Granja, março de 2008, página PDF 67",
    "Imagem do anúncio extraída diretamente do PDF.",
  ),
  recovered(18, 2010, 'advertisement',
    "https://zebu.org.br/PortalUploads/Revistas/A_Granja/2010_Fevereiro/revista.pdf",
    "A Granja, fevereiro de 2010, página PDF 29",
    "Imagem do anúncio extraída diretamente do PDF.",
  ),
  recovered(19, 2012, 'advertisement',
    "https://zebu.org.br/PortalUploads/Revistas/A_Granja/2012_Mar%C3%A7o/revista.pdf",
    "A Granja, março de 2012, página PDF 57",
    "Imagem do anúncio extraída diretamente do PDF.",
  ),
  recovered(20, 2014, 'advertisement',
    "https://zebu.org.br/PortalUploads/Revistas/A_Granja/2014_Fevereiro/revista.pdf",
    "A Granja, fevereiro de 2014, página PDF 36",
    "Anúncio recuperado no pacote anterior, preservado nesta pesquisa.",
  ),
  recovered(21, 2016, 'advertisement',
    "https://zebu.org.br/PortalUploads/Revistas/A_Lavoura/2016_Edi%C3%A7%C3%A3o%20713/revista.pdf",
    "A Lavoura, edição 713/2016, página PDF 55",
    "Anúncio recuperado no pacote anterior, preservado nesta pesquisa.",
  ),
  recovered(22, 2018, 'branding-project',
    "https://www.behance.net/gallery/58535353/Fenasoja",
    "Portfólio GH Branding / Jacson Silveira e equipe",
    "Peça gráfica do projeto de identidade de 2018; não é digitalização de cartaz de rua.",
  ),
  recovered(23, 2022, 'program-cover',
    "https://portalbrasil.com.br/wp-content/uploads/2022/04/folder-programacao-fenasoja2022-74x215cm-Web-18.04.pdf",
    "Folder do programa oficial 2022, página PDF 1, painel direito",
    "Capa do programa oficial: peça institucional representativa, não identificada como cartaz principal.",
  ),
  recovered(24, 2024, 'advertisement',
    "https://sucessonocampo.com.br/evento/fenasoja-2024/",
    "Sucesso no Campo; campanha conferida com banner do site oficial",
    "Peça publicada da campanha com data reagendada; recuperada no pacote anterior.",
  ),
  recovered(25, 2026, 'institutional-banner',
    "https://fenasoja.com.br/wp-content/uploads/2025/06/Banner-site-fenasoja.webp",
    "Banner institucional hospedado no domínio oficial Fenasoja",
    "Banner oficial 2026, não identificado como cartaz impresso principal.",
  ),
]);

/** Twelve genuine recovered pieces in official edition order; pending entries never render. */
export const FENASOJA_HISTORY_ARTS: readonly FenasojaHistoryArt[] = Object.freeze(
  FENASOJA_EDITION_CATALOG.filter((edition): edition is FenasojaHistoryArt => edition.status === 'recuperada'),
);
