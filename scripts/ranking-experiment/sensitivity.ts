import { aggregate } from './aggregate';
import { simulate } from './dynamic';
import { FINAL_PARAMS, Mode, RankParams } from './modes';
import { Performer } from './population';
import { Query, QueryKind, evaluateStatic } from './static';

export const ALPHAS = [0, 0.25, 0.5, 0.75];
export const QUOTAS = [0, 0.1, 0.2, 0.3];
export const W_Q = [0.4, 0.5, 0.6];
export const W_A = [0.1, 0.05];
export const W_L = [0.1, 0.05];

export interface Inputs {
  population: Performer[];
  queries: Record<QueryKind, Query[]>;
  orderCategories: number[];
  dynamicSeed: number;
}

/** Метрики 3.2 (каталог и подбор) и 3.3 для одного режима, параметров и seed. */
export function evaluate(input: Inputs, mode: Mode, params: RankParams) {
  const cat = evaluateStatic(
    input.population,
    input.queries.catalog,
    mode,
    params,
  );
  const rec = evaluateStatic(
    input.population,
    input.queries.recommend,
    mode,
    params,
  );
  const dyn = simulate(
    input.population,
    input.orderCategories,
    mode,
    input.dynamicSeed,
    params,
  );
  return {
    catalogNewcomerShare: cat.newcomerShare,
    catalogNoReviewShare: cat.noReviewNewcomerShare,
    catalogGini: cat.giniExposure,
    catalogTopExperiencedShare: cat.topExperiencedShare,
    catalogMeanQ: cat.meanQ,
    recommendNewcomerShare: rec.newcomerShare,
    recommendNoReviewShare: rec.noReviewNewcomerShare,
    recommendGini: rec.giniExposure,
    recommendTopExperiencedShare: rec.topExperiencedShare,
    recommendMeanQ: rec.meanQ,
    recommendMeanR: rec.meanR!,
    newcomersServed: dyn.newcomersServed,
    medianFirstOrder: dyn.medianFirstOrder,
    newcomerOrderShare: dyn.newcomerOrderShare,
    giniOrders: dyn.giniOrders,
    meanChosenQ: dyn.meanChosenQ,
    timeline: dyn.timeline,
  };
}

export type Evaluation = ReturnType<typeof evaluate>;

/** Относительная разница качества x к базе y — в топ-10 подбора и у выбранных в динамике. */
const qualityLoss = (x: Evaluation, y: Evaluation) => ({
  lossTop10: x.recommendMeanQ / y.recommendMeanQ - 1,
  lossChosen: x.meanChosenQ / y.meanChosenQ - 1,
});

/**
 * Сетка α × p при финальных весах, по всем seed. Потеря качества — к
 * weighted-base того же seed (критерий а). Клетка α = 0, p = 0 — это weighted-base.
 */
export function runSensitivity(inputs: Inputs[]) {
  const bases = inputs.map((input) =>
    evaluate(input, 'weighted-base', FINAL_PARAMS),
  );
  return ALPHAS.flatMap((alpha) =>
    QUOTAS.map((p) => {
      const perSeed = inputs.map((input, i) => {
        const e = evaluate(input, 'weighted', { ...FINAL_PARAMS, alpha, p });
        return { ...e, ...qualityLoss(e, bases[i]) };
      });
      return { alpha, p, stats: aggregate(perSeed) };
    }),
  );
}

/**
 * Сетка весов ступени 1 при финальных α и p, по всем seed.
 * baseLoss* — weighted-base к legacy (критерий б), loss* — weighted к weighted-base (критерий а).
 */
export function runWeights(inputs: Inputs[]) {
  const legacies = inputs.map((input) =>
    evaluate(input, 'legacy', FINAL_PARAMS),
  );
  return W_Q.flatMap((wQ) =>
    W_A.flatMap((wA) =>
      W_L.map((wL) => {
        const params = {
          ...FINAL_PARAMS,
          weights: { ...FINAL_PARAMS.weights, Q: wQ, A: wA, L: wL },
        };
        const perSeed = inputs.map((input, i) => {
          const b = evaluate(input, 'weighted-base', params);
          const w = evaluate(input, 'weighted', params);
          const bl = qualityLoss(b, legacies[i]);
          const wb = qualityLoss(w, b);
          return {
            recommendNewcomerShare: w.recommendNewcomerShare,
            recommendGini: w.recommendGini,
            newcomersServed: w.newcomersServed,
            meanChosenQ: w.meanChosenQ,
            baseLossTop10: bl.lossTop10,
            baseLossChosen: bl.lossChosen,
            lossTop10: wb.lossTop10,
            lossChosen: wb.lossChosen,
          };
        });
        return { wQ, wA, wL, stats: aggregate(perSeed) };
      }),
    ),
  );
}
