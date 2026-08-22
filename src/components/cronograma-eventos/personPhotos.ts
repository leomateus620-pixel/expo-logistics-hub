// Os arquivos de origem foram salvos trocados: o retrato do Fabiano está em
// person-djeison-drey.jpg e vice-versa. Os imports abaixo já corrigem isso.
import fabianoSoltis from '@/assets/person-djeison-drey.jpg';
import djeisonDrey from '@/assets/person-fabiano-soltis.jpg';
import brunaQuadros from '@/assets/person-bruna-quadros.png.asset.json';
import eduardoSantos from '@/assets/person-eduardo-santos.png.asset.json';
import joseFernandoBorella from '@/assets/person-jose-fernando-borella.png.asset.json';
import larissaDallalba from '@/assets/person-larissa-dallalba.png.asset.json';
import pauloNedel from '@/assets/person-paulo-nedel.png.asset.json';
import raulNunez from '@/assets/person-raul-nunez.png.asset.json';
import leonardoDambroz from '@/assets/person-leonardo-dambroz.png.asset.json';
import cassioFeltes from '@/assets/person-cassio-feltes.png.asset.json';
import felipeCarpenedoGabriel from '@/assets/person-felipe-carpenedo-gabriel.png.asset.json';
import fernandaMeinertz from '@/assets/person-fernanda-meinertz.png.asset.json';
import danielRibeiro from '@/assets/person-daniel-ribeiro.png.asset.json';
import josyaneHeck from '@/assets/person-josyane-heck.png.asset.json';
import leonardoChitolina from '@/assets/person-leonardo-chitolina.png.asset.json';
import rosaZorzan from '@/assets/person-rosa-zorzan.png.asset.json';
import germanoButtow from '@/assets/person-germano-buttow.png.asset.json';
import darioGermano from '@/assets/person-dario-germano.png.asset.json';
import cleoRockenbach from '@/assets/person-cleo-rockenbach.png.asset.json';
import marcosServat from '@/assets/person-marcos-servat.jpeg.asset.json';

/**
 * Only these members have an official portrait. Everyone else keeps the
 * existing initials / generic icon treatment.
 */
const PERSON_PHOTOS: Record<string, string> = {
  'fabiano soltis': fabianoSoltis,
  'djeison drey': djeisonDrey,
  'bruna pacheco de quadros': brunaQuadros.url,
  'eduardo santos': eduardoSantos.url,
  'jose fernando borella': joseFernandoBorella.url,
  'larissa mello dallalba': larissaDallalba.url,
  'paulo miguel nedel': pauloNedel.url,
  'raul dario nunez': raulNunez.url,
  'leonardo ruy dambroz': leonardoDambroz.url,
  'cassio ricardo feltes': cassioFeltes.url,
  'felipe carpenedo gabriel': felipeCarpenedoGabriel.url,
  'fernanda matarucco meinertz': fernandaMeinertz.url,
};

const PERSON_PHOTOS_BY_USER_ID: Record<string, string> = {
  'b8fd1e36-b46c-4eff-bb75-372b676ce123': fabianoSoltis,
  'e0ada2e5-4440-4d15-91bd-aa4160247113': djeisonDrey,
  '19171788-66a7-4ffc-bf72-82c74ca1a7ca': djeisonDrey,
  'fae623bc-2149-47c9-a59b-1899f406227c': brunaQuadros.url,
  '87d4fa05-375e-4e8f-9b56-d1b0c5d442b2': eduardoSantos.url,
  '6e758caf-f424-4a1c-9295-0b41f16e359f': joseFernandoBorella.url,
  'ae54d98d-472b-4aa7-b064-e1331505da3b': larissaDallalba.url,
  '0ff212de-11b9-431a-b4e0-166c07b6987b': pauloNedel.url,
  '3f4c603a-31e0-48dd-82bb-27571b81e3c8': raulNunez.url,
  '338f2835-ab00-4033-b390-aa185634979f': leonardoDambroz.url,
  '62fec475-8ad4-4db2-8464-c3863f2edb09': cassioFeltes.url,
  '8dce325e-91b4-4ed5-ba7d-c52cecac1c29': felipeCarpenedoGabriel.url,
  'a3b62599-3f3e-4e56-ab79-dbff4dca60e3': fernandaMeinertz.url,
};

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Returns the portrait URL for a person name, or null when there is none. */
export function getPersonPhoto(name?: string | null, userId?: string | null): string | null {
  if (userId && PERSON_PHOTOS_BY_USER_ID[userId]) return PERSON_PHOTOS_BY_USER_ID[userId];
  if (!name) return null;
  const normalized = normalize(name);
  if (!normalized) return null;
  const tokens = new Set(normalized.split(' '));
  for (const [key, url] of Object.entries(PERSON_PHOTOS)) {
    if (normalized === key) return url;
    // Match only when every token of the official name is present, so
    // homonyms ("Leonardo Chitolina") never inherit someone else's portrait.
    const keyTokens = key.split(' ');
    if (keyTokens.every((token) => tokens.has(token))) return url;
  }
  return null;
}
