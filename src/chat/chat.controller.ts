import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

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
}
