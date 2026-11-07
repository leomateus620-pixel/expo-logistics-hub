import records from './catalog.json';
import assets from './assets.json';

export interface MemorialPiece {
  id: string;
  kind: 'edition' | 'document' | 'epilogue';
  edition?: number;
  year: number;
  parentId?: string;
  sourceFile?: string;
  engravedPeriod?: string;
  visual: string;
  notes: string[];
  reviewStatus: 'partial' | 'verified';
  model: { profile: 'matte' | 'brass' | 'ornamental'; cornerRadius: number; depth: number; screws: boolean };
  transcriptionFile?: string;
  context?: { text: string; decision: string; sources: { title: string; url: string }[] };
}

export const memorialCollection = records as MemorialPiece[];
export const historicalEditions = memorialCollection.filter(piece => piece.kind === 'edition');
export const epilogue = memorialCollection.find(piece => piece.kind === 'epilogue')!;
export const historicalDocument = memorialCollection.find(piece => piece.kind === 'document')!;
export const timelinePieces = [...historicalEditions, epilogue];
export const findPiece = (id?: string | null) => memorialCollection.find(piece => piece.id === id);
export const pieceLabel = (piece: MemorialPiece) => piece.kind === 'document'
  ? 'Placa histórica de 2020'
  : piece.kind === 'epilogue' ? 'FENASOJA 2028 · LOADING…' : `${piece.edition}ª FENASOJA`;
function versionFor(piece: MemorialPiece, field: string) { return String((assets[piece.id as keyof typeof assets] as Record<string, unknown>)[field] ?? 'v1').slice(0,12); }
export const faceUrl = (piece: MemorialPiece) => {
  const reconstructed = Boolean((assets[piece.id as keyof typeof assets] as { art?: boolean }).art);
  return `/memorial-voluntariado/${reconstructed ? 'art' : 'faces'}/${piece.id}.webp?v=${versionFor(piece, reconstructed ? 'artSha256' : 'faceSha256')}`;
};
export const rectifiedUrl = (piece: MemorialPiece) => `/memorial-voluntariado/faces/${piece.id}.webp?v=${versionFor(piece, 'faceSha256')}`;
export const thumbnailUrl = (piece: MemorialPiece, small = false) => `/memorial-voluntariado/thumbnails/${piece.id}${small ? '-240' : ''}.webp?v=${versionFor(piece, small ? 'thumbnailSmallSha256' : 'thumbnailSha256')}`;
export const originalUrl = (piece: MemorialPiece) => piece.sourceFile ? `/memorial-voluntariado/originals/${encodeURIComponent(piece.sourceFile)}` : undefined;
export const pieceAssets = (piece: MemorialPiece) => assets[piece.id as keyof typeof assets];

export interface TranscriptionLine {
  role: string;
  name: string;
  status: 'verified' | 'unreadable';
  sourceRegion: [number, number, number, number];
  note?: string;
  roleStatus?: 'verified' | 'unreadable';
}
export interface Transcription {
  status: 'partial' | 'verified';
  sections: { title: string; lines: TranscriptionLine[] }[];
  notes: string[];
}
const transcriptionLoaders = import.meta.glob<Transcription>('./transcriptions/*.json', { import: 'default' });
export async function loadTranscription(piece: MemorialPiece): Promise<Transcription> {
  const loader = transcriptionLoaders[`./transcriptions/${piece.transcriptionFile}`];
  if (!loader) throw new Error('A transcrição desta peça não está disponível.');
  return loader();
}
