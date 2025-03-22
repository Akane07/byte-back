import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export const frontURL = 'https://localhost:3000';

@Injectable()
export class MailService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail', // Или другая почтовая служба
      auth: {
        user: 'diptimus@gmail.com',
        pass: 'vukg hvbr tpos vuhk',
      },
      debug: true, // Включить отладку
      logger: true, // Логи
    });
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const mailOptions = {
      from: 'diptimus@gmail.com',
      to: email,
      subject: 'Подтверждение регистрации на бирже Freelance Byte',
      text: `Ваш код верификации для регистрации на бирже Freelance Byte: ${token}. Если это были не вы, пожалуйста, проверьте свои пароли и проигнорируйте это письмо.`,
    };
    const r = await this.transporter.sendMail(mailOptions);
  }

  async sendRestoreEmail(email: string, token: string): Promise<void> {
    const mailOptions = {
      from: 'diptimus@gmail.com',
      to: email,
      subject: 'Восстановление доступа к аккаунту',
      text: `Код проверки для восстановления доступа к аккаунту на бирже Freelance Byte: ${token}. Если это были не вы, пожалуйста, проверьте свои пароли и проигнорируйте это письмо.`,
    };
    const r = await this.transporter.sendMail(mailOptions);
  }
}
