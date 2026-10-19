/**
 * Эксперимент: прежнее ранжирование против многофакторного (пул 3).
 * Всё в памяти, база не нужна. Одни и те же seed → одни и те же цифры.
 *
 *   npm run experiment:ranking
 *
 * Шаги 3.2–3.4 считаются на стартовых параметрах (START_PARAMS), проверка
 * по seed — на финальных из ranking.constants.ts (FINAL_PARAMS).
 * Результаты — в docs/experiment/. В results.md всё, что ниже строки
 * CONCLUSIONS_MARK, пишется руками и при перезапуске сохраняется.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { writeCsv } from './csv';
import { COMPLETE_AFTER, DYNAMIC_ORDERS, runDynamic } from './dynamic';
import { TOP_K, mean } from './metrics';
import { FINAL_PARAMS, START_PARAMS } from './modes';
import { MODEL, populationRows, populationSummary } from './population';
import { VARIANTS, inputsForSeed, runSeeds } from './seeds';
import {
  Evaluation,
  W_A,
  W_L,
  W_Q,
  evaluate,
  runSensitivity,
  runWeights,
} from './sensitivity';
import { QueryKind, STATIC_QUERIES, runStatic } from './static';

const SEED = 20261019;
/** Основной seed и пять дополнительных для проверки устойчивости. */
const SEEDS = [SEED, 1, 2, 3, 4, 5];
const OUT_DIR = join(__dirname, '../../docs/experiment');
const CONCLUSIONS_MARK = '<!-- выводы: ниже пишется руками -->';

type StaticRow = ReturnType<typeof runStatic>[number];
type DynamicRow = ReturnType<typeof runDynamic>[number];
type SensitivityRow = ReturnType<typeof runSensitivity>[number];
type WeightRow = ReturnType<typeof runWeights>[number];
type SeedRow = ReturnType<typeof runSeeds>[number];

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const input = inputsForSeed(SEED);
  const { population, queries, orderCategories, dynamicSeed } = input;
  csv('population.csv', populationRows(population));

  const staticRows = runStatic(population, queries, START_PARAMS);
  csv('static.csv', staticRows);
  const dynamicRows = runDynamic(
    population,
    orderCategories,
    dynamicSeed,
    START_PARAMS,
  );
  csv('dynamic.csv', dynamicRows);

  const legacy = evaluate(input, 'legacy', START_PARAMS);
  const sensitivityRows = runSensitivity(input);
  csv('sensitivity.csv', sensitivityRows);
  const weightRows = runWeights(input);
  csv('weights.csv', weightRows);

  const seedRows = runSeeds(SEEDS);
  csv('seeds.csv', seedRows);
  csv('summary.csv', summaryRows(seedRows));

  writeResults([
    summarySection(seedRows),
    populationSection(populationSummary(population)),
    staticSection(staticRows),
    dynamicSection(dynamicRows),
    sensitivitySection(legacy, sensitivityRows),
    weightsSection(legacy, weightRows),
    seedsSection(seedRows),
  ]);
  console.log(`Готово, результаты в ${OUT_DIR}`);
}

const fmt = (x: number, digits = 3) => x.toFixed(digits);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const signedPct = (x: number) =>
  `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`;
/** Значение и отклонение от базы в процентах: «4.425 (−0.8%)». */
const vs = (x: number, base: number) =>
  `${fmt(x)} (${signedPct(x / base - 1)})`;
const orderNo = (x: number) =>
  Number.isFinite(x) ? String(Math.round(x)) : `> ${DYNAMIC_ORDERS}`;
const params = (p: typeof START_PARAMS) =>
  `α = ${p.alpha}, p = ${p.p}, wQ = ${p.weights.Q}, wR = ${p.weights.R}, ` +
  `wE = ${p.weights.E}, wA = ${p.weights.A}, wL = ${p.weights.L}`;

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

function staticSection(rows: StaticRow[]) {
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
        vs(r.meanQ, base.meanQ),
        ...(kind === 'recommend' ? [fmt(r.meanR!)] : []),
      ].join(' | '),
    );
  };
  const head =
    '| Режим | Новичков в топ-10 | из них без отзывов | Джини видимости | Видимость у топ-10% опытных | Истинное q топ-10 (к legacy)';
  return [
    '## 3.2 Статическое сравнение',
    '',
    `По ${STATIC_QUERIES} запросов каждого вида, топ-${TOP_K}. Стартовые параметры: ${params(START_PARAMS)}. ` +
      '`weighted-base` — ступень 1 при α = 0 без квоты; `weighted` — обе ступени.',
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

function dynamicSection(rows: DynamicRow[]) {
  const base = rows.find((r) => r.mode === 'legacy')!;
  return [
    '## 3.3 Динамическая симуляция',
    '',
    `${DYNAMIC_ORDERS} заказов подряд, случайная категория, выдача каталога. ` +
      `Заказчик выбирает из топ-${TOP_K} с вероятностью ∝ exposure(позиция) · (0,5 + 0,5·Q). ` +
      `Заказ завершается через ${COMPLETE_AFTER} заказов, отзыв — с вероятностью ${MODEL.reviewRate}. ` +
      'Все режимы — на одной популяции, одной последовательности категорий и одном seed выбора. ' +
      'Стартовые параметры, как в 3.2.',
    '',
    '| Режим | Новичков с заказом | Медиана до первого заказа | Доля заказов у новичков | Джини по заказам | Истинное q выбранных (к legacy) |',
    '|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.mode} | ${pct(r.newcomersServed)} | ${orderNo(r.medianFirstOrder)} | ` +
        `${pct(r.newcomerOrderShare)} | ${fmt(r.giniOrders)} | ${vs(r.meanChosenQ, base.meanChosenQ)} |`,
    ),
    '',
    'Новичок — на старте симуляции. «Медиана до первого заказа» — номер заказа, ' +
      `к которому первый заказ получила половина стартовых новичков; «> ${DYNAMIC_ORDERS}» — половина так и не получила. ` +
      '«Джини по заказам» — по числу заказов, полученных за симуляцию, по всем исполнителям.',
  ].join('\n');
}

const legacyLine = (l: Evaluation) =>
  `Для сравнения, legacy: новичков в топ-10 подбора ${pct(l.recommendNewcomerShare)}, ` +
  `Джини видимости ${fmt(l.recommendGini)}, q топ-10 подбора ${fmt(l.recommendMeanQ)}, ` +
  `новичков с заказом ${pct(l.newcomersServed)}, q выбранных ${fmt(l.meanChosenQ)}.`;

function sensitivitySection(legacy: Evaluation, rows: SensitivityRow[]) {
  const base = rows.find((r) => r.alpha === 0 && r.p === 0)!;
  return [
    '## 3.4 Чувствительность к α и p',
    '',
    'Режим weighted со стартовыми весами. Клетка α = 0, p = 0 совпадает с weighted-base, ' +
      'отклонения качества — от неё (критерий а: не больше −2%). ' +
      'Статические метрики — по запросам подбора под заказ, динамические — по симуляции 3.3. ' +
      'Те же метрики для каталога — в sensitivity.csv.',
    '',
    legacyLine(legacy),
    '',
    '| α | p | Новичков в топ-10 | Джини видимости | Истинное q топ-10 (к base) | Новичков с заказом | Медиана до первого заказа | Истинное q выбранных (к base) |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.alpha} | ${r.p} | ${pct(r.recommendNewcomerShare)} | ${fmt(r.recommendGini)} | ` +
        `${vs(r.recommendMeanQ, base.recommendMeanQ)} | ${pct(r.newcomersServed)} | ` +
        `${orderNo(r.medianFirstOrder)} | ${vs(r.meanChosenQ, base.meanChosenQ)} |`,
    ),
  ].join('\n');
}

function weightsSection(legacy: Evaluation, rows: WeightRow[]) {
  const lines = W_Q.flatMap((wQ) =>
    W_A.flatMap((wA) =>
      W_L.map((wL) => {
        const pick = (mode: string) =>
          rows.find(
            (r) => r.wQ === wQ && r.wA === wA && r.wL === wL && r.mode === mode,
          )!;
        const b = pick('weighted-base');
        const w = pick('weighted');
        return (
          `| ${wQ} | ${wA} | ${wL} | ${vs(b.recommendMeanQ, legacy.recommendMeanQ)} | ` +
          `${vs(b.meanChosenQ, legacy.meanChosenQ)} | ${pct(w.recommendNewcomerShare)} | ` +
          `${fmt(w.recommendGini)} | ${vs(w.recommendMeanQ, b.recommendMeanQ)} | ` +
          `${pct(w.newcomersServed)} | ${vs(w.meanChosenQ, b.meanChosenQ)} |`
        );
      }),
    ),
  );
  return [
    '## 3.4 Веса ступени 1',
    '',
    `wQ × wA × wL при α = ${START_PARAMS.alpha}, p = ${START_PARAMS.p}; ` +
      `wE = ${START_PARAMS.weights.E}, wR = ${START_PARAMS.weights.R}. ` +
      'Положительные веса нормируются на сумму, как в ranking.math. ' +
      'Столбцы base — weighted-base с этими весами, отклонение от legacy (критерий б: показать, не подгонять). ' +
      'Столбцы weighted — полный алгоритм, отклонение качества от weighted-base с теми же весами (критерий а). ' +
      'Все метрики для обоих режимов — в weights.csv.',
    '',
    legacyLine(legacy),
    '',
    '| wQ | wA | wL | base: q топ-10 (к legacy) | base: q выбранных (к legacy) | Новичков в топ-10 | Джини видимости | q топ-10 (к base) | Новичков с заказом | q выбранных (к base) |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...lines,
  ].join('\n');
}

/** Метрики итоговой таблицы: заголовок с единицами, множитель, знаков после запятой. */
const SUMMARY_METRICS: {
  key: keyof SeedRow;
  title: string;
  scale: number;
  digits: number;
}[] = [
  {
    key: 'catalogNewcomerShare',
    title: 'Новичков в топ-10 каталога, %',
    scale: 100,
    digits: 1,
  },
  {
    key: 'recommendNewcomerShare',
    title: 'Новичков в топ-10 подбора, %',
    scale: 100,
    digits: 1,
  },
  {
    key: 'recommendNoReviewShare',
    title: 'из них без отзывов (подбор), %',
    scale: 100,
    digits: 1,
  },
  {
    key: 'newcomersServed',
    title: 'Новичков с первым заказом, %',
    scale: 100,
    digits: 1,
  },
  {
    key: 'medianFirstOrder',
    title: 'Медиана до первого заказа, № заказа',
    scale: 1,
    digits: 0,
  },
  {
    key: 'recommendGini',
    title: 'Джини видимости (подбор), 0–1',
    scale: 1,
    digits: 3,
  },
  { key: 'giniOrders', title: 'Джини по заказам, 0–1', scale: 1, digits: 3 },
  {
    key: 'catalogMeanQ',
    title: 'Истинное качество топ-10 каталога, балл 1–5',
    scale: 1,
    digits: 2,
  },
  {
    key: 'recommendMeanQ',
    title: 'Истинное качество топ-10 подбора, балл 1–5',
    scale: 1,
    digits: 2,
  },
];

/** Число для текста главы: десятичная запятая; Infinity — «> 2000» (половина не получила заказ). */
const ru = (x: number, digits: number) =>
  Number.isFinite(x)
    ? x.toFixed(digits).replace('.', ',')
    : `> ${DYNAMIC_ORDERS}`;

function seedStats(rows: SeedRow[], variant: string, key: keyof SeedRow) {
  const values = rows
    .filter((r) => r.variant === variant)
    .map((r) => r[key] as number);
  return {
    avg: values.every(Number.isFinite) ? mean(values) : Infinity,
    lo: Math.min(...values),
    hi: Math.max(...values),
  };
}

function summarySection(rows: SeedRow[]) {
  const lines = VARIANTS.map((variant) => {
    const cells = SUMMARY_METRICS.map(({ key, scale, digits }) => {
      const { avg, lo, hi } = seedStats(rows, variant, key);
      return `${ru(avg * scale, digits)} [${ru(lo * scale, digits)} – ${ru(hi * scale, digits)}]`;
    });
    return `| ${variant} | ${cells.join(' | ')} |`;
  });
  return [
    '## Итоговая таблица (для главы 3)',
    '',
    '**Новичок** — исполнитель с заполненным профилем (eligible) и меньше 5 завершённых заказов. ' +
      'Определение одно для всех режимов и таблиц; в статике статус берётся на момент запроса, ' +
      'в динамике — на старте симуляции.',
    '',
    `Финальные параметры: ${params(FINAL_PARAMS)}. В клетке — среднее по ${SEEDS.length} seed и [минимум – максимум]. ` +
      `Статика — по ${STATIC_QUERIES} запросов каталога и подбора (раздел 3.2), динамика — ${DYNAMIC_ORDERS} заказов (раздел 3.3). ` +
      `«> ${DYNAMIC_ORDERS}» — к концу симуляции первый заказ не получила и половина новичков. ` +
      '`weighted-prior` — контроль: Q с априорным средним, равным средней оценке платформы (раздел 3.5). ' +
      'Те же числа — в summary.csv, по каждому seed — в seeds.csv.',
    '',
    `| Режим | ${SUMMARY_METRICS.map((m) => m.title).join(' | ')} |`,
    `|---|${SUMMARY_METRICS.map(() => '---').join('|')}|`,
    ...lines,
  ].join('\n');
}

function summaryRows(rows: SeedRow[]) {
  return VARIANTS.flatMap((variant) =>
    SUMMARY_METRICS.map(({ key, title, scale }) => {
      const { avg, lo, hi } = seedStats(rows, variant, key);
      return {
        Режим: variant,
        Показатель: title,
        Среднее: avg * scale,
        Минимум: lo * scale,
        Максимум: hi * scale,
      };
    }),
  );
}

/** «среднее [мин–макс]» по seed. */
function spread(values: number[], show: (x: number) => string) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const avg = values.every(Number.isFinite) ? show(mean(values)) : '—';
  return `${avg} [${show(lo)} – ${show(hi)}]`;
}

function seedsSection(rows: SeedRow[]) {
  const of = (variant: string) => rows.filter((r) => r.variant === variant);
  const compare = (label: string, a: string, b: string) => {
    const ratios = (f: (r: SeedRow) => number) =>
      SEEDS.map((seed) => {
        const x = rows.find((r) => r.seed === seed && r.variant === a)!;
        const y = rows.find((r) => r.seed === seed && r.variant === b)!;
        return f(x) / f(y) - 1;
      });
    return (
      `| ${label} | ${spread(
        ratios((r) => r.recommendMeanQ),
        signedPct,
      )} | ` +
      `${spread(
        ratios((r) => r.meanChosenQ),
        signedPct,
      )} |`
    );
  };

  const priors = of('weighted-prior').map((r) => r.priorMean);
  return [
    '## 3.5 Финальные параметры на нескольких seed',
    '',
    `Финальные параметры: ${params(FINAL_PARAMS)}. ` +
      `Seed: ${SEEDS.join(', ')} (основной и пять дополнительных); от seed зависят популяция, запросы, ` +
      'категории заказов и выбор заказчика. В каждой клетке — среднее по seed и [минимум – максимум]. ' +
      'Значения по каждому seed — в seeds.csv.',
    '',
    '`weighted-prior` — контрольная строка: weighted, где Q считается по байесовской формуле с априорным ' +
      `средним, равным средней оценке платформы этого seed (${fmt(Math.min(...priors), 2)}–${fmt(Math.max(...priors), 2)}), ` +
      'а не 4,5. Код рейтинга сайта не меняется, выбор заказчика в динамике по-прежнему видит рейтинг сайта.',
    '',
    'Значения метрик по режимам — в итоговой таблице в начале файла.',
    '',
    '### Потеря истинного качества по seed',
    '',
    '| Сравнение | q топ-10 подбора | q выбранных |',
    '|---|---|---|',
    compare(
      '(а) weighted к weighted-base — механизмы для новичков',
      'weighted',
      'weighted-base',
    ),
    compare(
      '(б) weighted-base к legacy — ступень 1',
      'weighted-base',
      'legacy',
    ),
    compare('weighted к legacy — итого', 'weighted', 'legacy'),
    compare(
      'weighted-prior к weighted-base',
      'weighted-prior',
      'weighted-base',
    ),
  ].join('\n');
}

const csv = (name: string, rows: Record<string, unknown>[]) =>
  writeCsv(join(OUT_DIR, name), rows);

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
