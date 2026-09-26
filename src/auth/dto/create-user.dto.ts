import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/** Минимум 8 символов, хотя бы одна латинская буква и одна цифра. */
export const PASSWORD_REGEX =
  /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~]{8,}$/;
export const PASSWORD_MESSAGE =
  'Пароль должен содержать не менее 8 символов, из которых минимум 1 латинская буква и 1 цифра';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateUserDto {
  @ApiPropertyOptional({
    example: 'Иван Петров',
    description: 'Имя. Если не указано — берётся часть почты до @',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly name?: string;

  @ApiProperty({ example: 'ivan@example.com', description: 'Почта' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Некорректный адрес почты' })
  readonly email: string;

  @ApiProperty({ example: 'password123', description: 'Пароль' })
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  readonly password: string;
}

export class LoginUserDto {
  @ApiProperty({ example: 'ivan@example.com', description: 'Почта' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Некорректный адрес почты' })
  readonly email: string;

  @ApiProperty({ example: 'password123', description: 'Пароль' })
  @IsString()
  @IsNotEmpty({ message: 'Введите пароль' })
  readonly password: string;
}

export class VerifyUserDto {
  @ApiProperty({ example: 'ivan@example.com', description: 'Почта' })
  @Transform(normalizeEmail)
  @IsEmail()
  readonly email: string;

  @ApiProperty({ example: '123456', description: 'Код из письма' })
  @IsString()
  @IsNotEmpty()
  readonly token: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'password123', description: 'Текущий пароль' })
  @IsString()
  @IsNotEmpty({ message: 'Введите текущий пароль' })
  readonly password: string;

  @ApiProperty({ example: 'newPassword123', description: 'Новый пароль' })
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  readonly newPassword: string;
}

export class RecoveryRequestDto {
  @ApiProperty({ example: 'ivan@example.com', description: 'Почта' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Некорректный адрес почты' })
  readonly email: string;
}

export class RecoveryCodeDto extends RecoveryRequestDto {
  @ApiProperty({ example: '123456', description: 'Код из письма' })
  @Matches(/^\d{6}$/, { message: 'Код состоит из 6 цифр' })
  readonly code: string;
}

export class ResetPasswordDto extends RecoveryCodeDto {
  @ApiProperty({ example: 'newPassword123', description: 'Новый пароль' })
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  readonly password: string;
}

export class AccessToken {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...', description: 'JWT' })
  readonly access_token: string;
}
