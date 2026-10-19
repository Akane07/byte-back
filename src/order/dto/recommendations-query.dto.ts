import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class RecommendationsQueryDto {
  @ApiPropertyOptional({ example: 10, minimum: 1, maximum: 20, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  readonly limit: number = 10;

  @ApiPropertyOptional({
    type: Boolean,
    example: 1,
    description:
      '1 — добавить каждому исполнителю поле ranking с разбором score и вкладами факторов',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  readonly explain?: boolean;
}
