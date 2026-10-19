import {
  ALPHA,
  D_ACT,
  L_CAP,
  N_EXP,
  N_NEW,
  NEWCOMER_SHARE,
  PRIOR_MEAN,
  PROFILE_MIN,
  RELEVANCE_WEIGHTS,
  WEIGHTS,
} from './ranking.constants';

// Чистые функции ранжирования: без Nest и Mongoose, чтобы их можно было
// тестировать и вызывать из эксперимента (пул 3). Формулы — docs/ranking.md.

const DAY_MS = 24 * 60 * 60 * 1000;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Q: байесовский рейтинг из [1, 5] → [0, 1]. Без отзывов — априорное среднее. */
export function quality(ratingScore: number, reviewsCount: number) {
  const rating = reviewsCount > 0 ? ratingScore : PRIOR_MEAN;
  return clamp01((rating - 1) / 4);
}

/** E: опыт по числу завершённых заказов, с убывающей отдачей. */
export function experience(completed: number, nExp = N_EXP) {
  return Math.min(1, Math.log1p(Math.max(0, completed)) / Math.log1p(nExp));
}

/** Ê: исполнителю с заполненным профилем засчитывается доля α недостающего опыта. */
export function experienceAdvanced(
  completed: number,
  eligible: boolean,
  alpha = ALPHA,
) {
  const e = experience(completed);
  return eligible ? e + alpha * (1 - e) : e;
}

/** A: экспоненциальное затухание по дням с последнего визита. Нет визитов — 0. */
export function activity(
  lastSeen: string | Date | undefined,
  now: Date = new Date(),
  dAct = D_ACT,
) {
  const seen = toMs(lastSeen);
  if (seen === undefined) return 0;
  const days = Math.max(0, (now.getTime() - seen) / DAY_MS);
  return Math.exp(-days / dAct);
}

/** L: доля от предельной загрузки по заказам в работе. */
export function workload(inProgress: number, cap = L_CAP) {
  return clamp01(inProgress / cap);
}

export interface ProfileFields {
  avatar?: string;
  description?: string;
  speciality?: string;
  categories?: number[];
  skills?: string[];
  price_from?: number;
  work_format?: 'remote' | 'onsite' | 'both';
  city?: string;
  is_verified?: boolean;
}

export type MissingCondition =
  | 'avatar'
  | 'description'
  | 'speciality'
  | 'categories'
  | 'skills'
  | 'price_from'
  | 'city'
  | 'email_verified';

/** Заполнен ли профиль настолько, чтобы получать аванс опыта и место по квоте. */
export function isEligible(profile: ProfileFields) {
  const missing: MissingCondition[] = [];
  if (!profile.avatar) missing.push('avatar');
  if ((profile.description ?? '').trim().length < PROFILE_MIN.description) {
    missing.push('description');
  }
  if (!profile.speciality?.trim()) missing.push('speciality');
  if ((profile.categories?.length ?? 0) < PROFILE_MIN.categories) {
    missing.push('categories');
  }
  if ((profile.skills?.length ?? 0) < PROFILE_MIN.skills)
    missing.push('skills');
  if (profile.price_from === undefined || profile.price_from === null) {
    missing.push('price_from');
  }
  if (profile.work_format !== 'remote' && !profile.city) missing.push('city');
  if (!profile.is_verified) missing.push('email_verified');
  return { eligible: missing.length === 0, missing };
}

export function isNewcomer(eligible: boolean, completed: number) {
  return eligible && completed < N_NEW;
}

export interface OrderContext {
  category?: number;
  skills?: string[];
  price: number | { from: number; to: number };
  price_type: 'contract' | 'fixed' | 'hourly';
}

/** R: соответствие исполнителя заказу — категория, навыки, цена. */
export function relevance(
  order: OrderContext,
  performer: Pick<ProfileFields, 'categories' | 'skills' | 'price_from'>,
) {
  const cat =
    order.category !== undefined &&
    (performer.categories ?? []).includes(order.category)
      ? 1
      : 0;

  const orderSkills = order.skills ?? [];
  const own = new Set(performer.skills ?? []);
  const skills = orderSkills.length
    ? orderSkills.filter((s) => own.has(s)).length / orderSkills.length
    : cat;

  const budget = typeof order.price === 'number' ? order.price : order.price.to;
  const asked = performer.price_from;
  const price =
    order.price_type === 'contract' || asked === undefined || !(budget > 0)
      ? 1
      : asked <= budget
        ? 1
        : Math.max(0, 1 - (asked - budget) / budget);

  return (
    RELEVANCE_WEIGHTS.cat * cat +
    RELEVANCE_WEIGHTS.skills * skills +
    RELEVANCE_WEIGHTS.price * price
  );
}

export interface Factors {
  Q: number;
  E: number;
  Eadv: number;
  A: number;
  L: number;
  R?: number;
}

/**
 * Веса, с которыми факторы входят в score: положительные делятся на свою
 * сумму (без R — на сумму wQ, wE, wA), штраф wL не нормируется.
 */
export function effectiveWeights(withRelevance: boolean, weights = WEIGHTS) {
  const R = withRelevance ? weights.R : 0;
  const sum = weights.Q + R + weights.E + weights.A;
  return {
    Q: weights.Q / sum,
    R: R / sum,
    E: weights.E / sum,
    A: weights.A / sum,
    L: weights.L,
  };
}

export function score(f: Factors, weights = WEIGHTS) {
  const w = effectiveWeights(f.R !== undefined, weights);
  return w.Q * f.Q + w.R * (f.R ?? 0) + w.E * f.Eadv + w.A * f.A - w.L * f.L;
}

export interface Rankable {
  id: string;
  score: number;
  isNewcomer: boolean;
  reviewsCount: number;
  lastSeen?: string | Date;
}

/** Порядок: score ↓, отзывов ↓, последний визит ↓ (нет визитов — в конец), id ↑. */
export function compareRanked(a: Rankable, b: Rankable) {
  return (
    b.score - a.score ||
    b.reviewsCount - a.reviewsCount ||
    (toMs(b.lastSeen) ?? -Infinity) - (toMs(a.lastSeen) ?? -Infinity) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export type Reranked<T> = T & { position: number; quotaSlot: boolean };

/**
 * Ступень 2: на каждой позиции k новичков в выдаче должно быть не меньше
 * ⌊p·k⌋. Не хватает — ставим лучшего из оставшихся новичков (место по
 * квоте), иначе — лучшего из всех оставшихся.
 */
export function rerankWithNewcomerQuota<T extends Rankable>(
  items: T[],
  p = NEWCOMER_SHARE,
): Reranked<T>[] {
  const sorted = [...items].sort(compareRanked);
  const newcomers = sorted.filter((x) => x.isNewcomer);
  const others = sorted.filter((x) => !x.isNewcomer);
  const result: Reranked<T>[] = [];
  let placed = 0;

  while (newcomers.length || others.length) {
    const k = result.length + 1;
    // + 1e-9: чтобы p·k вроде 0,29·100 = 28,999… не теряло место из-за округления
    const required = Math.floor(p * k + 1e-9);
    let next: T;
    let quotaSlot = false;
    if (placed < required && newcomers.length) {
      next = newcomers.shift()!;
      quotaSlot = !others.length || compareRanked(next, others[0]) > 0;
    } else if (
      !others.length ||
      (newcomers.length && compareRanked(newcomers[0], others[0]) < 0)
    ) {
      next = newcomers.shift()!;
    } else {
      next = others.shift()!;
    }
    if (next.isNewcomer) placed++;
    result.push({ ...next, position: k, quotaSlot });
  }
  return result;
}

function toMs(value: string | Date | undefined) {
  if (value === undefined || value === null || value === '') return undefined;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}
