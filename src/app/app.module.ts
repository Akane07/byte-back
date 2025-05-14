import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { AppController } from './app.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';
import { OrderModule } from 'src/order/order.module';
import { PortfolioModule } from 'src/portfolio/portfolio.module';
import { CategoryModule } from 'src/category/category.module';
import { ChatModule } from 'src/chat/chat.module';
import { UploadController } from 'src/chat/upload.controller';

@Module({
  imports: [
    MongooseModule.forRoot('mongodb://localhost:27017/byte'),
    UserModule,
    AuthModule,
    OrderModule,
    PortfolioModule,
    CategoryModule,
    ChatModule,
  ],
  controllers: [AppController, UploadController],
  providers: [AppService],
})
export class AppModule {}

