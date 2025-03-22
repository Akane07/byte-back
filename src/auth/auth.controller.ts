import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AccessToken, CreateUserDto, LoginUserDto, VerifyUserDto } from './dto/create-user.dto';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Регистрация', description: 'Регистрирует пользователя и возвращает токен.' })
  @ApiBody({ 
    type: CreateUserDto, 
    description: 'Данные нового пользователя', 
    required: true 
  })
  @ApiResponse({ status: 200, description: 'Токен', type: AccessToken })
  async register(@Body() createUserDto: CreateUserDto) {
    return this.authService.registerUser(createUserDto);
  }

  @ApiOperation({ summary: 'Вход', description: 'Авторизует пользователя и возвращает токен.' })
  @ApiBody({ 
    type: LoginUserDto, 
    description: 'Данные пользователя', 
    required: true 
  })
  @ApiResponse({ status: 200, description: 'Токен', type: AccessToken })
  @Post('login')
  async login(@Body() createUserDto: { email: string; password: string }) {
    return this.authService.loginUser(createUserDto.email, createUserDto.password);
  }

  @ApiOperation({ summary: 'Подтверждение кода', description: 'Подтверждает пользователя и возвращает токен.' })
  @ApiBody({ 
    type: VerifyUserDto, 
    description: 'Токен пользователя', 
    required: true 
  })
  @ApiResponse({ status: 200, description: 'Токен', type: AccessToken })
  @Post('verify')
  async verify(@Body() token: { token: string }) {
    return this.authService.verifyUser(token.token);
  }
}
