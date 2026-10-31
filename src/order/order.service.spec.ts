import {
  BadRequestException,
  ForbiddenException,
  HttpException,
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
import {
  EMAIL_NOT_VERIFIED,
  EmailNotVerifiedException,
} from '../auth/email-not-verified.exception';
import { UserService } from '../user/user.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { isListed, OrderService } from './order.service';
import {
  Order,
  OrderResponse,
  OrderResponseSchema,
  OrderSchema,
  OrderStatus,
} from './schemas/order.schema';

const newId = () => new Types.ObjectId().toString();

const customer = newId();
const performer = newId();
const stranger = newId();
/** Кто не подтвердил почту; по умолчанию подтвердили все. */
const unverified = new Set<string>();

const dto = (fields: Partial<CreateOrderDto> = {}) =>
  ({
    title: 'Лендинг для кофейни',
    price: 15000,
    price_type: 'fixed',
    type: 'one-time',
    for_experts: false,
    deadlines: 'less-week',
    skills: ['Vue'],
    ...fields,
  }) as CreateOrderDto;

describe('OrderService', () => {
  let db: TestDb;
  let moduleRef: TestingModule;
  let service: OrderService;
  let orders: Model<Order>;
  let responses: Model<OrderResponse>;

  beforeAll(async () => {
    db = await startTestDb();
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(db.uri),
        MongooseModule.forFeature([
          { name: Order.name, schema: OrderSchema },
          { name: OrderResponse.name, schema: OrderResponseSchema },
        ]),
      ],
      providers: [
        OrderService,
        {
          provide: UserService,
          useValue: {
            setOrdersCount: jest.fn(),
            getUser: jest.fn(async (id: string) => ({
              id,
              is_verified: !unverified.has(id),
            })),
          },
        },
      ],
    }).compile();
    await db.attach(moduleRef.get(getConnectionToken()));
    service = moduleRef.get(OrderService);
    orders = moduleRef.get(getModelToken(Order.name));
    responses = moduleRef.get(getModelToken(OrderResponse.name));
  }, DB_START_TIMEOUT);

  afterEach(() => {
    unverified.clear();
    return db.clear();
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.stop();
  });

  /** Заказ сразу в нужном состоянии — в обход сервиса. */
  const seed = (fields: Partial<Order> = {}) =>
    orders.create({ ...dto(), user_id: customer, ...fields });

  const inStatus = (status: OrderStatus) => seed({ status, performer });

  const statusOf = async (id: string) =>
    (await orders.findById(id).lean())?.status;

  describe('жизненный цикл', () => {
    it('черновик → active → pending → review → completed', async () => {
      const draft = await service.createOrder(customer, dto({ draft: true }));
      expect(draft).toMatchObject({ draft: true, status: 'active' });

      const published = await service.updateOrder(
        draft.id,
        { draft: false },
        customer,
      );
      expect(published.draft).toBe(false);

      const assigned = await service.assignPerformer(
        draft.id,
        [customer, performer],
        performer,
        customer,
      );
      expect(assigned).toMatchObject({ status: 'pending', performer });

      expect((await service.submitWork(draft.id, performer)).status).toBe(
        'review',
      );

      const completed = await service.reviewWork(draft.id, customer, true);
      expect(completed.status).toBe('completed');
      expect(completed.completed_at).toBeInstanceOf(Date);
      expect(await statusOf(draft.id)).toBe('completed');
    });

    it('исполнитель может принять предложение, отправленное ему заказчиком', async () => {
      const order = await seed();
      // В диалоге участники в любом порядке: [исполнитель, заказчик].
      await service.assignPerformer(
        order.id,
        [performer, customer],
        performer,
        performer,
      );
      expect(await statusOf(order.id)).toBe('pending');
    });

    it('возврат на доработку: review → pending, затем снова на проверку', async () => {
      const order = await inStatus('review');

      const returned = await service.reviewWork(order.id, customer, false);
      expect(returned.status).toBe('pending');
      expect(returned.completed_at).toBeUndefined();

      await service.submitWork(order.id, performer);
      expect(await statusOf(order.id)).toBe('review');
    });

    it('второго исполнителя назначить нельзя', async () => {
      const order = await inStatus('pending');
      const other = newId();
      await expect(
        service.assignPerformer(order.id, [customer, other], other, customer),
      ).rejects.toThrow(BadRequestException);
    });

    it('исполнителя назначает только диалог с автором заказа', async () => {
      const order = await seed();
      await expect(
        service.assignPerformer(
          order.id,
          [stranger, performer],
          performer,
          performer,
        ),
      ).rejects.toThrow(ForbiddenException);
      // Исполнитель не участник диалога.
      await expect(
        service.assignPerformer(
          order.id,
          [customer, stranger],
          performer,
          customer,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(await statusOf(order.id)).toBe('active');
    });

    it('черновику исполнителя назначить нельзя', async () => {
      const order = await seed({ draft: true });
      await expect(
        service.assignPerformer(
          order.id,
          [customer, performer],
          performer,
          customer,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(await statusOf(order.id)).toBe('active');
    });

    it('заказу в архиве исполнителя назначить нельзя', async () => {
      const order = await seed({ is_active: false });
      await expect(
        service.assignPerformer(
          order.id,
          [customer, performer],
          performer,
          customer,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(await statusOf(order.id)).toBe('active');
    });

    it('сдать работу может только исполнитель и только из pending', async () => {
      const order = await inStatus('pending');
      await expect(service.submitWork(order.id, customer)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.submitWork(order.id, stranger)).rejects.toThrow(
        ForbiddenException,
      );

      await service.submitWork(order.id, performer);
      await expect(service.submitWork(order.id, performer)).rejects.toThrow(
        BadRequestException,
      );

      const completed = await inStatus('completed');
      await expect(service.submitWork(completed.id, performer)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('принять или вернуть работу может только заказчик и только на проверке', async () => {
      const order = await inStatus('review');
      for (const accepted of [true, false]) {
        await expect(
          service.reviewWork(order.id, performer, accepted),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          service.reviewWork(order.id, stranger, accepted),
        ).rejects.toThrow(ForbiddenException);
      }
      expect(await statusOf(order.id)).toBe('review');

      const pending = await inStatus('pending');
      await expect(
        service.reviewWork(pending.id, customer, true),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('отмена', () => {
    const HIDE =
      'Вернуть в черновик или отправить в архив можно только заказ, который ищет исполнителя';

    it('автор сам отменяет заказ без исполнителя — опубликованный и из архива', async () => {
      for (const fields of [{}, { is_active: false }]) {
        const order = await seed(fields);
        const cancelled = await service.cancelOrder(order.id, customer);
        expect(cancelled.status).toBe('cancelled');
        expect(await statusOf(order.id)).toBe('cancelled');
      }
    });

    it('сам автор не отменяет черновик, заказ с исполнителем, выполненный и уже отменённый', async () => {
      const cases: [Partial<Order>, string][] = [
        [{ draft: true }, 'Черновик не отменяют — его можно удалить'],
        [
          { status: 'pending', performer },
          'У заказа есть исполнитель — отмену нужно предложить ему в чате',
        ],
        [
          { status: 'review', performer },
          'У заказа есть исполнитель — отмену нужно предложить ему в чате',
        ],
        [
          { status: 'completed', performer },
          'Выполненный заказ отменить нельзя',
        ],
        [{ status: 'cancelled' }, 'Заказ уже отменён'],
      ];
      for (const [fields, message] of cases) {
        const order = await seed(fields);
        await expect(service.cancelOrder(order.id, customer)).rejects.toThrow(
          new BadRequestException(message),
        );
        expect(await statusOf(order.id)).toBe(fields.status ?? 'active');
      }
    });

    it('чужой заказ отменить нельзя — 404', async () => {
      const order = await seed();
      await expect(service.cancelOrder(order.id, stranger)).rejects.toThrow(
        NotFoundException,
      );
      expect(await statusOf(order.id)).toBe('active');
    });

    it('отменённый заказ не в ленте, откликнуться и назначить исполнителя нельзя', async () => {
      const order = await seed({ status: 'cancelled' });
      expect(
        (await service.getOrderList(stranger, { page: 1 })).orders,
      ).toEqual([]);
      await expect(
        service.createOrderResponse(order.id, performer, 'Возьмусь'),
      ).rejects.toThrow(new BadRequestException('Заказ не принимает отклики'));
      // Старый отклик в чате принимают после отмены.
      await expect(
        service.assignPerformer(
          order.id,
          [performer, customer],
          performer,
          customer,
        ),
      ).rejects.toThrow(new BadRequestException('Заказ отменён'));
      expect(await statusOf(order.id)).toBe('cancelled');
    });

    it('по согласию: заказ в работе и на проверке → cancelled, участники в любом порядке', async () => {
      const pending = await inStatus('pending');
      const review = await inStatus('review');
      expect(
        (await service.cancelDeal(pending.id, [customer, performer])).status,
      ).toBe('cancelled');
      expect(
        (await service.cancelDeal(review.id, [performer, customer])).status,
      ).toBe('cancelled');
      expect(await statusOf(review.id)).toBe('cancelled');
    });

    it('по согласию: не в работе или не те участники — отказ, статус прежний', async () => {
      const refused = new BadRequestException(
        'Заказ уже не в работе — отменить его нельзя',
      );
      for (const status of ['active', 'completed', 'cancelled'] as const) {
        const order = await seed({ status, performer });
        await expect(
          service.cancelDeal(order.id, [customer, performer]),
        ).rejects.toThrow(refused);
        expect(await statusOf(order.id)).toBe(status);
      }
      const order = await inStatus('pending');
      await expect(
        service.cancelDeal(order.id, [customer, stranger]),
      ).rejects.toThrow(refused);
      expect(await statusOf(order.id)).toBe('pending');
    });

    it('предложить отмену могут только участники и только заказа в работе или на проверке', async () => {
      const order = await inStatus('review');
      expect((await service.getDealToCancel(order.id, performer)).id).toBe(
        order.id,
      );
      expect((await service.getDealToCancel(order.id, customer)).id).toBe(
        order.id,
      );
      await expect(service.getDealToCancel(order.id, stranger)).rejects.toThrow(
        ForbiddenException,
      );

      for (const status of ['active', 'completed', 'cancelled'] as const) {
        const other = await seed({ status, performer });
        await expect(
          service.getDealToCancel(other.id, customer),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('заказ с исполнителем и отменённый не уходят в черновик и в архив, правка текста проходит', async () => {
      for (const status of [
        'pending',
        'review',
        'completed',
        'cancelled',
      ] as const) {
        const order = await seed({ status, performer });
        await expect(
          service.updateOrder(order.id, { draft: true }, customer),
        ).rejects.toThrow(new BadRequestException(HIDE));
        await expect(
          service.updateOrder(order.id, { is_active: false }, customer),
        ).rejects.toThrow(new BadRequestException(HIDE));
        await expect(service.archiveOrder(order.id, customer)).rejects.toThrow(
          new BadRequestException(HIDE),
        );
        expect(await orders.findById(order.id).lean()).toMatchObject({
          status,
          draft: false,
          is_active: true,
        });

        await service.updateOrder(order.id, { title: 'Пекарня' }, customer);
      }
    });
  });

  describe('одновременные действия: проходит одно, у заказа один конечный статус', () => {
    // Гонка зависит от того, в каком порядке база выполнит запросы, —
    // повторяем на нескольких заказах.
    const ROUNDS = 10;

    /** Запускает два действия разом; ровно одно должно пройти. */
    const race = async (first: Promise<unknown>, second: Promise<unknown>) => {
      const [a, b] = await Promise.allSettled([first, second]);
      expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected']);
      return a.status === 'fulfilled' ? 'first' : 'second';
    };

    it('«принять работу» и «принять отмену»', async () => {
      for (let i = 0; i < ROUNDS; i++) {
        const order = await inStatus('review');
        const winner = await race(
          service.reviewWork(order.id, customer, true),
          service.cancelDeal(order.id, [performer, customer]),
        );
        const saved = await orders.findById(order.id).lean();
        expect(saved?.status).toBe(
          winner === 'first' ? 'completed' : 'cancelled',
        );
        expect(!!saved?.completed_at).toBe(winner === 'first');
      }
    });

    it('«сдать работу» и «принять отмену»: отмена не теряется', async () => {
      for (let i = 0; i < ROUNDS; i++) {
        const order = await inStatus('pending');
        const [submit, cancel] = await Promise.allSettled([
          service.submitWork(order.id, performer),
          service.cancelDeal(order.id, [customer, performer]),
        ]);
        // Отменить можно и из pending, и из review: если работу успели
        // сдать раньше, проходят оба шага подряд. Но заказ отменён в любом
        // случае — сдача не может вернуть отменённый заказ на проверку.
        expect(cancel.status).toBe('fulfilled');
        expect(await statusOf(order.id)).toBe('cancelled');
        expect(['fulfilled', 'rejected']).toContain(submit.status);
      }
    });

    it('исполнитель принимает предложение, а автор отменяет заказ', async () => {
      for (let i = 0; i < ROUNDS; i++) {
        const order = await seed();
        const winner = await race(
          service.assignPerformer(
            order.id,
            [customer, performer],
            performer,
            performer,
          ),
          service.cancelOrder(order.id, customer),
        );
        const saved = await orders.findById(order.id).lean();
        expect(saved?.status).toBe(
          winner === 'first' ? 'pending' : 'cancelled',
        );
        expect(saved?.performer).toBe(
          winner === 'first' ? performer : undefined,
        );
      }
    });

    it('два исполнителя принимают предложения одного заказа', async () => {
      const other = newId();
      for (let i = 0; i < ROUNDS; i++) {
        const order = await seed();
        const winner = await race(
          service.assignPerformer(
            order.id,
            [customer, performer],
            performer,
            performer,
          ),
          service.assignPerformer(order.id, [customer, other], other, other),
        );
        expect((await orders.findById(order.id).lean())?.performer).toBe(
          winner === 'first' ? performer : other,
        );
      }
    });

    it('«в архив» или «в черновик» и «принять отклик»', async () => {
      const hide = {
        archive: (id: string) => service.archiveOrder(id, customer),
        draft: (id: string) =>
          service.updateOrder(id, { draft: true }, customer),
      };
      for (const [action, run] of Object.entries(hide)) {
        for (let i = 0; i < ROUNDS; i++) {
          const order = await seed();
          const winner = await race(
            run(order.id),
            service.assignPerformer(
              order.id,
              [performer, customer],
              performer,
              customer,
            ),
          );
          const saved = await orders.findById(order.id).lean();
          if (winner === 'first') {
            expect(saved).toMatchObject({
              status: 'active',
              ...(action === 'archive'
                ? { is_active: false }
                : { draft: true }),
            });
            expect(saved?.performer).toBeUndefined();
          } else {
            expect(saved).toMatchObject({
              status: 'pending',
              performer,
              is_active: true,
              draft: false,
            });
          }
        }
      }
    });
  });

  describe('подтверждение почты', () => {
    const PUBLISH =
      'Подтвердите почту, чтобы опубликовать заказ. Черновик можно сохранить и без этого';

    const errorOf = (promise: Promise<unknown>) =>
      promise.then(
        () => {
          throw new Error('Ожидалась ошибка, а действие прошло');
        },
        (error: unknown) => error,
      );

    /** 403 с кодом, по которому фронт откроет окно подтверждения. */
    const expectNotVerified = async (
      promise: Promise<unknown>,
      message: string,
    ) => {
      const error = await errorOf(promise);
      expect(error).toBeInstanceOf(EmailNotVerifiedException);
      expect((error as HttpException).getResponse()).toEqual({
        statusCode: 403,
        error: 'Forbidden',
        code: EMAIL_NOT_VERIFIED,
        message,
      });
    };

    /** 400 без кода: почту не подтвердила другая сторона. */
    const expectOtherSide = async (
      promise: Promise<unknown>,
      message: string,
    ) => {
      const error = await errorOf(promise);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as HttpException).message).toBe(message);
    };

    it('isListed: в ленте — опубликованный заказ в статусе active', () => {
      const listed = {
        status: 'active',
        draft: false,
        is_active: true,
      } as const;
      expect(isListed(listed)).toBe(true);
      expect(isListed({ ...listed, draft: true })).toBe(false);
      expect(isListed({ ...listed, is_active: false })).toBe(false);
      expect(isListed({ ...listed, status: 'pending' })).toBe(false);
    });

    it('черновик сохраняется без подтверждения, опубликовать сразу нельзя', async () => {
      unverified.add(customer);
      const draft = await service.createOrder(customer, dto({ draft: true }));
      expect(draft.draft).toBe(true);

      await expectNotVerified(service.createOrder(customer, dto()), PUBLISH);
      expect(await orders.countDocuments()).toBe(1);
    });

    it('публикация — и из черновика, и из архива; правка без публикации проходит', async () => {
      unverified.add(customer);
      const draft = await seed({ draft: true });
      const archived = await seed({ is_active: false });

      await expectNotVerified(
        service.updateOrder(draft.id, { draft: false }, customer),
        PUBLISH,
      );
      await expectNotVerified(
        service.updateOrder(archived.id, { is_active: true }, customer),
        PUBLISH,
      );
      expect(await orders.findById(draft.id).lean()).toMatchObject({
        draft: true,
      });
      expect(await orders.findById(archived.id).lean()).toMatchObject({
        is_active: false,
      });

      await service.updateOrder(draft.id, { title: 'Пекарня' }, customer);
      await service.updateOrder(archived.id, { title: 'Пекарня' }, customer);
    });

    it('заказ, опубликованный до подтверждения, можно править и отправить в архив', async () => {
      unverified.add(customer);
      const order = await seed();
      await service.updateOrder(
        order.id,
        { title: 'Пекарня', draft: false, is_active: true },
        customer,
      );
      await service.archiveOrder(order.id, customer);
      expect(await orders.findById(order.id).lean()).toMatchObject({
        title: 'Пекарня',
        is_active: false,
      });
    });

    it('откликнуться нельзя', async () => {
      unverified.add(performer);
      const order = await seed();
      await expectNotVerified(
        service.createOrderResponse(order.id, performer, 'Возьмусь'),
        'Подтвердите почту, чтобы откликнуться на заказ',
      );
      expect(await responses.countDocuments()).toBe(0);
      expect((await orders.findById(order.id).lean())?.response_count).toBe(0);
    });

    it('назначение: не подтвердил тот, кто принимает, — 403 с кодом', async () => {
      const order = await seed();

      unverified.add(performer);
      await expectNotVerified(
        service.assignPerformer(
          order.id,
          [customer, performer],
          performer,
          performer,
        ),
        'Подтвердите почту, чтобы взять заказ',
      );

      unverified.clear();
      unverified.add(customer);
      await expectNotVerified(
        service.assignPerformer(
          order.id,
          [performer, customer],
          performer,
          customer,
        ),
        'Подтвердите почту, чтобы выбрать исполнителя',
      );
      expect(await statusOf(order.id)).toBe('active');
    });

    it('назначение: не подтвердила другая сторона — 400 и кто именно', async () => {
      const order = await seed();

      // Старый отклик неподтверждённого исполнителя принимает заказчик.
      unverified.add(performer);
      await expectOtherSide(
        service.assignPerformer(
          order.id,
          [performer, customer],
          performer,
          customer,
        ),
        'Исполнитель ещё не подтвердил почту',
      );

      // Заказ опубликован до подтверждения, исполнитель принимает предложение.
      unverified.clear();
      unverified.add(customer);
      await expectOtherSide(
        service.assignPerformer(
          order.id,
          [customer, performer],
          performer,
          performer,
        ),
        'Заказчик ещё не подтвердил почту',
      );
      expect(await statusOf(order.id)).toBe('active');
    });

    it('не подтвердили оба — просим подтвердить того, кто принимает', async () => {
      const order = await seed();
      unverified.add(customer);
      unverified.add(performer);
      await expectNotVerified(
        service.assignPerformer(
          order.id,
          [customer, performer],
          performer,
          performer,
        ),
        'Подтвердите почту, чтобы взять заказ',
      );
    });
  });

  describe('удаление', () => {
    it('заказ, у которого был исполнитель, удалить нельзя — и после отмены', async () => {
      for (const status of [
        'pending',
        'review',
        'completed',
        'cancelled',
      ] as const) {
        const order = await inStatus(status);
        await expect(service.deleteOrder(order.id, customer)).rejects.toThrow(
          new BadRequestException(
            'Заказ, у которого был исполнитель, удалить нельзя: он остаётся в истории второй стороны',
          ),
        );
        expect(await orders.exists({ _id: order.id })).not.toBeNull();
      }
    });

    it('отменённый заказ без исполнителя удаляется', async () => {
      const order = await seed({ status: 'cancelled' });
      await service.deleteOrder(order.id, customer);
      expect(await orders.exists({ _id: order.id })).toBeNull();
    });

    it('заказ без исполнителя удаляется вместе с откликами', async () => {
      const order = await seed();
      await service.createOrderResponse(order.id, performer, 'Сделаю за день');

      await service.deleteOrder(order.id, customer);
      expect(await orders.exists({ _id: order.id })).toBeNull();
      expect(await responses.countDocuments({ order_id: order.id })).toBe(0);
    });

    it('чужой заказ удалить нельзя', async () => {
      const order = await seed();
      await expect(service.deleteOrder(order.id, stranger)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('черновик не виден чужим', () => {
    it('по id черновик открывает только автор', async () => {
      const draft = await seed({ draft: true });
      await expect(service.getOrder(draft.id, stranger)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getOrder(draft.id, undefined)).rejects.toThrow(
        NotFoundException,
      );
      expect((await service.getOrder(draft.id, customer)).id).toBe(draft.id);
    });

    it('черновика нет в ленте и в заказах профиля', async () => {
      const draft = await seed({ draft: true });
      const published = await seed();
      const ids = (list: { id?: string }[]) => list.map((o) => o.id);

      const feed = await service.getOrderList(stranger, { page: 1 });
      expect(ids(feed.orders)).toEqual([published.id]);
      expect(ids(await service.getUserOrders(customer, stranger))).toEqual([
        published.id,
      ]);
      expect(ids(await service.getUserOrders(customer, customer))).toEqual([
        published.id,
      ]);
      expect(() => service.getUserDrafts(customer, stranger)).toThrow(
        ForbiddenException,
      );
      expect(ids(await service.getUserDrafts(customer, customer))).toEqual([
        draft.id,
      ]);
    });

    it('на черновик нельзя откликнуться', async () => {
      const draft = await seed({ draft: true });
      await expect(
        service.createOrderResponse(draft.id, performer, 'Возьмусь'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('отметка о просмотре', () => {
    const viewers = async (id: string) =>
      (await orders.findById(id).lean())?.viewed_by;

    it('чужой черновик — 404, просмотр не записывается', async () => {
      const draft = await seed({ draft: true });
      await expect(service.viewOrder(stranger, draft.id)).rejects.toThrow(
        NotFoundException,
      );
      expect(await viewers(draft.id)).toEqual([]);
    });

    it('просмотр записывается, а в ответе нет ни заказа, ни адреса', async () => {
      const order = await seed({
        work_format: 'onsite',
        city: 'Казань',
        address: 'ул. Баумана, 12',
      });
      expect(await service.viewOrder(stranger, order.id)).toBeUndefined();
      expect(await viewers(order.id)).toEqual([stranger]);
    });
  });

  describe('адрес видят только заказчик и исполнитель (forViewer)', () => {
    const onsite = (fields: Partial<Order> = {}) =>
      seed({
        work_format: 'onsite',
        city: 'Казань',
        address: 'ул. Баумана, 12',
        ...fields,
      });

    it('в карточке заказа', async () => {
      const order = await onsite({ status: 'pending', performer });
      const viewedBy = (viewer?: string) =>
        service.getOrderForViewer(order.id, viewer);

      for (const viewer of [stranger, undefined]) {
        const json = await viewedBy(viewer);
        expect(json.address).toBeUndefined();
        expect(json.city).toBe('Казань');
      }
      expect((await viewedBy(customer)).address).toBe('ул. Баумана, 12');
      expect((await viewedBy(performer)).address).toBe('ул. Баумана, 12');
    });

    it('в ленте и в заказах профиля', async () => {
      await onsite();
      const feed = await service.getOrderList(stranger, { page: 1 });
      expect(feed.orders).toHaveLength(1);
      expect(feed.orders[0].address).toBeUndefined();

      const [own] = await service.getUserOrders(customer, customer);
      expect(own.address).toBe('ул. Баумана, 12');
      const [foreign] = await service.getUserOrders(customer, stranger);
      expect(foreign.address).toBeUndefined();
    });
  });
});
