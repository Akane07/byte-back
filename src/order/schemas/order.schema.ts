import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document } from 'mongoose';


// Order
export type OrderDocument = Order & Document;

@Schema()
export class Order {

  @ApiProperty({ example: '1', description: 'ID пользователя' })
  @Prop({ required: true })
  user_id: string;

  @ApiProperty({ example: 'Отсосать хуй', description: 'Название заказа' })
  @Prop({ required: true })
  title: string;

  @ApiProperty({ example: 'Отсосать хую!!!!!!', description: 'Описание заказа' })
  @Prop({ required: true })
  description: string;

  @ApiProperty({ example: 123, description: 'Цена' })
  @Prop({ required: true, default: 0 })
  price?: number;

  @ApiProperty({ example: 'fixed', description: 'Тип цены', enum: ['contract', 'fixed'] })
  @Prop({ required: true })
  price_type: 'contract' | 'fixed'; // договорная или фиксированная цена

  @ApiProperty({ example: 'one-time', description: 'Тип заказа', enum: ['one-time', 'reusable'] })
  @Prop({ required: true })
  type: 'one-time' | 'reusable';

  @ApiProperty({ example: true, description: 'Для экспертов' })
  @Prop({ required: true })
  for_experts: boolean;

  @ApiProperty({ example: 'contract', description: 'Дедлайны. enum, или строка ISO даты', enum: ['contract', 'more-than-month', 'less-than-month'] })
  @Prop({ required: true })
  deadlines: 'contract' | 'more-than-month' | 'less-than-month' | string;

  @ApiProperty({ example: ['Vue', 'React', 'Angular'], description: 'Массив навыков' })
  @Prop({ required: true })
  skills: string[];

  @ApiProperty({ example: '1', description: 'ID категории' })
  @Prop({ required: true })
  category: string;

  @ApiProperty({ example: '10', description: 'Количество откликов' })
  @Prop({ required: true, default: 0 })
  response_count: number;

  @ApiProperty({ example: ['1', '2'], description: 'Массив просмотренных ID пользователей' })
  @Prop({ type: [String], default: [] })
  viewed_by: string[];

  @ApiProperty({ example: true, description: 'Активен ли заказ' })
  @Prop({ required: true, default: true })
  is_active: boolean;

  @ApiProperty({ example: '2022-01-01T00:00:00.000Z', description: 'Дата создания' })
  @Prop({ required: true, default: Date.now })
  created_at: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id; // Создаём поле `id`
    delete ret._id;   // Удаляем `_id`
  }
});

OrderSchema.set('toObject', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id;
    delete ret._id;
  }
});


// OrderResponse
export type OrderResponseDocument = OrderResponse & Document;

@Schema()
export class OrderResponse {

  @ApiProperty({ example: '1', description: 'ID заказа' })
  @Prop({ required: true })
  order_id: string;

  @ApiProperty({ example: '1', description: 'ID пользователя' })
  @Prop({ required: true })
  user_id: string;

  @ApiProperty({ example: 'Отсосать хую!!!!!!', description: 'Описание отклика' })
  @Prop({ required: true })
  description: string;

  @ApiProperty({ example: '2022-01-01T00:00:00.000Z', description: 'Дата создания' })
  @Prop({ required: true, default: Date.now })
  created_at: Date;
}

export const OrderResponseSchema = SchemaFactory.createForClass(OrderResponse);

OrderResponseSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id; // Создаём поле `id`
    delete ret._id;   // Удаляем `_id`
  }
});

OrderResponseSchema.set('toObject', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id;
    delete ret._id;
  }
});