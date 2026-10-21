import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const MEDIA_TYPES = ['image', 'video', 'file', 'none'] as const;
export const MESSAGE_STATUSES = [
  'rejected',
  'accepted',
  'server',
  'response',
] as const;

export type MediaType = (typeof MEDIA_TYPES)[number];
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

const idTransform = {
  virtuals: true,
  versionKey: false,
  transform: (_: unknown, ret: Record<string, unknown>) => {
    ret.id = String(ret._id);
    delete ret._id;
    return ret;
  },
};

export type MessageDocument = HydratedDocument<Message>;

/**
 * Цитата сообщения, на которое отвечают. Хранится копией: если оригинал
 * удалят, ответ всё равно останется понятным.
 */
@Schema({ _id: false })
export class ReplySnapshot {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  senderId: string;

  @Prop({ default: '' })
  text: string;

  @Prop({ enum: MEDIA_TYPES, default: 'none' })
  mediaType: MediaType;
}

const ReplySnapshotSchema = SchemaFactory.createForClass(ReplySnapshot);

@Schema({ timestamps: true, toJSON: idTransform, toObject: idTransform })
export class Message {
  @Prop({ required: true, index: true })
  senderId: string;

  @Prop({ required: true, index: true })
  receiverId: string;

  @Prop({ default: '' })
  text: string;

  @Prop()
  mediaUrl?: string;

  @Prop({ enum: MEDIA_TYPES, default: 'none' })
  mediaType: MediaType;

  /** Исходное имя и размер файла — для mediaType = file. */
  @Prop()
  fileName?: string;

  @Prop()
  fileSize?: number;

  @Prop({ default: false })
  isRead: boolean;

  @Prop({ type: ReplySnapshotSchema })
  replyTo?: ReplySnapshot;

  /** Когда текст последний раз меняли. Нет — сообщение не редактировали. */
  @Prop()
  editedAt?: Date;

  /** Предложение заказа от заказчика исполнителю. */
  @Prop({ default: false })
  is_suggest: boolean;

  /** Исполнитель сдал работу по заказу, заказчик принимает или возвращает. */
  @Prop({ default: false })
  is_delivery: boolean;

  /** Одна сторона предлагает отменить заказ в работе, вторая соглашается или отказывается. */
  @Prop({ default: false })
  is_cancel: boolean;

  @Prop()
  orderId?: string;

  @Prop()
  responseId?: string;

  /**
   * server — служебное сообщение, response — отклик на заказ,
   * accepted / rejected — ответ на предложение, отклик или сдачу работы.
   * У предложения отмены accepted — отмена состоялась (по согласию или
   * без ответа второй стороны), rejected — не состоялась.
   */
  @Prop({ enum: MESSAGE_STATUSES })
  status?: MessageStatus;

  createdAt: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// История диалога: выборка по паре собеседников, новые сообщения первыми.
MessageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
// Непрочитанные: входящие без отметки о прочтении.
MessageSchema.index({ receiverId: 1, isRead: 1 });
