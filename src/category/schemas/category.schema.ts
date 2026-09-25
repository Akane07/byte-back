import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';

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
}

export const CategorySchema = SchemaFactory.createForClass(Category);
