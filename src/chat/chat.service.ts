import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Message, MessageDocument, MessageDto } from './schemas/chat.schema';
import { Model } from 'mongoose';
import { Order, OrderDocument, OrderResponse, OrderResponseDocument } from 'src/order/schemas/order.schema';

@Injectable()
export class ChatService {
    constructor(
        @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
        @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
        @InjectModel(OrderResponse.name) private orderResponseModel: Model<OrderResponseDocument>,
    ) { }

    async saveMessage(data: MessageDto): Promise<Message> {
        const message = new this.messageModel(data);
        return message.save();
    }

    async getChatBetweenUsers(userA: string, userB: string) {
        if (!userA || !userB) return [];

        return this.messageModel.find({
            $or: [
                { senderId: userA, receiverId: userB },
                { senderId: userB, receiverId: userA },
            ],
        }).sort({ createdAt: 1 }); // сортировка по времени
    }

    async getUserChats(userId: string) {
        if (!userId) return [];

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

    async deleteMessage(id: string) {
        console.log(id);
        
        if (!id) return;

        const res = await this.messageModel.findByIdAndDelete(id).exec();

        console.log(res);
        

        return this.messageModel.findByIdAndDelete(id).exec();
    }

    async acceptMessage(id: string, orderId: string, userId: string) {
        if (!id || !orderId || !userId) return;

        const order = await this.orderModel.findById(orderId).exec();

        if (!order) return;

        order.performer = userId;
        order.status = 'pending';

        await order.save();
        return this.messageModel.findByIdAndUpdate(id, { status: 'accepted' }).exec();
    }

    async finishOrderMessage(orderId: string) {
        if (!orderId) return;

        const order = await this.orderModel.findById(orderId).exec();

        if (!order) return;

        order.status = 'completed';

        await order.save();
    }

    async rejectMessage(id: string) {
        if (!id) return;

        return this.messageModel.findByIdAndUpdate(id, { status: 'rejected' }).exec();
    }

    async getOrderBetweenUsers(userId: string, otherId: string) {
        if (userId === otherId) return [];
        if (!userId || !otherId) return [];

        const orders = await this.orderModel.find({ performer: { $in: [userId, otherId] }, user_id: { $in: [userId, otherId] }, draft: { $ne: true } }).exec();
        
        return orders;
    }

    async patchResponse(responseId: string, messageId: string) {
        if (!responseId || !messageId) return;

        return this.orderResponseModel.findByIdAndUpdate(responseId, { messageId }).exec();
    }
}
