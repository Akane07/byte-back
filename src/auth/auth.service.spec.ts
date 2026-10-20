import { BadRequestException, HttpException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import {
  getConnectionToken,
  getModelToken,
  MongooseModule,
} from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { pbkdf2Sync } from 'crypto';
import { Model } from 'mongoose';
import { DB_START_TIMEOUT, startTestDb, TestDb } from '../../test/mongo';
import { MailService } from '../mail/mail.service';
import { AuthService } from './auth.service';
import { User, UserSchema } from './schemas/user.schema';

const EMAIL = 'anna@test.local';
const PASSWORD = 'Secret123';
const NEW_PASSWORD = 'NewSecret123';
const SECRETS =
  '+passwordHash +salt +hash_iterations +verification_token +code_sent_at ' +
  '+verify_attempts +verify_locked_until ' +
  '+reset_code +reset_expires +reset_attempts +reset_locked_until';
const SIX_DIGITS = /^\d{6}$/;
/** Коды генерируются от 100000, такой не выпадет никогда. */
const WRONG = '000000';
const LOCKED = 'Слишком много неверных попыток';
const secondsAgo = (s: number) => new Date(Date.now() - s * 1000);

describe('AuthService', () => {
  let db: TestDb;
  let moduleRef: TestingModule;
  let service: AuthService;
  let jwt: JwtService;
  let users: Model<User>;
  const mail = {
    sendVerificationEmail: jest.fn(),
    sendRestoreEmail: jest.fn(),
  };

  beforeAll(async () => {
    db = await startTestDb();
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(db.uri),
        MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
        JwtModule.register({ secret: 'test-secret' }),
      ],
      providers: [AuthService, { provide: MailService, useValue: mail }],
    }).compile();
    await db.attach(moduleRef.get(getConnectionToken()));
    service = moduleRef.get(AuthService);
    jwt = moduleRef.get(JwtService);
    users = moduleRef.get(getModelToken(User.name));
  }, DB_START_TIMEOUT);

  afterEach(async () => {
    jest.clearAllMocks();
    await db.clear();
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.stop();
  });

  const stored = async (email = EMAIL) =>
    (await users.findOne({ email }).select(SECRETS).lean())!;

  const userIdOf = (token: string) =>
    jwt.verify<{ userId: string }>(token).userId;

  /** Последний код из письма, отправленного заглушкой почты. */
  const lastCode = (send: jest.Mock) =>
    send.mock.calls[send.mock.calls.length - 1]?.[1] as string;

  const register = (email = EMAIL, password = PASSWORD) =>
    service.registerUser({ email, password });

  /** Сдвинуть время последнего письма: пауза между кодами уже прошла. */
  const cooldownPassed = (email = EMAIL) =>
    users.updateOne({ email }, { code_sent_at: secondsAgo(61) });

  /** Пользователь, которому уже можно отправить код восстановления. */
  const requestReset = async () => {
    await register();
    await cooldownPassed();
    await service.requestPasswordReset(EMAIL);
    return lastCode(mail.sendRestoreEmail);
  };

  const field = async (name: string) =>
    ((await stored()) as unknown as Record<string, unknown>)[name];

  const rejection = (promise: Promise<unknown>) =>
    promise.then(
      () => {
        throw new Error('Ожидался отказ');
      },
      (error: unknown) => error as HttpException,
    );

  describe('пароль', () => {
    it('хранится только хеш с солью, 210 000 итераций PBKDF2', async () => {
      await register();
      await register('boris@test.local');
      const [a, b] = [await stored(), await stored('boris@test.local')];

      expect(a.passwordHash).toMatch(/^[0-9a-f]{128}$/);
      expect(a.passwordHash).not.toContain(PASSWORD);
      expect(a.salt).toMatch(/^[0-9a-f]{32}$/);
      expect(a.hash_iterations).toBe(210_000);
      // Одинаковый пароль — разная соль, разный хеш.
      expect(a.salt).not.toBe(b.salt);
      expect(a.passwordHash).not.toBe(b.passwordHash);
      // Служебные поля не выдаются без явного select.
      const plain = (await users.findOne({ email: EMAIL }).lean())!;
      expect(plain).not.toHaveProperty('passwordHash');
      expect(plain).not.toHaveProperty('salt');
    });

    it('вход: верный пароль — токен, неверный или чужая почта — одна и та же ошибка', async () => {
      const { access_token } = await register();
      const { _id } = await stored();

      const login = await service.loginUser(EMAIL, PASSWORD);
      expect(userIdOf(login.access_token)).toBe(String(_id));
      expect(userIdOf(access_token)).toBe(String(_id));

      for (const [email, password] of [
        [EMAIL, 'Wrong123'],
        ['nobody@test.local', PASSWORD],
      ]) {
        await expect(service.loginUser(email, password)).rejects.toThrow(
          'Неверная почта или пароль',
        );
      }
    });

    it('пароль в старом формате (1000 итераций) перехешируется при входе', async () => {
      const salt = 'a'.repeat(32);
      await users.create({
        name: 'old',
        email: EMAIL,
        salt,
        // До рефакторинга поля hash_iterations не было.
        passwordHash: pbkdf2Sync(PASSWORD, salt, 1000, 64, 'sha512').toString(
          'hex',
        ),
      });

      await expect(service.loginUser(EMAIL, 'Wrong123')).rejects.toThrow(
        BadRequestException,
      );
      expect((await stored()).hash_iterations).toBeUndefined();

      await service.loginUser(EMAIL, PASSWORD);
      const rehashed = await stored();
      expect(rehashed.hash_iterations).toBe(210_000);
      expect(rehashed.salt).not.toBe(salt);
      // Новый хеш действительно от того же пароля.
      expect(rehashed.passwordHash).toBe(
        pbkdf2Sync(PASSWORD, rehashed.salt, 210_000, 64, 'sha512').toString(
          'hex',
        ),
      );
      await service.loginUser(EMAIL, PASSWORD);
    });
  });

  describe('код подтверждения почты', () => {
    it('при регистрации на почту уходит код из 6 цифр', async () => {
      await register();
      const code = lastCode(mail.sendVerificationEmail);

      expect(mail.sendVerificationEmail).toHaveBeenCalledWith(EMAIL, code);
      expect(code).toMatch(SIX_DIGITS);
      expect(await stored()).toMatchObject({
        is_verified: false,
        verification_token: code,
      });

      await expect(service.verifyUser(EMAIL, '000000')).rejects.toThrow(
        'Неверный код подтверждения',
      );
      await service.verifyUser(EMAIL, code);
      const verified = await stored();
      expect(verified.is_verified).toBe(true);
      expect(verified.verification_token).toBeUndefined();
    });

    it('повторно отправить код можно не раньше чем через минуту', async () => {
      await register();
      const id = String((await stored())._id);

      const early = await rejection(service.resendVerification(id));
      expect(early.getStatus()).toBe(429);
      expect(early.message).toMatch(/через \d+ с/);
      expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(1);

      await cooldownPassed();
      await service.resendVerification(id);
      const code = lastCode(mail.sendVerificationEmail);
      expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(2);
      expect(code).toMatch(SIX_DIGITS);
      expect((await stored()).verification_token).toBe(code);

      // Пауза отсчитывается заново от нового письма.
      expect(
        (await rejection(service.resendVerification(id))).getStatus(),
      ).toBe(429);
    });

    it('подтверждённой почте код не отправляется', async () => {
      await register();
      await service.verifyUser(EMAIL, lastCode(mail.sendVerificationEmail));
      await cooldownPassed();
      const id = String((await stored())._id);
      await expect(service.resendVerification(id)).rejects.toThrow(
        'Почта уже подтверждена',
      );
    });
  });

  describe('восстановление пароля', () => {
    it('код из 6 цифр живёт 15 минут, в базе — только его хеш', async () => {
      const before = Date.now();
      const code = await requestReset();
      const user = await stored();

      expect(code).toMatch(SIX_DIGITS);
      expect(user.reset_code).toMatch(/^[0-9a-f]{64}$/);
      expect(user.reset_code).not.toContain(code);
      const ttl = user.reset_expires!.getTime() - before;
      expect(ttl).toBeGreaterThanOrEqual(15 * 60 * 1000);
      expect(ttl).toBeLessThan(15 * 60 * 1000 + 5000);

      await expect(
        service.checkPasswordResetCode(EMAIL, code),
      ).resolves.toEqual({ ok: true });

      await users.updateOne({ email: EMAIL }, { reset_expires: secondsAgo(1) });
      await expect(service.checkPasswordResetCode(EMAIL, code)).rejects.toThrow(
        'Срок действия кода истёк',
      );
    });

    it('после 4 неверных попыток верный код ещё принимается', async () => {
      const code = await requestReset();
      for (let i = 0; i < 4; i++) {
        await service.checkPasswordResetCode(EMAIL, WRONG).catch(() => null);
      }
      await expect(
        service.checkPasswordResetCode(EMAIL, code),
      ).resolves.toEqual({ ok: true });
    });

    it('сброс меняет пароль, подтверждает почту и гасит код', async () => {
      const code = await requestReset();
      await service.resetPassword(EMAIL, code, 'NewSecret123');

      await expect(service.loginUser(EMAIL, PASSWORD)).rejects.toThrow(
        BadRequestException,
      );
      await service.loginUser(EMAIL, 'NewSecret123');
      const user = await stored();
      expect(user.is_verified).toBe(true);
      expect(user.reset_code).toBeUndefined();
      await expect(
        service.resetPassword(EMAIL, code, 'Another123'),
      ).rejects.toThrow('Неверный код');
    });

    it('на неизвестную почту и чаще раза в минуту письмо не уходит, ответ тот же', async () => {
      await expect(
        service.requestPasswordReset('nobody@test.local'),
      ).resolves.toEqual({ ok: true });
      expect(mail.sendRestoreEmail).not.toHaveBeenCalled();

      await requestReset();
      await expect(service.requestPasswordReset(EMAIL)).resolves.toEqual({
        ok: true,
      });
      expect(mail.sendRestoreEmail).toHaveBeenCalledTimes(1);
    });
  });

  // Правило одно для обоих кодов, счётчики раздельные.
  describe.each([
    {
      flow: 'подтверждение почты',
      attempts: 'verify_attempts',
      lockedUntil: 'verify_locked_until',
      start: async () => {
        await register();
        return lastCode(mail.sendVerificationEmail);
      },
      newCode: async () => {
        await cooldownPassed();
        await service.resendVerification(String((await stored())._id));
        return lastCode(mail.sendVerificationEmail);
      },
      enter: (code: string) => service.verifyUser(EMAIL, code),
      /** Почта подтверждена (и токен выдан). */
      accepted: async () => (await stored()).is_verified,
    },
    {
      flow: 'восстановление пароля',
      attempts: 'reset_attempts',
      lockedUntil: 'reset_locked_until',
      start: requestReset,
      newCode: async () => {
        await cooldownPassed();
        await service.requestPasswordReset(EMAIL);
        return lastCode(mail.sendRestoreEmail);
      },
      enter: (code: string) => service.resetPassword(EMAIL, code, NEW_PASSWORD),
      /** Пароль сменился. */
      accepted: () =>
        service.loginUser(EMAIL, NEW_PASSWORD).then(
          () => true,
          () => false,
        ),
    },
  ])(
    'блокировка ввода кода: $flow',
    ({ attempts, lockedUntil, start, newCode, enter, accepted }) => {
      const enterWrong = async (times: number) => {
        for (let i = 0; i < times; i++) {
          await expect(enter(WRONG)).rejects.toThrow('Неверный код');
        }
      };

      it('после 5 неверных вводов верный код не принимается', async () => {
        const code = await start();
        await enterWrong(5);
        await expect(enter(code)).rejects.toThrow(LOCKED);
        expect(await accepted()).toBe(false);
      });

      it('новый код блокировку не снимает', async () => {
        await start();
        await enterWrong(5);
        const code = await newCode();
        await expect(enter(code)).rejects.toThrow(LOCKED);
        expect(await accepted()).toBe(false);
      });

      it('блокировка на час; после неё счёт начинается заново', async () => {
        const code = await start();
        await enterWrong(5);
        const until = await field(lockedUntil);
        expect(until).toBeInstanceOf(Date);
        const left = (until as Date).getTime() - Date.now();
        expect(left).toBeGreaterThan(59 * 60 * 1000);
        expect(left).toBeLessThanOrEqual(60 * 60 * 1000);

        await users.updateOne(
          { email: EMAIL },
          { [lockedUntil]: secondsAgo(1) },
        );
        // Первая ошибка после блокировки — снова просто «неверный код».
        await enterWrong(1);
        await enter(code);
        expect(await accepted()).toBe(true);
      });

      it('верный ввод обнуляет счётчик', async () => {
        const code = await start();
        await enterWrong(4);
        await enter(code);
        expect((await field(attempts)) ?? 0).toBe(0);
      });

      it('параллельные неверные вводы не обходят счётчик', async () => {
        const code = await start();
        const results = await Promise.allSettled(
          Array.from({ length: 10 }, () => enter(WRONG)),
        );
        const wrong = results.filter(
          (r) =>
            r.status === 'rejected' &&
            (r.reason as Error).message.startsWith('Неверный код'),
        );
        expect(wrong).toHaveLength(5);
        await expect(enter(code)).rejects.toThrow(LOCKED);
      });
    },
  );
});
