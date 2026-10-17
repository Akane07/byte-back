import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  PERFORMER_FORMATS,
  PerformerFormat,
} from '../../auth/schemas/user.schema';
import { CATEGORY_IDS } from '../../category/constants/categories';
import { CITIES } from '../../common/cities';

/**
 * Поля профиля, которые пользователь может менять сам.
 * Всё, чего здесь нет (email, рейтинг, счётчики, пароль), глобальный
 * ValidationPipe с whitelist отбрасывает ещё до сервиса.
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Иван Петров' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'ivan_dev' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  nickname?: string;

  @ApiPropertyOptional({ example: 'Делаю лендинги на Vue' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: '+79281112233' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'Россия' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ example: 'Vue-разработчик' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  speciality?: string;

  @ApiPropertyOptional({ example: ['Vue', 'TypeScript'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  skills?: string[];

  @ApiPropertyOptional({ example: 'https://t.me/username' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  telegram?: string;

  @ApiPropertyOptional({ example: 'https://behance.net/username' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  behance?: string;

  @ApiPropertyOptional({ example: 'https://github.com/username' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  git?: string;

  @ApiPropertyOptional({
    example: 'Казань',
    description: 'Город, пусто — не указан',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsIn(CITIES, { message: 'Выберите город из списка' })
  city?: string;

  @ApiPropertyOptional({ example: true, description: 'Принимаю заказы' })
  @IsOptional()
  @IsBoolean()
  is_performer?: boolean;

  @ApiPropertyOptional({ example: 'both', enum: PERFORMER_FORMATS })
  @IsOptional()
  @IsIn(PERFORMER_FORMATS)
  work_format?: PerformerFormat;

  @ApiPropertyOptional({
    example: [3, 4],
    description: 'Категории услуг, до 5',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsIn(CATEGORY_IDS, { each: true })
  categories?: number[];

  @ApiPropertyOptional({
    example: 1500,
    description: 'Цена «от», руб.; null — убрать',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  price_from?: number | null;
}

const toIntArray = ({ value }: { value: unknown }) =>
  (Array.isArray(value) ? value : [value])
    .filter((v) => v !== undefined && v !== '')
    .map(Number);

export const SPECIALISTS_PAGE_SIZE = 12;

/** Фильтры каталога исполнителей. */
export class SpecialistsQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  readonly page: number = 1;

  @ApiPropertyOptional({ description: 'Имя, специальность, навыки, о себе' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly q?: string;

  @ApiPropertyOptional({ type: [Number], description: 'ID категорий' })
  @IsOptional()
  @Transform(toIntArray)
  @IsInt({ each: true })
  readonly categories?: number[];

  @ApiPropertyOptional({
    enum: ['remote', 'onsite'],
    description: 'Работает удалённо / выезжает на место',
  })
  @IsOptional()
  @IsIn(['remote', 'onsite'])
  readonly format?: 'remote' | 'onsite';

  @ApiPropertyOptional({ example: 'Казань' })
  @IsOptional()
  @IsIn(CITIES)
  readonly city?: string;
}
