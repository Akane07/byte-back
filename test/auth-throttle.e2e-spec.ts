import { ValidationPipe } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app/app.module';
import { TRUST_PROXY } from '../src/auth/auth.throttle';
import { MailService } from '../src/mail/mail.service';
import { DB_START_TIMEOUT, startTestDb, TestDb } from './mongo';

const PASSWORD = 'Secret123';
/** Почта, которой нет в базе: запросы доходят до сервиса и получают обычный отказ. */
const GHOST = 'nobody@e2e.local';
const TOO_MANY = /^Слишком много попыток, попробуйте через \d+ с$/;

/** Маршрут, лимит по ТЗ, ответ до исчерпания лимита, тело i-го запроса. */
type Case = [string, number, number, (i: number) => object];

describe('e2e: лимиты запросов к /auth с одного IP', () => {
  let db: TestDb;
  let app: NestExpressApplication;

  beforeAll(async () => {
    db = await startTestDb();
    process.env.MONGO_URI = db.uri;
    process.env.JWT_SECRET = 'e2e-secret';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        sendVerificationEmail: jest.fn(),
        sendRestoreEmail: jest.fn(),
      })
      .compile();
    await db.attach(moduleRef.get(getConnectionToken()));

    app = moduleRef.createNestApplication<NestExpressApplication>();
    // Как в main.ts.
    app.set('trust proxy', TRUST_PROXY);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.listen(0, '127.0.0.1');
  }, DB_START_TIMEOUT);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  /** Без ip запрос идёт напрямую с 127.0.0.1, с ip — как через прокси. */
  const post = (route: string, body: object, ip?: string) => {
    const req = request(app.getHttpServer())
      .post(`/api/v1/auth/${route}`)
      .send(body);
    return ip ? req.set('X-Forwarded-For', ip) : req;
  };

  it.each<Case>([
    ['login', 5, 400, () => ({ email: GHOST, password: PASSWORD })],
    [
      'register',
      3,
      200,
      (i) => ({ email: `new${i}@e2e.local`, password: PASSWORD }),
    ],
    ['verify', 5, 400, () => ({ email: GHOST, token: '000000' })],
    // Без токена: лимит проверяется раньше JWT, поэтому до него — 401.
    ['verify/resend', 3, 401, () => ({})],
    ['recovery', 3, 200, () => ({ email: GHOST })],
    ['recovery/verify', 5, 400, () => ({ email: GHOST, code: '000000' })],
    [
      'recovery/reset',
      5,
      400,
      () => ({ email: GHOST, code: '000000', password: PASSWORD }),
    ],
  ])(
    '/auth/%s: лимит %i в минуту, следующий запрос — 429',
    async (route, limit, status, body) => {
      for (let i = 0; i < limit; i++) {
        await post(route, body(i)).expect(status);
      }
      const res = await post(route, body(limit)).expect(429);
      expect(res.body.message).toMatch(TOO_MANY);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    },
  );

  it('у каждого IP свой счётчик, подменить IP через X-Forwarded-For нельзя', async () => {
    const body = { email: GHOST, password: PASSWORD };
    // Прокси дописывает адрес клиента в конец цепочки, всё левее прислал сам
    // клиент: новый адрес слева каждый раз не даёт новый счётчик.
    for (let i = 1; i <= 5; i++) {
      await post('login', body, `10.0.0.${i}, 203.0.113.5`).expect(400);
    }
    const res = await post('login', body, '10.0.0.6, 203.0.113.5').expect(429);
    expect(res.body.message).toMatch(TOO_MANY);

    // Другой посетитель за тем же прокси.
    await post('login', body, '203.0.113.6').expect(400);
  });

  it('GET /user/me, который фронт запрашивает при переходах, не ограничен: 20 подряд без 429', async () => {
    const { body } = await post(
      'register',
      { email: 'nav@e2e.local', password: PASSWORD },
      '198.51.100.7',
    ).expect(200);

    for (let i = 0; i < 20; i++) {
      await request(app.getHttpServer())
        .get('/api/v1/user/me')
        .set('Authorization', `Bearer ${body.access_token}`)
        .expect(200);
    }
  });
});
