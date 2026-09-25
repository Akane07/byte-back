import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * В multipart/form-data повторяющееся поле приходит массивом,
 * а единственное значение — строкой. Приводим к массиву всегда.
 */
const toArray = ({ value }: { value: unknown }) =>
  value === undefined || value === ''
    ? []
    : Array.isArray(value)
      ? value
      : [value];

const UPLOADED_FILE = /^\/uploads\/files\/[\w.-]+$/;

export class PortfolioDto {
  @ApiProperty({
    example: 'Интернет-магазин одежды',
    description: 'Название проекта',
  })
  @IsString()
  @IsNotEmpty({ message: 'Укажите название проекта' })
  @MaxLength(100)
  readonly title: string;

  @ApiProperty({
    example: 'Вёрстка и интеграция с API корзины',
    description: 'Описание',
  })
  @IsString()
  @IsNotEmpty({ message: 'Добавьте описание проекта' })
  @MaxLength(2000)
  readonly description: string;

  @ApiProperty({
    example: 'Frontend-разработчик',
    description: 'Роль в проекте',
  })
  @IsString()
  @IsNotEmpty({ message: 'Укажите свою роль в проекте' })
  @MaxLength(100)
  readonly role: string;

  @ApiPropertyOptional({
    example: ['Vue', 'Vite'],
    description: 'Навыки, до 10',
  })
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  readonly skills: string[] = [];
}

export class UpdatePortfolioDto extends PortfolioDto {
  @ApiPropertyOptional({
    example: ['/uploads/files/1700000000000-a1b2c3.jpg'],
    description: 'Уже загруженные картинки, которые остаются в проекте',
  })
  @Transform(toArray)
  @IsArray()
  @Matches(UPLOADED_FILE, { each: true })
  readonly photos: string[] = [];

  @ApiPropertyOptional({
    example: '/uploads/files/1700000000000-a1b2c3.mp4',
    description: 'Уже загруженное видео; пустая строка — удалить видео',
  })
  @IsOptional()
  @IsString()
  readonly video?: string;
}
