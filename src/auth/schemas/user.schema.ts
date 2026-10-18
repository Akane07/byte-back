import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

/** Где исполнитель готов работать: удалённо, на месте или и так, и так. */
export const PERFORMER_FORMATS = ['remote', 'onsite', 'both'] as const;
export type PerformerFormat = (typeof PERFORMER_FORMATS)[number];

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

  /** SHA-256 кода восстановления пароля: сам код в базе не хранится. */
  @Prop({ select: false })
  reset_code?: string;

  @Prop({ select: false })
  reset_expires?: Date;

  /** Неверные попытки ввода кода восстановления. */
  @Prop({ select: false })
  reset_attempts?: number;

  /** Когда отправлено последнее письмо с кодом — для паузы между письмами. */
  @Prop({ select: false })
  code_sent_at?: Date;

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

  @ApiProperty({ example: 'Казань', description: 'Город' })
  @Prop({ default: '', index: true })
  city: string;

  /** Показывать в каталоге исполнителей («Принимаю заказы»). */
  @ApiProperty({ example: true, description: 'Принимает заказы' })
  @Prop({ default: false, index: true })
  is_performer: boolean;

  @ApiProperty({
    example: 'both',
    enum: PERFORMER_FORMATS,
    description: 'Где готов работать',
  })
  @Prop({ enum: PERFORMER_FORMATS, default: 'remote' })
  work_format: PerformerFormat;

  @ApiProperty({ example: [3, 4], description: 'Категории услуг, до 5' })
  @Prop({ type: [Number], default: [] })
  categories: number[];

  @ApiProperty({ example: 1500, description: 'Цена услуг «от», руб.' })
  @Prop({ min: 0 })
  price_from?: number;

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

  /** Средняя оценка как исполнителя (0 — отзывов нет). Считает ReviewService. */
  @ApiProperty({ example: 4.8, description: 'Рейтинг исполнителя' })
  @Prop({ default: 0 })
  rating: number;

  /**
   * Рейтинг для сортировки каталога — байесовское среднее: при малом числе
   * отзывов он тянется к средней оценке по площадке. Иначе один отзыв на 5★
   * стоял бы выше сотни отзывов на 4.9★.
   */
  @Prop({ default: 0, index: true })
  rating_score: number;

  @ApiProperty({ example: 4.9, description: 'Рейтинг заказчика' })
  @Prop({ default: 0 })
  customer_rating: number;

  @ApiProperty({
    example: 3,
    description: 'Отзывов о пользователе как заказчике',
  })
  @Prop({ default: 0 })
  customer_reviews_count: number;

  @ApiProperty({ example: 5, description: 'Количество опубликованных заказов' })
  @Prop({ default: 0 })
  orders_count: number;

  @ApiProperty({
    example: 5,
    description: 'Отзывов о пользователе как исполнителе',
  })
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
