import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { ApiBody, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { ChangePasswordDto, User } from 'src/auth/schemas/user.schema';
import { AccessToken } from 'src/auth/dto/create-user.dto';
import { countries } from './constants/countries';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) { }

  @Get('countries')
  @ApiOperation({ summary: 'Получить список стран', description: 'Получить список стран' })
  @ApiResponse({ status: 200, description: 'Список строк, названий стран', type: [String] })
  getCountries() {
    return countries.sort();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Получить информацию о пользователе (себе)', description: 'Получить информацию о пользователе (себе)' })
  @ApiResponse({ status: 200, description: 'Пользователь', type: User })
  getMe(@Request() req: any) {
    return this.userService.getUser(req.user.userId);
  }

  @Post('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Изменить информацию профиля', description: 'Изменить информацию в своем профиле' })
  @ApiResponse({ status: 200, description: 'Пользователь', type: User })
  async patchMe(@Request() req, @Body() updateData: any) {
    return await this.userService.updateUser(req.user.userId, updateData);
  }

  @Get(':id')
  // @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Получить информацию о пользователе', description: 'Получить информацию о пользователе' })
  @ApiQuery({ name: 'id', type: String, description: 'ID пользователя', required: true })
  @ApiResponse({ status: 200, description: 'Пользователь', type: User })
  getUser(@Param() params: { id: string }) {
    return this.userService.getUser(params.id);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Смена пароля', description: 'Смена пароля пользователя' })
  @ApiBody({
    type: ChangePasswordDto,
    description: 'Пользователь',
    required: true
  })
  @ApiResponse({ status: 200, description: 'Токен', type: AccessToken })
  changePassword(@Request() req: any, @Body() body: { password: string; newPassword: string }) {
    return this.userService.changePassword(req.user.userId, body.password, body.newPassword);
  }
}
