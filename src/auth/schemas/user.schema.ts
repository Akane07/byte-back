import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema()
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true })
  salt: string;

  @Prop({ default: "" })
  name: string;

  @Prop({ required: false })
  description: string;

  @Prop({ default: "" })
  avatar: string;

  @Prop({ default: false })
  isVerified: boolean;

  @Prop({ required: false })
  verificationToken: string | null; // Токен для подтверждения email

  @Prop({ required: false })
  country: string | null;

  @Prop({ required: false })
  last_seen: string | null;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: 0 })
  rating: number;

  @Prop({ default: 0 })
  orders_count: number;

  @Prop({ default: 0 })
  reviews_count: number;

  @Prop({ default: [] })
  speciality: string[];
}

export const UserSchema = SchemaFactory.createForClass(User);
