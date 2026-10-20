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
import { UserService } from '../user/user.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderService } from './order.service';
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
        { provide: UserService, useValue: { setOrdersCount: jest.fn() } },
      ],
    }).compile();
    await db.attach(moduleRef.get(getConnectionToken()));
    service = moduleRef.get(OrderService);
    orders = moduleRef.get(getModelToken(Order.name));
    responses = moduleRef.get(getModelToken(OrderResponse.name));
  }, DB_START_TIMEOUT);

  afterEach(() => db.clear());

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
      await service.assignPerformer(order.id, [performer, customer], performer);
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
        service.assignPerformer(order.id, [customer, other], other),
      ).rejects.toThrow(BadRequestException);
    });

    it('исполнителя назначает только диалог с автором заказа', async () => {
      const order = await seed();
      await expect(
        service.assignPerformer(order.id, [stranger, performer], performer),
      ).rejects.toThrow(ForbiddenException);
      // Исполнитель не участник диалога.
      await expect(
        service.assignPerformer(order.id, [customer, stranger], performer),
      ).rejects.toThrow(ForbiddenException);
      expect(await statusOf(order.id)).toBe('active');
    });

    it('черновику исполнителя назначить нельзя', async () => {
      const order = await seed({ draft: true });
      await expect(
        service.assignPerformer(order.id, [customer, performer], performer),
      ).rejects.toThrow(BadRequestException);
      expect(await statusOf(order.id)).toBe('active');
    });

    it('заказу в архиве исполнителя назначить нельзя', async () => {
      const order = await seed({ is_active: false });
      await expect(
        service.assignPerformer(order.id, [customer, performer], performer),
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

  describe('удаление', () => {
    it('заказ с исполнителем удалить нельзя', async () => {
      const order = await inStatus('pending');
      await expect(service.deleteOrder(order.id, customer)).rejects.toThrow(
        BadRequestException,
      );
      expect(await orders.exists({ _id: order.id })).not.toBeNull();
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
