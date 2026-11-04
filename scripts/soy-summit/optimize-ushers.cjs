/* Repack authoring GLBs. Preserve geometry/rigs; JPEG for opaque colour maps,
   PNG alpha for hair, and correct alpha modes to avoid transparent skin. */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const folder = path.resolve('public/soy-summit/people');
(async () => {
  const report = [];
  for (const name of ['usher-left', 'usher-right']) {
    const file = path.join(folder, name + '.glb'), input = fs.readFileSync(file);
    const jsonLength = input.readUInt32LE(12);
    const doc = JSON.parse(input.subarray(20, 20 + jsonLength).toString());
    const bin = input.subarray(28 + jsonLength);
    const imageViews = new Map(doc.images.map(image => [image.bufferView, image]));
    const parts = []; let offset = 0;
    for (let index = 0; index < doc.bufferViews.length; index++) {
      const view = doc.bufferViews[index];
      let data = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
      const image = imageViews.get(index);
      if (image) {
        const alpha = /short|eyebrow|eyelash/.test(image.name);
        const normal = /normal/.test(image.name);
        let pipeline = sharp(data).resize({ width: alpha ? 512 : 1024, height: alpha ? 512 : 1024, fit: 'inside', withoutEnlargement: true });
        if (alpha || normal) { data = await pipeline.png({ compressionLevel: 9 }).toBuffer(); image.mimeType = 'image/png'; }
        else { data = await pipeline.removeAlpha().jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toBuffer(); image.mimeType = 'image/jpeg'; }
      }
      view.byteOffset = offset; view.byteLength = data.length;
      parts.push(data); offset += data.length;
      const pad = (4 - offset % 4) % 4; if (pad) { parts.push(Buffer.alloc(pad)); offset += pad; }
    }
    for (const material of doc.materials) {
      material.alphaMode = /short|eyebrow|eyelash/.test(material.name) ? 'MASK' : 'OPAQUE';
      if (material.alphaMode === 'MASK') material.alphaCutoff = .35;
      material.doubleSided = material.alphaMode === 'MASK';
      if (material.name.endsWith('.body')) material.pbrMetallicRoughness.roughnessFactor = .68;
    }
    doc.buffers[0].byteLength = offset;
    let json = Buffer.from(JSON.stringify(doc)); json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
    const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + offset, 8); header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
    const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(offset, 0); binHeader.writeUInt32LE(0x004e4942, 4);
    const output = Buffer.concat([header, json, binHeader, ...parts]); fs.writeFileSync(file, output);
    report.push({ file: 'public/soy-summit/people/' + name + '.glb', bytes: output.length, sourceBytes: input.length, textures: doc.images.length, triangles: doc.meshes.reduce((n, m) => n + m.primitives.reduce((a, p) => a + doc.accessors[p.indices].count / 3, 0), 0) });
  }
  fs.writeFileSync('docs/soy-summit/ushers-assets.json', JSON.stringify(report, null, 2) + '\n'); console.log(report);
})().catch(error => { console.error(error); process.exitCode = 1; });
