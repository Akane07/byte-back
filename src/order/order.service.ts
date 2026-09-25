import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { UserService } from '../user/user.service';
import { CreateOrderDto, UpdateOrderDto } from './dto/create-order.dto';
import {
  Order,
  OrderDocument,
  OrderResponse,
  OrderResponseDocument,
} from './schemas/order.schema';

const PAGE_SIZE = 10;

@Injectable()
export class OrderService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(OrderResponse.name)
    private readonly orderResponseModel: Model<OrderResponse>,
    private readonly userService: UserService,
  ) {}

  /** Лента: чужие опубликованные заказы без исполнителя. */
  async getOrderList(userId: string, page: number, categories?: number[]) {
    const filter: FilterQuery<Order> = {
      user_id: { $ne: userId },
      draft: { $ne: true },
      is_active: { $ne: false },
      performer: { $exists: false },
      status: { $nin: ['completed', 'cancelled'] },
    };
    if (categories?.length) {
      filter.category = { $in: categories };
    }

    const [orders, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ created_at: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE),
      this.orderModel.countDocuments(filter),
    ]);

    return {
      orders,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      currentPage: page,
    };
  }

  async getOrder(id: string) {
    return this.findOrder(id);
  }

  getUserOrders(userId: string) {
    return this.orderModel
      .find({ user_id: userId, draft: { $ne: true } })
      .sort({ created_at: -1 });
  }

  getUserDrafts(ownerId: string, userId: string) {
    if (ownerId !== userId) {
      throw new ForbiddenException('Чужие черновики недоступны');
    }
    return this.orderModel
      .find({ user_id: userId, draft: true })
      .sort({ created_at: -1 });
  }

  async createOrder(userId: string, dto: CreateOrderDto) {
    const order = await this.orderModel.create({ ...dto, user_id: userId });
    await this.syncOrdersCount(userId);
    return order;
  }

  async updateOrder(id: string, dto: UpdateOrderDto, userId: string) {
    const order = await this.findOwnOrder(id, userId);

    // Дата публикации ставится в момент выхода из черновика, а не при
    // каждом редактировании — иначе любая правка поднимала заказ в ленте.
    const publishing = order.draft && dto.draft === false;
    order.set(dto);
    if (publishing) {
      order.created_at = new Date();
    }
    await order.save();

    await this.syncOrdersCount(userId);
    return order;
  }

  async archiveOrder(id: string, userId: string) {
    const order = await this.findOwnOrder(id, userId);
    order.is_active = false;
    await order.save();
    return order;
  }

  async deleteOrder(id: string, userId: string) {
    const order = await this.findOwnOrder(id, userId);
    await Promise.all([
      order.deleteOne(),
      this.orderResponseModel.deleteMany({ order_id: id }),
    ]);
    await this.syncOrdersCount(userId);
    return { deleted: true };
  }

  async createOrderResponse(
    orderId: string,
    userId: string,
    description: string,
  ) {
    const order = await this.findOrder(orderId);

    if (order.user_id === userId) {
      throw new BadRequestException('Нельзя откликнуться на свой заказ');
    }
    if (order.draft || !order.is_active || order.performer) {
      throw new BadRequestException('Заказ не принимает отклики');
    }

    const existing = await this.orderResponseModel.exists({
      order_id: orderId,
      user_id: userId,
    });
    if (existing) {
      throw new BadRequestException('Вы уже откликнулись на этот заказ');
    }

    const response = await this.orderResponseModel.create({
      order_id: orderId,
      user_id: userId,
      description,
    });
    await this.orderModel.updateOne(
      { _id: orderId },
      { $inc: { response_count: 1 } },
    );

    return response;
  }

  /** Все отклики на заказ — только для его владельца. */
  async getOrderResponses(orderId: string, userId: string) {
    await this.findOwnOrder(orderId, userId);
    return this.orderResponseModel
      .find({ order_id: orderId })
      .sort({ created_at: -1 });
  }

  /** Свой отклик на заказ или null, если откликов не было. */
  getOrderResponse(userId: string, orderId: string) {
    return this.orderResponseModel.findOne({
      order_id: orderId,
      user_id: userId,
    });
  }

  /** Отклик по id — видят только его автор и владелец заказа. */
  async getOrderResponseById(responseId: string, userId: string) {
    const response = await this.findResponse(responseId);
    if (response.user_id !== userId) {
      const order = await this.orderModel.findById(response.order_id);
      if (order?.user_id !== userId) {
        throw new NotFoundException('Отклик не найден');
      }
    }
    return response;
  }

  async getUserResponses(userId: string) {
    const responses = await this.orderResponseModel
      .find({ user_id: userId })
      .sort({ created_at: -1 })
      .lean();
    if (!responses.length) return [];

    const orders = await this.orderModel
      .find({ _id: { $in: responses.map((r) => r.order_id) } })
      .lean();
    const orderById = new Map(
      orders.map((order) => [order._id.toString(), order]),
    );

    return responses.map((res) => {
      const order = orderById.get(res.order_id);
      return {
        id: res._id.toString(),
        order_id: res.order_id,
        user_id: res.user_id,
        description: res.description,
        created_at: res.created_at,
        viewed: res.viewed,
        messageId: res.messageId,
        title: order?.title ?? 'Заказ удалён',
        price: order?.price ?? 0,
        price_type: order?.price_type ?? 'contract',
      };
    });
  }

  async viewOrder(userId: string, orderId: string) {
    const order = await this.orderModel.findByIdAndUpdate(
      orderId,
      { $addToSet: { viewed_by: userId } },
      { new: true },
    );
    if (!order) {
      throw new NotFoundException('Заказ не найден');
    }
    return order;
  }

  async deleteOrderResponse(userId: string, responseId: string) {
    const response = await this.findResponse(responseId);
    if (response.user_id !== userId) {
      throw new NotFoundException('Отклик не найден');
    }

    await response.deleteOne();
    await this.orderModel.updateOne(
      { _id: response.order_id, response_count: { $gt: 0 } },
      { $inc: { response_count: -1 } },
    );

    return { deleted: true, messageId: response.messageId };
  }

  async editOrderResponse(
    userId: string,
    responseId: string,
    description: string,
  ) {
    const response = await this.findResponse(responseId);
    if (response.user_id !== userId) {
      throw new NotFoundException('Отклик не найден');
    }

    response.description = description;
    await response.save();
    return response;
  }

  /** Привязывает к отклику сообщение в чате, в котором он был отправлен. */
  async attachResponseMessage(
    responseId: string,
    userId: string,
    messageId: string,
  ) {
    await this.orderResponseModel.updateOne(
      { _id: responseId, user_id: userId },
      { messageId },
    );
  }

  /**
   * Назначает исполнителя. Вызывается при принятии предложения в чате:
   * заказчик выбирает исполнителя, либо исполнитель принимает предложение
   * заказчика. В обоих случаях заказ принадлежит одному из двух участников.
   */
  async assignPerformer(
    orderId: string,
    participants: [string, string],
    performerId: string,
  ) {
    const order = await this.findOrder(orderId);
    const [a, b] = participants;
    const customerId = performerId === a ? b : a;

    if (order.user_id !== customerId || !participants.includes(performerId)) {
      throw new ForbiddenException('Заказ не принадлежит участникам диалога');
    }
    if (order.performer || order.status !== 'active') {
      throw new BadRequestException('У заказа уже есть исполнитель');
    }

    order.performer = performerId;
    order.status = 'pending';
    await order.save();
    return order;
  }

  /** Исполнитель сообщает, что работа выполнена. */
  async completeOrder(orderId: string, performerId: string) {
    const order = await this.findOrder(orderId);
    if (order.performer !== performerId) {
      throw new ForbiddenException('Завершить заказ может только исполнитель');
    }
    order.status = 'completed';
    await order.save();
    return order;
  }

  /** Незавершённые заказы, связывающие двух пользователей. */
  getOrdersBetweenUsers(userId: string, otherId: string) {
    if (userId === otherId) return [];
    return this.orderModel.find({
      $or: [
        { user_id: userId, performer: otherId },
        { user_id: otherId, performer: userId },
      ],
      draft: { $ne: true },
      status: { $nin: ['completed', 'cancelled'] },
    });
  }

  private async findOrder(id: string): Promise<OrderDocument> {
    const order = await this.orderModel.findById(id);
    if (!order) {
      throw new NotFoundException('Заказ не найден');
    }
    return order;
  }

  /** Чужой заказ отдаём как «не найден», чтобы не раскрывать его существование. */
  private async findOwnOrder(id: string, userId: string) {
    const order = await this.findOrder(id);
    if (order.user_id !== userId) {
      throw new NotFoundException('Заказ не найден');
    }
    return order;
  }

  private async findResponse(id: string): Promise<OrderResponseDocument> {
    const response = await this.orderResponseModel.findById(id);
    if (!response) {
      throw new NotFoundException('Отклик не найден');
    }
    return response;
  }

  private async syncOrdersCount(userId: string) {
    const count = await this.orderModel.countDocuments({
      user_id: userId,
      draft: { $ne: true },
    });
    await this.userService.setOrdersCount(userId, count);
  }
}
