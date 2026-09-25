import { Logger, UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../auth/jwt.strategy';
import { OrderService } from '../order/order.service';
import { UserService } from '../user/user.service';
import { ChatService } from './chat.service';
import {
  FinishOrderDto,
  MessageActionDto,
  PostResponseDto,
  SendMessageDto,
} from './dto/chat-events.dto';
import { Message, MessageDocument } from './schemas/chat.schema';
import { WsExceptionFilter } from './ws-exception.filter';

type AuthedSocket = Socket & { data: { userId: string } };

/**
 * Чат в реальном времени. Работает на том же порту, что и HTTP API.
 *
 * При подключении клиент передаёт JWT в handshake.auth.token. Шлюз проверяет
 * его и сам помещает клиента в комнату с его id — подписаться на чужую
 * комнату нельзя. Отправитель во всех событиях берётся из токена.
 */
@WebSocketGateway()
@UseFilters(new WsExceptionFilter())
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: (errors) =>
      new WsException(
        errors.flatMap((e) => Object.values(e.constraints ?? {})),
      ),
  }),
)
export class ChatGateway implements OnGatewayConnection {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer() server: Server;

  constructor(
    private readonly chatService: ChatService,
    private readonly orderService: OrderService,
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      client.data.userId = payload.userId;
      await client.join(payload.userId);
    } catch {
      this.logger.debug(
        `Отклонено подключение без валидного токена: ${client.id}`,
      );
      client.emit('exception', { message: 'Требуется авторизация' });
      client.disconnect(true);
    }
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: SendMessageDto,
  ) {
    const senderId = client.data.userId;

    // Предложить можно только свой активный заказ без исполнителя.
    if (dto.is_suggest) {
      if (!dto.orderId)
        throw new WsException('Не указан заказ для предложения');
      const order = await this.orderService.getOrder(dto.orderId);
      if (order.user_id !== senderId || order.performer || order.draft) {
        throw new WsException('Этот заказ нельзя предложить');
      }
    }

    return this.send({
      senderId,
      receiverId: dto.receiverId,
      text: dto.text,
      mediaUrl: dto.mediaUrl,
      mediaType: dto.mediaUrl ? dto.mediaType : 'none',
      is_suggest: dto.is_suggest,
      orderId: dto.is_suggest ? dto.orderId : undefined,
    });
  }

  @SubscribeMessage('deleteMessage')
  async handleDeleteMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: MessageActionDto,
  ) {
    const message = await this.chatService.deleteMessage(
      dto.messageId,
      client.data.userId,
    );
    this.emitToBoth(message, 'messageDeleted', { messageId: dto.messageId });
  }

  /**
   * Принять предложение заказа или отклик. Принимает получатель сообщения:
   * - предложение (is_suggest): заказчик → исполнитель, исполнитель — получатель;
   * - отклик (status = response): исполнитель → заказчик, исполнитель — отправитель.
   */
  @SubscribeMessage('acceptMessage')
  async handleAcceptMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: MessageActionDto,
  ) {
    const message = await this.findPendingOffer(
      dto.messageId,
      client.data.userId,
    );
    const performerId = message.is_suggest
      ? message.receiverId
      : message.senderId;

    await this.orderService.assignPerformer(
      message.orderId!,
      [message.senderId, message.receiverId],
      performerId,
    );
    await this.chatService.setStatus(message, 'accepted');

    this.emitToBoth(message, 'messageAccepted', { messageId: message.id });
    await this.sendServerMessage(
      message,
      client.data.userId,
      'Предложение было принято',
    );
  }

  @SubscribeMessage('rejectMessage')
  async handleRejectMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: MessageActionDto,
  ) {
    const message = await this.findPendingOffer(
      dto.messageId,
      client.data.userId,
    );
    await this.chatService.setStatus(message, 'rejected');

    this.emitToBoth(message, 'messageRejected', { messageId: message.id });
    await this.sendServerMessage(
      message,
      client.data.userId,
      'Предложение было отклонено',
    );
  }

  /** Отправить свой отклик на заказ в чат с заказчиком. */
  @SubscribeMessage('postResponse')
  async handlePostResponse(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: PostResponseDto,
  ) {
    const senderId = client.data.userId;
    const response = await this.orderService.getOrderResponseById(
      dto.responseId,
      senderId,
    );
    if (response.user_id !== senderId || response.order_id !== dto.orderId) {
      throw new WsException('Отклик не найден');
    }
    const order = await this.orderService.getOrder(dto.orderId);

    const message = await this.send({
      senderId,
      receiverId: order.user_id,
      text: 'Отклик на заказ',
      status: 'response',
      orderId: dto.orderId,
      responseId: dto.responseId,
    });
    await this.orderService.attachResponseMessage(
      dto.responseId,
      senderId,
      message.id,
    );
    return message;
  }

  /** Исполнитель сообщает заказчику, что заказ выполнен. */
  @SubscribeMessage('finishOrder')
  async handleFinishOrder(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: FinishOrderDto,
  ) {
    const order = await this.orderService.completeOrder(
      dto.orderId,
      client.data.userId,
    );

    await this.send({
      senderId: client.data.userId,
      receiverId: order.user_id,
      text: 'Заказ выполнен и готов к проверке.',
      status: 'server',
      orderId: order.id,
    });
    return { orderId: order.id, status: order.status };
  }

  private async send(data: Parameters<ChatService['saveMessage']>[0]) {
    const message = await this.chatService.saveMessage(data);
    this.emitToBoth(message, 'receiveMessage', message.toJSON());
    return message;
  }

  private emitToBoth(
    message: Pick<Message, 'senderId' | 'receiverId'>,
    event: string,
    payload: unknown,
  ) {
    this.server.to([message.senderId, message.receiverId]).emit(event, payload);
  }

  /** Предложение или отклик, адресованные пользователю и ещё без ответа. */
  private async findPendingOffer(
    messageId: string,
    userId: string,
  ): Promise<MessageDocument> {
    const message = await this.chatService.findMessage(messageId);
    const isOffer = message.is_suggest || message.status === 'response';

    if (!isOffer || !message.orderId) {
      throw new WsException('Это сообщение нельзя принять или отклонить');
    }
    if (message.receiverId !== userId) {
      throw new WsException('Ответить может только получатель');
    }
    if (message.status === 'accepted' || message.status === 'rejected') {
      throw new WsException('На это предложение уже ответили');
    }
    return message;
  }

  private async sendServerMessage(
    offer: Pick<Message, 'senderId' | 'receiverId'>,
    actorId: string,
    text: string,
  ) {
    const actor = await this.userService.getUser(actorId);
    await this.send({
      senderId: offer.senderId,
      receiverId: offer.receiverId,
      text: `${text} ${actor.nickname || actor.name}.`,
      status: 'server',
    });
  }
}
