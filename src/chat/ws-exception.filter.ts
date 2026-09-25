import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

/**
 * Ошибки из сервисов (NotFoundException и т. п.) в WebSocket-обработчиках
 * по умолчанию превращаются в безликий «Internal server error».
 * Фильтр отдаёт клиенту событие exception с понятным текстом.
 */
@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
  private readonly logger = new Logger(WsExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<Socket>();

    if (exception instanceof WsException) {
      client.emit('exception', { message: exception.getError() });
      return;
    }

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const message =
        typeof response === 'object' &&
        response !== null &&
        'message' in response
          ? (response as { message: unknown }).message
          : exception.message;
      client.emit('exception', { message });
      return;
    }

    this.logger.error(exception);
    client.emit('exception', { message: 'Внутренняя ошибка сервера' });
  }
}
