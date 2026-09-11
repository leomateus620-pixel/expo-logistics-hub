// Optional 16-second canvas recording in local QA previews only.
// Recording affects performance: never mix this run into the FPS benchmark.
const fs = require('node:fs');
const path = require('node:path');
const index = path.resolve(process.argv[2], 'index.html');
const script = `addEventListener('load', () => {
  if (!location.pathname.startsWith('/__dev/') || !new URLSearchParams(location.search).has('recordingQa')) return;
  const button = document.createElement('button');
  button.textContent = 'Gravar mapa 16s (QA)';
  button.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:99999;background:white;color:black;padding:8px';
  document.body.append(button);
  button.onclick = () => {
    const canvas = document.querySelector('canvas[data-engine],canvas[data-commercial-map-render-health]');
    if (!canvas || !canvas.captureStream || typeof MediaRecorder === 'undefined') { button.textContent = 'Gravação indisponível'; return; }
    const stream = canvas.captureStream(15);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const recorder = new MediaRecorder(stream, {mimeType, videoBitsPerSecond:1600000});
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const reader = new FileReader();
      reader.onload = () => {
        const details = document.createElement('details');
        details.style.cssText = 'position:fixed;bottom:48px;left:8px;z-index:99999;background:white;color:black;max-height:80px;overflow:auto';
        const summary = document.createElement('summary'); summary.textContent = 'Vídeo QA gravado'; details.append(summary);
        const output = document.createElement('pre'); output.id = 'map-recording-base64'; output.textContent = reader.result; details.append(output);
        document.body.append(details); button.textContent = 'Gravação concluída';
      };
      reader.readAsDataURL(new Blob(chunks, {type:mimeType}));
    };
    button.disabled = true; button.textContent = 'Gravando mapa (16s)…';
    recorder.start(); setTimeout(() => recorder.stop(),16000);
  };
});`;
let html = fs.readFileSync(index, 'utf8');
if (!html.includes('data-recording-preview')) html = html.replace('</head>', `<script data-recording-preview>${script}</script></head>`);
fs.writeFileSync(index, html);
