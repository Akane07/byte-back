/**
 * Эксперимент: прежнее ранжирование против многофакторного (пул 3).
 * Всё в памяти, база не нужна. Одни и те же seed → одни и те же цифры.
 *
 *   npm run experiment:ranking
 *
 * Все таблицы и CSV, кроме population.csv, считаются при финальных параметрах
 * из ranking.constants.ts (сетки — с отклонением от них) по SEEDS и дают
 * среднее и [мин–макс]. Результаты — в docs/experiment/. В results.md всё,
 * что ниже строки CONCLUSIONS_MARK, пишется руками и сохраняется.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Stats, aggregate, flatten } from './aggregate';
import { writeCsv } from './csv';
import { COMPLETE_AFTER, DYNAMIC_ORDERS, TIMELINE_STEP } from './dynamic';
import { TOP_K } from './metrics';
import { FINAL_PARAMS } from './modes';
import {
  MODEL,
  platformMeanRating,
  populationRows,
  populationSummary,
} from './population';
import { VARIANTS, Variant, inputsForSeed, runVariants } from './seeds';
import { runSensitivity, runWeights } from './sensitivity';
import { STATIC_QUERIES } from './static';

const SEED = 20261019;
/** Основной seed и пять дополнительных для проверки устойчивости. */
const SEEDS = [SEED, 1, 2, 3, 4, 5];
const OUT_DIR = join(__dirname, '../../docs/experiment');
const CONCLUSIONS_MARK = '<!-- выводы: ниже пишется руками -->';
/** Устаревшие файлы прежних версий эксперимента — удаляются при запуске. */
const OBSOLETE = ['static.csv', 'dynamic.csv'];

type VariantRow = ReturnType<typeof runVariants>[number];

/** Как показывать метрику в таблицах results.md. */
interface Spec {
  title: string;
  scale: number;
  digits: number;
  /** Относительная разница: со знаком и «%». */
  signed?: boolean;
}

const pctSpec = (title: string): Spec => ({ title, scale: 100, digits: 1 });
const numSpec = (title: string, digits: number): Spec => ({
  title,
  scale: 1,
  digits,
});
const lossSpec = (title: string): Spec => ({
  title,
  scale: 100,
  digits: 1,
  signed: true,
});

const SPECS: Record<string, Spec> = {
  catalogNewcomerShare: pctSpec('Новичков в топ-10 каталога, %'),
  catalogNoReviewShare: pctSpec(
    'Новички без отзывов в топ-10 каталога, % мест',
  ),
  catalogGini: numSpec('Джини видимости (каталог), 0–1', 3),
  catalogTopExperiencedShare: pctSpec(
    'Видимость у 10% самых опытных (каталог), %',
  ),
  catalogMeanQ: numSpec('Истинное качество топ-10 каталога, балл 1–5', 2),
  recommendNewcomerShare: pctSpec('Новичков в топ-10 подбора, %'),
  recommendNoReviewShare: pctSpec(
    'Новички без отзывов в топ-10 подбора, % мест',
  ),
  recommendGini: numSpec('Джини видимости (подбор), 0–1', 3),
  recommendTopExperiencedShare: pctSpec(
    'Видимость у 10% самых опытных (подбор), %',
  ),
  recommendMeanQ: numSpec('Истинное качество топ-10 подбора, балл 1–5', 2),
  recommendMeanR: numSpec('Соответствие заказу R топ-10 подбора, 0–1', 2),
  newcomersServed: pctSpec('Новичков с первым заказом, %'),
  medianFirstOrder: numSpec('Медиана до первого заказа, № заказа', 0),
  newcomerOrderShare: pctSpec('Доля заказов у новичков, %'),
  giniOrders: numSpec('Джини по заказам, 0–1', 3),
  meanChosenQ: numSpec(
    'Истинное качество выбранных исполнителей (динамика), балл 1–5',
    2,
  ),
  lossTop10: lossSpec('Качество топ-10 подбора к weighted-base, %'),
  lossChosen: lossSpec('Качество выбранных к weighted-base, %'),
  baseLossTop10: lossSpec('weighted-base к legacy: качество топ-10 подбора, %'),
  baseLossChosen: lossSpec('weighted-base к legacy: качество выбранных, %'),
};

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const name of OBSOLETE) rmSync(join(OUT_DIR, name), { force: true });

  const inputs = SEEDS.map(inputsForSeed);
  csv('population.csv', populationRows(inputs[0].population));

  const variantRows = runVariants(SEEDS, inputs);
  csv('seeds.csv', variantRows);
  const variantStats = Object.fromEntries(
    VARIANTS.map((v) => [
      v,
      aggregate(variantRows.filter((r) => r.variant === v)),
    ]),
  ) as Record<Variant, Record<string, Stats>>;
  csv(
    'summary.csv',
    VARIANTS.map((variant) => ({ variant, ...flatten(variantStats[variant]) })),
  );
  csv('timeline.csv', timelineRows(variantRows));

  const sensitivity = runSensitivity(inputs);
  csv(
    'sensitivity.csv',
    sensitivity.map(({ alpha, p, stats }) => ({ alpha, p, ...flatten(stats) })),
  );
  const weights = runWeights(inputs);
  csv(
    'weights.csv',
    weights.map(({ wQ, wA, wL, stats }) => ({ wQ, wA, wL, ...flatten(stats) })),
  );

  // Точки сеток с финальными параметрами — это строка weighted итоговой таблицы.
  const finalCell = sensitivity.find(
    (c) => c.alpha === FINAL_PARAMS.alpha && c.p === FINAL_PARAMS.p,
  )!;
  const finalWeights = weights.find(
    (c) =>
      c.wQ === FINAL_PARAMS.weights.Q &&
      c.wA === FINAL_PARAMS.weights.A &&
      c.wL === FINAL_PARAMS.weights.L,
  )!;
  for (const key of ['newcomersServed', 'recommendNewcomerShare'] as const) {
    const expected = variantStats.weighted[key].mean;
    if (
      finalCell.stats[key].mean !== expected ||
      finalWeights.stats[key].mean !== expected
    ) {
      throw new Error(`Сетка не совпала со строкой weighted по ${key}`);
    }
  }

  writeResults([
    summarySection(variantStats),
    filesSection(),
    populationSection(inputs.map((i) => i.population)),
    staticSection(variantStats),
    dynamicSection(variantStats, variantRows),
    sensitivitySection(sensitivity),
    weightsSection(weights),
    seedsSection(variantRows),
  ]);
  console.log(`Готово, результаты в ${OUT_DIR}`);
}

const csv = (name: string, rows: Record<string, unknown>[]) =>
  writeCsv(join(OUT_DIR, name), rows);

/** Число для текста главы: десятичная запятая; Infinity — «> 2000». */
const ru = (x: number, digits: number) =>
  Number.isFinite(x)
    ? x.toFixed(digits).replace('.', ',')
    : `> ${DYNAMIC_ORDERS}`;

function show(x: number, spec: Spec) {
  const text = ru(Math.abs(x * spec.scale), spec.digits);
  if (!spec.signed) return ru(x * spec.scale, spec.digits);
  return `${x < 0 ? '−' : '+'}${text}`;
}

/** «среднее [мин – макс]». */
const cell = (s: Stats, spec: Spec) =>
  `${show(s.mean, spec)} [${show(s.min, spec)} – ${show(s.max, spec)}]`;

function table(
  first: string[],
  keys: string[],
  rows: { head: string[]; stats: Record<string, Stats> }[],
) {
  return [
    `| ${[...first, ...keys.map((k) => SPECS[k].title)].join(' | ')} |`,
    `|${[...first, ...keys].map(() => '---').join('|')}|`,
    ...rows.map(
      (r) =>
        `| ${[...r.head, ...keys.map((k) => cell(r.stats[k], SPECS[k]))].join(' | ')} |`,
    ),
  ].join('\n');
}

const variantTable = (
  stats: Record<Variant, Record<string, Stats>>,
  keys: string[],
) =>
  table(
    ['Режим'],
    keys,
    VARIANTS.map((v) => ({ head: [v], stats: stats[v] })),
  );

const finalParams = () => {
  const w = FINAL_PARAMS.weights;
  return (
    `α = ${ru(FINAL_PARAMS.alpha, 2)}, p = ${ru(FINAL_PARAMS.p, 1)}, wQ = ${ru(w.Q, 2)}, ` +
    `wR = ${ru(w.R, 2)}, wE = ${ru(w.E, 2)}, wA = ${ru(w.A, 2)}, wL = ${ru(w.L, 2)}`
  );
};
const seedsNote = () =>
  `В клетке — среднее по ${SEEDS.length} seed (${SEEDS.join(', ')}) и [минимум – максимум].`;

function summarySection(stats: Record<Variant, Record<string, Stats>>) {
  return [
    '## Итоговая таблица (для главы 3)',
    '',
    '**Новичок** — исполнитель с заполненным профилем (eligible) и меньше 5 завершённых заказов. ' +
      'Определение одно для всех режимов и таблиц; в статике статус берётся на момент запроса, ' +
      'в динамике — на старте симуляции.',
    '',
    `Финальные параметры: ${finalParams()}. ${seedsNote()} ` +
      `Статика — по ${STATIC_QUERIES} запросов каталога и подбора (раздел 3.2), динамика — ${DYNAMIC_ORDERS} заказов (раздел 3.3). ` +
      `«> ${DYNAMIC_ORDERS}» — к концу симуляции первый заказ не получила и половина новичков. ` +
      '`weighted-prior` — контроль: Q с априорным средним, равным средней оценке платформы (раздел 3.5).',
    '',
    variantTable(stats, [
      'catalogNewcomerShare',
      'recommendNewcomerShare',
      'recommendNoReviewShare',
      'newcomersServed',
      'medianFirstOrder',
      'recommendGini',
      'giniOrders',
      'catalogMeanQ',
      'recommendMeanQ',
      'meanChosenQ',
    ]),
  ].join('\n');
}

function filesSection() {
  const all = `финальные параметры, ${SEEDS.length} seed (${SEEDS.join(', ')})`;
  const rows = [
    [
      'summary.csv',
      'итоговые метрики четырёх режимов: среднее, мин, макс',
      all,
    ],
    [
      'seeds.csv',
      'те же метрики по каждому seed и режиму, без усреднения',
      all,
    ],
    [
      'timeline.csv',
      `доля новичков с первым заказом после каждых ${TIMELINE_STEP} заказов, четыре режима: среднее, мин, макс`,
      all,
    ],
    [
      'sensitivity.csv',
      'сетка α × p (16 точек): все метрики и потеря качества к weighted-base; среднее, мин, макс',
      `финальные веса, α и p по сетке, ${SEEDS.length} seed`,
    ],
    [
      'weights.csv',
      'сетка wQ × wA × wL (12 точек): потеря качества weighted-base к legacy и weighted к weighted-base, доступ новичков; среднее, мин, макс',
      `финальные α и p, веса по сетке, ${SEEDS.length} seed`,
    ],
    [
      'population.csv',
      'синтетические исполнители: истинное качество, опыт, отзывы, профиль',
      `основной seed ${SEED}; параметры ранжирования не используются`,
    ],
  ];
  return [
    '## Файлы',
    '',
    'Все файлы пересоздаются командой `npm run experiment:ranking`. CSV рассчитаны на Excel с русской локалью: ' +
      'разделитель «;», десятичная запятая, доли — в процентах, заголовки с единицами.',
    '',
    '| Файл | Что внутри | Параметры и seed |',
    '|---|---|---|',
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

function populationSection(
  populations: ReturnType<typeof inputsForSeed>['population'][],
) {
  const s = populationSummary(populations[0]);
  const means = populations.map(platformMeanRating);
  const table = s.rows.map((r) =>
    [
      r.group,
      r.count,
      r.newcomers,
      r.eligible,
      r.noReviews,
      ru(r.meanQ, 2),
      ru(r.meanCompleted, 1),
      r.meanAvgRating ? ru(r.meanAvgRating, 2) : '—',
      ru(r.meanRatingScore, 2),
      ru(r.meanInProgress, 2),
    ].join(' | '),
  );
  return [
    '## 3.1 Популяция',
    '',
    `Основной seed ${SEED}. Исполнителей: ${s.total}, категорий: ${MODEL.categories}. ` +
      `Новичков (eligible и меньше ${s.newcomerThreshold} завершённых заказов): ${s.newcomers}.`,
    '',
    '| Группа опыта | Исполнителей | Новичков | eligible | Без отзывов | Среднее q, балл | Среднее завершённых, шт. | Средняя оценка, балл | Средний rating_score, балл | В работе, шт. |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...table.map((row) => `| ${row} |`),
    '',
    `Среднее истинное q по всем: ${ru(s.meanQ, 2)}. ` +
      `Средняя оценка по всем отзывам платформы: ${ru(s.platformMeanRating, 2)} ` +
      `(по ${SEEDS.length} seed — от ${ru(Math.min(...means), 2)} до ${ru(Math.max(...means), 2)}).`,
  ].join('\n');
}

function staticSection(stats: Record<Variant, Record<string, Stats>>) {
  return [
    '## 3.2 Статическое сравнение',
    '',
    `По ${STATIC_QUERIES} запросов каждого вида, топ-${TOP_K}. Финальные параметры. ${seedsNote()} ` +
      '`weighted-base` — ступень 1 при α = 0 без квоты; `weighted` — обе ступени.',
    '',
    '### Каталог (случайная категория)',
    '',
    variantTable(stats, [
      'catalogNewcomerShare',
      'catalogNoReviewShare',
      'catalogGini',
      'catalogTopExperiencedShare',
      'catalogMeanQ',
    ]),
    '',
    '### Подбор под заказ (категория, 1–3 навыка, бюджет)',
    '',
    variantTable(stats, [
      'recommendNewcomerShare',
      'recommendNoReviewShare',
      'recommendGini',
      'recommendTopExperiencedShare',
      'recommendMeanQ',
      'recommendMeanR',
    ]),
  ].join('\n');
}

const CHECKPOINTS = [250, 500, 1000, 1500, 2000];

function timelineAt(rows: VariantRow[], variant: Variant, index: number) {
  return aggregate(
    rows
      .filter((r) => r.variant === variant)
      .map((r) => ({ v: r.timeline[index] })),
  ).v;
}

function timelineRows(rows: VariantRow[]) {
  const points = DYNAMIC_ORDERS / TIMELINE_STEP;
  return Array.from({ length: points }, (_, i) => {
    const row: Record<string, number> = { orders: (i + 1) * TIMELINE_STEP };
    for (const v of VARIANTS) {
      const s = timelineAt(rows, v, i);
      row[`${v}:mean`] = s.mean;
      row[`${v}:min`] = s.min;
      row[`${v}:max`] = s.max;
    }
    return row;
  });
}

function dynamicSection(
  stats: Record<Variant, Record<string, Stats>>,
  rows: VariantRow[],
) {
  const served = pctSpec('');
  return [
    '## 3.3 Динамическая симуляция',
    '',
    `${DYNAMIC_ORDERS} заказов подряд, случайная категория, выдача каталога. ` +
      `Заказчик выбирает из топ-${TOP_K} с вероятностью ∝ exposure(позиция) · (0,5 + 0,5·Q). ` +
      `Заказ завершается через ${COMPLETE_AFTER} заказов, отзыв — с вероятностью ${ru(MODEL.reviewRate, 1)}. ` +
      `Финальные параметры. ${seedsNote()}`,
    '',
    variantTable(stats, [
      'newcomersServed',
      'medianFirstOrder',
      'newcomerOrderShare',
      'giniOrders',
      'meanChosenQ',
    ]),
    '',
    'Новичок — на старте симуляции. «Медиана до первого заказа» — номер заказа, ' +
      `к которому первый заказ получила половина стартовых новичков. ` +
      '«Джини по заказам» — по числу заказов, полученных за симуляцию, по всем исполнителям.',
    '',
    `### Новичков с первым заказом по ходу симуляции, %`,
    '',
    `Полный ряд с шагом ${TIMELINE_STEP} заказов — в timeline.csv.`,
    '',
    `| Режим | ${CHECKPOINTS.map((c) => `после ${c} заказов`).join(' | ')} |`,
    `|---|${CHECKPOINTS.map(() => '---').join('|')}|`,
    ...VARIANTS.map(
      (v) =>
        `| ${v} | ${CHECKPOINTS.map((c) => cell(timelineAt(rows, v, c / TIMELINE_STEP - 1), served)).join(' | ')} |`,
    ),
  ].join('\n');
}

function sensitivitySection(grid: ReturnType<typeof runSensitivity>) {
  return [
    '## 3.4 Чувствительность к α и p',
    '',
    `Режим weighted при финальных весах, α и p по сетке. ${seedsNote()} ` +
      'Клетка α = 0, p = 0 совпадает с weighted-base; потеря качества — к weighted-base того же seed ' +
      '(критерий а: не хуже −2%). ' +
      `Точка α = ${ru(FINAL_PARAMS.alpha, 1)}, p = ${ru(FINAL_PARAMS.p, 1)} совпадает со строкой weighted итоговой таблицы. ` +
      'Остальные метрики, включая каталог, — в sensitivity.csv.',
    '',
    table(
      ['α', 'p'],
      [
        'recommendNewcomerShare',
        'recommendGini',
        'lossTop10',
        'newcomersServed',
        'medianFirstOrder',
        'lossChosen',
      ],
      grid.map((c) => ({ head: [ru(c.alpha, 2), ru(c.p, 1)], stats: c.stats })),
    ),
  ].join('\n');
}

function weightsSection(grid: ReturnType<typeof runWeights>) {
  return [
    '## 3.4 Веса ступени 1',
    '',
    `wQ × wA × wL при финальных α = ${ru(FINAL_PARAMS.alpha, 1)}, p = ${ru(FINAL_PARAMS.p, 1)}; ` +
      `wE = ${ru(FINAL_PARAMS.weights.E, 2)}, wR = ${ru(FINAL_PARAMS.weights.R, 2)}. ${seedsNote()} ` +
      'Положительные веса нормируются на сумму, как в ranking.math. ' +
      'Строка wQ = 0,4, wA = 0,1, wL = 0,1 — стартовые веса пула 1; ' +
      `строка wQ = ${ru(FINAL_PARAMS.weights.Q, 1)}, wA = ${ru(FINAL_PARAMS.weights.A, 2)}, wL = ${ru(FINAL_PARAMS.weights.L, 1)} — финальные, совпадает со строкой weighted итоговой таблицы. ` +
      'Потеря weighted-base к legacy — критерий б (показать, не подгонять), weighted к weighted-base — критерий а.',
    '',
    table(
      ['wQ', 'wA', 'wL'],
      [
        'baseLossTop10',
        'baseLossChosen',
        'recommendNewcomerShare',
        'newcomersServed',
        'lossTop10',
        'lossChosen',
      ],
      grid.map((c) => ({
        head: [ru(c.wQ, 1), ru(c.wA, 2), ru(c.wL, 2)],
        stats: c.stats,
      })),
    ),
  ].join('\n');
}

function seedsSection(rows: VariantRow[]) {
  const compare = (label: string, a: Variant, b: Variant) => {
    const ratios = SEEDS.map((seed) => {
      const x = rows.find((r) => r.seed === seed && r.variant === a)!;
      const y = rows.find((r) => r.seed === seed && r.variant === b)!;
      return {
        top10: x.recommendMeanQ / y.recommendMeanQ - 1,
        chosen: x.meanChosenQ / y.meanChosenQ - 1,
      };
    });
    const s = aggregate(ratios);
    const spec = lossSpec('');
    return `| ${label} | ${cell(s.top10, spec)} | ${cell(s.chosen, spec)} |`;
  };
  const priors = rows
    .filter((r) => r.variant === 'weighted-prior')
    .map((r) => r.priorMean);
  return [
    '## 3.5 Потеря качества и контроль априорного значения',
    '',
    `Финальные параметры: ${finalParams()}. ${seedsNote()} ` +
      'От seed зависят популяция, запросы, категории заказов и выбор заказчика.',
    '',
    '`weighted-prior` — контрольный режим: weighted, где Q считается по байесовской формуле с априорным ' +
      `средним, равным средней оценке платформы этого seed (${ru(Math.min(...priors), 2)}–${ru(Math.max(...priors), 2)}), ` +
      'а не 4,5. Код рейтинга сайта не меняется, выбор заказчика в динамике по-прежнему видит рейтинг сайта.',
    '',
    '| Сравнение | Качество топ-10 подбора, % | Качество выбранных, % |',
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
