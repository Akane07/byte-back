import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class Message {
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
}

export const MessageSchema = SchemaFactory.createForClass(Message);
