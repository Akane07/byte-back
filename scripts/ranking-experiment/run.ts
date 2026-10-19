/**
 * Эксперимент: прежнее ранжирование против многофакторного (пул 3).
 * Всё в памяти, база не нужна. Один и тот же SEED → одни и те же цифры.
 *
 *   npm run experiment:ranking
 *
 * Результаты — в docs/experiment/. В results.md всё, что ниже строки
 * CONCLUSIONS_MARK, пишется руками и при перезапуске сохраняется.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { mulberry32 } from './rng';
import {
  MODEL,
  generatePopulation,
  populationCsv,
  populationSummary,
} from './population';
import { DEFAULT_PARAMS } from './modes';
import { TOP_K } from './metrics';
import {
  QueryKind,
  STATIC_QUERIES,
  generateQueries,
  runStatic,
} from './static';
import {
  COMPLETE_AFTER,
  DYNAMIC_ORDERS,
  generateOrderCategories,
  runDynamic,
} from './dynamic';

const SEED = 20261019;
const OUT_DIR = join(__dirname, '../../docs/experiment');
const CONCLUSIONS_MARK = '<!-- выводы: ниже пишется руками -->';

const fmt = (x: number, digits = 3) => x.toFixed(digits);

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const population = generatePopulation(mulberry32(SEED));
  writeFileSync(join(OUT_DIR, 'population.csv'), populationCsv(population));

  const queries = generateQueries(mulberry32(SEED + 1));
  const staticRows = runStatic(population, queries);
  writeCsv('static.csv', staticRows);

  const orderCategories = generateOrderCategories(mulberry32(SEED + 2));
  const dynamicRows = runDynamic(population, orderCategories, SEED + 3);
  writeCsv('dynamic.csv', dynamicRows);

  const sections = [
    populationSection(populationSummary(population)),
    staticSection(staticRows),
    dynamicSection(dynamicRows),
  ];
  writeResults(sections);
  console.log(`Готово, результаты в ${OUT_DIR}`);
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const orderNo = (x: number) =>
  Number.isFinite(x) ? String(x) : `> ${DYNAMIC_ORDERS}`;

function dynamicSection(rows: ReturnType<typeof runDynamic>) {
  const base = rows.find((r) => r.mode === 'legacy')!;
  return [
    '## 3.3 Динамическая симуляция',
    '',
    `${DYNAMIC_ORDERS} заказов подряд, случайная категория, выдача каталога. ` +
      `Заказчик выбирает из топ-${TOP_K} с вероятностью ∝ exposure(позиция) · (0,5 + 0,5·Q). ` +
      `Заказ завершается через ${COMPLETE_AFTER} заказов, отзыв — с вероятностью ${MODEL.reviewRate}. ` +
      'Все режимы — на одной популяции, одной последовательности категорий и одном seed выбора.',
    '',
    '| Режим | Новичков с заказом | Медиана до первого заказа | Доля заказов у новичков | Джини по заказам | Истинное q выбранных (к legacy) |',
    '|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.mode} | ${pct(r.newcomersServed)} | ${orderNo(r.medianFirstOrder)} | ` +
        `${pct(r.newcomerOrderShare)} | ${fmt(r.giniOrders)} | ` +
        `${fmt(r.meanChosenQ)} (${signedPct(r.meanChosenQ / base.meanChosenQ - 1)}) |`,
    ),
    '',
    'Новичок — на старте симуляции. «Медиана до первого заказа» — номер заказа, ' +
      `к которому первый заказ получила половина стартовых новичков; «> ${DYNAMIC_ORDERS}» — половина так и не получила.`,
  ].join('\n');
}

function staticSection(rows: ReturnType<typeof runStatic>) {
  const table = (kind: QueryKind) => {
    const ofKind = rows.filter((r) => r.kind === kind);
    const base = ofKind.find((r) => r.mode === 'legacy')!;
    return ofKind.map((r) =>
      [
        r.mode,
        pct(r.newcomerShare),
        pct(r.noReviewNewcomerShare),
        fmt(r.giniExposure),
        pct(r.topExperiencedShare),
        `${fmt(r.meanQ)} (${signedPct(r.meanQ / base.meanQ - 1)})`,
        ...(kind === 'recommend' ? [fmt(r.meanR!)] : []),
      ].join(' | '),
    );
  };
  const head =
    '| Режим | Новичков в топ-10 | из них без отзывов | Джини видимости | Видимость у топ-10% опытных | Истинное q топ-10 (к legacy)';
  return [
    '## 3.2 Статическое сравнение',
    '',
    `По ${STATIC_QUERIES} запросов каждого вида, топ-${TOP_K}. ` +
      '`weighted-base` — ступень 1 при α = 0 без квоты; `weighted` — обе ступени, ' +
      `α = ${DEFAULT_PARAMS.alpha}, p = ${DEFAULT_PARAMS.p}.`,
    '',
    '### Каталог (случайная категория)',
    '',
    `${head} |`,
    '|---|---|---|---|---|---|',
    ...table('catalog').map((row) => `| ${row} |`),
    '',
    '### Подбор под заказ (категория, 1–3 навыка, бюджет)',
    '',
    `${head} | Средний R топ-10 |`,
    '|---|---|---|---|---|---|---|',
    ...table('recommend').map((row) => `| ${row} |`),
  ].join('\n');
}

const signedPct = (x: number) =>
  `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`;

function writeCsv(name: string, rows: Record<string, unknown>[]) {
  const columns = Object.keys(rows[0]);
  const cell = (v: unknown) =>
    typeof v === 'number' ? String(+v.toFixed(6)) : String(v ?? '');
  const lines = rows.map((r) => columns.map((c) => cell(r[c])).join(','));
  writeFileSync(
    join(OUT_DIR, name),
    [columns.join(','), ...lines].join('\n') + '\n',
  );
}

function populationSection(s: ReturnType<typeof populationSummary>) {
  const table = s.rows.map((r) =>
    [
      r.group,
      r.count,
      r.newcomers,
      r.eligible,
      r.noReviews,
      fmt(r.meanQ, 2),
      fmt(r.meanCompleted, 1),
      r.meanAvgRating ? fmt(r.meanAvgRating, 2) : '—',
      fmt(r.meanRatingScore, 2),
      fmt(r.meanInProgress, 2),
    ].join(' | '),
  );
  return [
    '## 3.1 Популяция',
    '',
    `Seed генератора: ${SEED}. Исполнителей: ${s.total}, категорий: ${MODEL.categories}. ` +
      `Новичков (eligible и меньше ${s.newcomerThreshold} завершённых заказов): ${s.newcomers}.`,
    '',
    '| Группа опыта | Исполнителей | Новичков | eligible | Без отзывов | Среднее q | Среднее заверш. | Средняя оценка | Средний rating_score | В работе |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...table.map((row) => `| ${row} |`),
    '',
    `Среднее истинное q по всем: ${fmt(s.meanQ, 2)}. ` +
      `Средняя оценка по всем отзывам платформы: ${fmt(s.platformMeanRating, 2)}.`,
  ].join('\n');
}

function writeResults(sections: string[]) {
  const file = join(OUT_DIR, 'results.md');
  const old = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const markAt = old.indexOf(CONCLUSIONS_MARK);
  const conclusions =
    markAt >= 0 ? old.slice(markAt) : `${CONCLUSIONS_MARK}\n\n## Выводы\n\n`;
  const header = [
    '# Эксперимент: прежнее и многофакторное ранжирование',
    '',
    'Файл собирается командой `npm run experiment:ranking` (scripts/ranking-experiment). ' +
      'Всё выше раздела «Выводы» перезаписывается при каждом запуске.',
  ].join('\n');
  writeFileSync(file, [header, ...sections, conclusions].join('\n\n'));
}

main();
