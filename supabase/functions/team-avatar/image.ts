import {ImageMagick,MagickFormat,MagickGeometry,ResourceLimits,initializeImageMagick} from 'npm:@imagemagick/magick-wasm@0.0.46';
import {imageSize} from 'npm:image-size@2.0.2';

export const MAX_UPLOAD_BYTES=8*1024*1024;
let initialized:Promise<void>|undefined;
export async function initialize(bytes?:Uint8Array){
 if(!initialized)initialized=(async()=>{
  const wasm=bytes??await Deno.readFile(new URL(import.meta.resolve('npm:@imagemagick/magick-wasm@0.0.46/magick.wasm')));
  await initializeImageMagick(wasm);
  ResourceLimits.width=6000n;ResourceLimits.height=6000n;ResourceLimits.area=12_000_000n;
  ResourceLimits.memory=128n*1024n*1024n;ResourceLimits.maxMemoryRequest=128n*1024n*1024n;ResourceLimits.disk=0n;ResourceLimits.listLength=8n;
  ResourceLimits.maxProfileSize=1024n*1024n;ResourceLimits.time=10n;
 })();
 await initialized;
}
export function validateImageHeader(bytes:Uint8Array){
 if(bytes.byteLength===0||bytes.byteLength>MAX_UPLOAD_BYTES)throw new Error('A foto deve ter até 8 MB.');
 const isJpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const isPng=[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
 const ascii=(from:number,to:number)=>String.fromCharCode(...bytes.slice(from,to));
 const isWebp=ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP';
 if(!isJpeg&&!isPng&&!isWebp)throw new Error('Formato inválido. Use JPEG, PNG ou WebP; converta HEIC/HEIF antes do envio.');
 // Reject animation containers before decoding; the image engine needs temporary list slots.
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(isPng){for(let at=8;at+12<=bytes.length;){const n=view.getUint32(at);if(ascii(at+4,at+8)==='acTL')throw new Error('Formato animado não permitido. Use uma foto estática.');if(n>bytes.length-at-12)break;at+=n+12;}}
 if(isWebp){for(let at=12;at+8<=bytes.length;){const n=view.getUint32(at+4,true);if(['ANIM','ANMF'].includes(ascii(at,at+4)))throw new Error('Formato animado não permitido. Use uma foto estática.');if(n>bytes.length-at-8)break;at+=n+8+(n%2);}}
 const size=imageSize(bytes);
 if(!size.width||!size.height||size.width<64||size.height<64||Math.max(size.width,size.height)>6000||size.width*size.height>12_000_000)throw new Error('Dimensões inválidas: use entre 64 px e 12 megapixels, até 6000 px por lado.');
 return size;
}
export async function processAvatar(bytes:Uint8Array,crop:{x:number;y:number;size:number}):Promise<Uint8Array>{
 validateImageHeader(bytes);await initialize();
 return ImageMagick.read(bytes,image=>{
  if(!([MagickFormat.Jpeg,MagickFormat.Png,MagickFormat.WebP] as MagickFormat[]).includes(image.format))throw new Error('Formato de imagem não permitido.');
  image.autoOrient();
  if(!crop||![crop.x,crop.y,crop.size].every(Number.isFinite)||crop.size<32||crop.x<0||crop.y<0||crop.x+crop.size>image.width+1||crop.y+crop.size>image.height+1)throw new Error('Enquadramento inválido. Selecione a foto novamente.');
  image.crop(new MagickGeometry(Math.round(crop.x),Math.round(crop.y),Math.round(crop.size),Math.round(crop.size)));
  image.resetPage();image.resize(256,256);image.strip();image.quality=82;
  return image.write(MagickFormat.WebP,data=>new Uint8Array(data));
 });
}
