import { Logger, UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../auth/jwt.strategy';
import { isListed, OrderService } from '../order/order.service';
import { OrderDocument } from '../order/schemas/order.schema';
import { UserService } from '../user/user.service';
import { CANCEL_REPLY_DAYS, daysText, replyOverdue } from './cancel-proposal';
import { ChatService } from './chat.service';
import {
  EditMessageDto,
  FinishOrderDto,
  MessageActionDto,
  PartnerDto,
  PostResponseDto,
  PresenceQueryDto,
  ProposeCancelDto,
  SendMessageDto,
} from './dto/chat-events.dto';
import { Message, MessageDocument } from './schemas/chat.schema';
import { WsExceptionFilter } from './ws-exception.filter';

type AuthedSocket = Socket & { data: { userId: string; sent?: number[] } };

/** Не больше RATE_LIMIT сообщений за RATE_WINDOW_MS с одного соединения. */
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 10_000;

/**
 * Чат в реальном времени. Работает на том же порту, что и HTTP API.
 *
 * При подключении клиент передаёт JWT в handshake.auth.token. Шлюз проверяет
 * его и сам помещает клиента в комнату с его id — подписаться на чужую
 * комнату нельзя. Отправитель во всех событиях берётся из токена.
 *
 * Комната пользователя — это все его вкладки и устройства. Пока в ней есть
 * хоть одно соединение, пользователь «в сети».
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
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
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
    let userId: string;
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      userId = payload.userId;
    } catch {
      this.logger.debug(
        `Отклонено подключение без валидного токена: ${client.id}`,
      );
      client.emit('exception', { message: 'Требуется авторизация' });
      client.disconnect(true);
      return;
    }

    client.data.userId = userId;
    await client.join(userId);

    // Первое соединение пользователя — сообщаем остальным, что он в сети.
    if (this.connectionsOf(userId) === 1) {
      client.broadcast.emit('presence', { userId, online: true });
    }
    await this.userService.touchLastSeen(userId).catch(() => undefined);
  }

  async handleDisconnect(client: Socket) {
    const userId: string | undefined = client.data.userId;
    // К моменту disconnect сокет уже вышел из комнат.
    if (!userId || this.connectionsOf(userId) > 0) return;

    const lastSeen = new Date().toISOString();
    await this.userService.touchLastSeen(userId).catch(() => undefined);
    this.server.emit('presence', { userId, online: false, lastSeen });
  }

  /** Кто из перечисленных пользователей сейчас в сети. Ответ — через ack. */
  @SubscribeMessage('getPresence')
  handleGetPresence(@MessageBody() dto: PresenceQueryDto) {
    return {
      online: dto.userIds.filter((id) => this.connectionsOf(id) > 0),
    };
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: SendMessageDto,
  ) {
    const senderId = client.data.userId;
    this.assertRate(client);

    if (dto.receiverId === senderId) {
      throw new WsException('Нельзя написать самому себе');
    }
    // Проверяем, что собеседник существует: иначе сообщения уходили
    // «в никуда» и висели в базе без диалога.
    await this.userService.getUser(dto.receiverId);

    const text = dto.text.trim();
    if (!text && !dto.mediaUrl && !dto.is_suggest) {
      throw new WsException('Пустое сообщение');
    }

    // Предложить можно только свой опубликованный заказ без исполнителя.
    if (dto.is_suggest) {
      if (!dto.orderId)
        throw new WsException('Не указан заказ для предложения');
      const order = await this.orderService.getOrder(dto.orderId, senderId);
      if (order.user_id !== senderId || !isListed(order)) {
        throw new WsException('Этот заказ нельзя предложить');
      }
    }

    const replyTo = dto.replyToId
      ? await this.chatService.replySnapshot(
          dto.replyToId,
          senderId,
          dto.receiverId,
        )
      : undefined;

    const mediaType = dto.mediaUrl ? dto.mediaType : 'none';
    return this.send(
      {
        senderId,
        receiverId: dto.receiverId,
        text,
        mediaUrl: dto.mediaUrl,
        mediaType,
        fileName: mediaType === 'file' ? dto.fileName : undefined,
        fileSize: mediaType === 'file' ? dto.fileSize : undefined,
        replyTo,
        is_suggest: dto.is_suggest,
        orderId: dto.is_suggest ? dto.orderId : undefined,
      },
      dto.clientId,
    );
  }

  @SubscribeMessage('editMessage')
  async handleEditMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: EditMessageDto,
  ) {
    const message = await this.chatService.editMessage(
      dto.messageId,
      client.data.userId,
      dto.text,
    );
    this.emitToBoth(message, 'messageEdited', {
      messageId: message.id,
      text: message.text,
      editedAt: message.editedAt,
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

  /** Отметить прочитанной переписку с собеседником. */
  @SubscribeMessage('markRead')
  async handleMarkRead(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: PartnerDto,
  ) {
    const readerId = client.data.userId;
    const count = await this.chatService.markRead(readerId, dto.userId);
    // Читателю тоже: в других его вкладках обнулится счётчик непрочитанных.
    if (count > 0) {
      this.server
        .to([readerId, dto.userId])
        .emit('messagesRead', { readerId, partnerId: dto.userId });
    }
  }

  /** «Печатает…»: пересылаем собеседнику, в базу не пишем. */
  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: PartnerDto,
  ) {
    if (dto.userId === client.data.userId) return;
    this.server.to(dto.userId).emit('typing', { userId: client.data.userId });
  }

  /**
   * Принять предложение заказа, отклик или сданную работу. Принимает
   * получатель сообщения:
   * - предложение (is_suggest): заказчик → исполнитель, исполнитель — получатель;
   * - отклик (status = response): исполнитель → заказчик, исполнитель — отправитель;
   * - сдача работы (is_delivery): исполнитель → заказчик, заказ завершается;
   * - отмена (is_cancel): любая сторона → другой, заказ отменяется.
   */
  @SubscribeMessage('acceptMessage')
  async handleAcceptMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: MessageActionDto,
  ) {
    const actorId = client.data.userId;
    const message = await this.findPendingOffer(dto.messageId, actorId);

    if (message.is_cancel) {
      const order = await this.orderService.cancelDeal(message.orderId!, [
        message.senderId,
        message.receiverId,
      ]);
      await this.completeCancel(
        message,
        order,
        `Заказ «${order.title}» отменён по согласию сторон.`,
      );
      return;
    }

    if (message.is_delivery) {
      const order = await this.orderService.reviewWork(
        message.orderId!,
        actorId,
        true,
      );
      await this.chatService.setStatus(message, 'accepted');
      this.emitToBoth(message, 'messageAccepted', { messageId: message.id });
      this.emitToBoth(message, 'orderUpdated', order.toJSON());
      await this.closeOpenCards(order.id, message.id);
      await this.sendServerMessage(
        message,
        `Работа по заказу «${order.title}» принята. Заказ завершён. ` +
          'Оставьте отзыв друг о друге — это помогает другим выбрать, с кем работать.',
      );
      return;
    }

    const performerId = message.is_suggest
      ? message.receiverId
      : message.senderId;

    const order = await this.orderService.assignPerformer(
      message.orderId!,
      [message.senderId, message.receiverId],
      performerId,
      actorId,
    );
    await this.chatService.setStatus(message, 'accepted');

    this.emitToBoth(message, 'messageAccepted', { messageId: message.id });
    this.emitToBoth(message, 'orderUpdated', order.toJSON());
    await this.sendServerMessage(
      message,
      `Предложение было принято ${await this.displayName(actorId)}.`,
    );
    await this.closeOtherOffers(order.id, order.title, message.id);
  }

  @SubscribeMessage('rejectMessage')
  async handleRejectMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: MessageActionDto,
  ) {
    const actorId = client.data.userId;
    const message = await this.findPendingOffer(dto.messageId, actorId);

    if (message.is_delivery) {
      const order = await this.orderService.reviewWork(
        message.orderId!,
        actorId,
        false,
      );
      await this.chatService.setStatus(message, 'rejected');
      this.emitToBoth(message, 'messageRejected', { messageId: message.id });
      this.emitToBoth(message, 'orderUpdated', order.toJSON());
      await this.sendServerMessage(
        message,
        `Работа по заказу «${order.title}» возвращена на доработку.`,
      );
      return;
    }

    await this.chatService.setStatus(message, 'rejected');

    this.emitToBoth(message, 'messageRejected', { messageId: message.id });
    await this.sendServerMessage(
      message,
      `Предложение было отклонено ${await this.displayName(actorId)}.`,
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

  /**
   * Исполнитель сдаёт работу. Раньше заказ сразу считался завершённым —
   * заказчик не мог ни проверить результат, ни вернуть его на доработку.
   * Теперь заказчику приходит карточка «Работа сдана» с выбором.
   */
  @SubscribeMessage('finishOrder')
  async handleFinishOrder(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: FinishOrderDto,
  ) {
    const order = await this.orderService.submitWork(
      dto.orderId,
      client.data.userId,
    );

    const message = await this.send({
      senderId: client.data.userId,
      receiverId: order.user_id,
      text: dto.text?.trim() ?? '',
      is_delivery: true,
      orderId: order.id,
    });
    this.emitToBoth(message, 'orderUpdated', order.toJSON());
    return { orderId: order.id, status: order.status };
  }

  /**
   * Предложить второй стороне отменить заказ в работе или на проверке.
   * Ей приходит карточка: принять или отклонить — acceptMessage / rejectMessage.
   */
  @SubscribeMessage('proposeCancel')
  async handleProposeCancel(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: ProposeCancelDto,
  ) {
    const senderId = client.data.userId;
    const order = await this.orderService.getDealToCancel(
      dto.orderId,
      senderId,
    );
    if (await this.chatService.hasOpenCancel(order.id)) {
      throw new WsException('Предложение отменить заказ уже отправлено');
    }

    return this.send({
      senderId,
      receiverId: order.user_id === senderId ? order.performer! : order.user_id,
      text: dto.text?.trim() ?? '',
      is_cancel: true,
      orderId: order.id,
    });
  }

  /**
   * Вторая сторона не ответила на предложение отмены CANCEL_REPLY_DAYS дней —
   * инициатор отменяет заказ сам. Срок проверяется в момент нажатия.
   */
  @SubscribeMessage('forceCancel')
  async handleForceCancel(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: MessageActionDto,
  ) {
    const proposal = await this.chatService.findMessage(dto.messageId);
    if (!proposal.is_cancel || proposal.senderId !== client.data.userId) {
      throw new WsException(
        'Отменить заказ без согласия может только автор предложения отмены',
      );
    }
    if (proposal.status === 'accepted' || proposal.status === 'rejected') {
      throw new WsException('На это предложение уже ответили');
    }
    if (!replyOverdue(proposal.createdAt, new Date())) {
      throw new WsException(
        `Отменить без согласия можно, если на предложение нет ответа ${daysText(CANCEL_REPLY_DAYS)}`,
      );
    }

    const order = await this.orderService.cancelDeal(proposal.orderId!, [
      proposal.senderId,
      proposal.receiverId,
    ]);
    await this.completeCancel(
      proposal,
      order,
      `Заказ «${order.title}» отменён без согласия второй стороны. ` +
        `Причина: вторая сторона не ответила ${daysText(CANCEL_REPLY_DAYS)}.`,
    );
  }

  /** Служебное сообщение в диалоге двух пользователей — для других модулей. */
  async notify(senderId: string, receiverId: string, text: string) {
    await this.sendServerMessage({ senderId, receiverId }, text);
  }

  private async send(
    data: Parameters<ChatService['saveMessage']>[0],
    clientId?: string,
  ) {
    const message = await this.chatService.saveMessage(data);
    this.emitToBoth(message, 'receiveMessage', {
      ...message.toJSON(),
      clientId,
    });
    return message;
  }

  private emitToBoth(
    message: Pick<Message, 'senderId' | 'receiverId'>,
    event: string,
    payload: unknown,
  ) {
    this.server.to([message.senderId, message.receiverId]).emit(event, payload);
  }

  private connectionsOf(userId: string) {
    return this.server.sockets.adapter.rooms.get(userId)?.size ?? 0;
  }

  /** Защита от флуда: скрипт мог отправлять сообщения без ограничений. */
  private assertRate(client: AuthedSocket) {
    const now = Date.now();
    const recent = (client.data.sent ?? []).filter(
      (t: number) => now - t < RATE_WINDOW_MS,
    );
    if (recent.length >= RATE_LIMIT) {
      throw new WsException('Слишком много сообщений. Подождите немного');
    }
    recent.push(now);
    client.data.sent = recent;
  }

  /** Предложение, отклик, сдача работы или отмена — адресованные пользователю и ещё без ответа. */
  private async findPendingOffer(
    messageId: string,
    userId: string,
  ): Promise<MessageDocument> {
    const message = await this.chatService.findMessage(messageId);
    const isOffer =
      message.is_suggest ||
      message.is_delivery ||
      message.is_cancel ||
      message.status === 'response';

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

  /** Остальным кандидатам — что заказ ушёл другому исполнителю. */
  private async closeOtherOffers(
    orderId: string,
    title: string,
    acceptedId: string,
  ) {
    const closed = await this.chatService.closeOtherOffers(orderId, acceptedId);
    for (const offer of closed) {
      this.emitToBoth(offer, 'messageRejected', { messageId: offer.id });
      await this.sendServerMessage(
        offer,
        `По заказу «${title}» выбран другой исполнитель.`,
      );
    }
  }

  /** Отмена состоялась: обеим сторонам — новый статус и служебное сообщение. */
  private async completeCancel(
    proposal: MessageDocument,
    order: OrderDocument,
    text: string,
  ) {
    await this.chatService.setStatus(proposal, 'accepted');
    this.emitToBoth(proposal, 'messageAccepted', { messageId: proposal.id });
    this.emitToBoth(proposal, 'orderUpdated', order.toJSON());
    await this.closeOpenCards(order.id, proposal.id);
    await this.sendServerMessage(proposal, text);
  }

  /**
   * Заказ выполнен или отменён — открытые карточки по нему (сдача работы,
   * предложение отмены) закрываются, чтобы не висели ненужные кнопки.
   */
  private async closeOpenCards(orderId: string, exceptId: string) {
    const closed = await this.chatService.closeOtherOffers(orderId, exceptId);
    for (const card of closed) {
      this.emitToBoth(card, 'messageRejected', { messageId: card.id });
    }
  }

  private async displayName(userId: string) {
    const user = await this.userService.getUser(userId);
    return user.nickname || user.name;
  }

  private async sendServerMessage(
    offer: Pick<Message, 'senderId' | 'receiverId'>,
    text: string,
  ) {
    await this.send({
      senderId: offer.senderId,
      receiverId: offer.receiverId,
      text,
      status: 'server',
    });
  }
}
