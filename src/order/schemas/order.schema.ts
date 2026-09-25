import { Prop, raw, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export const PRICE_TYPES = ['contract', 'fixed', 'hourly'] as const;
export const ORDER_TYPES = ['one-time', 'reusable'] as const;
export const DEADLINES = [
  'less-week',
  'more-week',
  'less-month',
  'more-month',
  'contract',
  'custom',
] as const;
export const ORDER_STATUSES = [
  'active',
  'pending',
  'completed',
  'cancelled',
] as const;

export type PriceType = (typeof PRICE_TYPES)[number];
export type OrderType = (typeof ORDER_TYPES)[number];
export type Deadline = (typeof DEADLINES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PriceRange = { from: number; to: number };
export type DateRange = { from: string; to: string };

/** Переводит _id в id и убирает служебный __v во всех ответах API. */
const idTransform = {
  virtuals: true,
  versionKey: false,
  transform: (_: unknown, ret: Record<string, unknown>) => {
    ret.id = String(ret._id);
    delete ret._id;
    return ret;
  },
};

export type OrderDocument = HydratedDocument<Order>;

@Schema({ toJSON: idTransform, toObject: idTransform })
export class Order {
  @ApiProperty({ example: '665f1c...', description: 'ID заказчика' })
  @Prop({ required: true, index: true })
  user_id: string;

  @ApiProperty({ example: 'Лендинг для кофейни', description: 'Название' })
  @Prop({ required: true })
  title: string;

  @ApiProperty({
    example: 'Нужен одностраничный сайт с меню и формой заказа',
    description: 'Описание',
  })
  @Prop({ default: '' })
  description: string;

  @ApiProperty({
    example: 15000,
    description: 'Цена: число или диапазон { from, to }',
  })
  @Prop({
    type: MongooseSchema.Types.Mixed,
    required: true,
    default: 0,
    validate: {
      validator: (value: unknown) =>
        typeof value === 'number' ||
        (typeof value === 'object' &&
          value !== null &&
          typeof (value as PriceRange).from === 'number' &&
          typeof (value as PriceRange).to === 'number'),
      message: 'price должен быть числом или объектом { from, to }',
    },
  })
  price: number | PriceRange;

  @ApiProperty({ example: 'fixed', enum: PRICE_TYPES, description: 'Тип цены' })
  @Prop({ required: true, enum: PRICE_TYPES })
  price_type: PriceType;

  @ApiProperty({
    example: 'one-time',
    enum: ORDER_TYPES,
    description: 'Тип заказа',
  })
  @Prop({ required: true, enum: ORDER_TYPES })
  type: OrderType;

  @ApiProperty({ example: true, description: 'Для экспертов' })
  @Prop({ default: false })
  for_experts: boolean;

  @ApiProperty({ example: 'contract', enum: DEADLINES, description: 'Сроки' })
  @Prop({ required: true, enum: DEADLINES })
  deadlines: Deadline;

  @ApiProperty({ required: false, description: 'Даты при deadlines = custom' })
  @Prop(raw({ from: String, to: String }))
  deadline_date?: DateRange;

  @ApiProperty({ example: ['Vue', 'Figma'], description: 'Навыки' })
  @Prop({ type: [String], default: [] })
  skills: string[];

  @ApiProperty({ example: 1, description: 'ID категории' })
  @Prop()
  category?: number;

  @ApiProperty({ example: 10, description: 'Количество откликов' })
  @Prop({ default: 0, min: 0 })
  response_count: number;

  @ApiProperty({ example: ['665f1c...'], description: 'Кто просмотрел' })
  @Prop({ type: [String], default: [] })
  viewed_by: string[];

  @ApiProperty({ example: true, description: 'Опубликован (false — в архиве)' })
  @Prop({ default: true })
  is_active: boolean;

  @ApiProperty({ example: false, description: 'Черновик' })
  @Prop({ default: false })
  draft: boolean;

  @ApiProperty({ example: '665f1c...', description: 'ID исполнителя' })
  @Prop()
  performer?: string;

  @ApiProperty({
    example: 'active',
    enum: ORDER_STATUSES,
    description: 'Статус сделки',
  })
  @Prop({ enum: ORDER_STATUSES, default: 'active' })
  status: OrderStatus;

  @ApiProperty({
    example: '2025-01-01T00:00:00.000Z',
    description: 'Дата публикации',
  })
  @Prop({ default: Date.now })
  created_at: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

export type OrderResponseDocument = HydratedDocument<OrderResponse>;

@Schema({ toJSON: idTransform, toObject: idTransform })
export class OrderResponse {
  @ApiProperty({ example: '665f1c...', description: 'ID заказа' })
  @Prop({ required: true, index: true })
  order_id: string;

  @ApiProperty({
    example: '665f1c...',
    description: 'ID исполнителя, оставившего отклик',
  })
  @Prop({ required: true, index: true })
  user_id: string;

  @ApiProperty({
    example: 'Сделаю за неделю, примеры работ в портфолио',
    description: 'Текст отклика',
  })
  @Prop({ required: true })
  description: string;

  @ApiProperty({
    required: false,
    description: 'ID сообщения с откликом в чате',
  })
  @Prop()
  messageId?: string;

  @ApiProperty({
    example: '2025-01-01T00:00:00.000Z',
    description: 'Дата отклика',
  })
  @Prop({ default: Date.now })
  created_at: Date;

  @ApiProperty({ example: false, description: 'Просмотрен заказчиком' })
  @Prop({ default: false })
  viewed: boolean;
}

export const OrderResponseSchema = SchemaFactory.createForClass(OrderResponse);
