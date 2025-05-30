import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { OrderService } from './order.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CreateOrderDto, CreateResponseDto, UpdateOrderDto } from './dto/create-order.dto';
import { ApiBody, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Order, OrderResponse } from './schemas/order.schema';

@Controller('order')
export class OrderController {
  constructor(private readonly orderService: OrderService) { }

  @Get('')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Список заказов', description: 'Получение списка заказов' })
  @ApiResponse({ status: 200, description: 'Список заказов', type: [Order] })
  getOrderList(@Request() req: any, @Query('page') page: number = 1, @Query('categories') categories?: string[]) {
    return this.orderService.getOrderList(req?.user?.userId, page, categories);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Заказ', description: 'Получение заказа' })
  @ApiQuery({ name: 'id', type: String, required: true, description: 'ID заказа' })
  @ApiResponse({ status: 200, description: 'Заказ', type: Order })
  getOrder(@Param() params: { id: string }) {
    return this.orderService.getOrder(params.id);
  }

  @Get('user/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Заказы пользователя', description: 'Список заказов пользователя' })
  @ApiQuery({ name: 'id', type: String, required: true, description: 'ID пользователя' })
  @ApiResponse({ status: 200, description: 'Список заказов пользователя', type: [Order] })
  getUserOrders(@Param() params: { id: string }) {
    return this.orderService.getUserOrders(params.id);
  }

  @Get('user/:id/drafts')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Черновики пользователя', description: 'Список черновиков пользователя' })
  @ApiQuery({ name: 'id', type: String, required: true, description: 'ID пользователя' })
  @ApiResponse({ status: 200, description: 'Список черновиков пользователя', type: [Order] })
  getUserDrafts(@Request() req: any, @Param() params: { id: string }) {
    return this.orderService.getUserDrafts(params.id, req.user.userId);
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe({
    whitelist: true,            // удаляет поля, которых нет в DTO
    forbidNonWhitelisted: true, // выбрасывает ошибку, если есть лишние поля
  }))
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Редактирование заказа', description: 'Редактирование заказа' })
  @ApiQuery({ name: 'id', type: String, required: true, description: 'ID заказа' })
  @ApiBody({ type: CreateOrderDto, description: 'Данные заказа', required: false })
  @ApiResponse({ status: 200, description: 'Заказ', type: Order })
  updateOrder(@Request() req: any, @Param() params: { id: string }, @Body() body: UpdateOrderDto) {
    return this.orderService.updateOrder(params.id, body, req.user.userId);
  }

  @Patch(':id/archive')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Архивирование заказа', description: 'Архивирование заказа' })
  @ApiQuery({ name: 'id', type: String, required: true, description: 'ID заказа' })
  @ApiResponse({ status: 200, description: 'Заказ', type: Order })
  archiveOrder(@Request() req: any, @Param() params: { id: string }) {
    return this.orderService.archiveOrder(params.id, req.user.userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Удаление заказа', description: 'Удаление заказа' })
  @ApiQuery({ name: 'id', type: String, required: true, description: 'ID заказа' })
  deleteOrder(@Request() req: any, @Param() params: { id: string }) {
    return this.orderService.deleteOrder(params.id, req.user.userId);
  }

  @Post('')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Создание заказа', description: 'Создание заказа' })
  @ApiBody({ type: CreateOrderDto, description: 'Данные заказа', required: true })
  @ApiResponse({ status: 200, description: 'Заказ', type: Order })
  createOrder(@Request() req: any, @Body() body: CreateOrderDto) {
    return this.orderService.createOrder(req.user.userId, body);
  }

  @Post(':id/response')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Добавление отклика', description: 'Добавление отклика к заказу' })
  @ApiQuery({ name: 'id', type: String, required: true, description: 'ID заказа' })
  @ApiBody({ type: CreateResponseDto, description: 'Данные отклика', required: true })
  @ApiResponse({ status: 200, description: 'Отклик', type: OrderResponse })
  createOrderResponse(@Request() req: any, @Param() params: { id: string }, @Body() body: { description: string }) {
    return this.orderService.createOrderResponse(params.id, req.user.userId, body);
  }

  @Get(':id/responses')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Получение откликов к заказу', description: 'Получение откликов к заказу по ID' })
  @ApiQuery({ name: 'id', type: String, required: true, description: 'ID заказа' })
  @ApiResponse({ status: 200, description: 'Отклик', type: [OrderResponse] })
  getOrderResponses(@Request() req: any, @Param() params: { id: string }) {
    return this.orderService.getOrderResponses(params.id, req.user.userId);
  }

  @Get(':id/response')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Получение отклика', description: 'Получение своего отклика к заказу' })
  @ApiQuery({ name: 'id', type: String, required: true, description: 'ID заказа' })
  @ApiResponse({ status: 200, description: 'Отклик', type: OrderResponse })
  getOrderResponse(@Request() req: any, @Param() params: { id: string }) {
    return this.orderService.getOrderResponse(req.user.userId, params.id);
  }

  @Get(':id/response/:rid')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Получение отклика', description: 'Получение отклика к заказу' })
  @ApiQuery({ name: 'id', type: String, required: true, description: 'ID заказа' })
    @ApiQuery({ name: 'rid', type: String, required: true, description: 'ID отклика' })
  @ApiResponse({ status: 200, description: 'Отклик', type: OrderResponse })
  getOrderResponseById(@Request() req: any, @Param() params: { id: string, rid: string }) {
    return this.orderService.getOrderResponseById(params.rid);
  }

  @Delete(':id/response/:rid')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Удаление отклика', description: 'Удаление своего отклика к заказу' })
  @ApiQuery({ name: 'id', type: String, required: true, description: 'ID заказа' })
  @ApiQuery({ name: 'rid', type: String, required: true, description: 'ID отклика' })
  deleteOrderResponse(@Request() req: any, @Param() params: { id: string, rid: string }) {
    return this.orderService.deleteOrderResponse(req.user.userId, params.id, params.rid);
  }

  @Patch(':id/response/:rid')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Изменение отклика', description: 'Изменение своего отклика к заказу' })
  @ApiQuery({ name: 'id', type: String, required: true, description: 'ID заказа' })
  @ApiQuery({ name: 'rid', type: String, required: true, description: 'ID отклика' })
  editOrderResponse(@Request() req: any, @Param() params: { id: string, rid: string }, @Body() body: { description: string }) {
    return this.orderService.editOrderResponse(req.user.userId, params.rid, body.description);
  }

  @Post('responses')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Получение откликов пользователя', description: 'Получение своих откликов на все заказы' })
  @ApiResponse({ status: 200, description: 'Отклики', type: [OrderResponse] })
  getUserResponses(@Request() req: any) {
    return this.orderService.getUserResponses(req.user.userId);
  }

  @Post(':id/viewed')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Просмотр заказа', description: 'Просмотр заказа из списка' })
  @ApiQuery({ name: 'id', type: String, required: true, description: 'ID заказа' })
  viewOrder(@Request() req: any, @Param() params: { id: string }) {
    return this.orderService.viewOrder(req.user.userId, params.id);
  }
}
