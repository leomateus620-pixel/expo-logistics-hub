// Export the same letter outlines used on the arena roof for the film's offline 3D pass.
import { readFile } from 'node:fs/promises';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

const assets = new URL('../../public/alvorada/', import.meta.url);
async function lettering(text, file, size) {
  const font = new FontLoader().parse(JSON.parse(await readFile(new URL(file, assets), 'utf8')));
  const mesh = new TextGeometry(text, {
    font, size, depth: size * 0.19, curveSegments: 7,
    bevelEnabled: true, bevelThickness: size * 0.025, bevelSize: size * 0.022, bevelSegments: 2,
  });
  mesh.computeBoundingBox();
  mesh.translate(-mesh.boundingBox.min.x, -mesh.boundingBox.min.y, 0);
  return Array.from(mesh.getAttribute('position').array);
}
const word = await lettering('FENASOJA', 'fenasoja-wordmark.typeface.json', 1);
const year = await lettering('2028', 'helvetiker-bold.typeface.json', 0.84);
process.stdout.write(JSON.stringify([word, year]));
