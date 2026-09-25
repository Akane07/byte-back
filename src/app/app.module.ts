import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CategoryModule } from '../category/category.module';
import { ChatModule } from '../chat/chat.module';
import { OrderModule } from '../order/order.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI', 'mongodb://localhost:27017/byte'),
      }),
    }),
    UserModule,
    AuthModule,
    OrderModule,
    PortfolioModule,
    CategoryModule,
    ChatModule,
  ],
})
export class AppModule {}
