import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserModule } from '../user/user.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import {
  Order,
  OrderResponse,
  OrderResponseSchema,
  OrderSchema,
} from './schemas/order.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: OrderResponse.name, schema: OrderResponseSchema },
    ]),
    UserModule,
  ],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
