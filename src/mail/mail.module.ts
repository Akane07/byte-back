import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

@Module({
  providers: [MailService],
  exports: [MailService], // Экспортируем MailService, чтобы он был доступен в других модулях
})
export class MailModule {}
