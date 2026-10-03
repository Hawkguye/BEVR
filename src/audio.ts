/**
 * Quiet drone whose pitch tracks speed and geodesic distance from the origin.
 */
export class AmbientAudio {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  enabled = false;

  resume(): void {
    if (!this.ctx) {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 92;
      gain.gain.value = 0.0;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      this.ctx = ctx;
      this.osc = osc;
      this.gain = gain;
    }
    void this.ctx.resume();
    this.enabled = true;
  }

  update(speed: number, originDist: number): void {
    if (!this.osc || !this.gain || !this.enabled) return;
    const f = 78 + speed * 28 + originDist * 6;
    this.osc.frequency.setTargetAtTime(f, this.ctx!.currentTime, 0.08);
    const g = 0.012 + Math.min(0.03, speed * 0.012);
    this.gain.gain.setTargetAtTime(g, this.ctx!.currentTime, 0.1);
  }
}
