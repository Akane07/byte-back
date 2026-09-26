import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import {
  createHash,
  pbkdf2,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'crypto';
import { Model } from 'mongoose';
import { promisify } from 'util';
import { MailService } from '../mail/mail.service';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './schemas/user.schema';

const pbkdf2Async = promisify(pbkdf2);

/** Рекомендация OWASP для PBKDF2-HMAC-SHA512. */
const HASH_ITERATIONS = 210_000;
/** С таким числом итераций хешировались пароли до рефакторинга. */
const LEGACY_HASH_ITERATIONS = 1000;
const SECRET_FIELDS = '+passwordHash +salt +hash_iterations';
const RESET_FIELDS = '+reset_code +reset_expires +reset_attempts';

/** Сколько живёт код восстановления пароля. */
const RESET_CODE_TTL_MS = 15 * 60 * 1000;
/** Сколько неверных вводов кода допускается, прежде чем он сгорит. */
const RESET_MAX_ATTEMPTS = 5;
/** Пауза между письмами с кодом одному пользователю. */
const RESEND_COOLDOWN_MS = 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async registerUser({ name, email, password }: CreateUserDto) {
    const existingUser = await this.userModel.exists({ email });
    if (existingUser) {
      throw new BadRequestException(
        'Пользователь с такой почтой уже зарегистрирован',
      );
    }

    const verification_token = this.generateVerificationCode();
    const user = await this.userModel.create({
      // Имени на форме регистрации нет — до правки профиля им служит
      // часть почты до @.
      name: name?.trim() || email.split('@')[0],
      email,
      ...(await this.hashPassword(password)),
      is_verified: false,
      verification_token,
      code_sent_at: new Date(),
    });

    // Письмо не должно ломать регистрацию: пользователь уже создан,
    // и ошибка SMTP в ответе оставила бы его в «полусозданном» состоянии.
    try {
      await this.mailService.sendVerificationEmail(email, verification_token);
    } catch (error) {
      this.logger.error(`Не удалось отправить письмо на ${email}`, error);
    }

    return { access_token: this.generateToken(user.id) };
  }

  async loginUser(email: string, password: string) {
    const user = await this.userModel.findOne({ email }).select(SECRET_FIELDS);

    if (!user || !(await this.verifyPassword(password, user))) {
      throw new BadRequestException('Неверная почта или пароль');
    }

    // Пароли, захешированные со старым числом итераций, перехешируем
    // при первом успешном входе — хранить их в прежнем виде не нужно.
    if ((user.hash_iterations ?? LEGACY_HASH_ITERATIONS) < HASH_ITERATIONS) {
      user.set(await this.hashPassword(password));
      await user.save();
    }

    return { access_token: this.generateToken(user.id) };
  }

  async verifyUser(email: string, token: string) {
    const user = await this.userModel.findOneAndUpdate(
      { email, verification_token: token, is_verified: false },
      { is_verified: true, $unset: { verification_token: 1 } },
    );

    if (!user) {
      throw new BadRequestException('Неверный код подтверждения');
    }

    return { access_token: this.generateToken(user.id) };
  }

  /** Отправить код подтверждения почты ещё раз. */
  async resendVerification(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('+verification_token +code_sent_at');
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    if (user.is_verified) {
      throw new BadRequestException('Почта уже подтверждена');
    }
    this.assertCooldown(user.code_sent_at);

    const code = this.generateVerificationCode();
    user.set({ verification_token: code, code_sent_at: new Date() });
    await user.save();
    await this.mailService.sendVerificationEmail(user.email, code);

    return { ok: true };
  }

  /**
   * Шаг 1 восстановления: отправить на почту код.
   *
   * Отвечает одинаково, есть такая почта в базе или нет, — иначе форму
   * можно было бы использовать, чтобы проверять, кто зарегистрирован.
   * По той же причине повторный запрос раньше минуты молча пропускается.
   */
  async requestPasswordReset(email: string) {
    const user = await this.userModel
      .findOne({ email })
      .select('+code_sent_at');
    if (!user || this.inCooldown(user.code_sent_at)) {
      return { ok: true };
    }

    const code = this.generateVerificationCode();
    user.set({
      reset_code: this.hashCode(code),
      reset_expires: new Date(Date.now() + RESET_CODE_TTL_MS),
      reset_attempts: 0,
      code_sent_at: new Date(),
    });
    await user.save();

    try {
      await this.mailService.sendRestoreEmail(email, code);
    } catch (error) {
      this.logger.error(`Не удалось отправить письмо на ${email}`, error);
    }

    return { ok: true };
  }

  /** Шаг 2: проверить код, не меняя пароль, — чтобы перейти к вводу нового. */
  async checkPasswordResetCode(email: string, code: string) {
    await this.findUserByResetCode(email, code);
    return { ok: true };
  }

  /** Шаг 3: сменить пароль и сразу войти. */
  async resetPassword(email: string, code: string, password: string) {
    const user = await this.findUserByResetCode(email, code);

    user.set({
      ...(await this.hashPassword(password)),
      // Код пришёл на эту почту — значит, она заодно подтверждена.
      is_verified: true,
      verification_token: undefined,
      reset_code: undefined,
      reset_expires: undefined,
      reset_attempts: undefined,
    });
    await user.save();

    return { access_token: this.generateToken(user.id) };
  }

  async changePassword(userId: string, password: string, newPassword: string) {
    const user = await this.userModel.findById(userId).select(SECRET_FIELDS);
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    if (!(await this.verifyPassword(password, user))) {
      throw new BadRequestException('Текущий пароль указан неверно');
    }

    user.set(await this.hashPassword(newPassword));
    await user.save();

    return { access_token: this.generateToken(user.id) };
  }

  private async hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const hash = await pbkdf2Async(
      password,
      salt,
      HASH_ITERATIONS,
      64,
      'sha512',
    );
    return {
      salt,
      passwordHash: hash.toString('hex'),
      hash_iterations: HASH_ITERATIONS,
    };
  }

  private async verifyPassword(
    password: string,
    user: Pick<User, 'salt' | 'passwordHash' | 'hash_iterations'>,
  ) {
    const iterations = user.hash_iterations ?? LEGACY_HASH_ITERATIONS;
    const expected = Buffer.from(user.passwordHash, 'hex');
    const actual = await pbkdf2Async(
      password,
      user.salt,
      iterations,
      64,
      'sha512',
    );
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  /**
   * Пользователь с действующим кодом восстановления. Каждый неверный ввод
   * засчитывается: после RESET_MAX_ATTEMPTS код сгорает, и шесть цифр
   * нельзя перебрать.
   */
  private async findUserByResetCode(email: string, code: string) {
    const user = await this.userModel.findOne({ email }).select(RESET_FIELDS);
    const invalid = new BadRequestException('Неверный код');

    if (!user?.reset_code || !user.reset_expires) throw invalid;

    if (user.reset_expires.getTime() < Date.now()) {
      throw new BadRequestException(
        'Срок действия кода истёк, запросите новый',
      );
    }

    const attempts = user.reset_attempts ?? 0;
    if (attempts >= RESET_MAX_ATTEMPTS) {
      throw new BadRequestException(
        'Слишком много неверных попыток, запросите новый код',
      );
    }

    const expected = Buffer.from(user.reset_code, 'hex');
    const actual = Buffer.from(this.hashCode(code), 'hex');
    if (!timingSafeEqual(expected, actual)) {
      user.reset_attempts = attempts + 1;
      await user.save();
      throw invalid;
    }

    return user;
  }

  private hashCode(code: string) {
    return createHash('sha256').update(code).digest('hex');
  }

  private inCooldown(sentAt?: Date) {
    return !!sentAt && Date.now() - sentAt.getTime() < RESEND_COOLDOWN_MS;
  }

  private assertCooldown(sentAt?: Date) {
    if (!sentAt || !this.inCooldown(sentAt)) return;
    const seconds = Math.ceil(
      (RESEND_COOLDOWN_MS - (Date.now() - sentAt.getTime())) / 1000,
    );
    throw new HttpException(
      `Отправить код повторно можно через ${seconds} с`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /** Шестизначный код из криптографического генератора. */
  private generateVerificationCode() {
    return randomInt(100_000, 1_000_000).toString();
  }

  private generateToken(userId: string) {
    return this.jwtService.sign({ userId });
  }
}
