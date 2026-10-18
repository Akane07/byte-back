import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { HydratedDocument } from 'mongoose';

/** Роль того, о ком отзыв: оценивали его как исполнителя или как заказчика. */
export const REVIEW_ROLES = ['performer', 'customer'] as const;
export type ReviewRole = (typeof REVIEW_ROLES)[number];

const idTransform = {
  virtuals: true,
  versionKey: false,
  transform: (_: unknown, ret: Record<string, unknown>) => {
    ret.id = String(ret._id);
    delete ret._id;
    return ret;
  },
};

@Schema({ _id: false })
export class ReviewReply {
  @ApiProperty({ example: 'Спасибо, рад был помочь!' })
  @Prop({ required: true })
  text: string;

  @ApiProperty()
  @Prop({ default: Date.now })
  created_at: Date;
}

const ReviewReplySchema = SchemaFactory.createForClass(ReviewReply);

export type ReviewDocument = HydratedDocument<Review>;

/**
 * Отзыв по завершённому заказу. Каждая сторона сделки оставляет не больше
 * одного отзыва о другой.
 *
 * Отзывы «слепые»: пока published = false, отзыв не виден никому, кроме
 * автора, и не влияет на рейтинг. Он открывается, когда вторая сторона тоже
 * оставит отзыв, или в publish_at — когда закроется окно для отзывов.
 * Так нельзя ответить плохим отзывом на плохой отзыв.
 */
@Schema({ toJSON: idTransform, toObject: idTransform })
export class Review {
  @ApiProperty({ description: 'Заказ' })
  @Prop({ required: true, index: true })
  order_id: string;

  @ApiProperty({ description: 'Кто оставил отзыв' })
  @Prop({ required: true, index: true })
  author_id: string;

  @ApiProperty({ description: 'О ком отзыв' })
  @Prop({ required: true, index: true })
  target_id: string;

  @ApiProperty({ enum: REVIEW_ROLES, description: 'В какой роли оценивали' })
  @Prop({ required: true, enum: REVIEW_ROLES })
  target_role: ReviewRole;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @ApiProperty({ example: 'Всё сделано быстро и аккуратно' })
  @Prop({ default: '' })
  text: string;

  @ApiProperty({ required: false, type: ReviewReply })
  @Prop({ type: ReviewReplySchema })
  reply?: ReviewReply;

  @ApiProperty()
  @Prop({ default: false, index: true })
  published: boolean;

  /** Когда отзыв откроется сам, даже без ответного. */
  @Prop({ required: true, index: true })
  publish_at: Date;

  @ApiProperty({ required: false })
  @Prop()
  published_at?: Date;

  @ApiProperty()
  @Prop({ default: Date.now })
  created_at: Date;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

// Один отзыв от каждой стороны на заказ — защита и от двойного клика.
ReviewSchema.index({ order_id: 1, author_id: 1 }, { unique: true });
// Лента отзывов в профиле.
ReviewSchema.index({
  target_id: 1,
  target_role: 1,
  published: 1,
  published_at: -1,
});
