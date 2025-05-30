import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class Message {
  id: string;
  
  @Prop({ required: true })
  senderId: string;

  @Prop({ required: true })
  receiverId: string;

  @Prop()
  text?: string;

  @Prop()
  mediaUrl?: string;

  @Prop({ enum: ['image', 'video', 'none'], default: 'none' })
  mediaType: 'image' | 'video' | 'none';

  @Prop({ default: false })
  isRead: boolean;

  @Prop({ default: false })
  is_suggest: boolean;

  @Prop({ required: false })
  orderId: string;

  @Prop({ required: false })
  responseId: string;

  @Prop({ required: false })
  status: 'rejected' | 'accepted' | 'server' | 'response';
}

export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id; // Создаём поле `id`
    delete ret._id;   // Удаляем `_id`
  }
});

MessageSchema.set('toObject', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id;
    delete ret._id;
  }
});

export interface MessageDto {
  senderId: string;
  receiverId: string;
  text: string;
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'none';
  createdAt: string;
  is_suggest: boolean;
  status?: 'rejected' | 'accepted' | 'server' | 'response';
  orderId?: string;
  responseId?: string; 
}