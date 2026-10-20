import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  getConnectionToken,
  getModelToken,
  MongooseModule,
} from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Model, Types } from 'mongoose';
import { DB_START_TIMEOUT, startTestDb, TestDb } from '../../test/mongo';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { ChatGateway } from '../chat/chat.gateway';
import { Order, OrderSchema } from '../order/schemas/order.schema';
import { bayesianScore, ReviewService } from './review.service';
import { Review, ReviewSchema } from './schemas/review.schema';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);
const LOW_RATING_TEXT = 'Сорвал срок на неделю';

describe('ReviewService', () => {
  let db: TestDb;
  let moduleRef: TestingModule;
  let service: ReviewService;
  let reviews: Model<Review>;
  let orders: Model<Order>;
  let users: Model<User>;
  const chat = { notify: jest.fn() };

  let customer: string;
  let performer: string;
  let stranger: string;

  beforeAll(async () => {
    db = await startTestDb();
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(db.uri),
        MongooseModule.forFeature([
          { name: Review.name, schema: ReviewSchema },
          { name: Order.name, schema: OrderSchema },
          { name: User.name, schema: UserSchema },
        ]),
      ],
      providers: [ReviewService, { provide: ChatGateway, useValue: chat }],
    }).compile();
    await db.attach(moduleRef.get(getConnectionToken()));
    service = moduleRef.get(ReviewService);
    reviews = moduleRef.get(getModelToken(Review.name));
    orders = moduleRef.get(getModelToken(Order.name));
    users = moduleRef.get(getModelToken(User.name));
    // Уникальный индекс «один отзыв от автора на заказ» должен успеть создаться.
    await reviews.init();
  }, DB_START_TIMEOUT);

  beforeEach(async () => {
    [customer, performer, stranger] = await Promise.all(
      ['customer', 'performer', 'stranger'].map(async (name) => {
        const user = await users.create({
          name,
          email: `${name}@test.local`,
          passwordHash: 'x',
          salt: 'x',
        });
        return user.id as string;
      }),
    );
  });

  afterEach(async () => {
    chat.notify.mockClear();
    await db.clear();
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.stop();
  });

  const order = (fields: Partial<Order> = {}) =>
    orders.create({
      title: 'Лендинг для кофейни',
      price: 15000,
      price_type: 'fixed',
      type: 'one-time',
      deadlines: 'less-week',
      user_id: customer,
      performer,
      status: 'completed',
      completed_at: daysAgo(1),
      ...fields,
    });

  const review = (authorId: string, orderId: string, rating = 5, text = '') =>
    service.create(authorId, { orderId, rating, text });

  const profile = async (id: string) => (await users.findById(id).lean())!;

  describe('кто и когда может оставить отзыв', () => {
    it('только после завершения заказа', async () => {
      for (const status of [
        'active',
        'pending',
        'review',
        'cancelled',
      ] as const) {
        const o = await order({ status, completed_at: undefined });
        await expect(review(customer, o.id)).rejects.toThrow(
          BadRequestException,
        );
      }
      expect(await reviews.countDocuments()).toBe(0);
    });

    it('только участник заказа', async () => {
      const o = await order();
      await expect(review(stranger, o.id)).rejects.toThrow(ForbiddenException);
      expect(await reviews.countDocuments()).toBe(0);
    });

    it('несуществующий заказ — 404', async () => {
      await expect(
        review(customer, new Types.ObjectId().toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('не позже 14 дней после завершения', async () => {
      const o = await order({ completed_at: daysAgo(15) });
      await expect(review(customer, o.id)).rejects.toThrow(BadRequestException);
    });

    it('оценка 1–2 требует пояснения не короче 10 символов', async () => {
      for (const [rating, text] of [
        [1, ''],
        [2, ''],
        [2, 'Плохо'],
      ] as const) {
        const o = await order();
        await expect(review(customer, o.id, rating, text)).rejects.toThrow(
          BadRequestException,
        );
      }
      expect(await reviews.countDocuments()).toBe(0);

      const withReason = await order();
      await review(customer, withReason.id, 2, LOW_RATING_TEXT);
      // С оценки 3 текст необязателен.
      const neutral = await order();
      await review(customer, neutral.id, 3, '');
      expect(await reviews.countDocuments()).toBe(2);
    });

    it('один отзыв на заказ от каждого автора', async () => {
      const o = await order();
      await review(customer, o.id, 5);
      await expect(review(customer, o.id, 4)).rejects.toThrow(
        'Вы уже оставили отзыв',
      );
      expect(await reviews.countDocuments({ author_id: customer })).toBe(1);

      // Вторая сторона свой отзыв оставить может.
      await review(performer, o.id, 5);
      expect(await reviews.countDocuments()).toBe(2);
    });

    it('заказчик оценивает исполнителя, исполнитель — заказчика', async () => {
      const o = await order();
      expect(await review(customer, o.id)).toMatchObject({
        target_id: performer,
        target_role: 'performer',
      });
      expect(await review(performer, o.id)).toMatchObject({
        target_id: customer,
        target_role: 'customer',
      });
    });
  });

  describe('слепые отзывы', () => {
    it('первый отзыв скрыт: его нет в профиле и рейтинге', async () => {
      const o = await order();
      const created = await review(customer, o.id, 5);

      expect(created.published).toBe(false);
      const list = await service.listForUser(performer, 'performer', 1);
      expect(list.reviews).toHaveLength(0);
      expect((await service.summary(performer)).performer.count).toBe(0);
      expect(await profile(performer)).toMatchObject({
        rating: 0,
        reviews_count: 0,
      });
      // Второй стороне — напоминание в чат.
      expect(chat.notify).toHaveBeenCalledWith(
        customer,
        performer,
        expect.any(String),
      );
    });

    it('отзыв второй стороны открывает оба сразу', async () => {
      const o = await order();
      await review(customer, o.id, 5);
      const second = await review(performer, o.id, 4);

      expect(second.published).toBe(true);
      const stored = await reviews.find().lean();
      expect(stored.map((r) => r.published)).toEqual([true, true]);
      expect(stored.every((r) => r.published_at instanceof Date)).toBe(true);

      expect(await profile(performer)).toMatchObject({
        rating: 5,
        reviews_count: 1,
      });
      expect(await profile(customer)).toMatchObject({
        customer_rating: 4,
        customer_reviews_count: 1,
      });
      const list = await service.listForUser(performer, 'performer', 1);
      expect(list.reviews.map((r) => r.author?.id)).toEqual([customer]);
    });

    it('через 14 дней publishDue открывает отзыв без ответного', async () => {
      const due = await order();
      const fresh = await order();
      await review(customer, due.id, 4);
      await review(customer, fresh.id, 5);
      // Окно первого заказа закрылось.
      await reviews.updateOne(
        { order_id: due.id },
        { publish_at: new Date(Date.now() - 1000) },
      );

      await service.publishDue();

      const byOrder = new Map(
        (await reviews.find().lean()).map((r) => [r.order_id, r.published]),
      );
      expect(byOrder.get(due.id)).toBe(true);
      expect(byOrder.get(fresh.id)).toBe(false);
      expect(await profile(performer)).toMatchObject({
        rating: 4,
        reviews_count: 1,
      });
    });

    it('publish_at — конец окна: 14 дней от завершения заказа', async () => {
      const completedAt = daysAgo(3);
      const o = await order({ completed_at: completedAt });
      await review(customer, o.id);
      const stored = (await reviews.findOne().lean())!;
      expect(stored.publish_at.getTime()).toBe(
        completedAt.getTime() + 14 * DAY,
      );
    });
  });

  describe('байесовский рейтинг', () => {
    it('считается по формуле (среднее · N + 4,5 · 3) / (N + 3)', () => {
      expect(bayesianScore(0, 0)).toBe(0);
      expect(bayesianScore(5, 1)).toBeCloseTo((5 * 1 + 4.5 * 3) / (1 + 3));
      expect(bayesianScore(3, 10)).toBeCloseTo((3 * 10 + 4.5 * 3) / (10 + 3));
    });

    it('пересчитывается в профиле по опубликованным отзывам', async () => {
      const ratings = [5, 4, 2];
      for (const rating of ratings) {
        const o = await order();
        await review(customer, o.id, rating, LOW_RATING_TEXT);
        await review(performer, o.id, 5);
      }
      // Ещё не открытый отзыв на рейтинг не влияет.
      const hidden = await order();
      await review(customer, hidden.id, 1, LOW_RATING_TEXT);

      const n = ratings.length;
      const average = ratings.reduce((a, b) => a + b, 0) / n;
      const p = await profile(performer);
      expect(p.reviews_count).toBe(n);
      expect(p.rating).toBe(Math.round(average * 10) / 10);
      expect(p.rating_score).toBeCloseTo((average * n + 4.5 * 3) / (n + 3));
      // Оценки как заказчика считаются отдельно.
      expect(await profile(customer)).toMatchObject({
        customer_rating: 5,
        customer_reviews_count: n,
        reviews_count: 0,
      });
    });
  });
});
