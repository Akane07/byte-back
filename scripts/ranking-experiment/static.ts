import { OrderContext } from '../../src/ranking/ranking.math';
import { TOP_K, exposureAt, gini, mean } from './metrics';
import { MODES, Mode, RankParams, rank } from './modes';
import { MODEL, Performer, categorySkills, newcomer } from './population';
import { Rng, randInt, sample } from './rng';

export const STATIC_QUERIES = 200;
export type QueryKind = 'catalog' | 'recommend';

export interface Query {
  category: number;
  order?: OrderContext;
}

export interface StaticMetrics {
  newcomerShare: number;
  /** Доля новичков без единого отзыва — у них rating_score = 0. */
  noReviewNewcomerShare: number;
  giniExposure: number;
  topExperiencedShare: number;
  meanQ: number;
  meanR?: number;
}

export function generateQueries(rng: Rng): Record<QueryKind, Query[]> {
  const randomCategory = () => randInt(rng, 0, MODEL.categories - 1);
  const catalog = Array.from({ length: STATIC_QUERIES }, () => ({
    category: randomCategory(),
  }));
  const recommend = Array.from({ length: STATIC_QUERIES }, () => {
    const category = randomCategory();
    const contract = rng() < 0.5;
    const order: OrderContext = {
      category,
      skills: sample(rng, categorySkills(category), randInt(rng, 1, 3)),
      price: contract ? 0 : randInt(rng, 10, 60) * 100,
      price_type: contract ? 'contract' : 'fixed',
    };
    return { category, order };
  });
  return { catalog, recommend };
}

/** Жёсткие фильтры: каталог — по категории; подбор (2.0) — категория или общий навык. */
export function candidatesFor(population: Performer[], query: Query) {
  if (!query.order) {
    return population.filter((p) => p.categories.includes(query.category));
  }
  const skills = new Set(query.order.skills ?? []);
  return population.filter(
    (p) =>
      p.categories.includes(query.category) ||
      p.skills.some((s) => skills.has(s)),
  );
}

export function evaluateStatic(
  population: Performer[],
  queries: Query[],
  mode: Mode,
  params?: RankParams,
): StaticMetrics {
  const exposure = new Map(population.map((p) => [p.id, 0]));
  const newcomerShares: number[] = [];
  const noReviewShares: number[] = [];
  const qs: number[] = [];
  const rs: number[] = [];

  for (const query of queries) {
    const top = rank(
      mode,
      candidatesFor(population, query),
      query.order,
      params,
    ).slice(0, TOP_K);
    top.forEach(({ performer, R }, i) => {
      exposure.set(
        performer.id,
        exposure.get(performer.id)! + exposureAt(i + 1),
      );
      qs.push(performer.q);
      if (R !== undefined) rs.push(R);
    });
    const newcomers = top.filter((r) => newcomer(r.performer));
    newcomerShares.push(newcomers.length / top.length);
    noReviewShares.push(
      newcomers.filter((r) => !r.performer.reviewsCount).length / top.length,
    );
  }

  const values = [...exposure.values()];
  const total = values.reduce((s, x) => s + x, 0);
  const topExperienced = [...population]
    .sort((a, b) => b.completed - a.completed || (a.id < b.id ? -1 : 1))
    .slice(0, Math.round(population.length * 0.1));

  return {
    newcomerShare: mean(newcomerShares),
    noReviewNewcomerShare: mean(noReviewShares),
    giniExposure: gini(values),
    topExperiencedShare:
      topExperienced.reduce((s, p) => s + exposure.get(p.id)!, 0) / total,
    meanQ: mean(qs),
    meanR: rs.length ? mean(rs) : undefined,
  };
}

export function runStatic(
  population: Performer[],
  queries: Record<QueryKind, Query[]>,
) {
  return (['catalog', 'recommend'] as QueryKind[]).flatMap((kind) =>
    MODES.map((mode) => ({
      kind,
      mode,
      ...evaluateStatic(population, queries[kind], mode),
    })),
  );
}
