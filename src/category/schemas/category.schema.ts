import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { CATEGORY_FORMATS, type CategoryFormat } from '../constants/categories';

const hideMongoId = {
  versionKey: false,
  transform: (_: unknown, ret: Record<string, unknown>) => {
    delete ret._id;
    return ret;
  },
};

@Schema({ toJSON: hideMongoId, toObject: hideMongoId })
export class Category {
  // Числовой id задаётся вручную и используется в заказах и в справочнике навыков.
  @ApiProperty({ example: 1 })
  @Prop({ unique: true, required: true })
  id: number;

  @ApiProperty({ example: 'Веб-разработка' })
  @Prop({ required: true })
  title: string;

  @ApiProperty({
    example: 'remote',
    enum: CATEGORY_FORMATS,
    description:
      'remote — удалённо, onsite — на месте, any — бывает по-разному',
  })
  @Prop({ enum: CATEGORY_FORMATS, default: 'remote' })
  format: CategoryFormat;

  /** Порядок в списках: сначала удалённые, потом смешанные, потом на месте. */
  @ApiProperty({ example: 1 })
  @Prop({ default: 0 })
  order: number;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
