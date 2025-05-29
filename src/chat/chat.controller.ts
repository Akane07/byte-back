import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) { }

  @Get()
  @UseGuards(JwtAuthGuard)
  getChat(@Query('user') userA: string, @Request() req: any) {
    return this.chatService.getChatBetweenUsers(userA, req.user.userId);
  }

  @Get('all')
  @UseGuards(JwtAuthGuard)
  getAllChats(@Request() req: any) {
    return this.chatService.getUserChats(req.user.userId);
  }

  @Get('between/:id/and/:uid')
  @UseGuards(JwtAuthGuard)
  getOrderBetweenUsers(@Param() params: { id: string, uid: string }) {
    return this.chatService.getOrderBetweenUsers(params.id, params.uid);
  }
}
