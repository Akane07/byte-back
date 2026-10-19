import { generateOrderCategories } from './dynamic';
import { FINAL_PARAMS, Mode } from './modes';
import { generatePopulation, platformMeanRating } from './population';
import { mulberry32 } from './rng';
import { Inputs, evaluate } from './sensitivity';
import { generateQueries } from './static';

/** weighted-prior — weighted, где Q считается с априорным средним, равным средней оценке платформы. */
export type Variant = Mode | 'weighted-prior';
export const VARIANTS: Variant[] = [
  'legacy',
  'weighted-base',
  'weighted',
  'weighted-prior',
];

/** Все случайные данные эксперимента выводятся из одного seed. */
export function inputsForSeed(seed: number): Inputs {
  return {
    population: generatePopulation(mulberry32(seed)),
    queries: generateQueries(mulberry32(seed + 1)),
    orderCategories: generateOrderCategories(mulberry32(seed + 2)),
    dynamicSeed: seed + 3,
  };
}

/** Четыре режима при финальных параметрах, по строке на seed и режим. */
export function runVariants(seeds: number[], inputs: Inputs[]) {
  return seeds.flatMap((seed, i) => {
    const input = inputs[i];
    const prior = platformMeanRating(input.population);
    return VARIANTS.map((variant) => ({
      seed,
      variant,
      ...(variant === 'weighted-prior'
        ? evaluate(input, 'weighted', { ...FINAL_PARAMS, priorMean: prior })
        : evaluate(input, variant, FINAL_PARAMS)),
      priorMean: variant === 'weighted-prior' ? prior : 4.5,
    }));
  });
}
