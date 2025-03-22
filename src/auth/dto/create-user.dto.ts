import { ApiProperty } from "@nestjs/swagger";

export class CreateUserDto {
  @ApiProperty({ example: 'John Doe', description: 'Имя пользователя' })
  readonly name: string;

  @ApiProperty({ example: 'john_doe@example.com', description: 'Логин пользователя' })
  readonly email: string;

  @ApiProperty({ example: 'password', description: 'Пароль пользователя' })
  readonly password: string;
}

export class LoginUserDto {
  @ApiProperty({ example: 'john_doe@example.com', description: 'Логин пользователя' })
  readonly email: string;

  @ApiProperty({ example: 'password', description: 'Пароль пользователя' })
  readonly password: string;
}

export class VerifyUserDto {
  @ApiProperty({ example: '123456', description: 'Токен пользователя из письма' })
  readonly token: string;
}

export class AccessToken {
  @ApiProperty({ example: '123456', description: 'Токен пользователя' })
  readonly access_token: string;
}