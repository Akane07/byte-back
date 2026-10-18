import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { User } from '../auth/schemas/user.schema';
import { ChatGateway } from '../chat/chat.gateway';
import { Order } from '../order/schemas/order.schema';
import { CreateReviewDto } from './dto/review.dto';
import { Review, ReviewDocument, ReviewRole } from './schemas/review.schema';

const DAY = 24 * 60 * 60 * 1000;
/** Сколько дней после завершения заказа можно оставить отзыв. */
export const REVIEW_WINDOW_DAYS = 14;
/** Отзыв с оценкой не выше этой должен объяснять, что пошло не так. */
const LOW_RATING = 2;
const MIN_LOW_RATING_TEXT = 10;
const PAGE_SIZE = 10;
/** Как часто открывать отзывы, у которых закончилось окно. */
const PUBLISH_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Байесовское среднее для сортировки каталога: к оценкам исполнителя
 * «подмешиваются» PRIOR_WEIGHT воображаемых отзывов со средней оценкой
 * PRIOR_MEAN. С ростом числа настоящих отзывов их влияние исчезает.
 */
const PRIOR_MEAN = 4.5;
const PRIOR_WEIGHT = 3;

export function bayesianScore(average: number, count: number) {
  if (!count) return 0;
  return (average * count + PRIOR_MEAN * PRIOR_WEIGHT) / (count + PRIOR_WEIGHT);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

type PublicAuthor = Pick<User, 'name' | 'nickname' | 'avatar'> & {
  id: string;
};

@Injectable()
export class ReviewService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReviewService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    @InjectModel(Review.name) private readonly reviewModel: Model<Review>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly chat: ChatGateway,
  ) {}

  onModuleInit() {
    void this.publishDue();
    this.timer = setInterval(() => void this.publishDue(), PUBLISH_INTERVAL_MS);
    // Таймер не должен держать процесс (тесты, завершение сервера).
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  // --- Отзыв ---

  async create(authorId: string, dto: CreateReviewDto) {
    const order = await this.orderModel.findById(dto.orderId);
    if (!order || order.draft) {
      throw new NotFoundException('Заказ не найден');
    }

    const isCustomer = order.user_id === authorId;
    const isPerformer = order.performer === authorId;
    if (!isCustomer && !isPerformer) {
      throw new ForbiddenException(
        'Отзыв могут оставить только участники заказа',
      );
    }
    if (order.status !== 'completed') {
      throw new BadRequestException(
        'Отзыв можно оставить после завершения заказа',
      );
    }
    const closesAt = windowCloses(order);
    if (!closesAt || closesAt.getTime() < Date.now()) {
      throw new BadRequestException(
        `Отзыв можно оставить в течение ${REVIEW_WINDOW_DAYS} дней после завершения заказа`,
      );
    }
    if (dto.rating <= LOW_RATING && dto.text.length < MIN_LOW_RATING_TEXT) {
      throw new BadRequestException(
        'Расскажите, что пошло не так: низкую оценку нужно пояснить',
      );
    }

    const targetId = isCustomer ? order.performer! : order.user_id;
    let review: ReviewDocument;
    try {
      review = await this.reviewModel.create({
        order_id: order.id,
        author_id: authorId,
        target_id: targetId,
        // Заказчик оценивает исполнителя, и наоборот.
        target_role: isCustomer ? 'performer' : 'customer',
        rating: dto.rating,
        text: dto.text,
        publish_at: closesAt,
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new BadRequestException('Вы уже оставили отзыв по этому заказу');
      }
      throw error;
    }

    // Вторая сторона уже оценила — открываем оба отзыва сразу.
    const counterpart = await this.reviewModel.findOne({
      order_id: order.id,
      author_id: targetId,
    });
    if (counterpart) {
      await this.publish([review, counterpart]);
    } else {
      await this.chat.notify(
        authorId,
        targetId,
        `${isCustomer ? 'Заказчик' : 'Исполнитель'} оставил отзыв по заказу «${order.title}». ` +
          'Оцените сотрудничество и вы: отзывы откроются, когда оба оценят друг друга ' +
          `или через ${REVIEW_WINDOW_DAYS} дней после завершения заказа.`,
      );
    }

    return review.toJSON();
  }

  /** Ответ на отзыв о себе — один, только на опубликованный. */
  async reply(reviewId: string, userId: string, text: string) {
    const review = isValidObjectId(reviewId)
      ? await this.reviewModel.findById(reviewId)
      : null;
    if (!review || !review.published) {
      throw new NotFoundException('Отзыв не найден');
    }
    if (review.target_id !== userId) {
      throw new ForbiddenException('Ответить можно только на отзыв о себе');
    }
    if (review.reply) {
      throw new BadRequestException('Вы уже ответили на этот отзыв');
    }
    review.reply = { text, created_at: new Date() };
    await review.save();
    return review.toJSON();
  }

  // --- Чтение ---

  /** Опубликованные отзывы о пользователе в роли исполнителя или заказчика. */
  async listForUser(userId: string, role: ReviewRole, page: number) {
    const filter = { target_id: userId, target_role: role, published: true };
    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .sort({ published_at: -1, _id: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE),
      this.reviewModel.countDocuments(filter),
    ]);

    const [authors, orders] = await Promise.all([
      this.authorsById(reviews.map((r) => r.author_id)),
      this.orderModel.find(
        {
          _id: { $in: reviews.map((r) => r.order_id).filter(isValidObjectId) },
        },
        { title: 1 },
      ),
    ]);
    const titles = new Map(orders.map((o) => [o.id as string, o.title]));

    return {
      reviews: reviews.map((r) => ({
        ...r.toJSON(),
        author: authors.get(r.author_id) ?? null,
        order: {
          id: r.order_id,
          title: titles.get(r.order_id) ?? 'Заказ удалён',
        },
      })),
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      currentPage: page,
    };
  }

  /** Сводка для профиля: среднее, число и распределение оценок по ролям. */
  async summary(userId: string) {
    const [rows, completedAsPerformer] = await Promise.all([
      this.reviewModel.aggregate<{
        _id: { role: ReviewRole; rating: number };
        count: number;
      }>([
        { $match: { target_id: userId, published: true } },
        {
          $group: {
            _id: { role: '$target_role', rating: '$rating' },
            count: { $sum: 1 },
          },
        },
      ]),
      this.orderModel.countDocuments({
        performer: userId,
        status: 'completed',
      }),
    ]);

    const byRole = (role: ReviewRole) => {
      const distribution: Record<number, number> = {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
      };
      for (const row of rows) {
        if (row._id.role === role) distribution[row._id.rating] = row.count;
      }
      const count = Object.values(distribution).reduce((a, b) => a + b, 0);
      const sum = Object.entries(distribution).reduce(
        (acc, [rating, n]) => acc + Number(rating) * n,
        0,
      );
      return { average: count ? round1(sum / count) : 0, count, distribution };
    };

    return {
      performer: byRole('performer'),
      customer: byRole('customer'),
      completedAsPerformer,
    };
  }

  /**
   * Заказы, по которым пользователь ещё может оставить отзыв: завершены не
   * раньше REVIEW_WINDOW_DAYS дней назад, и его отзыва ещё нет.
   */
  async pending(userId: string) {
    const since = new Date(Date.now() - REVIEW_WINDOW_DAYS * DAY);
    const orders = await this.orderModel
      .find({
        status: 'completed',
        completed_at: { $gte: since },
        $or: [{ user_id: userId }, { performer: userId }],
      })
      .sort({ completed_at: -1 });
    if (!orders.length) return [];

    const done = new Set(
      (
        await this.reviewModel.find(
          {
            author_id: userId,
            order_id: { $in: orders.map((o) => o.id as string) },
          },
          { order_id: 1 },
        )
      ).map((r) => r.order_id),
    );
    const open = orders.filter((o) => !done.has(o.id as string));
    const partnerOf = (o: (typeof orders)[number]) =>
      o.user_id === userId ? o.performer! : o.user_id;
    const partners = await this.authorsById(open.map(partnerOf));

    return open.map((o) => ({
      order: {
        id: o.id as string,
        title: o.title,
        completed_at: o.completed_at,
      },
      // Роль того, кого предстоит оценить.
      role: (o.user_id === userId ? 'performer' : 'customer') as ReviewRole,
      partner: partners.get(partnerOf(o)) ?? null,
      deadline: windowCloses(o),
    }));
  }

  // --- Публикация и рейтинг ---

  /** Открыть отзывы, у которых закончилось окно (вызывается по таймеру). */
  async publishDue() {
    try {
      const due = await this.reviewModel.find({
        published: false,
        publish_at: { $lte: new Date() },
      });
      if (due.length) {
        await this.publish(due);
        this.logger.log(`Открыто отзывов по истечении срока: ${due.length}`);
      }
    } catch (error) {
      this.logger.error('Не удалось открыть отзывы', error as Error);
    }
  }

  private async publish(reviews: ReviewDocument[]) {
    const now = new Date();
    await this.reviewModel.updateMany(
      { _id: { $in: reviews.map((r) => r._id) }, published: false },
      { published: true, published_at: now },
    );
    const targets = new Set(reviews.map((r) => r.target_id));
    await Promise.all([...targets].map((id) => this.recalculate(id)));
  }

  /**
   * Пересчитать рейтинги пользователя по опубликованным отзывам. Средние
   * хранятся в профиле, а не считаются на лету: по ним сортируется каталог.
   */
  async recalculate(userId: string) {
    const rows = await this.reviewModel.aggregate<{
      _id: ReviewRole;
      average: number;
      count: number;
    }>([
      { $match: { target_id: userId, published: true } },
      {
        $group: {
          _id: '$target_role',
          average: { $avg: '$rating' },
          count: { $sum: 1 },
        },
      },
    ]);
    const performer = rows.find((r) => r._id === 'performer');
    const customer = rows.find((r) => r._id === 'customer');

    await this.userModel.updateOne(
      { _id: userId },
      {
        rating: performer ? round1(performer.average) : 0,
        reviews_count: performer?.count ?? 0,
        rating_score: performer
          ? bayesianScore(performer.average, performer.count)
          : 0,
        customer_rating: customer ? round1(customer.average) : 0,
        customer_reviews_count: customer?.count ?? 0,
      },
    );
  }

  private async authorsById(ids: string[]) {
    const unique = [...new Set(ids)].filter(isValidObjectId);
    const users = await this.userModel.find(
      { _id: { $in: unique } },
      { name: 1, nickname: 1, avatar: 1 },
    );
    return new Map<string, PublicAuthor>(
      users.map((u) => [
        u.id as string,
        {
          id: u.id as string,
          name: u.name,
          nickname: u.nickname,
          avatar: u.avatar,
        },
      ]),
    );
  }
}

/** Конец окна для отзывов. Нет даты завершения (старые заказы) — окна нет. */
function windowCloses(order: Pick<Order, 'completed_at'>) {
  return order.completed_at
    ? new Date(
        new Date(order.completed_at).getTime() + REVIEW_WINDOW_DAYS * DAY,
      )
    : null;
}
