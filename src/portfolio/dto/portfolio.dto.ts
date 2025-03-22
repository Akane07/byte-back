import { ApiProperty } from "@nestjs/swagger";

export class PortfolioDto {
    @ApiProperty({ example: 'Бебебе с бябябя', description: 'Название проекта' })
    readonly title: string;

    @ApiProperty({ example: 'Делал бебебе с бябябя', description: 'Описание проекта' })
    readonly description: string;

    @ApiProperty({ example: 'Разработчик', description: 'Роль в проекте' })
    readonly role: string;

    @ApiProperty({ example: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'], description: 'Массив ссылок на изображения' })
    readonly images: string[];
}