/**
 * Splits a continuous 16 kHz mono stream into contiguous, independently
 * decodable parts. Every input sample lands in exactly one part (no overlap and
 * no gap), and cuts prefer the middle of a short silence so words are not split
 * across parts. Parts are forced at `maxChunkMs` at the quietest recent frame.
 */
export interface PcmChunkStats {
  peakLevel: number;
  rmsLevel: number;
  voicedRatio: number;
}

export interface PcmChunk {
  samples: Int16Array;
  startSample: number;
  endSample: number;
  stats: PcmChunkStats;
}

export interface PcmChunkerOptions {
  sampleRate?: number;
  minChunkMs?: number;
  maxChunkMs?: number;
  frameMs?: number;
  silenceRunMs?: number;
  startSample?: number;
}

export class PcmChunker {
  readonly sampleRate: number;
  private readonly frameSamples: number;
  private readonly minSamples: number;
  private readonly maxSamples: number;
  private readonly silenceFrames: number;
  private buffer: Int16Array;
  private length = 0;
  private chunkStartSample: number;
  private frameEnergy = 0;
  private frameCount = 0;
  private frameRms: number[] = [];
  private silentRun = 0;
  private noiseFloor = 0.01;
  private peak = 0;
  private energy = 0;
  private voicedFrames = 0;
  private lastFrameLevel = 0;

  constructor(options: PcmChunkerOptions = {}) {
    this.sampleRate = options.sampleRate ?? 16_000;
    this.frameSamples = Math.round((this.sampleRate * (options.frameMs ?? 20)) / 1_000);
    this.minSamples = Math.round((this.sampleRate * (options.minChunkMs ?? 25_000)) / 1_000);
    this.maxSamples = Math.round((this.sampleRate * (options.maxChunkMs ?? 55_000)) / 1_000);
    this.silenceFrames = Math.max(1, Math.round((options.silenceRunMs ?? 300) / (options.frameMs ?? 20)));
    if (this.minSamples <= 0 || this.maxSamples < this.minSamples) throw new Error('invalid_chunk_bounds');
    this.buffer = new Int16Array(this.maxSamples + this.frameSamples);
    this.chunkStartSample = Math.max(0, Math.round(options.startSample ?? 0));
  }

  /** Total samples accepted so far (emitted + pending), i.e. the active capture position. */
  get totalSamples(): number {
    return this.chunkStartSample + this.length;
  }

  get pendingSamples(): number {
    return this.length;
  }

  /** Most recent 20 ms RMS level (0..1), used by the microphone meter. */
  get level(): number {
    return this.lastFrameLevel;
  }

  push(samples: Float32Array): PcmChunk[] {
    const output: PcmChunk[] = [];
    for (let index = 0; index < samples.length; index += 1) {
      const value = Math.max(-1, Math.min(1, samples[index]));
      this.buffer[this.length] = value < 0 ? Math.round(value * 0x8000) : Math.round(value * 0x7fff);
      this.length += 1;
      const absolute = Math.abs(value);
      if (absolute > this.peak) this.peak = absolute;
      this.energy += value * value;
      this.frameEnergy += value * value;
      this.frameCount += 1;
      if (this.frameCount === this.frameSamples) {
        const chunk = this.closeFrame();
        if (chunk) output.push(chunk);
      }
    }
    return output;
  }

  /** Emits whatever is pending (pause, stop, interruption). */
  flush(): PcmChunk | null {
    if (this.length === 0) return null;
    return this.cut(this.length);
  }

  private closeFrame(): PcmChunk | null {
    const rms = Math.sqrt(this.frameEnergy / this.frameCount);
    this.frameEnergy = 0;
    this.frameCount = 0;
    this.lastFrameLevel = rms;
    this.frameRms.push(rms);
    // Adaptive noise floor: falls quickly to quiet frames, rises slowly.
    this.noiseFloor = rms < this.noiseFloor ? this.noiseFloor * 0.6 + rms * 0.4 : Math.min(0.2, this.noiseFloor * 1.002);
    const threshold = Math.max(0.006, this.noiseFloor * 3);
    if (rms > threshold * 1.5) this.voicedFrames += 1;
    this.silentRun = rms <= threshold ? this.silentRun + 1 : 0;
    if (this.length >= this.minSamples && this.silentRun >= this.silenceFrames) {
      const cutAt = this.length - Math.floor((this.silentRun * this.frameSamples) / 2);
      return this.cut(Math.max(this.frameSamples, cutAt));
    }
    if (this.length >= this.maxSamples) {
      return this.cut(this.quietestRecentBoundary());
    }
    return null;
  }

  private quietestRecentBoundary(): number {
    const framesInChunk = this.frameRms.length;
    const lookback = Math.min(framesInChunk - 1, Math.round((3_000 / 1_000) * (this.sampleRate / this.frameSamples)));
    let bestFrame = framesInChunk - 1;
    let bestLevel = Number.POSITIVE_INFINITY;
    for (let frame = framesInChunk - 1; frame >= framesInChunk - lookback; frame -= 1) {
      if (this.frameRms[frame] < bestLevel) {
        bestLevel = this.frameRms[frame];
        bestFrame = frame;
      }
    }
    return Math.max(this.frameSamples, Math.min(this.length, (bestFrame + 1) * this.frameSamples));
  }

  private cut(at: number): PcmChunk {
    const samples = this.buffer.slice(0, at);
    const remainder = this.buffer.slice(at, this.length);
    const framesUsed = Math.max(1, Math.round(at / this.frameSamples));
    const chunk: PcmChunk = {
      samples,
      startSample: this.chunkStartSample,
      endSample: this.chunkStartSample + at,
      stats: {
        peakLevel: Math.round(this.peak * 10_000) / 10_000,
        rmsLevel: Math.round(Math.sqrt(this.energy / Math.max(1, this.length)) * 10_000) / 10_000,
        voicedRatio: Math.round(Math.min(1, this.voicedFrames / framesUsed) * 10_000) / 10_000,
      },
    };
    this.buffer.fill(0);
    this.buffer.set(remainder, 0);
    this.length = remainder.length;
    this.chunkStartSample = chunk.endSample;
    const remainingFrames = Math.floor(this.length / this.frameSamples);
    this.frameRms = this.frameRms.slice(this.frameRms.length - remainingFrames);
    this.peak = 0;
    this.energy = 0;
    for (let index = 0; index < this.length; index += 1) {
      const value = this.buffer[index] / 0x8000;
      this.energy += value * value;
      if (Math.abs(value) > this.peak) this.peak = Math.abs(value);
    }
    this.voicedFrames = 0;
    this.silentRun = 0;
    return chunk;
  }
}

export function encodeInt16Wav(samples: Int16Array, sampleRate = 16_000): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  new Int16Array(buffer, 44).set(samples);
  return new Blob([buffer], { type: 'audio/wav' });
}
