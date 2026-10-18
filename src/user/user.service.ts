import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { escapeRegExp } from '../common/escape-regexp';
import { User, UserDocument } from '../auth/schemas/user.schema';
import {
  SPECIALISTS_PAGE_SIZE,
  SpecialistsQueryDto,
  UpdateUserDto,
} from './dto/update-user.dto';

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
    // price_from: null — «цену не указываю»: убираем поле, а не храним null.
    const { price_from, ...rest } = updateData as UpdateUserDto;
    const update =
      price_from === null ? { ...rest, $unset: { price_from: 1 } } : updateData;
    const user = await this.userModel.findByIdAndUpdate(userId, update, {
      new: true,
      runValidators: true,
    });
    return toPrivateUser(this.assertFound(user));
  }

  /**
   * Каталог исполнителей: те, кто отметил «Принимаю заказы». Сверху —
   * с лучшим взвешенным рейтингом (см. User.rating_score), при равенстве —
   * с большим числом отзывов, затем кто недавно заходил.
   */
  async getSpecialists(query: SpecialistsQueryDto) {
    const { page, q, categories, format, city } = query;
    const filter: FilterQuery<User> = { is_performer: true };

    if (categories?.length) filter.categories = { $in: categories };
    if (format === 'remote') filter.work_format = { $in: ['remote', 'both'] };
    if (format === 'onsite') filter.work_format = { $in: ['onsite', 'both'] };
    if (city) filter.city = city;

    const search = q?.trim();
    if (search) {
      const re = new RegExp(escapeRegExp(search), 'i');
      filter.$or = [
        { name: re },
        { nickname: re },
        { speciality: re },
        { skills: re },
        { description: re },
      ];
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ rating_score: -1, reviews_count: -1, last_seen: -1, _id: 1 })
        .skip((page - 1) * SPECIALISTS_PAGE_SIZE)
        .limit(SPECIALISTS_PAGE_SIZE),
      this.userModel.countDocuments(filter),
    ]);

    return {
      users: users.map(toPublicUser),
      totalPages: Math.max(1, Math.ceil(total / SPECIALISTS_PAGE_SIZE)),
      currentPage: page,
      total,
    };
  }

  /** Время последнего визита — при входе в чат и выходе из него. */
  async touchLastSeen(userId: string) {
    await this.userModel.updateOne(
      { _id: userId },
      { last_seen: new Date().toISOString() },
    );
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
