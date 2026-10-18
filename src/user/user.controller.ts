import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { UserId } from '../auth/current-user.decorator';
import { AccessToken, ChangePasswordDto } from '../auth/dto/create-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../auth/schemas/user.schema';
import { avatarUpload, uploadUrl } from '../common/uploads';
import { CITIES } from '../common/cities';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe';
import { countries } from './constants/countries';
import { SpecialistsQueryDto, UpdateUserDto } from './dto/update-user.dto';
import { UserService } from './user.service';

const sortedCountries = [...countries].sort((a, b) => a.localeCompare(b, 'ru'));

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('countries')
  @ApiOperation({ summary: 'Список стран' })
  @ApiResponse({ status: 200, type: [String] })
  getCountries() {
    return sortedCountries;
  }

  @Get('cities')
  @ApiOperation({ summary: 'Города для заказов на месте и профилей' })
  @ApiResponse({ status: 200, type: [String] })
  getCities() {
    return CITIES;
  }

  @Get('specialists')
  @ApiOperation({
    summary: 'Каталог исполнителей',
    description:
      'Пользователи с «Принимаю заказы»: поиск, категории, формат работы, город. По 12 на страницу',
  })
  getSpecialists(@Query() query: SpecialistsQueryDto) {
    return this.userService.getSpecialists(query);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Свой профиль' })
  @ApiResponse({ status: 200, type: User })
  getMe(@UserId() userId: string) {
    return this.userService.getMe(userId);
  }

  @Post('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Изменить свой профиль' })
  @ApiResponse({ status: 200, type: User })
  updateMe(@UserId() userId: string, @Body() dto: UpdateUserDto) {
    return this.userService.updateUser(userId, dto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Смена пароля' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, type: AccessToken })
  changePassword(@UserId() userId: string, @Body() dto: ChangePasswordDto) {
    return this.userService.changePassword(
      userId,
      dto.password,
      dto.newPassword,
    );
  }

  @Post('set_avatar')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Загрузить аватар',
    description: 'multipart, поле avatar, JPEG/PNG/WebP до 3 МБ',
  })
  @UseInterceptors(FileInterceptor('avatar', avatarUpload))
  async setAvatar(
    @UserId() userId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Файл не передан');
    }
    const avatarUrl = uploadUrl('avatars', file.filename);
    await this.userService.updateUser(userId, { avatar: avatarUrl });
    return { avatarUrl };
  }

  // Параметрический маршрут объявлен последним, чтобы не перехватывать
  // статические пути вроде /user/me и /user/countries.
  @Get(':id')
  @ApiOperation({ summary: 'Публичный профиль пользователя' })
  @ApiResponse({ status: 200, type: User })
  getUser(@Param('id', ParseObjectIdPipe) id: string) {
    return this.userService.getUser(id);
  }
}
