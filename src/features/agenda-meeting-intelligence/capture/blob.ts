export function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error('blob_read_failed'));
    });
    reader.addEventListener('error', () => reject(reader.error ?? new Error('blob_read_failed')));
    reader.readAsArrayBuffer(blob);
  });
}

export async function blobToText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text();
  return new TextDecoder().decode(await blobToArrayBuffer(blob));
}
