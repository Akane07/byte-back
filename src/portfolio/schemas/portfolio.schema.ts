import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document } from 'mongoose';

export type PortfolioDocument = Portfolio & Document;

@Schema()
export class Portfolio {
  id: string;

  @ApiProperty({ example: '1', description: 'ID пользователя' })
  @Prop({ required: true })
  user_id: string;

  @ApiProperty({ example: 'Отсосать хуй', description: 'Название проекта для портфолио' })
  @Prop({ required: true })
  title: string;

  @ApiProperty({ example: 'Отсосать хую!!!!!!', description: 'Описание проекта в портфолио' })
  @Prop({ required: true })
  description: string;

  @ApiProperty({ example: 'Франтент разаабачик', description: 'Роль пользователя в проекте' })
  @Prop({ required: true, default: '' })
  role: string;

  @ApiProperty({ example: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'], description: 'Массив ссылок на изображения' })
  @Prop({ required: true })
  images: string[];

  @ApiProperty({ example: '2022-01-01T00:00:00.000Z', description: 'Дата создания' })
  @Prop({ required: true, default: Date.now })
  created_at: Date;

  @ApiProperty({ example: true, description: 'Черновик ли это' })
  @Prop({ required: false })
  readonly draft?: boolean;
}

export const PortfolioSchema = SchemaFactory.createForClass(Portfolio);

PortfolioSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id; // Создаём поле `id`
    delete ret._id;   // Удаляем `_id`
  }
});

PortfolioSchema.set('toObject', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id;
    delete ret._id;
  }
});