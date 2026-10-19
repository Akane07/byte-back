import { writeFileSync } from 'fs';

/** Заголовок столбца и множитель значения (доли пишутся в процентах). */
interface Column {
  title: string;
  scale?: number;
}

const PCT = 100;

/** Русские заголовки с единицами для всех CSV эксперимента. */
const COLUMNS: Record<string, Column> = {
  seed: { title: 'Seed' },
  variant: { title: 'Режим' },
  alpha: { title: 'α, доля недостающего опыта' },
  p: { title: 'p, минимальная доля новичков' },
  wQ: { title: 'wQ, вес качества' },
  wA: { title: 'wA, вес активности' },
  wL: { title: 'wL, вес загрузки' },
  priorMean: { title: 'Априорное среднее для Q, балл' },
  orders: { title: 'Размещено заказов, шт.' },

  catalogNewcomerShare: { title: 'Каталог: новичков в топ-10, %', scale: PCT },
  catalogNoReviewShare: {
    title: 'Каталог: новички без отзывов в топ-10, % мест',
    scale: PCT,
  },
  catalogGini: { title: 'Каталог: Джини видимости, 0–1' },
  catalogTopExperiencedShare: {
    title: 'Каталог: видимость у 10% самых опытных, %',
    scale: PCT,
  },
  catalogMeanQ: { title: 'Каталог: истинное качество топ-10, балл 1–5' },
  recommendNewcomerShare: { title: 'Подбор: новичков в топ-10, %', scale: PCT },
  recommendNoReviewShare: {
    title: 'Подбор: новички без отзывов в топ-10, % мест',
    scale: PCT,
  },
  recommendGini: { title: 'Подбор: Джини видимости, 0–1' },
  recommendTopExperiencedShare: {
    title: 'Подбор: видимость у 10% самых опытных, %',
    scale: PCT,
  },
  recommendMeanQ: { title: 'Подбор: истинное качество топ-10, балл 1–5' },
  recommendMeanR: { title: 'Подбор: соответствие заказу R топ-10, 0–1' },

  newcomersServed: {
    title: 'Динамика: новичков с первым заказом, %',
    scale: PCT,
  },
  medianFirstOrder: {
    title:
      'Динамика: медиана до первого заказа, № заказа (пусто — половина не получила)',
  },
  newcomerOrderShare: {
    title: 'Динамика: доля заказов у новичков, %',
    scale: PCT,
  },
  giniOrders: { title: 'Динамика: Джини по числу заказов, 0–1' },
  meanChosenQ: { title: 'Динамика: истинное качество выбранных, балл 1–5' },

  lossTop10: {
    title: 'weighted к weighted-base: качество топ-10 подбора, %',
    scale: PCT,
  },
  lossChosen: {
    title: 'weighted к weighted-base: качество выбранных, %',
    scale: PCT,
  },
  baseLossTop10: {
    title: 'weighted-base к legacy: качество топ-10 подбора, %',
    scale: PCT,
  },
  baseLossChosen: {
    title: 'weighted-base к legacy: качество выбранных, %',
    scale: PCT,
  },

  legacy: { title: 'legacy: новичков с первым заказом, %', scale: PCT },
  'weighted-base': {
    title: 'weighted-base: новичков с первым заказом, %',
    scale: PCT,
  },
  weighted: { title: 'weighted: новичков с первым заказом, %', scale: PCT },
  'weighted-prior': {
    title: 'weighted-prior: новичков с первым заказом, %',
    scale: PCT,
  },
};

const SUFFIX: Record<string, string> = {
  mean: 'среднее',
  min: 'мин',
  max: 'макс',
};

/** «x:mean» → заголовок x с припиской «— среднее». */
function column(key: string) {
  const [base, suffix] = key.split(':');
  const def = COLUMNS[base];
  const title = def?.title ?? base;
  return {
    title: suffix ? `${title} — ${SUFFIX[suffix]}` : title,
    scale: def?.scale ?? 1,
  };
}

/**
 * CSV для Excel с русской локалью: BOM, разделитель «;», десятичная запятая.
 * Иначе Excel по двойному щелчку откроет всё в одном столбце.
 * Поля-массивы (таймлайн) пропускаются — для них отдельный файл.
 */
export function writeCsv(file: string, rows: Record<string, unknown>[]) {
  const keys = Object.keys(rows[0]).filter((k) => !Array.isArray(rows[0][k]));
  const header = keys.map((k) => column(k).title);
  const cell = (key: string, v: unknown) => {
    if (typeof v !== 'number') return String(v ?? '');
    if (!Number.isFinite(v)) return '';
    return String(+(v * column(key).scale).toFixed(4)).replace('.', ',');
  };
  const lines = rows.map((r) => keys.map((k) => cell(k, r[k])).join(';'));
  writeFileSync(file, '﻿' + [header.join(';'), ...lines].join('\n') + '\n');
}
