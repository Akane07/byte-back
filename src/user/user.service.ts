import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from 'src/auth/schemas/user.schema';
import { Model } from 'mongoose';
import { AuthService } from 'src/auth/auth.service';

@Injectable()
export class UserService {
    constructor(
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        private readonly authService: AuthService,
    ) { }

    async getUser(userId: string) {
        const user = await this.userModel.findById<UserDocument>(userId).exec();

        if (!user) {
            throw new NotFoundException("User does not exist");
        }

        user.last_seen = new Date().toISOString();
        await user.save();

        return this.returnUser(user);
    }

    async updateUser(_id: string, updateData: Partial<User>) {
        if (updateData.passwordHash || updateData.salt || updateData.id
          || updateData.verification_token || updateData.last_seen || updateData.created_at ||
        updateData.rating || updateData.orders_count || updateData.reviews_count) {
          throw new BadRequestException("Невозможно изменить данные пользоватея");
        }
    
        let user = await this.userModel.findById(_id).exec();

        if (user.id !== _id) {
            throw new BadRequestException("Невозможно изменить данные пользоватея");
        }
    
        if (updateData.email) {
        } else {
          user = await this.userModel.findByIdAndUpdate(_id, updateData, { new: true });
        }
    
        if (!user) {
          throw new BadRequestException("Пользователя не существует");
        }
    
        return this.returnUser(user);
      }

    async patchUserOrdersCount(userId: string, ordersCount: number) {
        const user = await this.userModel.findById<UserDocument>(userId).exec();
        user.orders_count = ordersCount;
        await user.save();
    }

    async changePassword(userId: string, password: string, newPassword: string) {
        const { access_token } = await this.authService.changePassword(userId, password, newPassword);
        return access_token;
    }

    private returnUser(user: any) {
        const {
            __v,
            _id,
            passwordHash,
            salt,
            verificationToken,
            ...result
        } = user._doc;

        return {
            id: user._id,
            ...result
        };
    }
}
