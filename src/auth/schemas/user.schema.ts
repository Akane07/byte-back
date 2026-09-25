import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema()
export class User {
  @ApiProperty({ example: 'ivan@example.com', description: 'Почта' })
  @Prop({ required: true, unique: true })
  email: string;

  // Поля ниже помечены select: false — без явного .select('+поле')
  // они не загружаются и не могут случайно попасть в ответ API.
  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ required: true, select: false })
  salt: string;

  /** Число итераций PBKDF2. У старых записей поля нет — это 1000. */
  @Prop({ select: false })
  hash_iterations?: number;

  @Prop({ select: false })
  verification_token?: string;

  @ApiProperty({ example: 'Иван Петров', description: 'Имя' })
  @Prop({ default: '' })
  name: string;

  @ApiProperty({ example: 'ivan_dev', description: 'Ник' })
  @Prop({ default: '' })
  nickname: string;

  @ApiProperty({ example: 'Frontend-разработчик', description: 'О себе' })
  @Prop({ default: '' })
  description: string;

  @ApiProperty({ example: '+79281112233', description: 'Телефон' })
  @Prop({ default: '' })
  phone: string;

  @ApiProperty({ example: '/uploads/avatars/1.jpg', description: 'Аватар' })
  @Prop({ default: '' })
  avatar: string;

  @ApiProperty({ example: true, description: 'Подтверждена ли почта' })
  @Prop({ default: false })
  is_verified: boolean;

  @ApiProperty({ example: 'Россия', description: 'Страна' })
  @Prop({ default: '' })
  country: string;

  @ApiProperty({
    example: '2025-01-01T00:00:00.000Z',
    description: 'Последний вход',
  })
  @Prop()
  last_seen?: string;

  @ApiProperty({
    example: '2025-01-01T00:00:00.000Z',
    description: 'Регистрация',
  })
  @Prop({ default: Date.now })
  created_at: Date;

  @ApiProperty({ example: 5, description: 'Рейтинг' })
  @Prop({ default: 0 })
  rating: number;

  @ApiProperty({ example: 5, description: 'Количество опубликованных заказов' })
  @Prop({ default: 0 })
  orders_count: number;

  @ApiProperty({ example: 5, description: 'Количество отзывов' })
  @Prop({ default: 0 })
  reviews_count: number;

  @ApiProperty({ example: ['Vue', 'TypeScript'], description: 'Навыки' })
  @Prop({ type: [String], default: [] })
  skills: string[];

  @ApiProperty({ example: 'Vue-разработчик', description: 'Специальность' })
  @Prop({ default: '' })
  speciality: string;

  @ApiProperty({ example: 'https://t.me/username', description: 'Telegram' })
  @Prop({ default: '' })
  telegram: string;

  @ApiProperty({
    example: 'https://behance.net/username',
    description: 'Behance',
  })
  @Prop({ default: '' })
  behance: string;

  @ApiProperty({
    example: 'https://github.com/username',
    description: 'GitHub / GitLab',
  })
  @Prop({ default: '' })
  git: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
