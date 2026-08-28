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
import robertoSteffen from '@/assets/person-roberto-steffen.png.asset.json';
import felipeBortoli from '@/assets/person-felipe-bortoli.png.asset.json';
import valtairDornelles from '@/assets/person-valtair-dornelles.png.asset.json';
import elisandraSimaoReis from '@/assets/person-elisandra-simao-reis.png.asset.json';
import alexandreDallagnese from '@/assets/person-alexandre-dallagnese.png.asset.json';
import zeliaSavoldi from '@/assets/person-zelia-savoldi.png.asset.json';

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
  'daniel u ribeiro da silva': danielRibeiro.url,
  'josyane cristina heck': josyaneHeck.url,
  'leonardo chitolina': leonardoChitolina.url,
  'rosa zorzan de paula': rosaZorzan.url,
  'germano tessmer buttow': germanoButtow.url,
  'dario junior da motta germano': darioGermano.url,
  'cleo antonio rockenbach': cleoRockenbach.url,
  'marcos eduardo servat': marcosServat.url,
  'roberto steffen': robertoSteffen.url,
  'felipe bortoli': felipeBortoli.url,
  'valtair dornelles': valtairDornelles.url,
  'elisandra simao reis': elisandraSimaoReis.url,
  'alexandre dall agnese': alexandreDallagnese.url,
  'zelia savoldi': zeliaSavoldi.url,
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
  'c44eb392-a0b1-4e26-a779-172dda834a93': danielRibeiro.url,
  'f2eca357-8825-441e-99a0-5c4657553166': josyaneHeck.url,
  '17a834e4-3ae6-4842-9306-b19dd0559a3c': leonardoChitolina.url,
  'aafa8fd8-97cf-4e5b-8ade-3b4fe1e206a2': rosaZorzan.url,
  'b431453a-322c-4f2f-b962-bc5d6f508ec1': germanoButtow.url,
  'd3bd4c52-4ba9-4d64-bf45-3b43206fb9f4': germanoButtow.url,
  '8a948030-5348-4e85-b81e-73025976aa08': darioGermano.url,
  'f7b108d9-10a6-4b87-953b-783e7bfa05ff': darioGermano.url,
  '557dacc6-7fcf-42de-ac23-d555d9072d07': cleoRockenbach.url,
  'a3e893e1-a069-40f2-9f9e-5bbf80b21274': cleoRockenbach.url,
  'f9ed4ab9-0ef3-4ee4-9707-36288dbc828f': marcosServat.url,
  '7e7b9e5f-d232-4090-a882-ed00d6b604ea': marcosServat.url,
  '92596009-b530-4e31-b21f-fa3cbcbc8350': robertoSteffen.url,
  '6dde1d6f-ee4a-4d49-ad4d-d20986d73515': felipeBortoli.url,
  'b416c96a-bc67-4db6-94ea-9c204cab7535': valtairDornelles.url,
  'fde6a374-cb22-4ac9-999f-d04229cd1517': valtairDornelles.url,
  'cea6a057-6eaf-4778-97a5-78982f7058d4': elisandraSimaoReis.url,
  '3832dcf4-f7f7-4a7e-93fd-71261b5742a9': alexandreDallagnese.url,
  '74a71a9f-c2a6-4ae1-baed-1e2d7b8bc07f': zeliaSavoldi.url,
  '38e7e8d3-4c66-4279-92ea-961b70ee4e80': zeliaSavoldi.url,
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
