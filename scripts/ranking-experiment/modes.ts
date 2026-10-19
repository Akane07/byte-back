import {
  ALPHA,
  NEWCOMER_SHARE,
  WEIGHTS,
} from '../../src/ranking/ranking.constants';
import {
  OrderContext,
  activity,
  experience,
  experienceAdvanced,
  quality,
  relevance,
  rerankWithNewcomerQuota,
  score,
  workload,
} from '../../src/ranking/ranking.math';
import { NOW, Performer, newcomer } from './population';

export type Mode = 'legacy' | 'weighted-base' | 'weighted';
export const MODES: Mode[] = ['legacy', 'weighted-base', 'weighted'];

/** Параметры механизмов для новичков (аванс опыта α, квота p) и веса score. */
export interface RankParams {
  alpha: number;
  p: number;
  weights?: typeof WEIGHTS;
}
export const DEFAULT_PARAMS: RankParams = {
  alpha: ALPHA,
  p: NEWCOMER_SHARE,
};

export interface Ranked {
  performer: Performer;
  /** Соответствие заказу; есть только в запросах подбора. */
  R?: number;
}

export function toOrderPerformer(p: Performer) {
  return {
    categories: p.categories,
    skills: p.skills,
    price_from: p.priceFrom,
  };
}

/** Ранжирует кандидатов (уже отфильтрованных) выбранным режимом. */
export function rank(
  mode: Mode,
  candidates: Performer[],
  order?: OrderContext,
  params: RankParams = DEFAULT_PARAMS,
): Ranked[] {
  const withR = (p: Performer): Ranked => ({
    performer: p,
    R: order ? relevance(order, toOrderPerformer(p)) : undefined,
  });
  if (mode === 'legacy') return [...candidates].sort(compareLegacy).map(withR);
  return rankWeighted(
    candidates.map(withR),
    mode === 'weighted' ? params : { ...params, alpha: 0, p: 0 },
  );
}

/** Как в UserService.getSpecialists: rating_score ↓, отзывов ↓, визит ↓, _id ↑. */
function compareLegacy(a: Performer, b: Performer) {
  return (
    b.ratingScore - a.ratingScore ||
    b.reviewsCount - a.reviewsCount ||
    b.lastSeen.getTime() - a.lastSeen.getTime() ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Обе ступени RankingService на чистых функциях ranking.math. */
function rankWeighted(items: Ranked[], params: RankParams) {
  const scored = items.map((item) => {
    const p = item.performer;
    const s = score(
      {
        Q: quality(p.ratingScore, p.reviewsCount),
        E: experience(p.completed),
        Eadv: experienceAdvanced(p.completed, p.eligible, params.alpha),
        A: activity(p.lastSeen, NOW),
        L: workload(p.inProgress),
        R: item.R,
      },
      params.weights,
    );
    return {
      ...item,
      id: p.id,
      score: s,
      isNewcomer: newcomer(p),
      reviewsCount: p.reviewsCount,
      lastSeen: p.lastSeen,
    };
  });
  return rerankWithNewcomerQuota(scored, params.p).map(({ performer, R }) => ({
    performer,
    R,
  }));
}
