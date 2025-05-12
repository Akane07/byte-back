import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document } from 'mongoose';

class DateType {
  @Prop({ required: true })
  from: string;

  @Prop({ required: true })
  to: string;
}

class PriceType {
  @Prop({ required: true })
  from: number;

  @Prop({ required: true })
  to: number;
}

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
  @Prop({ required: false })
  description: string;

  @ApiProperty({ example: 123, description: 'Цена' })
  @Prop({
    required: true,
    default: 0,
    validate: {
      validator: function (value) {
        return (
          typeof value === 'number' ||
          (value &&
            typeof value === 'object' &&
            typeof value.from === 'number' &&
            typeof value.to === 'number')
        );
      },
      message: 'price must be a number or an object with from/to numbers',
    },
    type: Object,
  })
  price: number | PriceType;

  @ApiProperty({ example: 'fixed', description: 'Тип цены', enum: ['contract', 'fixed'] })
  @Prop({ required: true })
  price_type: 'contract' | 'fixed' | 'hourly';

  @ApiProperty({ example: 'one-time', description: 'Тип заказа', enum: ['one-time', 'reusable'] })
  @Prop({ required: true })
  type: 'one-time' | 'reusable';

  @ApiProperty({ example: true, description: 'Для экспертов' })
  @Prop({ required: true })
  for_experts: boolean;

  @ApiProperty({ example: 'contract', description: 'Дедлайны. enum, или строка ISO даты', enum: ['contract', 'more-than-month', 'less-than-month'] })
  @Prop({ required: true })
  deadlines: 'less-week' | 'more-week' | 'less-month' | 'more-month' | 'contract' | 'custom';

  @Prop({ required: false })
  deadline_date?: DateType;

  @ApiProperty({ example: ['Vue', 'React', 'Angular'], description: 'Массив навыков' })
  @Prop({ required: true })
  skills: string[];

  @ApiProperty({ example: 1, description: 'ID категории' })
  @Prop({ required: false })
  category: number;

  @ApiProperty({ example: '10', description: 'Количество откликов' })
  @Prop({ required: true, default: 0 })
  response_count: number;

  @ApiProperty({ example: ['1', '2'], description: 'Массив просмотренных ID пользователей' })
  @Prop({ type: [String], default: [] })
  viewed_by: string[];

  @ApiProperty({ example: true, description: 'Активен ли заказ' })
  @Prop({ required: true, default: true })
  is_active: boolean;

  @ApiProperty({ example: true, description: 'Черновик ли это' })
  @Prop({ required: true, default: false })
  draft: boolean;

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

  @Prop({ required: true, default: false })
  viewed: boolean;
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