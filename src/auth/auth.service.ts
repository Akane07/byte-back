import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes, pbkdf2Sync } from 'crypto';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtService } from '@nestjs/jwt';
import { MailService } from 'src/mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService
  ) { }

  async registerUser(createUserDto: CreateUserDto): Promise<{ access_token: string }> {
    let { email, password, name } = createUserDto;
    email = email.toLowerCase();

    const existingUser = await this.userModel.findOne({ email }).exec();
    if (existingUser) {
      throw new BadRequestException('Пользователь с такими учётными данными уже существует');
    }
    if (!this.checkPassword(password)) {
      throw new BadRequestException('Пароль должен содержать не менее 8-ми символов, из которых минимум 1 буква и 1 цифра');
    }

    const { salt, hash } = this.hashPassword(password);
    const verification_token = this.generateVerificationToken();

    const newUser = new this.userModel<Partial<User>>({
      name,
      email,
      passwordHash: hash,
      salt,
      is_verified: false, // Новый пользователь не подтверждён
      verification_token,
    });
    const user = await newUser.save();

    await this.mailService.sendVerificationEmail(email, verification_token);

    const access_token = this.generateToken(user.get('id') as string);

    return { access_token };
  }

  async loginUser(email: string, password: string): Promise<{ access_token: string }> {
    const user = await this.userModel.findOne({ email }).exec();

    if (!user) {
      throw new BadRequestException('Неверный e-mail или пароль');
    }

    const isPasswordValid = this.verifyPassword(password, user.salt, user.passwordHash);
    if (!isPasswordValid) {
      throw new BadRequestException('Неверный e-mail или пароль');
    }

    const access_token = this.generateToken(user.get('id') as string);

    return { access_token };
  }

  async verifyUser(token: string): Promise<{ access_token: string }> {
    const user = await this.userModel.findOne({ verification_token: token }).exec();
    if (!user || user.is_verified || !user.verification_token || !token) {
      throw new BadRequestException('Неверный токен верификации');
    }
    await this.userModel.updateOne({ verification_token: token }, { is_verified: true, verification_token: '' });
    const access_token = this.generateToken(user.get('id') as string);
    return { access_token };
  }

  public async changePassword(email: string, password: string, newPassword: string): Promise<{ access_token: string }> {
    const user = await this.userModel.findOne({ email }).exec();
    if (!user) {
      throw new BadRequestException('Неверный e-mail');
    }

    const isPasswordValid = this.verifyPassword(password, user.salt, user.passwordHash);
    if (!isPasswordValid) {
      throw new BadRequestException('Неверный пароль');
    }

    if (!this.checkPassword(newPassword)) {
      throw new BadRequestException('Пароль должен содержать не менее 8-ми символов, из которых минимум 1 буква и 1 цифра');
    }

    const { salt, hash } = this.hashPassword(newPassword);
    await this.userModel.updateOne({ email }, { passwordHash: hash, salt });
    const access_token = this.generateToken(user.get('id') as string);
    return { access_token };
  }

  private hashPassword(password: string): { salt: string; hash: string } {
    const salt = randomBytes(16).toString('hex');
    const hash = pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return { salt, hash };
  }

  private verifyPassword(password: string, salt: string, hash: string): boolean {
    const hashToVerify = pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return hash === hashToVerify;
  }

  private checkPassword(password: string): boolean {
    const reg = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!"#$%&'()*+,-./:;<=>?@[\]^_`{|}~]{8,}$/;
    return reg.test(password);
  }

  private generateVerificationToken(): string {
    return Math.floor(Math.random() * 1000000).toString();
  }

  private generateToken(userId: string): string {
    return this.jwtService.sign({ userId });
  }
}
