export const TOP_K = 10;

/** Видимость позиции (как в DCG): 1-я — 1, 2-я — 0,63, 10-я — 0,29. */
export const exposureAt = (position: number) => 1 / Math.log2(position + 1);

export const mean = (xs: number[]) =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;

/**
 * Коэффициент Джини. Равен Σᵢ Σⱼ |xᵢ − xⱼ| / (2 · n² · x̄), но считается
 * по отсортированному ряду за n·log n: G = Σ (2i − n − 1) · x₍ᵢ₎ / (n · Σx).
 */
export function gini(values: number[]) {
  const xs = [...values].sort((a, b) => a - b);
  const n = xs.length;
  const total = xs.reduce((s, x) => s + x, 0);
  if (!n || !total) return 0;
  const weighted = xs.reduce((s, x, i) => s + (2 * (i + 1) - n - 1) * x, 0);
  return weighted / (n * total);
}

/** Медиана; Infinity в ряду означает «не наступило» и сортируется в конец. */
export function median(values: number[]) {
  if (!values.length) return NaN;
  const xs = [...values].sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}
