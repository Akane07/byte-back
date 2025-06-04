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
import { MessageDto } from './schemas/chat.schema';

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
    @MessageBody() data: MessageDto,
  ) {
    const savedMessage = await this.chatService.saveMessage(data);
    this.server.to(data.receiverId).emit('receiveMessage', savedMessage);
    this.server.to(data.senderId).emit('receiveMessage', savedMessage);

    return savedMessage;
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(@MessageBody() userId: string, @ConnectedSocket() client: Socket) {
    if (!userId) return;

    client.join(userId);
  }

  @SubscribeMessage('deleteMessage')
  async handleDeleteMessage(
    @MessageBody() data: { messageId: string; senderId: string; receiverId: string }
  ) {
    const { messageId, senderId, receiverId } = data;

    if (!messageId || !senderId || !receiverId) return;

    await this.chatService.deleteMessage(messageId);

    this.server.to(senderId).emit('messageDeleted', { messageId, success: true });
    this.server.to(receiverId).emit('messageDeleted', { messageId, success: true });
  }

  @SubscribeMessage('acceptMessage')
  async handleAcceptMessage(@MessageBody() data: any) {
    const { messageId, senderId, receiverId, name, orderId, type } = data;

    if (!messageId || !senderId || !receiverId || !orderId) return;

    await this.chatService.acceptMessage(messageId, orderId, type === 'seller' ? senderId : receiverId);

    this.server.to(senderId).emit('messageAccepted', { messageId, success: true });
    this.server.to(receiverId).emit('messageAccepted', { messageId, success: true });

    this.handleMessage({ senderId, receiverId, text: `Предложение было принято${name ? (' ' + name) : ''}.`, status: 'server', is_suggest: false, mediaType: 'none', mediaUrl: '', createdAt: '' });
  }

  @SubscribeMessage('rejectMessage')
  async handleRejectMessage(@MessageBody() data: any) {
    const { messageId, senderId, receiverId, name } = data;

    if (!messageId || !senderId || !receiverId) return;

    await this.chatService.rejectMessage(messageId);

    this.server.to(senderId).emit('messageRejected', { messageId, success: true });
    this.server.to(receiverId).emit('messageRejected', { messageId, success: true });

    this.handleMessage({ senderId, receiverId, text: `Предложение было отклонено${name ? (' ' + name) : ''}.`, status: 'server', is_suggest: false, mediaType: 'none', mediaUrl: '', createdAt: '' });
  }

  @SubscribeMessage('postResponse')
  async handlePostResponse(@MessageBody() data: any) {
    const { senderId, receiverId, orderId, responseId } = data;

    if (!senderId || !receiverId || !orderId || !responseId) return;

    const res = await this.handleMessage({ senderId, receiverId, text: `Отклик на заказ`, status: 'response', is_suggest: false, mediaType: 'none', mediaUrl: '', createdAt: '', orderId, responseId });

    this.chatService.patchResponse(responseId, res.id);
  }

  @SubscribeMessage('finishOrder')
  async handleFinishOrder(@MessageBody() data: any) {
    const { senderId, receiverId, orderId } = data;

    if (!senderId || !receiverId || !orderId) return;

    await this.chatService.finishOrderMessage(orderId);

    this.handleMessage({ senderId, receiverId, text: `Заказ выполнен и готов к проверке.`, status: 'server', is_suggest: false, mediaType: 'none', mediaUrl: '', createdAt: '' });
  }
}
