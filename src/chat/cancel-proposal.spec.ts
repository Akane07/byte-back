import { CANCEL_REPLY_DAYS, daysText, replyOverdue } from './cancel-proposal';

const DAY = 24 * 60 * 60 * 1000;

describe('предложение отмены: срок ответа', () => {
  const proposedAt = new Date('2026-10-01T12:00:00Z');
  const after = (ms: number) => new Date(proposedAt.getTime() + ms);

  it(`срок — ${daysText(CANCEL_REPLY_DAYS)} с момента предложения`, () => {
    expect(replyOverdue(proposedAt, after(CANCEL_REPLY_DAYS * DAY - 1))).toBe(
      false,
    );
    expect(replyOverdue(proposedAt, after(CANCEL_REPLY_DAYS * DAY))).toBe(true);
    expect(replyOverdue(proposedAt, after(10 * DAY))).toBe(true);
  });

  it('daysText склоняет «день»', () => {
    expect([1, 2, 3, 5, 11, 12, 21, 22, 25, 111].map(daysText)).toEqual([
      '1 день',
      '2 дня',
      '3 дня',
      '5 дней',
      '11 дней',
      '12 дней',
      '21 день',
      '22 дня',
      '25 дней',
      '111 дней',
    ]);
  });
});
