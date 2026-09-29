// Converts the existing UI wordmark typography into a small, offline 3D subset.
// Source: https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip
// Input: extras/ttf/Inter-Black.ttf; preserve public/alvorada/INTER-LICENSE.txt.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { TTFLoader } from 'three/examples/jsm/loaders/TTFLoader.js';
import opentype from 'three/examples/jsm/libs/opentype.module.js';

if (!process.argv[2]) throw new Error('Pass the official Inter v4.1 Black TTF path');
const source = readFileSync(process.argv[2]);
const buffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
const parsed = opentype.parse(buffer);
const typeface = new TTFLoader().parse(buffer);
const text = 'FENASOJA';
const scale = 100000 / (parsed.unitsPerEm * 72);
const glyphs = {};
for (const [i, letter] of [...text].entries()) {
  if (glyphs[letter]) continue;
  const next = text[i + 1];
  const kerning = next ? parsed.getKerningValue(parsed.charToGlyph(letter), parsed.charToGlyph(next)) : 0;
  glyphs[letter] = { ...typeface.glyphs[letter],
    ha: typeface.glyphs[letter].ha + kerning * scale - 0.04 * parsed.unitsPerEm * scale };
}
const subset = { ...typeface, glyphs, familyName: 'Fenasoja Roof Wordmark Subset',
  original_font_information: { copyright: parsed.getEnglishName('copyright'),
    sourceFamily: parsed.getEnglishName('fullName'), license: 'SIL Open Font License 1.1' },
  wordmark: { text, fontWeight: 900, trackingEm: -0.04, shapedAdvances: true,
    source: 'Inter v4.1 / extras/ttf/Inter-Black.ttf',
    sourceSha256: createHash('sha256').update(source).digest('hex') } };
writeFileSync('public/alvorada/fenasoja-wordmark.typeface.json', `${JSON.stringify(subset)}\n`);
console.log(subset.wordmark);
