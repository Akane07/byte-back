/**
 * Сколько дней инициатор ждёт ответа на предложение отменить заказ. Потом
 * он может отменить заказ сам: иначе молчание второй стороны держало бы
 * заказ в работе бесконечно.
 */
export const CANCEL_REPLY_DAYS = 3;

const DAY = 24 * 60 * 60 * 1000;

/** На предложение отмены нет ответа CANCEL_REPLY_DAYS дней и больше. */
export function replyOverdue(proposedAt: Date, now: Date) {
  return now.getTime() - proposedAt.getTime() >= CANCEL_REPLY_DAYS * DAY;
}

/** «1 день», «3 дня», «5 дней» — срок в текстах не ломается при смене константы. */
export function daysText(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? 'день'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'дня'
        : 'дней';
  return `${n} ${word}`;
}
