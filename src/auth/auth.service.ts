import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes, pbkdf2Sync } from 'crypto';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
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
    const verificationToken = this.generateVerificationToken();

    const newUser = new this.userModel({
      name,
      email,
      passwordHash: hash,
      salt,
      isVerified: false, // Новый пользователь не подтверждён
      verificationToken,
    });

    const user = await newUser.save();

    console.log(user);
    

    const access_token = this.generateToken(user.get('id') as string);

    return { access_token };
  }

  async loginUser(email: string, password: string): Promise<any> {
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
    return randomBytes(32).toString('hex') + (new Date().toISOString()); // Генерация уникального токена
  }

  private generateToken(userId: string): string {
    return this.jwtService.sign({ userId });
  }
}
