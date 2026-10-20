import { io, Socket } from 'socket.io-client';

/** Сколько ждать события сокета, прежде чем тест упадёт. */
export const EVENT_TIMEOUT = 3000;

/**
 * Дождаться события (подходящего под match). Подписываться — до действия,
 * которое его вызывает, иначе событие можно пропустить:
 *   const updated = waitFor(customer, 'orderUpdated');
 *   customer.emit('acceptMessage', { messageId });
 *   await updated;
 */
export function waitFor<T = any>(
  socket: Socket,
  event: string,
  match: (payload: T) => boolean = () => true,
  timeout = EVENT_TIMEOUT,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const handler = (payload: T) => {
      if (!match(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Событие «${event}» не пришло за ${timeout} мс`));
    }, timeout);
    socket.on(event, handler);
  });
}

/** Клиент чата. Без токена сервер сам разрывает соединение. */
export function chatClient(url: string, token?: string) {
  return io(url, {
    auth: token ? { token } : {},
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
}

/**
 * Клиент, готовый к событиям. Сервер проверяет токен и кладёт сокет в комнату
 * пользователя асинхронно — уже после того, как клиент получил connect.
 * Поэтому ждём, пока сервер увидит пользователя в сети.
 */
export async function connectAs(url: string, token: string, userId: string) {
  const socket = chatClient(url, token);
  await waitFor(socket, 'connect');
  const deadline = Date.now() + EVENT_TIMEOUT;
  while (Date.now() < deadline) {
    const { online } = await socket
      .timeout(EVENT_TIMEOUT)
      .emitWithAck('getPresence', { userIds: [userId] });
    if (online.includes(userId)) return socket;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  socket.close();
  throw new Error(`Сервер не принял сокет пользователя ${userId}`);
}
