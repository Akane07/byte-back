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
    const ws = host.switchToWs();
    const client = ws.getClient<Socket>();
    // clientId отправленного сообщения — чтобы клиент пометил именно его
    // как неотправленное, а не гадал, к чему относится ошибка.
    const data: unknown = ws.getData();
    const clientId =
      typeof data === 'object' &&
      data !== null &&
      typeof (data as { clientId?: unknown }).clientId === 'string'
        ? (data as { clientId: string }).clientId
        : undefined;
    const emit = (message: unknown) =>
      client.emit('exception', { message, clientId });

    if (exception instanceof WsException) {
      emit(exception.getError());
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
      emit(message);
      return;
    }

    this.logger.error(exception);
    emit('Внутренняя ошибка сервера');
  }
}
