import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument, OrderResponse, OrderResponseDocument } from './schemas/order.schema';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrderService {
    constructor(
        @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
        @InjectModel(OrderResponse.name) private readonly orderResponseModel: Model<OrderResponseDocument>,
    ) { }

    async getOrderList() {
        const orders = await this.orderModel.find().exec();

        return orders;
    }

    async getOrder(id: string) {
        const order = await this.orderModel.findById(id).exec();
        if (!order) {
            throw new NotFoundException('Order not found');
        }
        return order;
    }

    async getUserOrders(userId: string) {
        const orders = await this.orderModel.find({ user_id: userId }).exec();
        return orders;
    }

    async createOrder(userId: string, body: CreateOrderDto) {
        const order = new this.orderModel({ ...body, user_id: userId });
        await order.save();
        return order;
    }

    async updateOrder(id: string, body: CreateOrderDto) {
        const order = await this.orderModel.findById(id).exec();
        if (!order) {
            throw new NotFoundException('Order not found');
        }
        order.set(body);
        await order.save();
        return order;
    }

    async archiveOrder(id: string) {
        const order = await this.orderModel.findById(id).exec();
        if (!order) {
            throw new NotFoundException('Order not found');
        }
        order.is_active = false;
        await order.save();
        return order;
    }

    async deleteOrder(id: string) {
        const order = await this.orderModel.findByIdAndDelete(id).exec();
        if (!order) {
            throw new NotFoundException('Order not found');
        }
        return 'order deleted';
    }

    async createOrderResponse(orderId: string, userId: string, body: { description: string }) {
        const response = {
            order_id: orderId,
            user_id: userId,
            description: body.description,
        };

        const orderResponse = new this.orderResponseModel(response);
        await orderResponse.save();
        return orderResponse;
    }

    async getOrderResponses(orderId: string) {
        const responses = await this.orderResponseModel.find({ order_id: orderId }).exec();
        return responses;
    }

    async getOrderResponse(userId: string, orderId: string) {
        const response = await this.orderResponseModel.findOne({ order_id: orderId, user_id: userId }).exec();
        return response;
    }

    async viewOrder(userId: string, orderId: string) {
        const order = await this.orderModel.findById(orderId);
        if (!order) {
          throw new Error('Заказ не найден');
        }
      
        // Если юзер ещё не смотрел этот заказ, добавляем его в список
        if (!order.viewed_by.includes(userId)) {
          order.viewed_by.push(userId);
          await order.save();
        }
      
        return order;
      }
}
