import { mean } from './metrics';

/** Среднее и разброс метрики по seed. */
export interface Stats {
  mean: number;
  min: number;
  max: number;
}

/** Числовые поля строк → среднее, минимум, максимум. Infinity в ряду даёт среднее Infinity. */
export function aggregate(rows: Record<string, unknown>[]) {
  const keys = Object.keys(rows[0]).filter(
    (k) => typeof rows[0][k] === 'number',
  );
  const stats: Record<string, Stats> = {};
  for (const key of keys) {
    const values = rows.map((r) => r[key] as number);
    stats[key] = {
      mean: values.every(Number.isFinite) ? mean(values) : Infinity,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }
  return stats;
}

/** Для CSV: поле x → x:mean, x:min, x:max. */
export function flatten(stats: Record<string, Stats>) {
  const row: Record<string, number> = {};
  for (const [key, s] of Object.entries(stats)) {
    row[`${key}:mean`] = s.mean;
    row[`${key}:min`] = s.min;
    row[`${key}:max`] = s.max;
  }
  return row;
}
