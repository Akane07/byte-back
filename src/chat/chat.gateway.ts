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

  constructor(private chatService: ChatService) { }

  afterInit() {
    console.log('WebSocket initialized');
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody() data: any,
  ) {
    const savedMessage = await this.chatService.saveMessage(data);
    this.server.to(data.receiverId).emit('receiveMessage', savedMessage);
    this.server.to(data.senderId).emit('receiveMessage', savedMessage);
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(@MessageBody() userId: string, @ConnectedSocket() client: Socket) {
    client.join(userId); // each user joins their own room
  }

  @SubscribeMessage('deleteMessage')
  async handleDeleteMessage(
    @MessageBody() data: { messageId: string; senderId: string; receiverId: string }
  ) {
    const { messageId, senderId, receiverId } = data;
    await this.chatService.deleteMessage(messageId);

    this.server.to(senderId).emit('messageDeleted', { messageId, success: true });
    this.server.to(receiverId).emit('messageDeleted', { messageId, success: true });
  }

  @SubscribeMessage('acceptMessage')
  async handleAcceptMessage(@MessageBody() data: any) {
    const { messageId, senderId, receiverId, name, orderId } = data;
    await this.chatService.acceptMessage(messageId, orderId, receiverId);

    this.server.to(senderId).emit('messageAccepted', { messageId, success: true });
    this.server.to(receiverId).emit('messageAccepted', { messageId, success: true });

    this.handleMessage({ senderId, receiverId, text: `Предложение было принято ${name}.`, status: 'server' });
  }

  @SubscribeMessage('rejectMessage')
  async handleRejectMessage(@MessageBody() data: any) {
    const { messageId, senderId, receiverId, name } = data;
    await this.chatService.rejectMessage(messageId);

    this.server.to(senderId).emit('messageRejected', { messageId, success: true });
    this.server.to(receiverId).emit('messageRejected', { messageId, success: true });

    this.handleMessage({ senderId, receiverId, text: `Предложение было отклонено ${name}.`, status: 'server' });
  }
}
