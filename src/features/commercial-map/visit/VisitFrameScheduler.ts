/** Stops only visitor-owned invalidations. Environment animation keeps its own
 * demand owner, while input/camera/data changes wake this small mutable clock. */
export class VisitFrameScheduler {
  private quietSeconds = 0;
  readonly settleSeconds = 2;

  wake() { this.quietSeconds = 0; }

  step(delta: number, changed: boolean) {
    if (changed) this.wake();
    else this.quietSeconds = Math.min(this.settleSeconds, this.quietSeconds + Math.max(0, Math.min(.05, delta)));
    return this.quietSeconds < this.settleSeconds;
  }
}
