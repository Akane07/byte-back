import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  AccessToken,
  CreateUserDto,
  LoginUserDto,
  VerifyUserDto,
} from './dto/create-user.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Регистрация',
    description:
      'Создаёт пользователя, отправляет код на почту и возвращает токен.',
  })
  @ApiResponse({ status: 200, description: 'Токен', type: AccessToken })
  register(@Body() dto: CreateUserDto) {
    return this.authService.registerUser(dto);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Вход',
    description: 'Проверяет пароль и возвращает токен.',
  })
  @ApiResponse({ status: 200, description: 'Токен', type: AccessToken })
  login(@Body() dto: LoginUserDto) {
    return this.authService.loginUser(dto.email, dto.password);
  }

  @Post('verify')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Подтверждение почты',
    description: 'Подтверждает почту кодом из письма и возвращает токен.',
  })
  @ApiResponse({ status: 200, description: 'Токен', type: AccessToken })
  verify(@Body() dto: VerifyUserDto) {
    return this.authService.verifyUser(dto.email, dto.token);
  }
}
