/** FNV-1a seeds + Mulberry32. Streams are named, never derived from the live RNG. */
export function hashSeed(seed: string | number): number {
  const s = String(seed); let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export class Rng {
  private value: number;
  constructor(seed: string | number) { this.value = hashSeed(seed); }
  uniform(): number {
    let t = this.value = (this.value + 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number { return Math.floor(this.uniform() * n); }
  normalPair(): [number, number] {
    const r = Math.sqrt(-2 * Math.log(Math.max(1e-12, this.uniform())));
    const a = 2 * Math.PI * this.uniform(); return [r * Math.cos(a), r * Math.sin(a)];
  }
  fillNormals(buffer: Float64Array): void {
    for (let i = 0; i < buffer.length; i += 2) {
      const r = Math.sqrt(-2 * Math.log(Math.max(1e-12, this.uniform()))), a = 2 * Math.PI * this.uniform();
      buffer[i] = r * Math.cos(a); if (i + 1 < buffer.length) buffer[i + 1] = r * Math.sin(a);
    }
  }
  clone(): Rng { const r = new Rng(0); r.value = this.value; return r; }
}
export const stream = (seed: string | number, name: string) => new Rng(`${seed}:${name}`);
