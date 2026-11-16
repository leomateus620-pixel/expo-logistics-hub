/**
 * Streaming mono resampler to the 16 kHz rate used for meeting audio parts.
 * Downsampling averages every input sample inside each output period (a box
 * filter), which removes most aliasing for speech without buffering the stream.
 * State is kept across calls so part boundaries never drop or repeat samples.
 */
export class StreamingDownsampler {
  private readonly ratio: number;
  private inputIndex = 0;
  private nextBoundary: number;
  private accumulator = 0;
  private count = 0;
  private previous = 0;
  private upsamplePosition = 0;

  constructor(readonly inputRate: number, readonly outputRate = 16_000) {
    if (!(inputRate > 0) || !(outputRate > 0)) throw new Error('invalid_sample_rate');
    this.ratio = inputRate / outputRate;
    this.nextBoundary = this.ratio;
  }

  process(input: Float32Array): Float32Array {
    if (this.inputRate === this.outputRate) return input.slice();
    if (this.ratio < 1) return this.upsample(input);
    const output = new Float32Array(Math.ceil(input.length / this.ratio) + 1);
    let written = 0;
    for (let index = 0; index < input.length; index += 1) {
      this.accumulator += input[index];
      this.count += 1;
      this.inputIndex += 1;
      if (this.inputIndex >= this.nextBoundary) {
        output[written] = this.accumulator / this.count;
        written += 1;
        this.accumulator = 0;
        this.count = 0;
        this.nextBoundary += this.ratio;
      }
    }
    return output.subarray(0, written).slice();
  }

  private upsample(input: Float32Array): Float32Array {
    const step = this.ratio;
    const output: number[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const current = input[index];
      while (this.upsamplePosition < 1) {
        output.push(this.previous + (current - this.previous) * this.upsamplePosition);
        this.upsamplePosition += step;
      }
      this.upsamplePosition -= 1;
      this.previous = current;
    }
    return Float32Array.from(output);
  }
}
