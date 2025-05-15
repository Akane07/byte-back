import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Message, MessageDocument } from './schemas/chat.schema';
import { Model } from 'mongoose';

@Injectable()
export class ChatService {
    constructor(
        @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    ) { }

    async saveMessage(data: any): Promise<Message> {
        const message = new this.messageModel(data);
        return message.save();
    }

    async getMessages(user1: string, user2: string) {
        return this.messageModel.find({
            $or: [
                { senderId: user1, receiverId: user2 },
                { senderId: user2, receiverId: user1 },
            ],
        }).sort({ createdAt: 1 });
    }

    async getChatBetweenUsers(userA: string, userB: string) {
        return this.messageModel.find({
            $or: [
                { senderId: userA, receiverId: userB },
                { senderId: userB, receiverId: userA },
            ],
        }).sort({ createdAt: 1 }); // сортировка по времени
    }

    async getUserChats(userId: string) {
        return this.messageModel.find({ $or: [{ senderId: userId }, { receiverId: userId }] }).sort({ createdAt: 1 }); // сортировка по времени
    }   

}
