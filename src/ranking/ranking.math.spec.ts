import { N_NEW, WEIGHTS } from './ranking.constants';
import {
  activity,
  compareRanked,
  contributions,
  effectiveWeights,
  experience,
  experienceAdvanced,
  isEligible,
  isNewcomer,
  ProfileFields,
  quality,
  Rankable,
  relevance,
  rerankWithNewcomerQuota,
  score,
  workload,
} from './ranking.math';

const NOW = new Date('2026-10-19T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

const fullProfile: ProfileFields = {
  avatar: '/uploads/avatars/1.webp',
  description: 'а'.repeat(80),
  speciality: 'Vue-разработчик',
  categories: [1],
  skills: ['Vue', 'TypeScript', 'Nuxt'],
  price_from: 1500,
  work_format: 'remote',
  city: '',
  is_verified: true,
};

const inUnit = (x: number) => x >= 0 && x <= 1;

describe('факторы', () => {
  it('все в [0, 1] на краевых входах', () => {
    for (const [rating, count] of [
      [0, 0],
      [1, 10],
      [5, 10],
      [5, 1000],
    ]) {
      expect(inUnit(quality(rating, count))).toBe(true);
    }
    for (const n of [0, 1, 30, 1000]) {
      expect(inUnit(experience(n))).toBe(true);
      expect(inUnit(experienceAdvanced(n, true))).toBe(true);
      expect(inUnit(workload(n))).toBe(true);
    }
    expect(activity(undefined, NOW)).toBe(0);
    expect(activity(NOW, NOW)).toBe(1);
    expect(inUnit(activity(daysAgo(1000), NOW))).toBe(true);
  });

  it('Q: рейтинг 1 → 0, рейтинг 5 → 1, без отзывов — по априорному 4,5', () => {
    expect(quality(1, 10)).toBe(0);
    expect(quality(5, 10)).toBe(1);
    expect(quality(0, 0)).toBeCloseTo(0.875);
  });

  it('E достигает 1 на N_EXP и дальше не растёт', () => {
    expect(experience(30)).toBeCloseTo(1);
    expect(experience(200)).toBe(1);
  });

  it('A затухает в e раз за D_ACT дней', () => {
    expect(activity(daysAgo(14), NOW)).toBeCloseTo(Math.exp(-1));
  });

  it('L ограничен единицей', () => {
    expect(workload(3)).toBe(1);
    expect(workload(10)).toBe(1);
    expect(workload(0)).toBe(0);
  });
});

describe('опыт с авансом', () => {
  it.each([0, 0.25, 0.5, 0.75])(
    'E и Ê не убывают с ростом n при α = %p, Ê ≥ E',
    (alpha) => {
      for (let n = 1; n <= 60; n++) {
        expect(experience(n)).toBeGreaterThanOrEqual(experience(n - 1));
        expect(experienceAdvanced(n, true, alpha)).toBeGreaterThanOrEqual(
          experienceAdvanced(n - 1, true, alpha),
        );
        expect(experienceAdvanced(n, true, alpha)).toBeGreaterThanOrEqual(
          experience(n),
        );
      }
    },
  );

  it('без eligible Ê = E', () => {
    for (const n of [0, 3, 10, 60]) {
      expect(experienceAdvanced(n, false)).toBe(experience(n));
    }
  });
});

describe('eligible и новичок', () => {
  it('полный профиль — eligible, с 0 заказов — новичок', () => {
    expect(isEligible(fullProfile)).toEqual({ eligible: true, missing: [] });
    expect(isNewcomer(true, 0)).toBe(true);
    expect(isNewcomer(true, N_NEW)).toBe(false);
  });

  it('без аватара — не eligible, не новичок, в missing есть avatar', () => {
    const { eligible, missing } = isEligible({ ...fullProfile, avatar: '' });
    expect(eligible).toBe(false);
    expect(missing).toContain('avatar');
    expect(isNewcomer(eligible, 0)).toBe(false);
  });

  it('город нужен только для работы на месте', () => {
    expect(
      isEligible({ ...fullProfile, work_format: 'onsite' }).missing,
    ).toEqual(['city']);
    expect(
      isEligible({ ...fullProfile, work_format: 'both', city: 'Казань' })
        .eligible,
    ).toBe(true);
  });

  it('пустой профиль — все условия в missing', () => {
    expect(isEligible({ work_format: 'both' }).missing).toEqual([
      'avatar',
      'description',
      'speciality',
      'categories',
      'skills',
      'price_from',
      'city',
      'email_verified',
    ]);
  });
});

describe('score', () => {
  it('без R сумма положительных весов равна 1, wL не меняется', () => {
    const w = effectiveWeights(false);
    expect(w.Q + w.E + w.A).toBeCloseTo(1);
    expect(w.R).toBe(0);
    expect(w.L).toBe(WEIGHTS.L);
  });

  it('с R сумма положительных весов тоже равна 1', () => {
    const w = effectiveWeights(true);
    expect(w.Q + w.R + w.E + w.A).toBeCloseTo(1);
  });

  it('идеальный свободный исполнитель — 1, перегруженный — на wL ниже', () => {
    const best = { Q: 1, E: 1, Eadv: 1, A: 1, L: 0 };
    expect(score(best)).toBeCloseTo(1);
    expect(score({ ...best, L: 1 })).toBeCloseTo(1 - WEIGHTS.L);
    expect(score({ ...best, R: 1 })).toBeCloseTo(1);
  });

  it('сумма вкладов равна score — с R и без', () => {
    const f = { Q: 0.8, E: 0.2, Eadv: 0.6, A: 0.4, L: 2 / 3 };
    for (const factors of [f, { ...f, R: 0.7 }]) {
      const c = contributions(factors);
      expect(c.Q + c.R + c.E + c.A + c.L).toBeCloseTo(score(factors), 12);
      expect(c.L).toBeLessThan(0);
    }
    expect(contributions(f).R).toBe(0);
  });
});

const item = (
  id: string,
  s: number,
  isNewcomer = false,
  reviewsCount = 0,
  lastSeen?: Date,
): Rankable => ({ id, score: s, isNewcomer, reviewsCount, lastSeen });

describe('compareRanked', () => {
  it('при равном score: отзывы ↓, визит ↓, id ↑ — детерминированно', () => {
    const list = [
      item('c', 0.5, false, 1, daysAgo(1)),
      item('b', 0.5, false, 1, daysAgo(1)),
      item('d', 0.5, false, 1),
      item('a', 0.5, false, 1, daysAgo(5)),
      item('e', 0.5, false, 2),
      item('f', 0.6),
    ];
    const ids = (xs: Rankable[]) => xs.map((x) => x.id).join('');
    const once = ids([...list].sort(compareRanked));
    expect(once).toBe('febcad');
    expect(ids([...list].reverse().sort(compareRanked))).toBe(once);
  });
});

/** Детерминированный генератор для перебора случайных выдач. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomList(rand: () => number, size: number, newcomerShare: number) {
  return Array.from({ length: size }, (_, i) =>
    item(`u${String(i).padStart(3, '0')}`, rand(), rand() < newcomerShare),
  );
}

describe('квота для новичков', () => {
  const rand = mulberry32(42);
  const cases = Array.from({ length: 200 }, () =>
    randomList(rand, 1 + Math.floor(rand() * 40), rand() * 0.5),
  );

  it.each([0.1, 0.2, 0.3])(
    'p = %p: в любом префиксе k новичков ≥ ⌊p·k⌋, пока они есть',
    (p) => {
      for (const list of cases) {
        const total = list.filter((x) => x.isNewcomer).length;
        const ranked = rerankWithNewcomerQuota(list, p);
        let seen = 0;
        ranked.forEach((x, i) => {
          if (x.isNewcomer) seen++;
          expect(seen).toBeGreaterThanOrEqual(
            Math.min(total, Math.floor(p * (i + 1) + 1e-9)),
          );
        });
      }
    },
  );

  it('выдача — перестановка входа, позиции 1..n', () => {
    for (const list of cases) {
      const ranked = rerankWithNewcomerQuota(list);
      expect(ranked.map((x) => x.id).sort()).toEqual(
        list.map((x) => x.id).sort(),
      );
      expect(ranked.map((x) => x.position)).toEqual(list.map((_, i) => i + 1));
    }
  });

  it('без новичков и при p = 0 — чистая сортировка по score', () => {
    for (const list of cases) {
      const plain = [...list].sort(compareRanked).map((x) => x.id);
      const noNewcomers = list.map((x) => ({ ...x, isNewcomer: false }));
      expect(rerankWithNewcomerQuota(noNewcomers).map((x) => x.id)).toEqual(
        [...noNewcomers].sort(compareRanked).map((x) => x.id),
      );
      expect(rerankWithNewcomerQuota(list, 0).map((x) => x.id)).toEqual(plain);
    }
  });

  it('среди новичков и среди остальных порядок по score сохраняется', () => {
    for (const list of cases) {
      const ranked = rerankWithNewcomerQuota(list);
      for (const flag of [true, false]) {
        const group = ranked.filter((x) => x.isNewcomer === flag);
        expect(group.map((x) => x.id)).toEqual(
          [...group].sort(compareRanked).map((x) => x.id),
        );
      }
    }
  });

  it('пример: 10 мест, новички слабее всех → на 5-й и 10-й по квоте', () => {
    const list = [
      ...Array.from({ length: 8 }, (_, i) => item(`o${i}`, 0.9 - i * 0.05)),
      item('n1', 0.2, true),
      item('n2', 0.1, true),
    ];
    const ranked = rerankWithNewcomerQuota(list);
    expect(ranked.map((x) => x.id)).toEqual([
      'o0',
      'o1',
      'o2',
      'o3',
      'n1',
      'o4',
      'o5',
      'o6',
      'o7',
      'n2',
    ]);
    expect(ranked.filter((x) => x.quotaSlot).map((x) => x.id)).toEqual([
      'n1',
      'n2',
    ]);
  });

  it('новичок, поднявшийся сам, засчитывается в квоту и не помечен quotaSlot', () => {
    const list = [
      item('n1', 0.95, true),
      ...Array.from({ length: 9 }, (_, i) => item(`o${i}`, 0.9 - i * 0.05)),
    ];
    const ranked = rerankWithNewcomerQuota(list);
    expect(ranked[0]).toMatchObject({ id: 'n1', quotaSlot: false });
    expect(ranked.map((x) => x.id)).toEqual(
      [...list].sort(compareRanked).map((x) => x.id),
    );
  });
});

describe('relevance', () => {
  const performer = {
    categories: [1],
    skills: ['Vue', 'Nuxt'],
    price_from: 1500,
  };
  const fixed = (price: number | { from: number; to: number }) => ({
    category: 1,
    skills: ['Vue', 'Nuxt', 'Figma', 'SEO'],
    price,
    price_type: 'fixed' as const,
  });

  it('у заказа нет навыков — skills = cat', () => {
    const order = { ...fixed(5000), skills: [] };
    expect(relevance(order, performer)).toBeCloseTo(1);
    expect(relevance({ ...order, category: 2 }, performer)).toBeCloseTo(0.15);
  });

  it('категория и 2 из 4 навыков, цена в бюджете', () => {
    expect(relevance(fixed(5000), performer)).toBeCloseTo(
      0.5 + 0.35 * 0.5 + 0.15,
    );
  });

  it('цена выше бюджета снижает price, в два раза выше — до 0', () => {
    const base = 0.5 + 0.35 * 0.5;
    expect(relevance(fixed(1000), performer)).toBeCloseTo(base + 0.15 * 0.5);
    expect(relevance(fixed(750), performer)).toBeCloseTo(base);
  });

  it('договорная и почасовая цена, цена «от» не указана — price = 1', () => {
    const full = 0.5 + 0.35 * 0.5 + 0.15;
    expect(
      relevance({ ...fixed(100), price_type: 'contract' }, performer),
    ).toBeCloseTo(full);
    expect(
      relevance({ ...fixed(100), price_type: 'hourly' }, performer),
    ).toBeCloseTo(full);
    expect(
      relevance(fixed(100), { ...performer, price_from: undefined }),
    ).toBeCloseTo(full);
  });

  it('диапазон: бюджет — верхняя граница, без неё — нижняя', () => {
    const base = 0.5 + 0.35 * 0.5;
    expect(relevance(fixed({ from: 500, to: 1500 }), performer)).toBeCloseTo(
      base + 0.15,
    );
    expect(
      relevance(
        fixed({ from: 1000 } as { from: number; to: number }),
        performer,
      ),
    ).toBeCloseTo(base + 0.15 * 0.5);
  });
});
