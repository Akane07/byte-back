import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from 'src/auth/schemas/user.schema';
import { Model } from 'mongoose';

@Injectable()
export class UserService {
    constructor(
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    ) { }

    async getUser(userId: string) {
        const user = await this.userModel.findById<UserDocument>(userId).exec();

        if (!user) {
            throw new NotFoundException("User does not exist");
        }

        return this.retrunUser(user);
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
