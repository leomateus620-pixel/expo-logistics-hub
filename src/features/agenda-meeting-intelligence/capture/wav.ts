const WAV_HEADER_BYTES = 44;

function concatenateFloat32(chunks: readonly Float32Array[]): Float32Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export function resampleMonoPcm(
  samples: Float32Array,
  sourceSampleRate: number,
  targetSampleRate = 16_000,
): Float32Array {
  if (sourceSampleRate <= 0 || targetSampleRate <= 0) {
    throw new Error('invalid_sample_rate');
  }
  if (sourceSampleRate === targetSampleRate) return samples.slice();

  const ratio = sourceSampleRate / targetSampleRate;
  const targetLength = Math.max(1, Math.round(samples.length / ratio));
  const result = new Float32Array(targetLength);
  for (let index = 0; index < targetLength; index += 1) {
    const sourcePosition = index * ratio;
    const leftIndex = Math.floor(sourcePosition);
    const rightIndex = Math.min(samples.length - 1, leftIndex + 1);
    const interpolation = sourcePosition - leftIndex;
    result[index] = samples[leftIndex] * (1 - interpolation) + samples[rightIndex] * interpolation;
  }
  return result;
}

export function encodePcm16Wav(
  chunks: readonly Float32Array[],
  sourceSampleRate: number,
  targetSampleRate = 16_000,
): Blob {
  const resampled = resampleMonoPcm(concatenateFloat32(chunks), sourceSampleRate, targetSampleRate);
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + resampled.length * 2);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + resampled.length * 2, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, targetSampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, resampled.length * 2, true);

  let offset = WAV_HEADER_BYTES;
  for (const sample of resampled) {
    const normalized = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, normalized < 0 ? normalized * 0x8000 : normalized * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
