import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateBy,
  ValidateNested,
  ValidationOptions,
} from 'class-validator';
import {
  DEADLINES,
  Deadline,
  ORDER_TYPES,
  OrderType,
  PRICE_TYPES,
  PriceRange,
  PriceType,
} from '../schemas/order.schema';

const MAX_PRICE = 10_000_000;

/** Цена — неотрицательное число или диапазон { from, to }, где from <= to. */
function IsPrice(options?: ValidationOptions) {
  const inRange = (n: unknown) =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MAX_PRICE;

  return ValidateBy(
    {
      name: 'isPrice',
      validator: {
        validate: (value: unknown) => {
          if (typeof value === 'number') return inRange(value);
          if (typeof value !== 'object' || value === null) return false;
          const { from, to } = value as PriceRange;
          return inRange(from) && inRange(to) && from <= to;
        },
        defaultMessage: () =>
          `price должен быть числом от 0 до ${MAX_PRICE} или диапазоном { from, to }`,
      },
    },
    options,
  );
}

export class DateRangeDto {
  @ApiProperty({ example: 'Mon Sep 01 2025' })
  @IsString()
  from: string;

  @ApiProperty({ example: 'Tue Sep 30 2025' })
  @IsString()
  to: string;
}

export class CreateOrderDto {
  @ApiProperty({ example: 'Лендинг для кофейни', description: 'Название' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите название заказа' })
  @MaxLength(200)
  readonly title: string;

  @ApiPropertyOptional({
    example: 'Нужен одностраничный сайт с меню',
    description: 'Описание',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  readonly description?: string;

  @ApiProperty({ example: 15000, description: 'Цена: число или { from, to }' })
  @IsPrice()
  readonly price: number | PriceRange;

  @ApiProperty({ example: 'fixed', enum: PRICE_TYPES })
  @IsIn(PRICE_TYPES)
  readonly price_type: PriceType;

  @ApiProperty({ example: 'one-time', enum: ORDER_TYPES })
  @IsIn(ORDER_TYPES)
  readonly type: OrderType;

  @ApiProperty({ example: false, description: 'Для экспертов' })
  @IsBoolean()
  readonly for_experts: boolean;

  @ApiProperty({ example: 'contract', enum: DEADLINES })
  @IsIn(DEADLINES)
  readonly deadlines: Deadline;

  @ApiPropertyOptional({ type: DateRangeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeDto)
  readonly deadline_date?: DateRangeDto;

  @ApiProperty({ example: ['Vue', 'Figma'], description: 'Навыки, до 10' })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  readonly skills: string[];

  @ApiPropertyOptional({ example: 1, description: 'ID категории' })
  @IsOptional()
  @IsInt()
  readonly category?: number;

  @ApiPropertyOptional({
    example: false,
    description: 'Сохранить как черновик',
  })
  @IsOptional()
  @IsBoolean()
  readonly draft?: boolean;
}

export class UpdateOrderDto extends PartialType(CreateOrderDto) {
  @ApiPropertyOptional({
    example: true,
    description: 'false — отправить в архив',
  })
  @IsOptional()
  @IsBoolean()
  readonly is_active?: boolean;
}

export class CreateResponseDto {
  @ApiProperty({
    example: 'Сделаю за неделю, примеры работ в портфолио',
    description: 'Текст отклика',
  })
  @IsString()
  @IsNotEmpty({ message: 'Отклик не может быть пустым' })
  @MaxLength(2000)
  readonly description: string;
}

const toIntArray = ({ value }: { value: unknown }) =>
  (Array.isArray(value) ? value : [value])
    .filter((v) => v !== undefined && v !== '')
    .map(Number);

export class OrderListQueryDto {
  @ApiPropertyOptional({ example: 1, description: 'Страница, с 1' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  readonly page: number = 1;

  // ?categories=1&categories=2 приходит массивом, а ?categories=1 — строкой.
  @ApiPropertyOptional({ type: [Number], description: 'ID категорий' })
  @IsOptional()
  @Transform(toIntArray)
  @IsInt({ each: true })
  readonly categories?: number[];
}
