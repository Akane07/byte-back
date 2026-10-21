import { ForbiddenException } from '@nestjs/common';

/** По этому коду фронт открывает окно «Подтвердите почту»; текст — причина в окне. */
export const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

/**
 * Только тому, кто сам не подтвердил почту: ему фронт и предложит её подтвердить.
 * Если почту не подтвердила другая сторона сделки — обычная 400 с текстом.
 */
export class EmailNotVerifiedException extends ForbiddenException {
  constructor(message: string) {
    super({
      statusCode: 403,
      error: 'Forbidden',
      code: EMAIL_NOT_VERIFIED,
      message,
    });
  }
}
