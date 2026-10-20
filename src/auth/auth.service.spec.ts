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
const SECRETS =
  '+passwordHash +salt +hash_iterations +verification_token +code_sent_at ' +
  '+reset_code +reset_expires +reset_attempts';
const SIX_DIGITS = /^\d{6}$/;
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
    /** Пользователь, которому уже можно отправить код восстановления. */
    const requestReset = async () => {
      await register();
      await cooldownPassed();
      await service.requestPasswordReset(EMAIL);
      return lastCode(mail.sendRestoreEmail);
    };

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

    it('после 5 неверных попыток код сгорает', async () => {
      const code = await requestReset();
      const wrong = code === '111111' ? '222222' : '111111';

      for (let i = 0; i < 5; i++) {
        await expect(
          service.checkPasswordResetCode(EMAIL, wrong),
        ).rejects.toThrow('Неверный код');
      }
      expect((await stored()).reset_attempts).toBe(5);
      await expect(
        service.resetPassword(EMAIL, code, 'NewSecret123'),
      ).rejects.toThrow('Слишком много неверных попыток');
      await expect(service.loginUser(EMAIL, PASSWORD)).resolves.toBeDefined();
    });

    it('после 4 неверных попыток верный код ещё принимается', async () => {
      const code = await requestReset();
      const wrong = code === '111111' ? '222222' : '111111';
      for (let i = 0; i < 4; i++) {
        await service.checkPasswordResetCode(EMAIL, wrong).catch(() => null);
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
});
