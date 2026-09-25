import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const MEDIA_TYPES = ['image', 'video', 'none'] as const;
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

  @Prop({ default: false })
  isRead: boolean;

  /** Предложение заказа от заказчика исполнителю. */
  @Prop({ default: false })
  is_suggest: boolean;

  @Prop()
  orderId?: string;

  @Prop()
  responseId?: string;

  /**
   * server — служебное сообщение, response — отклик на заказ,
   * accepted / rejected — ответ на предложение или отклик.
   */
  @Prop({ enum: MESSAGE_STATUSES })
  status?: MessageStatus;

  createdAt: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
