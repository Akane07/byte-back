import { Throttle, ThrottlerModuleOptions } from '@nestjs/throttler';

/** Окно, за которое считаются запросы с одного IP; запрос сверх лимита блокирует маршрут для этого IP на столько же. */
export const AUTH_WINDOW_MS = 60_000;

/** Лимиты /auth: запросов с одного IP за окно, у каждого маршрута свой счётчик. */
export const AUTH_LIMITS = {
  /** Вход: человеку хватает с запасом, подбору пароля — мало. */
  login: 5,
  /** Регистрация: каждая создаёт аккаунт и отправляет письмо. */
  register: 3,
  /** Восстановление и повторная отправка кода: каждый запрос — письмо, чужой ящик не завалить. */
  mail: 3,
  /** Ввод кода: подтверждение почты и оба шага восстановления — код принимают оба. */
  code: 5,
};

/**
 * Откуда Express берёт IP клиента (req.ip). За прокси `npm run share` все
 * запросы приходят с 127.0.0.1, поэтому адрес берётся из X-Forwarded-For —
 * но только если запрос пришёл с этой же машины. С true клиент подменил бы
 * IP своим заголовком и обошёл лимит.
 */
export const TRUST_PROXY = 'loopback';

export const AUTH_THROTTLER: ThrottlerModuleOptions = {
  // Без лимита по умолчанию модуль не работает, но маршрутам он не достаётся:
  // у каждого маршрута AuthController свой AuthLimit или @SkipThrottle().
  throttlers: [{ ttl: AUTH_WINDOW_MS, limit: AUTH_LIMITS.login }],
  errorMessage: (_context, { timeToBlockExpire }) =>
    `Слишком много попыток, попробуйте через ${timeToBlockExpire} с`,
};

/** Лимит маршрута: limit запросов за AUTH_WINDOW_MS с одного IP. */
export const AuthLimit = (limit: number) => Throttle({ default: { limit } });
