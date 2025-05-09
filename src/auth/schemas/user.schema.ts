import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema()
export class User {
  id: string;

  @ApiProperty({ example: 'john_doe@example.com', description: 'Логин пользователя' })
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true })
  salt: string;

  @ApiProperty({ example: 'John Doe', description: 'Имя пользователя' })
  @Prop({ default: "" })
  name: string;

  @ApiProperty({ example: 'John228', description: 'Ник пользователя' })
  @Prop({ default: "" })
  nickname: string;

  @ApiProperty({ example: 'description', description: 'Описание пользователя' })
  @Prop({ required: false })
  description: string;

  @ApiProperty({ example: '89281112233', description: 'Номер телефона' })
  @Prop({ required: false })
  phone: string;

  @ApiProperty({ example: 'avatar', description: 'Аватар пользователя' })
  @Prop({ default: "" })
  avatar: string;

  @ApiProperty({ example: true, description: 'Подтвержден ли email' })
  @Prop({ default: false })
  is_verified: boolean;

  @Prop({ required: false })
  verification_token: string | null; // Токен для подтверждения email

  @ApiProperty({ example: 'Russia', description: 'Страна пользователя' })
  @Prop({ required: false })
  country: string | null;

  @ApiProperty({ example: '2022-01-01T00:00:00.000Z', description: 'Дата последнего входа' })
  @Prop({ required: false })
  last_seen: string | null;

  @ApiProperty({ example: '2022-01-01T00:00:00.000Z', description: 'Дата создания аккаунта' })
  @Prop({ default: Date.now })
  created_at: Date;

  @ApiProperty({ example: 5, description: 'Рейтинг пользователя' })
  @Prop({ default: 0 })
  rating: number;

  @ApiProperty({ example: 5, description: 'Количество заказов пользователя' })
  @Prop({ default: 0 })
  orders_count: number;

  @ApiProperty({ example: 5, description: 'Количество отзывов пользователя' })
  @Prop({ default: 0 })
  reviews_count: number;

  @ApiProperty({ example: ['Vue', 'React', 'Angular'], description: 'Массив навыков' })
  @Prop({ default: [] })
  skills: string[];

  @ApiProperty({ example: 'Vue разработчик', description: 'Специальность' })
  @Prop({ default: '' })
  speciality: string;

  @ApiProperty({ example: '@LinerMVVM', description: 'Ссылка на аккаунт' })
  @Prop({ default: '' })
  telegram: string;

  @ApiProperty({ example: '@LinerMVVM', description: 'Ссылка на аккаунт' })
  @Prop({ default: '' })
  behance: string;

  @ApiProperty({ example: '@LinerMVVM', description: 'Ссылка на аккаунт' })
  @Prop({ default: '' })
  git: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

export class ChangePasswordDto {
  @ApiProperty({ example: 'password', description: 'Пароль пользователя' })
  password: string;

  @ApiProperty({ example: 'new password', description: 'Пароль пользователя' })
  newPassword: string;
}
