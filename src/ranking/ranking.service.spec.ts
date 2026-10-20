import {
  getConnectionToken,
  getModelToken,
  MongooseModule,
} from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Model, Types } from 'mongoose';
import { DB_START_TIMEOUT, startTestDb, TestDb } from '../../test/mongo';
import { AuthService } from '../auth/auth.service';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { Order, OrderSchema, OrderStatus } from '../order/schemas/order.schema';
import { SpecialistsQueryDto } from '../user/dto/update-user.dto';
import { UserService } from '../user/user.service';
import { experience, workload } from './ranking.math';
import {
  RankingCandidate,
  RankingInfo,
  RankingService,
} from './ranking.service';

const newId = () => new Types.ObjectId().toString();

/** Исполнитель с заполненным профилем — одинаковым у всех, кроме id. */
const candidate = (id: string): RankingCandidate => ({
  id,
  rating_score: 4.5,
  reviews_count: 0,
  last_seen: new Date().toISOString(),
  avatar: '/uploads/avatars/1.webp',
  description: 'а'.repeat(80),
  speciality: 'Vue-разработчик',
  categories: [1],
  skills: ['Vue', 'TypeScript', 'Nuxt'],
  work_format: 'remote',
  is_verified: true,
});

describe('RankingService', () => {
  let db: TestDb;
  let moduleRef: TestingModule;
  let ranking: RankingService;
  let userService: UserService;
  let orders: Model<Order>;
  let users: Model<User>;

  beforeAll(async () => {
    db = await startTestDb();
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(db.uri),
        MongooseModule.forFeature([
          { name: Order.name, schema: OrderSchema },
          { name: User.name, schema: UserSchema },
        ]),
      ],
      providers: [
        RankingService,
        UserService,
        { provide: AuthService, useValue: {} },
      ],
    }).compile();
    await db.attach(moduleRef.get(getConnectionToken()));
    ranking = moduleRef.get(RankingService);
    userService = moduleRef.get(UserService);
    orders = moduleRef.get(getModelToken(Order.name));
    users = moduleRef.get(getModelToken(User.name));
  }, DB_START_TIMEOUT);

  afterEach(async () => {
    jest.restoreAllMocks();
    await db.clear();
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.stop();
  });

  const order = (
    performer: string | undefined,
    status: OrderStatus,
    customer = newId(),
  ) =>
    orders.create({
      title: 'Заказ',
      price: 1000,
      price_type: 'fixed',
      type: 'one-time',
      deadlines: 'less-week',
      user_id: customer,
      performer,
      status,
    });

  describe('агрегация счётчиков заказов', () => {
    it('завершённые и в работе — по каждому исполнителю, одной агрегацией', async () => {
      const [busy, single, idle] = [newId(), newId(), newId()];
      await Promise.all([
        order(busy, 'completed'),
        order(busy, 'completed'),
        order(busy, 'pending'),
        order(busy, 'review'),
        // Отменённый не считается ни завершённым, ни текущим.
        order(busy, 'cancelled'),
        order(single, 'completed'),
        // Заказы, где idle заказчик, и заказы без исполнителя не в счёт.
        order(newId(), 'completed', idle),
        order(undefined, 'active', idle),
      ]);
      const aggregate = jest.spyOn(orders, 'aggregate');

      const described = await ranking.describe(
        [busy, single, idle].map(candidate),
      );

      expect(aggregate).toHaveBeenCalledTimes(1);
      const counts = described.map(({ ranking: r }) => [
        r.completed,
        r.inProgress,
      ]);
      expect(counts).toEqual([
        [2, 2],
        [1, 0],
        [0, 0],
      ]);
      // Счётчики доходят до факторов опыта и загрузки.
      for (const { ranking: r } of described) {
        expect(r.factors.E).toBeCloseTo(experience(r.completed));
        expect(r.factors.L).toBeCloseTo(workload(r.inProgress));
      }
      // describe порядок не меняет.
      expect(described.map((d) => d.candidate.id)).toEqual([
        busy,
        single,
        idle,
      ]);
    });

    it('при равных профилях свободный исполнитель выше загруженного', async () => {
      const [loaded, free] = [newId(), newId()];
      await Promise.all(
        ['pending', 'pending', 'review'].map((s) =>
          order(loaded, s as OrderStatus),
        ),
      );

      const ranked = await ranking.rank([loaded, free].map(candidate));
      expect(ranked.map((r) => r.candidate.id)).toEqual([free, loaded]);
      expect(ranked.map((r) => r.ranking.position)).toEqual([1, 2]);
      expect(ranked[1].ranking.inProgress).toBe(3);
    });
  });

  describe('legacy — прежняя сортировка каталога', () => {
    // rating_score, reviews_count, last_seen: равенства на каждом уровне.
    const rows: [number, number, string | undefined][] = [
      [4.8, 10, '2026-10-01T00:00:00.000Z'],
      [4.8, 10, '2026-10-05T00:00:00.000Z'],
      [4.8, 3, '2026-10-20T00:00:00.000Z'],
      [4.6, 7, undefined],
      [4.6, 7, '2026-09-01T00:00:00.000Z'],
      [4.6, 7, '2026-09-01T00:00:00.000Z'],
      [4.6, 7, '2026-09-01T00:00:00.000Z'],
      [4.9, 1, '2026-10-10T00:00:00.000Z'],
      [0, 0, '2026-10-21T00:00:00.000Z'],
      [0, 0, undefined],
      [0, 0, '2026-10-02T00:00:00.000Z'],
      [3.9, 20, '2026-10-03T00:00:00.000Z'],
      [4.2, 2, '2026-10-04T00:00:00.000Z'],
      [4.2, 2, '2026-10-04T00:00:00.000Z'],
    ];

    type Row = {
      id: string;
      rating_score: number;
      reviews_count: number;
      last_seen?: string;
    };
    const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    /** Эталон из ТЗ 1.4: рейтинг, число отзывов, последний визит; затем _id. */
    const legacyOrder = (a: Row, b: Row) =>
      b.rating_score - a.rating_score ||
      b.reviews_count - a.reviews_count ||
      // Нет визита — ниже всех, как null в сортировке MongoDB.
      cmp(b.last_seen ?? '', a.last_seen ?? '') ||
      cmp(a.id, b.id);

    let expected: string[];

    beforeEach(async () => {
      // id выдаём заранее и вставляем в обратном порядке: порядок вставки
      // не должен совпадать с порядком по _id.
      const docs = rows.map(([rating_score, reviews_count, last_seen], i) => ({
        _id: new Types.ObjectId(),
        email: `p${i}@test.local`,
        passwordHash: 'x',
        salt: 'x',
        is_performer: true,
        rating_score,
        reviews_count,
        last_seen,
      }));
      await users.insertMany([...docs].reverse());
      // Не исполнители в каталог не попадают.
      await users.create({
        email: 'customer@test.local',
        passwordHash: 'x',
        salt: 'x',
        rating_score: 5,
        reviews_count: 50,
      });
      expected = docs
        .map((d) => ({ ...d, id: d._id.toString() }))
        .sort(legacyOrder)
        .map((d) => d.id);
    });

    const catalog = async (explain: boolean) => {
      const pages = await Promise.all(
        [1, 2].map((page) =>
          userService.getSpecialists({
            page,
            rankMode: 'legacy',
            explain,
          } as SpecialistsQueryDto),
        ),
      );
      expect(pages.map((p) => p.total)).toEqual([rows.length, rows.length]);
      return pages.flatMap(
        (p) => p.users as { id: string; ranking?: RankingInfo }[],
      );
    };

    it('порядок по всем страницам совпадает с эталоном', async () => {
      const list = await catalog(false);
      expect(list.map((u) => u.id)).toEqual(expected);
      expect(list[0]).not.toHaveProperty('ranking');
    });

    it('с explain порядок тот же, позиции сквозные', async () => {
      const list = await catalog(true);
      expect(list.map((u) => u.id)).toEqual(expected);
      expect(list.map((u) => u.ranking?.position)).toEqual(
        expected.map((_, i) => i + 1),
      );
      expect(list.every((u) => u.ranking?.mode === 'legacy')).toBe(true);
    });
  });
});
