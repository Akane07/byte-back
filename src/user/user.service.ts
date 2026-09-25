import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly authService: AuthService,
  ) {}

  /** Свой профиль: все поля, кроме секретных. Заодно отмечает время визита. */
  async getMe(userId: string) {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { last_seen: new Date().toISOString() },
      { new: true },
    );
    return toPrivateUser(this.assertFound(user));
  }

  /** Чужой профиль: без почты и телефона. */
  async getUser(userId: string) {
    const user = await this.userModel.findById(userId);
    return toPublicUser(this.assertFound(user));
  }

  async updateUser(
    userId: string,
    updateData: UpdateUserDto | { avatar: string },
  ) {
    const user = await this.userModel.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    });
    return toPrivateUser(this.assertFound(user));
  }

  async setOrdersCount(userId: string, ordersCount: number) {
    await this.userModel.updateOne(
      { _id: userId },
      { orders_count: ordersCount },
    );
  }

  changePassword(userId: string, password: string, newPassword: string) {
    return this.authService.changePassword(userId, password, newPassword);
  }

  private assertFound(user: UserDocument | null): UserDocument {
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    return user;
  }
}

function toPrivateUser(user: UserDocument) {
  const { _id, __v, ...fields } = user.toObject();
  return { id: _id.toString(), ...fields };
}

function toPublicUser(user: UserDocument) {
  const { email, phone, ...fields } = toPrivateUser(user);
  return fields;
}
