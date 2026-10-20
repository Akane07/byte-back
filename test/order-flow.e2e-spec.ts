import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { Socket } from 'socket.io-client';
import * as request from 'supertest';
import { AppModule } from '../src/app/app.module';
import { CorsIoAdapter } from '../src/common/socket-io.adapter';
import { MailService } from '../src/mail/mail.service';
import { DB_START_TIMEOUT, startTestDb, TestDb } from './mongo';
import { chatClient, connectAs, EVENT_TIMEOUT, waitFor } from './socket';

const PASSWORD = 'Secret123';
const SIX_DIGITS = /^\d{6}$/;
const ORDER = {
  title: 'Лендинг для кофейни',
  price: 15000,
  price_type: 'fixed',
  type: 'one-time',
  for_experts: false,
  deadlines: 'less-week',
  skills: ['Vue'],
};

interface Member {
  id: string;
  email: string;
  token: string;
}

type Json = Record<string, any>;

describe('e2e: заказ от регистрации до рейтинга', () => {
  let db: TestDb;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let url: string;
  const sockets: Socket[] = [];
  // Настоящих писем тесты не отправляют: коды берутся из заглушки.
  const mail = {
    sendVerificationEmail: jest.fn(),
    sendRestoreEmail: jest.fn(),
  };

  beforeAll(async () => {
    db = await startTestDb();
    // Переменные процесса важнее .env (@nestjs/config их не перезаписывает).
    process.env.MONGO_URI = db.uri;
    process.env.JWT_SECRET = 'e2e-secret';

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();
    // До init: при старте модули пишут в базу (категории, публикация отзывов).
    await db.attach(moduleRef.get(getConnectionToken()));

    app = moduleRef.createNestApplication();
    // Как в main.ts.
    app.setGlobalPrefix('api/v1');
    app.useWebSocketAdapter(new CorsIoAdapter(app, ['http://localhost:3000']));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
  }, DB_START_TIMEOUT);

  afterAll(async () => {
    sockets.forEach((socket) => socket.close());
    await app?.close();
    await db?.stop();
  });

  const api = () => request(app.getHttpServer());
  const bearer = (member: Member) => ({
    Authorization: `Bearer ${member.token}`,
  });

  let seq = 0;
  /** Регистрация и подтверждение почты кодом из заглушки письма. */
  const signUp = async (name: string): Promise<Member> => {
    const email = `${name}${++seq}@e2e.local`;
    await api()
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, name })
      .expect(200);
    const [, code] = mail.sendVerificationEmail.mock.calls.find(
      ([to]) => to === email,
    )!;
    expect(code).toMatch(SIX_DIGITS);

    const { body } = await api()
      .post('/api/v1/auth/verify')
      .send({ email, token: code })
      .expect(200);
    const token: string = body.access_token;
    const me = await api()
      .get('/api/v1/user/me')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    expect(me.body.is_verified).toBe(true);
    return { id: me.body.id, email, token };
  };

  const connect = async (member: Member) => {
    const socket = await connectAs(url, member.token, member.id);
    sockets.push(socket);
    return socket;
  };

  const createOrder = async (customer: Member) => {
    const { body } = await api()
      .post('/api/v1/order')
      .set(bearer(customer))
      .send(ORDER)
      .expect(201);
    return body.id as string;
  };

  const respond = async (performer: Member, orderId: string) => {
    const { body } = await api()
      .post(`/api/v1/order/${orderId}/response`)
      .set(bearer(performer))
      .send({ description: 'Сделаю за два дня' })
      .expect(201);
    return body.id as string;
  };

  /** Исполнитель отправляет отклик в чат; возвращает id карточки отклика. */
  const postResponse = async (
    performer: Socket,
    customer: Socket,
    orderId: string,
    responseId: string,
  ) => {
    const card = waitFor<Json>(
      customer,
      'receiveMessage',
      (m) => m.status === 'response',
    );
    const message = await performer
      .timeout(EVENT_TIMEOUT)
      .emitWithAck('postResponse', { orderId, responseId });
    expect((await card).id).toBe(message.id);
    return message.id as string;
  };

  /** Заказчик принимает карточку; заказ приходит обоим в orderUpdated. */
  const accept = (
    customer: Socket,
    performer: Socket,
    messageId: string,
    orderId: string,
  ) => {
    const updates = Promise.all(
      [customer, performer].map((s) =>
        waitFor<Json>(s, 'orderUpdated', (o) => o.id === orderId),
      ),
    );
    customer.emit('acceptMessage', { messageId });
    return updates;
  };

  /** Исполнитель сдаёт работу; возвращает id карточки «Работа сдана». */
  const deliver = async (
    customer: Socket,
    performer: Socket,
    orderId: string,
  ) => {
    const card = waitFor<Json>(
      customer,
      'receiveMessage',
      (m) => m.is_delivery && m.orderId === orderId,
    );
    const ack = await performer
      .timeout(EVENT_TIMEOUT)
      .emitWithAck('finishOrder', {
        orderId,
        text: 'Готово, ссылка в описании',
      });
    expect(ack).toEqual({ orderId, status: 'review' });
    return (await card).id as string;
  };

  /** Ошибку обработчика сокет получает событием exception. */
  const refusal = (socket: Socket, event: string, payload: Json) => {
    const exception = waitFor<Json>(socket, 'exception');
    socket.emit(event, payload);
    return exception;
  };

  const orderOf = async (orderId: string, viewer: Member) =>
    (
      await api()
        .get(`/api/v1/order/${orderId}`)
        .set(bearer(viewer))
        .expect(200)
    ).body as Json;

  const messageOf = async (
    viewer: Member,
    partnerId: string,
    messageId: string,
  ) => {
    const { body } = await api()
      .get('/api/v1/chat')
      .query({ user: partnerId })
      .set(bearer(viewer))
      .expect(200);
    return (body.messages as Json[]).find((m) => m.id === messageId);
  };

  const profile = async (member: Member) =>
    (await api().get(`/api/v1/user/${member.id}`).expect(200)).body as Json;

  it('регистрация → заказ → отклик → назначение → сдача → приёмка → отзывы → рейтинг', async () => {
    const customer = await signUp('customer');
    const performer = await signUp('performer');

    const orderId = await createOrder(customer);
    const responseId = await respond(performer, orderId);
    const [c, p] = await Promise.all([connect(customer), connect(performer)]);

    // Отклик в чате, заказчик принимает — исполнитель назначен.
    const responseCard = await postResponse(p, c, orderId, responseId);
    for (const order of await accept(c, p, responseCard, orderId)) {
      expect(order).toMatchObject({
        status: 'pending',
        performer: performer.id,
      });
    }

    // Сдача работы и приёмка — заказ завершён.
    const delivery = await deliver(c, p, orderId);
    for (const order of await accept(c, p, delivery, orderId)) {
      expect(order.status).toBe('completed');
    }
    const completed = await orderOf(orderId, customer);
    expect(completed).toMatchObject({
      status: 'completed',
      performer: performer.id,
    });
    expect(completed.completed_at).toBeDefined();
    expect(await profile(performer)).toMatchObject({
      rating: 0,
      reviews_count: 0,
    });

    // Отзывы: первый скрыт, второй открывает оба.
    const first = await api()
      .post('/api/v1/reviews')
      .set(bearer(customer))
      .send({ orderId, rating: 5, text: 'Сделано быстро и аккуратно' })
      .expect(201);
    expect(first.body.published).toBe(false);
    expect((await profile(performer)).reviews_count).toBe(0);

    const second = await api()
      .post('/api/v1/reviews')
      .set(bearer(performer))
      .send({ orderId, rating: 4 })
      .expect(201);
    expect(second.body.published).toBe(true);

    // Рейтинг в профилях обновился.
    const rated = await profile(performer);
    expect(rated).toMatchObject({ rating: 5, reviews_count: 1 });
    expect(rated.rating_score).toBeCloseTo((5 * 1 + 4.5 * 3) / (1 + 3));
    expect(await profile(customer)).toMatchObject({
      customer_rating: 4,
      customer_reviews_count: 1,
    });
    const { body: list } = await api()
      .get(`/api/v1/reviews/user/${performer.id}`)
      .expect(200);
    expect(list.reviews).toHaveLength(1);
  });

  it('подключение без JWT или с чужим токеном отклоняется', async () => {
    for (const token of [undefined, 'not-a-jwt']) {
      const socket = chatClient(url, token);
      sockets.push(socket);
      const exception = waitFor<Json>(socket, 'exception');
      const disconnect = waitFor<string>(socket, 'disconnect');
      expect(await exception).toMatchObject({
        message: 'Требуется авторизация',
      });
      expect(await disconnect).toBe('io server disconnect');
    }
  });

  it('посторонний не может принять работу и сдать чужой заказ', async () => {
    const customer = await signUp('customer');
    const performer = await signUp('performer');
    const stranger = await signUp('stranger');
    const orderId = await createOrder(customer);
    const responseId = await respond(performer, orderId);
    const [c, p, s] = await Promise.all(
      [customer, performer, stranger].map(connect),
    );
    await accept(c, p, await postResponse(p, c, orderId, responseId), orderId);
    const delivery = await deliver(c, p, orderId);

    expect(
      await refusal(s, 'acceptMessage', { messageId: delivery }),
    ).toMatchObject({ message: 'Ответить может только получатель' });
    expect(await refusal(s, 'finishOrder', { orderId })).toMatchObject({
      message: 'Сдать работу может только исполнитель',
    });

    expect((await orderOf(orderId, customer)).status).toBe('review');
    const card = await messageOf(customer, performer.id, delivery);
    expect(card?.status).toBeUndefined();
  });

  it('старый отклик на заказ в архиве принять нельзя: сообщение и заказ не меняются', async () => {
    const customer = await signUp('customer');
    const performer = await signUp('performer');
    const orderId = await createOrder(customer);
    const responseId = await respond(performer, orderId);
    const [c, p] = await Promise.all([connect(customer), connect(performer)]);
    const card = await postResponse(p, c, orderId, responseId);

    await api()
      .patch(`/api/v1/order/${orderId}/archive`)
      .set(bearer(customer))
      .expect(200);

    expect(
      await refusal(c, 'acceptMessage', { messageId: card }),
    ).toMatchObject({ message: 'Заказ снят с публикации' });
    const order = await orderOf(orderId, customer);
    expect(order).toMatchObject({ status: 'active', is_active: false });
    expect(order.performer).toBeUndefined();
    expect((await messageOf(customer, performer.id, card))?.status).toBe(
      'response',
    );
  });
});
