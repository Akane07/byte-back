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
import {
  chatUpload,
  mediaTypeOf,
  originalName,
  uploadUrl,
} from '../common/uploads';
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
    description:
      '?user=<id собеседника>&before=<id сообщения>&limit=50 — страница истории ' +
      'от старых к новым и признак hasMore',
  })
  getChat(
    @UserId() userId: string,
    @Query('user', ParseObjectIdPipe) otherId: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getChatBetweenUsers(
      userId,
      otherId,
      before,
      limit ? Number(limit) || undefined : undefined,
    );
  }

  @Get('chat/all')
  @ApiOperation({ summary: 'Список своих диалогов' })
  getAllChats(@UserId() userId: string) {
    return this.chatService.getUserChats(userId);
  }

  @Get('chat/unread')
  @ApiOperation({ summary: 'Непрочитанные сообщения: всего и по собеседникам' })
  getUnread(@UserId() userId: string) {
    return this.chatService.getUnread(userId);
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
    description:
      'multipart, поле file до 50 МБ: картинки (JPEG/PNG/WebP/GIF), видео ' +
      '(MP4/WebM), документы (PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT) и архивы (ZIP/RAR/7Z)',
  })
  @UseInterceptors(FileInterceptor('file', chatUpload))
  uploadFile(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Файл не передан');
    }
    return {
      url: uploadUrl('files', file.filename),
      mimetype: file.mimetype,
      mediaType: mediaTypeOf(file.mimetype),
      name: originalName(file),
      size: file.size,
    };
  }
}
