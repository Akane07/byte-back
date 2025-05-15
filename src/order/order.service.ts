import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument, OrderResponse, OrderResponseDocument } from './schemas/order.schema';
import { CreateOrderDto, UpdateOrderDto } from './dto/create-order.dto';
import { UserService } from '../user/user.service';

@Injectable()
export class OrderService {
    constructor(
        @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
        @InjectModel(OrderResponse.name) private readonly orderResponseModel: Model<OrderResponseDocument>,
        private readonly userService: UserService,
    ) { }

    async getOrderList(userId: string, page: number, categoryIds?: string[]) {
        const pageSize = 10;
        const skip = (page - 1) * pageSize;

        const filter: any = {};
        if (categoryIds && categoryIds.length > 0) {
            filter.category = { $in: categoryIds };
        }

        if (userId) {
            filter.user = { $ne: userId };
        }
        filter.draft = { $ne: true };

        const [orders, total] = await Promise.all([
            this.orderModel
                .find(filter)
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(pageSize)
                .exec(),
            this.orderModel.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(total / pageSize);

        return {
            orders,
            totalPages,
            currentPage: page,
        };
    }

    async getOrder(id: string) {
        const order = await this.orderModel.findById(id).exec();
        if (!order) {
            throw new NotFoundException('Order not found');
        }
        return order;
    }

    async getUserOrders(userId: string) {
        const orders = await this.orderModel.find({ user_id: userId, draft: { $ne: true } }).exec();
        return orders;
    }

    async getUserDrafts(id: string, userId: string) {
        if (id !== userId) {
            throw new NotFoundException('Drafts not found');
        }

        const orders = await this.orderModel.find({ user_id: id, draft: { $ne: false } }).exec();
        return orders;
    }

    async createOrder(userId: string, body: CreateOrderDto) {
        const order = new this.orderModel({ ...body, user_id: userId });
        await order.save();
        await this.userService.patchUserOrdersCount(userId, (await this.getUserOrders(userId)).length);
        return order;
    }

    async updateOrder(id: string, body: UpdateOrderDto, userId: string) {
        const order = await this.orderModel.findById(id).exec();

        if (!order) {
            throw new NotFoundException('Order not found');
        }

        if (order.user_id !== userId) {
            throw new NotFoundException('Order not found');
        }

        const protectedFields = ['user_id', 'created_at', 'response_count', 'viewed_by'];
        for (const field of protectedFields) {
            if (field in body) {
                throw new BadRequestException(`Field '${field}' cannot be updated`);
            }
        }

        order.set(body);

        if (!body.draft) {
            order.created_at = new Date();
            await this.userService.patchUserOrdersCount(order.user_id, (await this.getUserOrders(order.user_id)).length);
        }

        await order.save();

        return order;
    }

    async archiveOrder(id: string, userId: string) {
        const order = await this.orderModel.findById(id).exec();

        if (!order) {
            throw new NotFoundException('Order not found');
        }

        if (order.user_id !== userId) {
            throw new NotFoundException('Order not found');
        }

        order.is_active = false;
        await order.save();
        return order;
    }

    async deleteOrder(id: string, userId: string) {
        const order = await this.orderModel.findById(id).exec();

        if (!order) {
            throw new NotFoundException('Order not found');
        }

        if (order.user_id !== userId) {
            throw new NotFoundException('Order not found');
        }

        await order.deleteOne();
        await this.userService.patchUserOrdersCount(order.user_id, (await this.getUserOrders(order.user_id)).length);
        return 'order deleted';
    }

    async createOrderResponse(orderId: string, userId: string, body: { description: string }) {
        const order = await this.orderModel.findById(orderId).exec();

        if (!order) {
            throw new NotFoundException('Order not found');
        }

        if (order.user_id === userId) {
            throw new NotFoundException('Order not found');
        }

        const existing = await this.orderResponseModel.findOne({ order_id: orderId, user_id: userId });
        if (existing) {
            throw new BadRequestException('You already responded to this order');
        }

        const response = {
            order_id: orderId,
            user_id: userId,
            description: body.description,
        };

        const orderResponse = new this.orderResponseModel(response);
        await orderResponse.save();

        order.response_count += 1;
        await order.save();

        return orderResponse;
    }

    async getOrderResponses(orderId: string, userId: string) {
        const order = await this.orderModel.findById(orderId).exec();

        if (!order) {
            throw new NotFoundException('Order not found');
        }

        if (order.user_id === userId) {
            throw new NotFoundException('Order not found');
        }

        const responses = await this.orderResponseModel.find({ order_id: orderId }).exec();
        return responses;
    }

    async getOrderResponse(userId: string, orderId: string) {
        const response = await this.orderResponseModel.findOne({ order_id: orderId, user_id: userId }).exec();
        return response;
    }

    async getUserResponses(userId: string) {
        const responses = await this.orderResponseModel.find({ user_id: userId }).lean();

        if (!responses.length) return [];

        const orderIds = responses.map(res => res.order_id);
        const orders = await this.orderModel.find({ _id: { $in: orderIds } }).lean();
        const orderTitleMap = new Map(orders.map(order => [order._id.toString(), order.title]));
        const orderPriceMap = new Map(orders.map(order => [order._id.toString(), order.price]));
        const orderTypeMap = new Map(orders.map(order => [order._id.toString(), order.price_type]));
        const responsesWithTitles = responses.map(res => ({
            created_at: res.created_at,
            description: res.description,
            order_id: res.order_id,
            user_id: res.user_id,
            id: res._id,
            viewed: res.viewed,
            title: orderTitleMap.get(res.order_id) || '',
            price: orderPriceMap.get(res.order_id) || '',
            price_type: orderTypeMap.get(res.order_id) || '',
        }));

        return responsesWithTitles;
    }

    async viewOrder(userId: string, orderId: string) {
        const order = await this.orderModel.findById(orderId);
        if (!order) {
            throw new Error('Заказ не найден');
        }

        if (!order.viewed_by.includes(userId)) {
            order.viewed_by.push(userId);
            await order.save();
        }

        return order;
    }

    async deleteOrderResponse(user_id: string, order_id: string, response_id: string) {
        const response = await this.orderResponseModel.findById(response_id);

        if (!response) {
            throw new NotFoundException('Response not found');
        }

        if (response.user_id !== user_id) {
            throw new NotFoundException('Response not found');
        };

        await response.deleteOne();

        const order = await this.orderModel.findById(order_id);

        if (!order) return;

        order.response_count -= 1;
        order.save();

        return true;
    }

    async editOrderResponse(user_id: string, response_id: string, description: string) {
        const response = await this.orderResponseModel.findById(response_id);

        if (response.user_id !== user_id) {
            throw new NotFoundException('Response not found');
        };

        response.description = description;
        await response.save();

        return response;
    }
}
