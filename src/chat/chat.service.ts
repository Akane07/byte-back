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
        const chats = await this.messageModel.aggregate([
            {
                $match: {
                    $or: [
                        { senderId: userId },
                        { receiverId: userId }
                    ]
                }
            },
            {
                $addFields: {
                    otherUserId: {
                        $cond: [
                            { $eq: ['$senderId', userId] },
                            '$receiverId',
                            '$senderId'
                        ]
                    },
                    isOwnMessage: { $eq: ['$senderId', userId] },
                    displayText: {
                        $cond: [
                            { $eq: ['$mediaType', 'video'] },
                            'Видео',
                            '$text'
                        ]
                    }
                }
            },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: '$otherUserId',
                    lastMessage: { $first: '$displayText' },
                    lastMessageDate: { $first: '$createdAt' },
                    isRead: {
                        $first: {
                            $cond: [
                                { $eq: ['$senderId', userId] },
                                '$isRead',
                                '$$REMOVE'
                            ]
                        }
                    }
                }
            },
            {
                // преобразуем строку в ObjectId
                $addFields: {
                    objectOtherUserId: {
                        $convert: {
                            input: '$_id',
                            to: 'objectId',
                            onError: null,
                            onNull: null
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'objectOtherUserId',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: '$user' },
            {
                $project: {
                    _id: 0,
                    userId: '$_id',
                    name: '$user.name',
                    avatar: '$user.avatar',
                    lastMessage: 1,
                    lastMessageDate: 1,
                    isRead: 1
                }
            },
            { $sort: { lastMessageDate: -1 } }
        ]);

        return chats;
    }


}
