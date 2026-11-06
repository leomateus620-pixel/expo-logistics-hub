import assert from 'node:assert/strict';
import {ImageMagick,MagickImage,MagickColors,MagickFormat,Orientation} from 'npm:@imagemagick/magick-wasm@0.0.46';
import {initialize,processAvatar,validateImageHeader,MAX_UPLOAD_BYTES} from './image.ts';

await initialize();
function fixture(format:MagickFormat,width=320,height=240,rotate=false){
 const image=MagickImage.create(MagickColors.Green,width,height);
 try{
  if(rotate){image.orientation=Orientation.RightTop;image.setProfile('exif',new Uint8Array([69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0]));}
  image.comment='Private original metadata';
  return image.write(format,data=>new Uint8Array(data));
 }finally{image.dispose();}
}
for(const format of [MagickFormat.Jpeg,MagickFormat.Png,MagickFormat.WebP]){
 Deno.test(`${format}: real decoder, square optimized WebP and stripped metadata`,async()=>{
  const bytes=await processAvatar(fixture(format),{x:40,y:0,size:240});
  assert(bytes.length<524288);
  ImageMagick.read(bytes,img=>{assert.equal(img.width,256);assert.equal(img.height,256);assert.equal(img.format,MagickFormat.WebP);assert(!img.comment);assert.equal([...img.profileNames].length,0);});
 });
}
Deno.test('EXIF rotation is applied before validating the crop',async()=>{
 const bytes=fixture(MagickFormat.Jpeg,320,240,true);
 const result=await processAvatar(bytes,{x:0,y:80,size:240});
 assert.equal(validateImageHeader(result).width,256);
});
Deno.test('Rejects HEIC, forged types, truncated images, dimensions and oversized uploads',async()=>{
 for(const bytes of [new Uint8Array([0,0,0,20,102,116,121,112,104,101,105,99]),new TextEncoder().encode('<svg/>'),new Uint8Array([255,216,255]),new Uint8Array(MAX_UPLOAD_BYTES+1),fixture(MagickFormat.Png,32,32)]){
  await assert.rejects(()=>processAvatar(bytes,{x:0,y:0,size:64}));
 }
});
Deno.test('Rejects invalid crop coordinates, zoom and NaN',async()=>{
 const bytes=fixture(MagickFormat.Jpeg);
 for(const crop of [{x:-1,y:0,size:100},{x:300,y:0,size:100},{x:0,y:0,size:NaN},{x:0,y:0,size:10}])await assert.rejects(()=>processAvatar(bytes,crop));
});
