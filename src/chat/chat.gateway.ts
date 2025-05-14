import {
  SubscribeMessage,
  WebSocketGateway,
  OnGatewayInit,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway(3002, {
  cors: {
    origin: '*',  // Можно заменить на свой фронт-адрес для продакшн
  },
})
export class ChatGateway implements OnGatewayInit {
  @WebSocketServer() server: Server;

  constructor(private chatService: ChatService) {}

  afterInit() {
    console.log('WebSocket initialized');
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    const savedMessage = await this.chatService.saveMessage(data);
    this.server.to(data.receiverId).emit('receiveMessage', savedMessage);
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(@MessageBody() userId: string, @ConnectedSocket() client: Socket) {
    client.join(userId); // each user joins their own room
  }
}
