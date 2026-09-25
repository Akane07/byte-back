import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    this.from = user ?? '';

    // Без SMTP-доступа письма не отправляются, а код пишется в лог —
    // так проект можно запустить локально без почтового ящика.
    this.transporter =
      user && pass
        ? createTransport({
            service: config.get<string>('SMTP_SERVICE', 'gmail'),
            auth: { user, pass },
          })
        : null;

    if (!this.transporter) {
      this.logger.warn(
        'SMTP не настроен: письма не отправляются, коды пишутся в лог',
      );
    }
  }

  sendVerificationEmail(email: string, code: string) {
    return this.send(
      email,
      'Подтверждение регистрации на бирже Freelance Byte',
      `Ваш код подтверждения для регистрации на бирже Freelance Byte: ${code}. ` +
        'Если вы не регистрировались, просто проигнорируйте это письмо.',
    );
  }

  sendRestoreEmail(email: string, code: string) {
    return this.send(
      email,
      'Восстановление доступа к аккаунту',
      `Код для восстановления доступа к аккаунту на бирже Freelance Byte: ${code}. ` +
        'Если вы не запрашивали восстановление, проверьте свои пароли и проигнорируйте это письмо.',
    );
  }

  private async send(to: string, subject: string, text: string) {
    if (!this.transporter) {
      this.logger.log(`[письмо не отправлено] ${to}: ${text}`);
      return;
    }
    await this.transporter.sendMail({ from: this.from, to, subject, text });
  }
}
