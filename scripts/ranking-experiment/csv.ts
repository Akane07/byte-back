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
  kind: { title: 'Вид запроса (catalog — каталог, recommend — подбор)' },
  mode: { title: 'Режим' },
  variant: { title: 'Режим' },
  alpha: { title: 'α, доля недостающего опыта' },
  p: { title: 'p, минимальная доля новичков' },
  wQ: { title: 'wQ, вес качества' },
  wA: { title: 'wA, вес активности' },
  wL: { title: 'wL, вес загрузки' },
  priorMean: { title: 'Априорное среднее для Q, балл' },

  newcomerShare: { title: 'Новичков в топ-10, %', scale: PCT },
  noReviewNewcomerShare: {
    title: 'Новички без отзывов в топ-10, % мест',
    scale: PCT,
  },
  giniExposure: { title: 'Джини видимости, 0–1' },
  topExperiencedShare: {
    title: 'Видимость у 10% самых опытных, %',
    scale: PCT,
  },
  meanQ: { title: 'Истинное качество топ-10, балл 1–5' },
  meanR: { title: 'Соответствие заказу R топ-10, 0–1' },

  catalogNewcomerShare: {
    title: 'Каталог: новичков в топ-10, %',
    scale: PCT,
  },
  catalogNoReviewShare: {
    title: 'Каталог: новички без отзывов в топ-10, % мест',
    scale: PCT,
  },
  catalogGini: { title: 'Каталог: Джини видимости, 0–1' },
  catalogMeanQ: { title: 'Каталог: истинное качество топ-10, балл 1–5' },
  recommendNewcomerShare: {
    title: 'Подбор: новичков в топ-10, %',
    scale: PCT,
  },
  recommendNoReviewShare: {
    title: 'Подбор: новички без отзывов в топ-10, % мест',
    scale: PCT,
  },
  recommendGini: { title: 'Подбор: Джини видимости, 0–1' },
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
  meanChosenQ: {
    title: 'Динамика: истинное качество выбранных, балл 1–5',
  },
};

/**
 * CSV для Excel с русской локалью: BOM, разделитель «;», десятичная запятая.
 * Иначе Excel по двойному щелчку откроет всё в одном столбце.
 */
export function writeCsv(file: string, rows: Record<string, unknown>[]) {
  const keys = Object.keys(rows[0]);
  const header = keys.map((k) => COLUMNS[k]?.title ?? k);
  const cell = (key: string, v: unknown) => {
    if (typeof v !== 'number') return String(v ?? '');
    if (!Number.isFinite(v)) return '';
    const x = v * (COLUMNS[key]?.scale ?? 1);
    return String(+x.toFixed(4)).replace('.', ',');
  };
  const lines = rows.map((r) => keys.map((k) => cell(k, r[k])).join(';'));
  writeFileSync(file, '﻿' + [header.join(';'), ...lines].join('\n') + '\n');
}
