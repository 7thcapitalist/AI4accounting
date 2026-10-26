/** Deterministic PRNG (mulberry32). State is a plain number so it lives inside SimState. */

export function nextRandom(state: number): { value: number; state: number } {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: s };
}

/** Mutable cursor over a PRNG state, used inside a single reducer call. */
export class Rng {
  constructor(public state: number) {}

  float(): number {
    const r = nextRandom(this.state);
    this.state = r.state;
    return r.value;
  }

  /** Integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.float() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)] as T;
  }
}
