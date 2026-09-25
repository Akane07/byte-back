import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message, MessageDocument, MessageStatus } from './schemas/chat.schema';

type NewMessage = Pick<Message, 'senderId' | 'receiverId'> &
  Partial<Omit<Message, 'senderId' | 'receiverId' | 'createdAt'>>;

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Message.name) private readonly messageModel: Model<Message>,
  ) {}

  saveMessage(data: NewMessage) {
    return this.messageModel.create(data);
  }

  getChatBetweenUsers(userId: string, otherId: string) {
    return this.messageModel
      .find({
        $or: [
          { senderId: userId, receiverId: otherId },
          { senderId: otherId, receiverId: userId },
        ],
      })
      .sort({ createdAt: 1 });
  }

  /** Список диалогов пользователя: собеседник и последнее сообщение. */
  getUserChats(userId: string) {
    return this.messageModel.aggregate([
      { $match: { $or: [{ senderId: userId }, { receiverId: userId }] } },
      {
        $addFields: {
          otherUserId: {
            $cond: [{ $eq: ['$senderId', userId] }, '$receiverId', '$senderId'],
          },
          displayText: {
            $switch: {
              branches: [
                { case: { $eq: ['$mediaType', 'video'] }, then: 'Видео' },
                {
                  case: {
                    $and: [
                      { $eq: ['$mediaType', 'image'] },
                      { $eq: ['$text', ''] },
                    ],
                  },
                  then: 'Изображение',
                },
              ],
              default: '$text',
            },
          },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$otherUserId',
          lastMessage: { $first: '$displayText' },
          lastMessageDate: { $first: '$createdAt' },
          isRead: {
            $first: {
              $cond: [{ $eq: ['$senderId', userId] }, '$isRead', '$$REMOVE'],
            },
          },
        },
      },
      {
        $addFields: {
          objectOtherUserId: {
            $convert: {
              input: '$_id',
              to: 'objectId',
              onError: null,
              onNull: null,
            },
          },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'objectOtherUserId',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          name: '$user.name',
          nickname: '$user.nickname',
          avatar: '$user.avatar',
          lastMessage: 1,
          lastMessageDate: 1,
          isRead: 1,
        },
      },
      { $sort: { lastMessageDate: -1 } },
    ]);
  }

  async findMessage(id: string): Promise<MessageDocument> {
    const message = await this.messageModel.findById(id);
    if (!message) {
      throw new NotFoundException('Сообщение не найдено');
    }
    return message;
  }

  /** Удалить сообщение может только его автор. */
  async deleteMessage(id: string, userId: string) {
    const message = await this.findMessage(id);
    if (message.senderId !== userId) {
      throw new ForbiddenException('Удалить можно только своё сообщение');
    }
    await message.deleteOne();
    return message;
  }

  async setStatus(message: MessageDocument, status: MessageStatus) {
    message.status = status;
    await message.save();
    return message;
  }
}
