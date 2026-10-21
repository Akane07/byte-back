import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, isValidObjectId } from 'mongoose';
import { Message, MessageDocument, MessageStatus } from './schemas/chat.schema';

type NewMessage = Pick<Message, 'senderId' | 'receiverId'> &
  Partial<Omit<Message, 'senderId' | 'receiverId' | 'createdAt'>>;

export const HISTORY_PAGE_SIZE = 50;
const MAX_HISTORY_PAGE_SIZE = 100;

/** Длина цитаты в ответе: целиком хранить не нужно, хватит начала. */
const REPLY_PREVIEW_LENGTH = 200;

/** Условие «сообщение из диалога этих двух пользователей». */
function dialogFilter(a: string, b: string): FilterQuery<Message> {
  return {
    $or: [
      { senderId: a, receiverId: b },
      { senderId: b, receiverId: a },
    ],
  };
}

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Message.name) private readonly messageModel: Model<Message>,
  ) {}

  saveMessage(data: NewMessage) {
    return this.messageModel.create(data);
  }

  /**
   * Страница истории диалога, от старых к новым. Без before — последние
   * сообщения, с before — те, что раньше указанного (подгрузка при
   * прокрутке вверх). Раньше история отдавалась целиком, и длинная
   * переписка открывалась всё медленнее.
   */
  async getChatBetweenUsers(
    userId: string,
    otherId: string,
    before?: string,
    limit = HISTORY_PAGE_SIZE,
  ) {
    const size = Math.min(Math.max(limit, 1), MAX_HISTORY_PAGE_SIZE);
    const filter: FilterQuery<Message> = dialogFilter(userId, otherId);

    if (before) {
      if (!isValidObjectId(before)) {
        throw new BadRequestException('Некорректный идентификатор сообщения');
      }
      const anchor = await this.messageModel.findById(before, { createdAt: 1 });
      if (anchor) {
        // При совпадении времени порядок задаёт _id — иначе сообщения,
        // созданные в одну миллисекунду, терялись бы на границе страниц.
        filter.$and = [
          {
            $or: [
              { createdAt: { $lt: anchor.createdAt } },
              { createdAt: anchor.createdAt, _id: { $lt: anchor._id } },
            ],
          },
        ];
      }
    }

    // Берём на одно больше, чтобы узнать, есть ли ещё страницы.
    const page = await this.messageModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(size + 1);

    const hasMore = page.length > size;
    return { messages: page.slice(0, size).reverse(), hasMore };
  }

  /** Список диалогов: собеседник, последнее сообщение и число непрочитанных. */
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
                { case: { $eq: ['$is_delivery', true] }, then: 'Работа сдана' },
                {
                  case: { $eq: ['$is_cancel', true] },
                  then: 'Предложение отменить заказ',
                },
                {
                  case: { $eq: ['$is_suggest', true] },
                  then: 'Предложение заказа',
                },
                {
                  case: { $ne: [{ $ifNull: ['$responseId', null] }, null] },
                  then: 'Отклик на заказ',
                },
                { case: { $eq: ['$mediaType', 'video'] }, then: 'Видео' },
                {
                  case: {
                    $and: [
                      { $eq: ['$mediaType', 'file'] },
                      { $eq: ['$text', ''] },
                    ],
                  },
                  then: { $concat: ['Файл: ', { $ifNull: ['$fileName', ''] }] },
                },
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
          isUnread: {
            $and: [
              { $eq: ['$receiverId', userId] },
              { $ne: ['$isRead', true] },
            ],
          },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$otherUserId',
          lastMessage: { $first: '$displayText' },
          lastMessageDate: { $first: '$createdAt' },
          // Служебное сообщение («Предложение принято…») — ничьё, без «Вы:».
          lastMessageMine: {
            $first: {
              $and: [
                { $eq: ['$senderId', userId] },
                { $ne: ['$status', 'server'] },
              ],
            },
          },
          isRead: { $first: '$isRead' },
          unreadCount: { $sum: { $cond: ['$isUnread', 1, 0] } },
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
          last_seen: '$user.last_seen',
          lastMessage: 1,
          lastMessageDate: 1,
          lastMessageMine: 1,
          isRead: 1,
          unreadCount: 1,
        },
      },
      { $sort: { lastMessageDate: -1 } },
    ]);
  }

  /** Непрочитанные входящие по собеседникам — для счётчика в шапке. */
  async getUnread(userId: string) {
    const rows: { _id: string; count: number }[] =
      await this.messageModel.aggregate([
        { $match: { receiverId: userId, isRead: { $ne: true } } },
        { $group: { _id: '$senderId', count: { $sum: 1 } } },
      ]);

    const byUser = Object.fromEntries(rows.map((r) => [r._id, r.count]));
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    return { total, byUser };
  }

  /** Отметить прочитанными все входящие от собеседника. */
  async markRead(userId: string, otherId: string) {
    const { modifiedCount } = await this.messageModel.updateMany(
      { senderId: otherId, receiverId: userId, isRead: { $ne: true } },
      { isRead: true },
    );
    return modifiedCount;
  }

  async findMessage(id: string): Promise<MessageDocument> {
    const message = await this.messageModel.findById(id);
    if (!message) {
      throw new NotFoundException('Сообщение не найдено');
    }
    return message;
  }

  /** Цитата для ответа. Отвечать можно только на сообщение из того же диалога. */
  async replySnapshot(replyToId: string, senderId: string, receiverId: string) {
    const original = await this.findMessage(replyToId);
    const sameDialog =
      (original.senderId === senderId && original.receiverId === receiverId) ||
      (original.senderId === receiverId && original.receiverId === senderId);
    if (!sameDialog) {
      throw new BadRequestException(
        'Ответить можно только на сообщение из этого диалога',
      );
    }

    const text =
      original.text ||
      (original.mediaType === 'file' ? (original.fileName ?? '') : '');
    return {
      id: original.id,
      senderId: original.senderId,
      text: text.slice(0, REPLY_PREVIEW_LENGTH),
      mediaType: original.mediaType,
    };
  }

  /**
   * Удалить можно своё обычное сообщение, ещё не принятое предложение заказа
   * или отмены (отозвать) или отклик без ответа. Служебные сообщения и предложения, на которые уже ответили,
   * — история сделки: раньше их можно было стереть, и пропадало, кто и
   * когда принял заказ.
   */
  async deleteMessage(id: string, userId: string) {
    const message = await this.findMessage(id);
    if (message.senderId !== userId) {
      throw new ForbiddenException('Удалить можно только своё сообщение');
    }
    if (!isDeletable(message)) {
      throw new ForbiddenException(
        'Это сообщение — часть истории сделки, его нельзя удалить',
      );
    }
    await message.deleteOne();
    return message;
  }

  /** Править можно текст своего обычного сообщения. */
  async editMessage(id: string, userId: string, text: string) {
    const message = await this.findMessage(id);
    if (message.senderId !== userId) {
      throw new ForbiddenException('Изменить можно только своё сообщение');
    }
    if (!isPlain(message)) {
      throw new ForbiddenException('Это сообщение нельзя изменить');
    }

    const trimmed = text.trim();
    if (!trimmed && message.mediaType === 'none') {
      throw new BadRequestException('Сообщение не может быть пустым');
    }
    message.text = trimmed;
    message.editedAt = new Date();
    await message.save();
    return message;
  }

  async setStatus(message: MessageDocument, status: MessageStatus) {
    message.status = status;
    await message.save();
    return message;
  }

  /** Есть ли по заказу предложение отмены без ответа. */
  async hasOpenCancel(orderId: string) {
    return !!(await this.messageModel.exists({
      orderId,
      is_cancel: true,
      status: { $nin: ['accepted', 'rejected'] },
    }));
  }

  /**
   * Когда у заказа появился исполнитель, остальные предложения и отклики
   * по нему больше не актуальны — отклоняем их, чтобы в чатах с другими
   * исполнителями не висели кнопки «Принять», которые всё равно вернут ошибку.
   * Так же закрываются сдача работы и предложение отмены, когда заказ
   * выполнен или отменён.
   */
  async closeOtherOffers(orderId: string, exceptId: string) {
    const offers = await this.messageModel.find({
      orderId,
      _id: { $ne: exceptId },
      $or: [
        { is_suggest: true },
        { status: 'response' },
        { is_delivery: true },
        { is_cancel: true },
      ],
      status: { $nin: ['accepted', 'rejected'] },
    });
    await this.messageModel.updateMany(
      { _id: { $in: offers.map((o) => o._id) } },
      { status: 'rejected' },
    );
    return offers;
  }
}

/** Обычное сообщение: текст и вложения, без карточек сделки. */
function isPlain(message: Message) {
  return (
    !message.is_suggest &&
    !message.is_delivery &&
    !message.is_cancel &&
    !message.responseId &&
    !message.status
  );
}

function isDeletable(message: Message) {
  if (isPlain(message)) return true;
  const answered =
    message.status === 'accepted' || message.status === 'rejected';
  // Отклик в статусе response — ещё без ответа заказчика.
  return (
    ((message.is_suggest || message.is_cancel) && !answered) ||
    message.status === 'response'
  );
}
