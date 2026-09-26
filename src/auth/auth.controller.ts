import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { UserId } from './current-user.decorator';
import {
  AccessToken,
  CreateUserDto,
  LoginUserDto,
  RecoveryCodeDto,
  RecoveryRequestDto,
  ResetPasswordDto,
  VerifyUserDto,
} from './dto/create-user.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

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

  @Post('verify/resend')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Повторная отправка кода подтверждения',
    description: 'Не чаще раза в минуту, иначе 429.',
  })
  resendVerification(@UserId() userId: string) {
    return this.authService.resendVerification(userId);
  }

  @Post('recovery')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Восстановление пароля: запросить код',
    description:
      'Отправляет код на почту. Ответ одинаковый, есть такая почта или нет.',
  })
  requestRecovery(@Body() dto: RecoveryRequestDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post('recovery/verify')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Восстановление пароля: проверить код',
    description: 'Код живёт 15 минут, после 5 неверных вводов сгорает.',
  })
  checkRecoveryCode(@Body() dto: RecoveryCodeDto) {
    return this.authService.checkPasswordResetCode(dto.email, dto.code);
  }

  @Post('recovery/reset')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Восстановление пароля: задать новый',
    description: 'Меняет пароль по коду из письма и возвращает токен.',
  })
  @ApiResponse({ status: 200, description: 'Токен', type: AccessToken })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.email, dto.code, dto.password);
  }
}
