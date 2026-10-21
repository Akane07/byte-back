import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { EmailNotVerifiedException } from '../auth/email-not-verified.exception';
import { escapeRegExp } from '../common/escape-regexp';
import { contributions } from '../ranking/ranking.math';
import { UserService } from '../user/user.service';
import {
  CreateOrderDto,
  OrderListQueryDto,
  UpdateOrderDto,
} from './dto/create-order.dto';
import { RecommendationsQueryDto } from './dto/recommendations-query.dto';
import {
  Order,
  OrderDocument,
  OrderResponse,
  OrderResponseDocument,
  OrderStatus,
} from './schemas/order.schema';

const PAGE_SIZE = 10;
const PUBLISH_REASON =
  'опубликовать заказ. Черновик можно сохранить и без этого';
/** Сделка идёт: исполнитель работает или работа на проверке. */
const DEAL_STATUSES: OrderStatus[] = ['pending', 'review'];

@Injectable()
export class OrderService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(OrderResponse.name)
    private readonly orderResponseModel: Model<OrderResponse>,
    private readonly userService: UserService,
  ) {}

  /**
   * Лента: чужие опубликованные заказы без исполнителя. userId нет у гостя —
   * тогда в ленте все заказы, свои исключать не из чего.
   */
  async getOrderList(userId: string | undefined, query: OrderListQueryDto) {
    const { page, categories, format, city, q, urgent } = query;
    const conditions: FilterQuery<Order>[] = [
      {
        ...(userId && { user_id: { $ne: userId } }),
        draft: { $ne: true },
        is_active: { $ne: false },
        performer: { $exists: false },
        status: { $nin: ['completed', 'cancelled'] },
      },
    ];

    if (categories?.length) {
      conditions.push({ category: { $in: categories } });
    }
    if (urgent) {
      conditions.push({ urgent: true });
    }
    // У старых заказов поля work_format нет — они удалённые.
    if (format === 'onsite') {
      conditions.push({ work_format: 'onsite' });
    } else if (format === 'remote') {
      conditions.push({ work_format: { $ne: 'onsite' } });
    }
    // Город отсекает только заказы на месте: удалённую работу можно
    // делать из любого города, поэтому она остаётся в ленте.
    if (city) {
      conditions.push({
        $or: [{ work_format: { $ne: 'onsite' } }, { city }],
      });
    }
    const search = q?.trim();
    if (search) {
      const re = new RegExp(escapeRegExp(search), 'i');
      conditions.push({
        $or: [{ title: re }, { description: re }, { skills: re }],
      });
    }

    const filter: FilterQuery<Order> = { $and: conditions };
    const [orders, total] = await Promise.all([
      this.orderModel
        .find(filter)
        // Срочные — выше, внутри — от новых к старым.
        .sort({ urgent: -1, created_at: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE),
      this.orderModel.countDocuments(filter),
    ]);

    return {
      orders: orders.map((order) => forViewer(order, userId)),
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      currentPage: page,
    };
  }

  /** Черновик виден только автору — раньше любой мог открыть чужой по id. */
  async getOrder(id: string, userId?: string) {
    const order = await this.findOrder(id);
    if (order.draft && order.user_id !== userId) {
      throw new NotFoundException('Заказ не найден');
    }
    return order;
  }

  /** Заказ для показа пользователю: без адреса, если смотрит посторонний. */
  async getOrderForViewer(id: string, userId?: string) {
    return forViewer(await this.getOrder(id, userId), userId);
  }

  async getUserOrders(ownerId: string, viewerId?: string) {
    const orders = await this.orderModel
      .find({ user_id: ownerId, draft: { $ne: true } })
      .sort({ created_at: -1 });
    return orders.map((order) => forViewer(order, viewerId));
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
    const order = new this.orderModel({ ...dto, user_id: userId });
    normalizeLocation(order);
    if (isListed(order)) {
      await this.assertVerified(userId, PUBLISH_REASON);
    }
    await order.save();
    await this.syncOrdersCount(userId);
    return order;
  }

  async updateOrder(id: string, dto: UpdateOrderDto, userId: string) {
    const order = await this.findOwnOrder(id, userId);

    // Дата публикации ставится в момент выхода из черновика, а не при
    // каждом редактировании — иначе любая правка поднимала заказ в ленте.
    const publishing = order.draft && dto.draft === false;
    const wasListed = isListed(order);
    if (dto.draft || dto.is_active === false) {
      assertCanHide(order);
    }
    order.set(dto);
    normalizeLocation(order);
    // Правка заказа, который уже в ленте, публикацией не считается.
    if (!wasListed && isListed(order)) {
      await this.assertVerified(userId, PUBLISH_REASON);
    }
    if (publishing) {
      order.created_at = new Date();
    }
    await order.save();

    await this.syncOrdersCount(userId);
    return order;
  }

  async archiveOrder(id: string, userId: string) {
    const order = await this.findOwnOrder(id, userId);
    assertCanHide(order);
    order.is_active = false;
    await order.save();
    return order;
  }

  /**
   * Заказ без исполнителя автор отменяет сам. Одна условная запись: статус
   * проверяется в самой операции, причину отказа ищем только после неё.
   */
  async cancelOrder(id: string, userId: string) {
    const order = await this.orderModel.findOneAndUpdate(
      { _id: id, user_id: userId, status: 'active', draft: { $ne: true } },
      { status: 'cancelled' },
      { returnDocument: 'after' },
    );
    if (order) return order;

    const current = await this.findOwnOrder(id, userId);
    throw new BadRequestException(
      current.draft
        ? 'Черновик не отменяют — его можно удалить'
        : current.status === 'cancelled'
          ? 'Заказ уже отменён'
          : current.status === 'completed'
            ? 'Выполненный заказ отменить нельзя'
            : 'У заказа есть исполнитель — отмену нужно предложить ему в чате',
    );
  }

  /** Заказ, отмену которого участник может предложить второй стороне. */
  async getDealToCancel(orderId: string, userId: string) {
    const order = await this.findOrder(orderId);
    if (order.user_id !== userId && order.performer !== userId) {
      throw new ForbiddenException('Отменить заказ могут только его участники');
    }
    if (!DEAL_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        'Предложить отмену можно только для заказа в работе или на проверке',
      );
    }
    return order;
  }

  /**
   * Отмена сделки: заказ в работе или на проверке → cancelled. Без чтения
   * перед записью — одна условная операция. Если параллельно приняли работу,
   * условие уже не выполнится, и у заказа останется один конечный статус.
   */
  async cancelDeal(orderId: string, participants: [string, string]) {
    const [a, b] = participants;
    const order = await this.orderModel.findOneAndUpdate(
      {
        _id: orderId,
        status: { $in: DEAL_STATUSES },
        $or: [
          { user_id: a, performer: b },
          { user_id: b, performer: a },
        ],
      },
      { status: 'cancelled' },
      { returnDocument: 'after' },
    );
    if (!order) {
      throw new BadRequestException(
        'Заказ уже не в работе — отменить его нельзя',
      );
    }
    return order;
  }

  async deleteOrder(id: string, userId: string) {
    const order = await this.findOwnOrder(id, userId);
    // Исполнитель остаётся в заказе и после отмены: на заказ ссылаются чат
    // и отзывы, он есть в истории второй стороны.
    if (order.performer) {
      throw new BadRequestException(
        'Заказ, у которого был исполнитель, удалить нельзя: он остаётся в истории второй стороны',
      );
    }
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
    if (!isListed(order)) {
      throw new BadRequestException('Заказ не принимает отклики');
    }

    const existing = await this.orderResponseModel.exists({
      order_id: orderId,
      user_id: userId,
    });
    if (existing) {
      throw new BadRequestException('Вы уже откликнулись на этот заказ');
    }
    await this.assertVerified(userId, 'откликнуться на заказ');

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

  /**
   * Подбор исполнителей под свой заказ. Чужой заказ — 403 (чужой черновик —
   * 404, как в getOrder); не опубликованный в статусе active — пустой список.
   */
  async getRecommendations(
    orderId: string,
    userId: string,
    { limit, explain }: RecommendationsQueryDto,
  ) {
    const order = await this.getOrder(orderId, userId);
    if (order.user_id !== userId) {
      throw new ForbiddenException('Подбор доступен только автору заказа');
    }
    if (order.status !== 'active' || !order.is_active || order.draft) return [];

    const ranked = (await this.userService.getOrderCandidates(order)).slice(
      0,
      limit,
    );
    const responded = new Set(
      (
        await this.orderResponseModel
          .find({
            order_id: orderId,
            user_id: { $in: ranked.map((r) => r.candidate.id) },
          })
          .select('user_id')
      ).map((r) => r.user_id),
    );
    return ranked.map(({ candidate, ranking }) => ({
      ...candidate,
      isNewcomer: ranking.isNewcomer,
      alreadyResponded: responded.has(candidate.id),
      ...(explain && {
        ranking: { ...ranking, contributions: contributions(ranking.factors) },
      }),
    }));
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

  /**
   * Видимость — как в getOrder. Ответ пустой: раньше здесь возвращался
   * заказ целиком, с адресом и содержимым чужого черновика.
   */
  async viewOrder(userId: string, orderId: string) {
    await this.getOrder(orderId, userId);
    await this.orderModel.updateOne(
      { _id: orderId },
      { $addToSet: { viewed_by: userId } },
    );
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
   * actorId — тот, кто нажал «Принять».
   */
  async assignPerformer(
    orderId: string,
    participants: [string, string],
    performerId: string,
    actorId: string,
  ) {
    const order = await this.findOrder(orderId);
    const [a, b] = participants;
    const customerId = performerId === a ? b : a;

    if (order.user_id !== customerId || !participants.includes(performerId)) {
      throw new ForbiddenException('Заказ не принадлежит участникам диалога');
    }
    // Старые отклики и предложения по отменённому заказу остаются в чатах.
    if (order.status === 'cancelled') {
      throw new BadRequestException('Заказ отменён');
    }
    // Статус у черновика и заказа в архиве — active, его проверки мало.
    if (order.draft || !order.is_active) {
      throw new BadRequestException('Заказ снят с публикации');
    }
    if (order.performer || order.status !== 'active') {
      throw new BadRequestException('У заказа уже есть исполнитель');
    }
    await this.assertDealVerified(customerId, performerId, actorId);

    order.performer = performerId;
    order.status = 'pending';
    await order.save();
    return order;
  }

  /** Исполнитель сдаёт работу: заказ уходит на проверку заказчику. */
  async submitWork(orderId: string, performerId: string) {
    const order = await this.findOrder(orderId);
    if (order.performer !== performerId) {
      throw new ForbiddenException('Сдать работу может только исполнитель');
    }
    if (order.status === 'review') {
      throw new BadRequestException('Работа уже на проверке у заказчика');
    }
    if (order.status !== 'pending') {
      throw new BadRequestException('Заказ не в работе');
    }
    order.status = 'review';
    await order.save();
    return order;
  }

  /**
   * Ответ заказчика на сданную работу: принять (заказ завершён)
   * или вернуть на доработку (снова в работе).
   */
  async reviewWork(orderId: string, customerId: string, accepted: boolean) {
    const order = await this.findOrder(orderId);
    if (order.user_id !== customerId) {
      throw new ForbiddenException('Принять работу может только заказчик');
    }
    if (order.status !== 'review') {
      throw new BadRequestException('Работа по заказу не на проверке');
    }
    order.status = accepted ? 'completed' : 'pending';
    if (accepted) order.completed_at = new Date();
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

  private async assertVerified(userId: string, reason: string) {
    const user = await this.userService.getUser(userId);
    if (!user.is_verified) {
      throw new EmailNotVerifiedException(`Подтвердите почту, чтобы ${reason}`);
    }
  }

  /**
   * Сделка — только между подтверждёнными: так в неё не попадут ни отклики,
   * ни заказы, созданные до обязательного подтверждения. Свою почту
   * подтвердить можно сразу (403 с кодом), про чужую — только сообщить.
   */
  private async assertDealVerified(
    customerId: string,
    performerId: string,
    actorId: string,
  ) {
    const actorIsPerformer = actorId === performerId;
    await this.assertVerified(
      actorId,
      actorIsPerformer ? 'взять заказ' : 'выбрать исполнителя',
    );
    const other = await this.userService.getUser(
      actorIsPerformer ? customerId : performerId,
    );
    if (!other.is_verified) {
      throw new BadRequestException(
        actorIsPerformer
          ? 'Заказчик ещё не подтвердил почту'
          : 'Исполнитель ещё не подтвердил почту',
      );
    }
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

/**
 * Заказ ищет исполнителя и виден в ленте. Переход в это состояние —
 * публикация: из черновика или из архива.
 */
export function isListed(order: Pick<Order, 'status' | 'draft' | 'is_active'>) {
  return order.status === 'active' && !order.draft && order.is_active !== false;
}

/**
 * В черновик и в архив уходит только заказ, который ищет исполнителя.
 * Заказ с исполнителем закрывается отменой, отменённый — уже закрыт.
 */
function assertCanHide(order: Pick<Order, 'status'>) {
  if (order.status !== 'active') {
    throw new BadRequestException(
      'Вернуть в черновик или отправить в архив можно только заказ, который ищет исполнителя',
    );
  }
}

/**
 * Город и адрес нужны только заказу на месте. У удалённого их стираем,
 * чтобы после смены формата в базе не оставался чужой адрес. Опубликовать
 * заказ на месте без города нельзя — исполнители не поймут, куда ехать;
 * в черновике город можно указать позже.
 */
function normalizeLocation(order: OrderDocument) {
  if (order.work_format !== 'onsite') {
    order.city = undefined;
    order.address = undefined;
    return;
  }
  if (order.address !== undefined) {
    order.address = order.address.trim() || undefined;
  }
  if (!order.city && !order.draft) {
    throw new BadRequestException('Укажите город, где нужно выполнить заказ');
  }
}

/**
 * Точный адрес видят только заказчик и выбранный исполнитель. Остальным
 * хватит города: адрес квартиры в открытой ленте — подарок мошенникам.
 */
export function forViewer(order: OrderDocument, viewerId?: string) {
  const json = order.toJSON() as unknown as Order & { id: string };
  const insider =
    !!viewerId && (viewerId === order.user_id || viewerId === order.performer);
  if (!insider) {
    delete json.address;
  }
  return json;
}
