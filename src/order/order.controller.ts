import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { OptionalUserId, UserId } from '../auth/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe';
import {
  CreateOrderDto,
  CreateResponseDto,
  OrderListQueryDto,
  UpdateOrderDto,
} from './dto/create-order.dto';
import { OrderService } from './order.service';
import { Order, OrderResponse } from './schemas/order.schema';

// Гарды — на каждом методе, а не на классе: гард класса выполняется всегда,
// и открыть отдельные методы гостю было бы нельзя. Лента, заказ и заказы
// пользователя доступны без входа (OptionalJwtAuthGuard), остальное — только
// с токеном.
@Controller('order')
@ApiBearerAuth()
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Лента заказов',
    description: 'Чужие опубликованные заказы, по 10 на страницу',
  })
  getOrderList(
    @OptionalUserId() userId: string | undefined,
    @Query() query: OrderListQueryDto,
  ) {
    return this.orderService.getOrderList(userId, query.page, query.categories);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Создать заказ или черновик' })
  @ApiResponse({ status: 201, type: Order })
  createOrder(@UserId() userId: string, @Body() dto: CreateOrderDto) {
    return this.orderService.createOrder(userId, dto);
  }

  // POST, а не GET — так исторически вызывает фронтенд.
  @Post('responses')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Свои отклики на все заказы' })
  getUserResponses(@UserId() userId: string) {
    return this.orderService.getUserResponses(userId);
  }

  @Get('user/:id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Опубликованные заказы пользователя' })
  @ApiResponse({ status: 200, type: [Order] })
  getUserOrders(@Param('id', ParseObjectIdPipe) id: string) {
    return this.orderService.getUserOrders(id);
  }

  @Get('user/:id/drafts')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Свои черновики' })
  @ApiResponse({ status: 200, type: [Order] })
  getUserDrafts(
    @UserId() userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.orderService.getUserDrafts(id, userId);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Заказ по id' })
  @ApiResponse({ status: 200, type: Order })
  getOrder(
    @OptionalUserId() userId: string | undefined,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.orderService.getOrder(id, userId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Изменить свой заказ' })
  @ApiResponse({ status: 200, type: Order })
  updateOrder(
    @UserId() userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateOrderDto,
  ) {
    return this.orderService.updateOrder(id, dto, userId);
  }

  @Patch(':id/archive')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Отправить свой заказ в архив' })
  @ApiResponse({ status: 200, type: Order })
  archiveOrder(
    @UserId() userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.orderService.archiveOrder(id, userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Удалить свой заказ вместе с откликами' })
  deleteOrder(
    @UserId() userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.orderService.deleteOrder(id, userId);
  }

  @Post(':id/viewed')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Отметить заказ просмотренным' })
  viewOrder(
    @UserId() userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.orderService.viewOrder(userId, id);
  }

  @Post(':id/response')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Откликнуться на заказ' })
  @ApiResponse({ status: 201, type: OrderResponse })
  createOrderResponse(
    @UserId() userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CreateResponseDto,
  ) {
    return this.orderService.createOrderResponse(id, userId, dto.description);
  }

  @Get(':id/responses')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Отклики на свой заказ' })
  @ApiResponse({ status: 200, type: [OrderResponse] })
  getOrderResponses(
    @UserId() userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.orderService.getOrderResponses(id, userId);
  }

  @Get(':id/response')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Свой отклик на заказ (null, если не откликались)' })
  @ApiResponse({ status: 200, type: OrderResponse })
  getOrderResponse(
    @UserId() userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.orderService.getOrderResponse(userId, id);
  }

  @Get(':id/response/:rid')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Отклик по id — автору и владельцу заказа' })
  @ApiResponse({ status: 200, type: OrderResponse })
  getOrderResponseById(
    @UserId() userId: string,
    @Param('rid', ParseObjectIdPipe) rid: string,
  ) {
    return this.orderService.getOrderResponseById(rid, userId);
  }

  @Patch(':id/response/:rid')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Изменить свой отклик' })
  @ApiResponse({ status: 200, type: OrderResponse })
  editOrderResponse(
    @UserId() userId: string,
    @Param('rid', ParseObjectIdPipe) rid: string,
    @Body() dto: CreateResponseDto,
  ) {
    return this.orderService.editOrderResponse(userId, rid, dto.description);
  }

  @Delete(':id/response/:rid')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Удалить свой отклик' })
  deleteOrderResponse(
    @UserId() userId: string,
    @Param('rid', ParseObjectIdPipe) rid: string,
  ) {
    return this.orderService.deleteOrderResponse(userId, rid);
  }
}
