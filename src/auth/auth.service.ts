import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { pbkdf2, randomBytes, randomInt, timingSafeEqual } from 'crypto';
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
      name: name.trim(),
      email,
      ...(await this.hashPassword(password)),
      is_verified: false,
      verification_token,
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

  /** Шестизначный код из криптографического генератора. */
  private generateVerificationCode() {
    return randomInt(100_000, 1_000_000).toString();
  }

  private generateToken(userId: string) {
    return this.jwtService.sign({ userId });
  }
}
