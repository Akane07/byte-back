import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { UserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe';
import { mediaUpload, uploadUrl } from '../common/uploads';
import { OrderService } from '../order/order.service';
import { ChatService } from './chat.service';

@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly orderService: OrderService,
  ) {}

  @Get('chat')
  @ApiOperation({
    summary: 'Переписка с пользователем',
    description: '?user=<id собеседника>',
  })
  getChat(
    @UserId() userId: string,
    @Query('user', ParseObjectIdPipe) otherId: string,
  ) {
    return this.chatService.getChatBetweenUsers(userId, otherId);
  }

  @Get('chat/all')
  @ApiOperation({ summary: 'Список своих диалогов' })
  getAllChats(@UserId() userId: string) {
    return this.chatService.getUserChats(userId);
  }

  @Get('chat/between/:id/and/:uid')
  @ApiOperation({ summary: 'Незавершённые общие заказы с собеседником' })
  getOrdersBetweenUsers(
    @UserId() userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('uid', ParseObjectIdPipe) uid: string,
  ) {
    if (userId !== id && userId !== uid) {
      throw new ForbiddenException('Можно смотреть только свои заказы');
    }
    return this.orderService.getOrdersBetweenUsers(id, uid);
  }

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Загрузить файл для чата',
    description: 'multipart, поле file: JPEG/PNG/WebP/MP4/WebM до 50 МБ',
  })
  @UseInterceptors(FileInterceptor('file', mediaUpload))
  uploadFile(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Файл не передан');
    }
    return { url: uploadUrl('files', file.filename), mimetype: file.mimetype };
  }
}
