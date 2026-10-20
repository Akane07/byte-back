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
import { User, UserDocument } from './schemas/user.schema';

const pbkdf2Async = promisify(pbkdf2);

/** Рекомендация OWASP для PBKDF2-HMAC-SHA512. */
const HASH_ITERATIONS = 210_000;
/** С таким числом итераций хешировались пароли до рефакторинга. */
const LEGACY_HASH_ITERATIONS = 1000;
const SECRET_FIELDS = '+passwordHash +salt +hash_iterations';
const RESET_FIELDS = '+reset_code +reset_expires +reset_locked_until';

/** Сколько живёт код восстановления пароля. */
const RESET_CODE_TTL_MS = 15 * 60 * 1000;
/** Сколько неверных вводов кода допускается до блокировки ввода. */
const CODE_MAX_ATTEMPTS = 5;
/**
 * На сколько блокируется ввод кода. Новый код блокировку не снимает:
 * иначе перебор шёл бы по CODE_MAX_ATTEMPTS попыток на каждое письмо.
 */
const CODE_LOCK_MS = 60 * 60 * 1000;
/** Пауза между письмами с кодом одному пользователю. */
const RESEND_COOLDOWN_MS = 60 * 1000;

/** Счётчик и блокировка — раздельные для двух видов кода. */
type CodeKind = 'verify' | 'reset';

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
    const user = await this.userModel
      .findOne({ email, is_verified: false })
      .select('+verification_token +verify_locked_until');
    const wrong = 'Неверный код подтверждения';
    if (!user?.verification_token) {
      throw new BadRequestException(wrong);
    }

    await this.spendAttempt(
      user,
      'verify',
      this.sameCode(this.hashCode(user.verification_token), token),
      wrong,
    );
    user.set({ is_verified: true, verification_token: undefined });
    await user.save();

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

  /** Пользователь с действующим кодом восстановления. */
  private async findUserByResetCode(email: string, code: string) {
    const user = await this.userModel.findOne({ email }).select(RESET_FIELDS);
    const wrong = 'Неверный код';

    if (!user?.reset_code || !user.reset_expires) {
      throw new BadRequestException(wrong);
    }

    if (user.reset_expires.getTime() < Date.now()) {
      throw new BadRequestException(
        'Срок действия кода истёк, запросите новый',
      );
    }

    await this.spendAttempt(
      user,
      'reset',
      this.sameCode(user.reset_code, code),
      wrong,
    );
    return user;
  }

  /**
   * Одно правило для кода подтверждения и кода восстановления: после
   * CODE_MAX_ATTEMPTS неверных вводов ввод блокируется на CODE_LOCK_MS,
   * верный ввод обнуляет счётчик, после блокировки счёт идёт заново.
   *
   * Попытка списывается одним атомарным запросом до ответа: если сначала
   * прочитать счётчик, а потом записать, параллельные запросы видят одно
   * и то же значение и проверяют кодов больше лимита.
   */
  private async spendAttempt(
    user: UserDocument,
    kind: CodeKind,
    correct: boolean,
    wrongMessage: string,
  ) {
    const attempts = `${kind}_attempts`;
    const lockedUntil = `${kind}_locked_until`;

    await this.userModel.updateOne(
      { _id: user._id, [lockedUntil]: { $lte: new Date() } },
      { $unset: { [attempts]: 1, [lockedUntil]: 1 } },
    );
    const spent = await this.userModel
      .findOneAndUpdate(
        { _id: user._id, [attempts]: { $not: { $gte: CODE_MAX_ATTEMPTS } } },
        { $inc: { [attempts]: 1 } },
        { new: true },
      )
      .select(`+${attempts}`);

    if (!spent) {
      const until = user.get(lockedUntil) as Date | undefined;
      const left = (until?.getTime() ?? Date.now() + CODE_LOCK_MS) - Date.now();
      const minutes = Math.max(1, Math.ceil(left / 60_000));
      throw new BadRequestException(
        `Слишком много неверных попыток, попробуйте через ${minutes} мин`,
      );
    }
    if (correct) {
      await this.userModel.updateOne(
        { _id: user._id },
        { $unset: { [attempts]: 1, [lockedUntil]: 1 } },
      );
      return;
    }
    if ((spent.get(attempts) as number) >= CODE_MAX_ATTEMPTS) {
      await this.userModel.updateOne(
        { _id: user._id },
        { [lockedUntil]: new Date(Date.now() + CODE_LOCK_MS) },
      );
    }
    throw new BadRequestException(wrongMessage);
  }

  private hashCode(code: string) {
    return createHash('sha256').update(code).digest('hex');
  }

  /** Код против его SHA-256 — за постоянное время. */
  private sameCode(expectedHash: string, code: string) {
    return timingSafeEqual(
      Buffer.from(expectedHash, 'hex'),
      Buffer.from(this.hashCode(code), 'hex'),
    );
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
