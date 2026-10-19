import { WEIGHTS } from '../../src/ranking/ranking.constants';
import { simulate } from './dynamic';
import { DEFAULT_PARAMS, Mode, RankParams } from './modes';
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

/** Метрики 3.2 (каталог и подбор) и 3.3 для одного режима и набора параметров. */
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
    catalogGini: cat.giniExposure,
    catalogMeanQ: cat.meanQ,
    recommendNewcomerShare: rec.newcomerShare,
    recommendGini: rec.giniExposure,
    recommendMeanQ: rec.meanQ,
    recommendMeanR: rec.meanR!,
    newcomersServed: dyn.newcomersServed,
    medianFirstOrder: dyn.medianFirstOrder,
    giniOrders: dyn.giniOrders,
    meanChosenQ: dyn.meanChosenQ,
  };
}

export type Evaluation = ReturnType<typeof evaluate>;

/** Сетка α × p при стартовых весах; клетка α = 0, p = 0 — это weighted-base. */
export function runSensitivity(input: Inputs) {
  return ALPHAS.flatMap((alpha) =>
    QUOTAS.map((p) => ({
      alpha,
      p,
      ...evaluate(input, 'weighted', { alpha, p }),
    })),
  );
}

/** Сетка весов ступени 1 при α и p по умолчанию; для каждой — weighted-base и weighted. */
export function runWeights(input: Inputs) {
  return W_Q.flatMap((wQ) =>
    W_A.flatMap((wA) =>
      W_L.flatMap((wL) => {
        const weights = { ...WEIGHTS, Q: wQ, A: wA, L: wL };
        return (['weighted-base', 'weighted'] as Mode[]).map((mode) => ({
          wQ,
          wA,
          wL,
          mode,
          ...evaluate(input, mode, { ...DEFAULT_PARAMS, weights }),
        }));
      }),
    ),
  );
}
