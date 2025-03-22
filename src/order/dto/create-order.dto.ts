import { ApiProperty } from "@nestjs/swagger";

export class CreateOrderDto {
    @ApiProperty({ example: 'Отсосать хуй', description: 'Название заказа' })
    readonly title: string;

    @ApiProperty({ example: 'Отсосать хую!!!!!!', description: 'Описание заказа' })
    readonly description: string;

    @ApiProperty({ example: 123, description: 'Цена' })
    readonly price?: number;

    @ApiProperty({ example: 'fixed', description: 'Тип цены', enum: ['contract', 'fixed'] })
    readonly price_type: 'contract' | 'fixed'; // договорная или фиксированная цена

    @ApiProperty({ example: 'one-time', description: 'Тип заказа', enum: ['one-time', 'reusable'] })
    readonly type: 'one-time' | 'reusable';

    @ApiProperty({ example: true, description: 'Для экспертов' })
    readonly for_experts: boolean;

    @ApiProperty({ example: 'contract', description: 'Дедлайны. enum, или строка ISO даты', enum: ['contract', 'more-than-month', 'less-than-month'] })
    readonly deadlines: 'contract' | 'more-than-month' | 'less-than-month' | string;

    @ApiProperty({ example: ['Vue', 'React', 'Angular'], description: 'Массив навыков' })
    readonly skills: string[];

    @ApiProperty({ example: '1', description: 'ID категории' })
    readonly category: string;
}

export class CreateResponseDto {
    @ApiProperty({ example: 'Приложить свою работу привет', description: 'Отклик на заказ' })
    readonly description: string;
}