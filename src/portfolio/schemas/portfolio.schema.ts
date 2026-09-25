import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { HydratedDocument } from 'mongoose';

export type PortfolioDocument = HydratedDocument<Portfolio>;

@Schema()
export class Portfolio {
  @ApiProperty({ example: '665f1c...', description: 'ID автора' })
  @Prop({ required: true, index: true })
  user_id: string;

  @ApiProperty({
    example: 'Интернет-магазин одежды',
    description: 'Название проекта',
  })
  @Prop({ required: true })
  title: string;

  @ApiProperty({
    example: 'Вёрстка и интеграция с API корзины',
    description: 'Описание',
  })
  @Prop({ required: true })
  description: string;

  @ApiProperty({
    example: 'Frontend-разработчик',
    description: 'Роль в проекте',
  })
  @Prop({ default: '' })
  role: string;

  @ApiProperty({ example: ['Vue', 'Vite'], description: 'Навыки' })
  @Prop({ type: [String], default: [] })
  skills: string[];

  @ApiProperty({
    example: ['665f1c...'],
    description: 'Кто просмотрел (в ответе API — число)',
  })
  @Prop({ type: [String], default: [] })
  viewed_by: string[];

  @ApiProperty({ example: ['665f1c...'], description: 'Кто поставил лайк' })
  @Prop({ type: [String], default: [] })
  liked_by: string[];

  @ApiProperty({
    example: ['/uploads/files/1.jpg'],
    description: 'Картинки, первая — обложка',
  })
  @Prop({ type: [String], default: [] })
  images: string[];

  @ApiProperty({ example: '/uploads/files/1.mp4', description: 'Видео' })
  @Prop()
  video?: string;

  @ApiProperty({
    example: '2025-01-01T00:00:00.000Z',
    description: 'Дата создания',
  })
  @Prop({ default: Date.now })
  created_at: Date;
}

export const PortfolioSchema = SchemaFactory.createForClass(Portfolio);
