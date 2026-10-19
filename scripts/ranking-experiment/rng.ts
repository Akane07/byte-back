/** Детерминированный генератор: один и тот же seed → одна и та же последовательность. */
export type Rng = () => number;

/** mulberry32 — простой 32-битный генератор, равномерно на [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Целое в [min, max] включительно. */
export function randInt(rng: Rng, min: number, max: number) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Нормальное распределение (Бокс — Мюллер). */
export function normal(rng: Rng, mean = 0, sigma = 1) {
  const u = 1 - rng();
  const v = rng();
  return mean + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** k различных элементов массива в случайном порядке. */
export function sample<T>(rng: Rng, items: T[], k: number) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, k);
}

/** Индекс по весам, пропорционально weights[i]. */
export function weightedIndex(rng: Rng, weights: number[]) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}
