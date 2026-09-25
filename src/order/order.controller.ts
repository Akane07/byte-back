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
import { UserId } from '../auth/current-user.decorator';
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

@Controller('order')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @ApiOperation({
    summary: 'Лента заказов',
    description: 'Чужие опубликованные заказы, по 10 на страницу',
  })
  getOrderList(@UserId() userId: string, @Query() query: OrderListQueryDto) {
    return this.orderService.getOrderList(userId, query.page, query.categories);
  }

  @Post()
  @ApiOperation({ summary: 'Создать заказ или черновик' })
  @ApiResponse({ status: 201, type: Order })
  createOrder(@UserId() userId: string, @Body() dto: CreateOrderDto) {
    return this.orderService.createOrder(userId, dto);
  }

  // POST, а не GET — так исторически вызывает фронтенд.
  @Post('responses')
  @ApiOperation({ summary: 'Свои отклики на все заказы' })
  getUserResponses(@UserId() userId: string) {
    return this.orderService.getUserResponses(userId);
  }

  @Get('user/:id')
  @ApiOperation({ summary: 'Опубликованные заказы пользователя' })
  @ApiResponse({ status: 200, type: [Order] })
  getUserOrders(@Param('id', ParseObjectIdPipe) id: string) {
    return this.orderService.getUserOrders(id);
  }

  @Get('user/:id/drafts')
  @ApiOperation({ summary: 'Свои черновики' })
  @ApiResponse({ status: 200, type: [Order] })
  getUserDrafts(
    @UserId() userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.orderService.getUserDrafts(id, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Заказ по id' })
  @ApiResponse({ status: 200, type: Order })
  getOrder(@Param('id', ParseObjectIdPipe) id: string) {
    return this.orderService.getOrder(id);
  }

  @Patch(':id')
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
  @ApiOperation({ summary: 'Отправить свой заказ в архив' })
  @ApiResponse({ status: 200, type: Order })
  archiveOrder(
    @UserId() userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.orderService.archiveOrder(id, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить свой заказ вместе с откликами' })
  deleteOrder(
    @UserId() userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.orderService.deleteOrder(id, userId);
  }

  @Post(':id/viewed')
  @ApiOperation({ summary: 'Отметить заказ просмотренным' })
  viewOrder(
    @UserId() userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.orderService.viewOrder(userId, id);
  }

  @Post(':id/response')
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
  @ApiOperation({ summary: 'Отклики на свой заказ' })
  @ApiResponse({ status: 200, type: [OrderResponse] })
  getOrderResponses(
    @UserId() userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.orderService.getOrderResponses(id, userId);
  }

  @Get(':id/response')
  @ApiOperation({ summary: 'Свой отклик на заказ (null, если не откликались)' })
  @ApiResponse({ status: 200, type: OrderResponse })
  getOrderResponse(
    @UserId() userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.orderService.getOrderResponse(userId, id);
  }

  @Get(':id/response/:rid')
  @ApiOperation({ summary: 'Отклик по id — автору и владельцу заказа' })
  @ApiResponse({ status: 200, type: OrderResponse })
  getOrderResponseById(
    @UserId() userId: string,
    @Param('rid', ParseObjectIdPipe) rid: string,
  ) {
    return this.orderService.getOrderResponseById(rid, userId);
  }

  @Patch(':id/response/:rid')
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
  @ApiOperation({ summary: 'Удалить свой отклик' })
  deleteOrderResponse(
    @UserId() userId: string,
    @Param('rid', ParseObjectIdPipe) rid: string,
  ) {
    return this.orderService.deleteOrderResponse(userId, rid);
  }
}
