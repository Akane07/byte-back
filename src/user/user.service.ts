import { Injectable, NotFoundException } from '@nestjs/common';
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

        return this.retrunUser(user);
    }

    async changePassword(userId: string, password: string, newPassword: string) {
        const { access_token } = await this.authService.changePassword(userId, password, newPassword);
        return access_token;
    }

    private retrunUser(user: any) {
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
