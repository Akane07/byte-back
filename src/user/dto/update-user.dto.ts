import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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
}
