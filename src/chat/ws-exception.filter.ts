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
    // code — как в REST-ответе: по нему клиент решает, что делать
    // (например, EMAIL_NOT_VERIFIED — открыть окно подтверждения почты).
    const emit = (message: unknown, code?: unknown) =>
      client.emit('exception', { message, code, clientId });

    if (exception instanceof WsException) {
      emit(exception.getError());
      return;
    }

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const body =
        typeof response === 'object' && response !== null
          ? (response as { message?: unknown; code?: unknown })
          : {};
      emit('message' in body ? body.message : exception.message, body.code);
      return;
    }

    this.logger.error(exception);
    emit('Внутренняя ошибка сервера');
  }
}
