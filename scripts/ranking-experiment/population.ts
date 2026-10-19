import { bayesianScore } from '../../src/review/review.service';
import { N_NEW } from '../../src/ranking/ranking.constants';
import { isNewcomer } from '../../src/ranking/ranking.math';
import { Rng, normal, randInt, sample } from './rng';

/** Параметры модели рынка (ТЗ, раздел 3.0). */
export const MODEL = {
  performers: 300,
  categories: 4,
  /** Навыков у каждой категории. */
  skillsPerCategory: 6,
  /** Группы опыта: доля исполнителей и диапазон завершённых заказов. */
  experienceGroups: [
    { group: 'low', share: 0.6, min: 0, max: 4, maxInProgress: 1 },
    { group: 'mid', share: 0.3, min: 5, max: 30, maxInProgress: 2 },
    { group: 'high', share: 0.1, min: 30, max: 200, maxInProgress: 4 },
  ] as const,
  /** Истинное качество: среднее и разброс, обрезка в [1, 5]. */
  qualityMean: 4.0,
  qualitySigma: 0.6,
  /** Шум отдельной оценки вокруг истинного качества. */
  ratingNoise: 0.5,
  /** Вероятность, что заказчик оставит отзыв после завершения. */
  reviewRate: 0.8,
  eligibleShare: 0.7,
  maxDaysSinceVisit: 30,
  /** Цена «от» исполнителя, ₽. */
  priceFrom: { min: 500, max: 5000 },
};

/** Фиксированное «сейчас», чтобы активность A не зависела от даты запуска. */
export const NOW = new Date('2026-10-01T00:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

export type ExperienceGroup = (typeof MODEL.experienceGroups)[number]['group'];

export interface Performer {
  id: string;
  group: ExperienceGroup;
  /** Истинное качество — известно только эксперименту, не заказчику. */
  q: number;
  completed: number;
  inProgress: number;
  ratingSum: number;
  reviewsCount: number;
  /** Как в базе: bayesianScore, без отзывов — 0. */
  ratingScore: number;
  eligible: boolean;
  daysSinceVisit: number;
  lastSeen: Date;
  categories: number[];
  skills: string[];
  priceFrom: number;
}

export const clampRating = (x: number) => Math.min(5, Math.max(1, x));

export const categorySkills = (category: number) =>
  Array.from(
    { length: MODEL.skillsPerCategory },
    (_, i) => `c${category}-s${i + 1}`,
  );

/** Новая оценка ≈ q + шум; пересчёт рейтинга той же формулой, что на сайте. */
export function addRating(p: Performer, rng: Rng) {
  p.ratingSum += clampRating(normal(rng, p.q, MODEL.ratingNoise));
  p.reviewsCount++;
  p.ratingScore = bayesianScore(p.ratingSum / p.reviewsCount, p.reviewsCount);
}

export const newcomer = (p: Performer) => isNewcomer(p.eligible, p.completed);

export function generatePopulation(rng: Rng): Performer[] {
  const performers: Performer[] = [];
  for (let i = 0; i < MODEL.performers; i++) {
    const g = pickGroup(i / MODEL.performers);
    const categoryCount = randInt(rng, 1, 2);
    const categories = sample(
      rng,
      Array.from({ length: MODEL.categories }, (_, c) => c),
      categoryCount,
    ).sort((a, b) => a - b);
    const ownSkills = categories.flatMap(categorySkills);
    const skills = sample(rng, ownSkills, randInt(rng, 3, 6));
    const daysSinceVisit = rng() * MODEL.maxDaysSinceVisit;

    const p: Performer = {
      id: `p${String(i + 1).padStart(3, '0')}`,
      group: g.group,
      q: clampRating(normal(rng, MODEL.qualityMean, MODEL.qualitySigma)),
      completed: randInt(rng, g.min, g.max),
      inProgress: randInt(rng, 0, g.maxInProgress),
      ratingSum: 0,
      reviewsCount: 0,
      ratingScore: 0,
      eligible: rng() < MODEL.eligibleShare,
      daysSinceVisit,
      lastSeen: new Date(NOW.getTime() - daysSinceVisit * DAY_MS),
      categories,
      skills,
      priceFrom:
        Math.round(
          randInt(rng, MODEL.priceFrom.min, MODEL.priceFrom.max) / 100,
        ) * 100,
    };
    for (let k = 0; k < p.completed; k++) {
      if (rng() < MODEL.reviewRate) addRating(p, rng);
    }
    performers.push(p);
  }
  return performers;
}

/** Группы идут подряд по доле: первые 60% — low, следующие 30% — mid, остальные — high. */
function pickGroup(position: number) {
  let acc = 0;
  for (const g of MODEL.experienceGroups) {
    acc += g.share;
    if (position < acc - 1e-9) return g;
  }
  return MODEL.experienceGroups[MODEL.experienceGroups.length - 1];
}

export function populationCsv(performers: Performer[]) {
  const header =
    'id,group,q,completed,in_progress,reviews_count,avg_rating,rating_score,eligible,newcomer,days_since_visit,categories,skills,price_from';
  const rows = performers.map((p) =>
    [
      p.id,
      p.group,
      p.q.toFixed(3),
      p.completed,
      p.inProgress,
      p.reviewsCount,
      p.reviewsCount ? (p.ratingSum / p.reviewsCount).toFixed(3) : '',
      p.ratingScore.toFixed(3),
      p.eligible ? 1 : 0,
      newcomer(p) ? 1 : 0,
      p.daysSinceVisit.toFixed(2),
      p.categories.join(' '),
      p.skills.join(' '),
      p.priceFrom,
    ].join(','),
  );
  return [header, ...rows].join('\n') + '\n';
}

/** Сводка для проверки адекватности модели. */
export function populationSummary(performers: Performer[]) {
  const mean = (xs: number[]) =>
    xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
  const rows = MODEL.experienceGroups.map(({ group }) => {
    const ps = performers.filter((p) => p.group === group);
    const rated = ps.filter((p) => p.reviewsCount > 0);
    return {
      group,
      count: ps.length,
      newcomers: ps.filter(newcomer).length,
      eligible: ps.filter((p) => p.eligible).length,
      noReviews: ps.length - rated.length,
      meanQ: mean(ps.map((p) => p.q)),
      meanCompleted: mean(ps.map((p) => p.completed)),
      meanAvgRating: mean(rated.map((p) => p.ratingSum / p.reviewsCount)),
      meanRatingScore: mean(ps.map((p) => p.ratingScore)),
      meanInProgress: mean(ps.map((p) => p.inProgress)),
    };
  });
  return {
    rows,
    total: performers.length,
    newcomers: performers.filter(newcomer).length,
    newcomerThreshold: N_NEW,
    platformMeanRating: platformMeanRating(performers),
    meanQ: mean(performers.map((p) => p.q)),
  };
}

/** Средняя оценка по всем отзывам платформы. */
export function platformMeanRating(performers: Performer[]) {
  const sum = performers.reduce((s, p) => s + p.ratingSum, 0);
  const count = performers.reduce((s, p) => s + p.reviewsCount, 0);
  return sum / count;
}
