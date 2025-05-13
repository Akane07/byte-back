import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateOrderDto {
    @ApiProperty({ example: 'Отсосать хуй', description: 'Название заказа' })
    readonly title: string;

    @ApiProperty({ example: 'Отсосать хую!!!!!!', description: 'Описание заказа' })
    readonly description: string;

    @ApiProperty({ example: 123, description: 'Цена' })
    readonly price: number | {
        from: number;
        to: number;
    };

    @ApiProperty({ example: 'fixed', description: 'Тип цены', enum: ['contract', 'fixed'] })
    readonly price_type: 'contract' | 'fixed' | 'hourly';

    @ApiProperty({ example: 'one-time', description: 'Тип заказа', enum: ['one-time', 'reusable'] })
    readonly type: 'one-time' | 'reusable';

    @ApiProperty({ example: true, description: 'Для экспертов' })
    readonly for_experts: boolean;

    @ApiProperty({ example: 'contract', description: 'Дедлайны. enum, или строка ISO даты', enum: ['contract', 'more-than-month', 'less-than-month'] })
    readonly deadlines: 'less-week' | 'more-week' | 'less-month' | 'more-month' | 'contract' | 'custom';

    deadline_date?: {
        from: string;
        to: string;
    };

    @ApiProperty({ example: ['Vue', 'React', 'Angular'], description: 'Массив навыков' })
    readonly skills: string[];

    @ApiProperty({ example: 1, description: 'ID категории' })
    readonly category: number;
}

export class CreateResponseDto {
    @ApiProperty({ example: 'Приложить свою работу привет', description: 'Отклик на заказ' })
    readonly description: string;
}

export class UpdateOrderDto {
    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    price?: number | { from: number; to: number };

    @IsOptional()
    @IsIn(['contract', 'fixed', 'hourly'])
    price_type?: 'contract' | 'fixed' | 'hourly';

    @IsOptional()
    @IsIn(['one-time', 'reusable'])
    type?: 'one-time' | 'reusable';

    @IsOptional()
    @IsBoolean()
    for_experts?: boolean;

    @IsOptional()
    @IsIn(['less-week', 'more-week', 'less-month', 'more-month', 'contract', 'custom'])
    deadlines?: string;

    @IsOptional()
    deadline_date?: Date;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    skills?: string[];

    @IsOptional()
    @IsNumber()
    category?: number;

    @IsOptional()
    @IsBoolean()
    is_active?: boolean;

    @IsOptional()
    @IsBoolean()
    draft?: boolean;
}