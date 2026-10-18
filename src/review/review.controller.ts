import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe';
import {
  CreateReviewDto,
  ReplyReviewDto,
  ReviewListQueryDto,
} from './dto/review.dto';
import { REVIEW_WINDOW_DAYS, ReviewService } from './review.service';

@Controller('reviews')
@ApiBearerAuth()
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Оставить отзыв по завершённому заказу',
    description:
      `В течение ${REVIEW_WINDOW_DAYS} дней после завершения. Отзыв откроется, ` +
      'когда вторая сторона тоже оставит отзыв, или когда закончится этот срок',
  })
  create(@UserId() userId: string, @Body() dto: CreateReviewDto) {
    return this.reviewService.create(userId, dto);
  }

  @Get('pending')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Завершённые заказы, по которым можно оставить отзыв',
  })
  pending(@UserId() userId: string) {
    return this.reviewService.pending(userId);
  }

  @Post(':id/reply')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Ответить на отзыв о себе' })
  reply(
    @UserId() userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: ReplyReviewDto,
  ) {
    return this.reviewService.reply(id, userId, dto.text);
  }

  @Get('user/:id')
  @ApiOperation({
    summary: 'Отзывы о пользователе',
    description: '?role=performer|customer&page=1, по 10 на страницу',
  })
  list(
    @Param('id', ParseObjectIdPipe) id: string,
    @Query() query: ReviewListQueryDto,
  ) {
    return this.reviewService.listForUser(id, query.role, query.page);
  }

  @Get('user/:id/summary')
  @ApiOperation({
    summary: 'Рейтинг пользователя: среднее и распределение оценок',
  })
  summary(@Param('id', ParseObjectIdPipe) id: string) {
    return this.reviewService.summary(id);
  }
}
