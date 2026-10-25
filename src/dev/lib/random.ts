/** A uniform random integer in [0, n), from the crypto RNG, with rejection sampling so no value is favoured. */
export function randomInt(n: number): number {
  if (n <= 0 || n > 2 ** 32) throw new RangeError('n out of range');
  const limit = 2 ** 32 - (2 ** 32 % n); // the largest multiple of n that fits: values at or above it are redrawn
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

/** Fisher–Yates with the crypto RNG. */
export function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
