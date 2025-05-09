import { ApiProperty } from "@nestjs/swagger";
import { File } from "buffer";

export class PortfolioDto {
    @ApiProperty({ example: 'Бебебе с бябябя', description: 'Название проекта' })
    readonly title: string;

    @ApiProperty({ example: 'Делал бебебе с бябябя', description: 'Описание проекта' })
    readonly description: string;

    @ApiProperty({ example: 'Разработчик', description: 'Роль в проекте' })
    readonly role: string;

    @ApiProperty({ example: ['Vue', 'Vite'], description: 'Массив навыков' })
    readonly skills: string[];

    @ApiProperty({ example: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'], description: 'Массив изображений' })
    readonly images: string[];

    @ApiProperty({ example: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'], description: 'Массив изображений, которые ОСТАЛИСЬ при редактировании' })
    readonly photos?: string[];

    @ApiProperty({ example: 'https://example.com/image1.jpg', description: 'Видео' })
    readonly video?: string;
}