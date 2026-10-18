import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { REVIEW_ROLES, ReviewRole } from '../schemas/review.schema';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateReviewDto {
  @ApiProperty({ description: 'Завершённый заказ' })
  @IsMongoId()
  orderId: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({
    example: 'Сделал раньше срока, всё аккуратно',
    description: 'Обязателен при оценке 1–2: низкую оценку нужно объяснить',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  text: string = '';
}

export class ReplyReviewDto {
  @ApiProperty({ example: 'Спасибо за отзыв!' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Ответ не может быть пустым' })
  @MaxLength(1000)
  text: string;
}

export class ReviewListQueryDto {
  @ApiPropertyOptional({ enum: REVIEW_ROLES, default: 'performer' })
  @IsOptional()
  @IsIn(REVIEW_ROLES)
  role: ReviewRole = 'performer';

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page: number = 1;
}
