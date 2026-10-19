import { quality } from '../../src/ranking/ranking.math';
import { TOP_K, exposureAt, gini, mean, median } from './metrics';
import { MODES, Mode, NewcomerParams, rank } from './modes';
import { MODEL, Performer, addRating, newcomer } from './population';
import { Rng, mulberry32, randInt, weightedIndex } from './rng';
import { candidatesFor } from './static';

export const DYNAMIC_ORDERS = 2000;
/** Заказ завершается, когда после него размещено столько новых заказов. */
export const COMPLETE_AFTER = 20;

export interface DynamicMetrics {
  /** Доля стартовых новичков, получивших хотя бы один заказ. */
  newcomersServed: number;
  /** Медиана номера заказа, на котором стартовый новичок получил первый; Infinity — не получила половина. */
  medianFirstOrder: number;
  /** Доля всех заказов, доставшихся стартовым новичкам. */
  newcomerOrderShare: number;
  /** Джини по числу заказов, полученных за симуляцию, по всем исполнителям. */
  giniOrders: number;
  /** Среднее истинное q выбранных исполнителей — выгода заказчика. */
  meanChosenQ: number;
}

export const generateOrderCategories = (rng: Rng) =>
  Array.from({ length: DYNAMIC_ORDERS }, () =>
    randInt(rng, 0, MODEL.categories - 1),
  );

export function simulate(
  population: Performer[],
  categories: number[],
  mode: Mode,
  seed: number,
  params?: NewcomerParams,
): DynamicMetrics {
  const rng = mulberry32(seed);
  const performers = population.map((p) => ({ ...p }));
  const startNewcomers = new Set(performers.filter(newcomer).map((p) => p.id));
  const received = new Map(performers.map((p) => [p.id, 0]));
  const firstOrder = new Map<string, number>();
  const pending: { performer: Performer; at: number }[] = [];
  const chosenQ: number[] = [];
  let newcomerOrders = 0;

  categories.forEach((category, t) => {
    while (pending.length && pending[0].at === t) {
      const { performer } = pending.shift()!;
      performer.inProgress--;
      performer.completed++;
      if (rng() < MODEL.reviewRate) addRating(performer, rng);
    }

    const top = rank(
      mode,
      candidatesFor(performers, { category }),
      undefined,
      params,
    ).slice(0, TOP_K);
    // заказчик не знает истинного q и смотрит на рейтинг (Q) и позицию
    const weights = top.map(
      ({ performer: p }, i) =>
        exposureAt(i + 1) *
        (0.5 + 0.5 * quality(p.ratingScore, p.reviewsCount)),
    );
    const chosen = top[weightedIndex(rng, weights)].performer;

    chosen.inProgress++;
    received.set(chosen.id, received.get(chosen.id)! + 1);
    if (!firstOrder.has(chosen.id)) firstOrder.set(chosen.id, t + 1);
    if (startNewcomers.has(chosen.id)) newcomerOrders++;
    chosenQ.push(chosen.q);
    pending.push({ performer: chosen, at: t + COMPLETE_AFTER });
  });

  const newcomerIds = [...startNewcomers];
  return {
    newcomersServed:
      newcomerIds.filter((id) => firstOrder.has(id)).length /
      newcomerIds.length,
    medianFirstOrder: median(
      newcomerIds.map((id) => firstOrder.get(id) ?? Infinity),
    ),
    newcomerOrderShare: newcomerOrders / categories.length,
    giniOrders: gini([...received.values()]),
    meanChosenQ: mean(chosenQ),
  };
}

export function runDynamic(
  population: Performer[],
  categories: number[],
  seed: number,
) {
  return MODES.map((mode) => ({
    mode,
    ...simulate(population, categories, mode, seed),
  }));
}
