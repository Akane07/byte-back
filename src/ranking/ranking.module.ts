import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../order/schemas/order.schema';
import { RankingService } from './ranking.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
  ],
  providers: [RankingService],
  exports: [RankingService],
})
export class RankingModule {}
