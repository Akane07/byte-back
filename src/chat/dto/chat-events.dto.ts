import {
  IsBoolean,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { MEDIA_TYPES, MediaType } from '../schemas/chat.schema';

// Отправитель во всех событиях берётся из токена соединения, а не из тела,
// поэтому поля senderId в этих DTO нет.

export class SendMessageDto {
  @IsMongoId()
  receiverId: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text: string = '';

  @IsOptional()
  @Matches(/^\/uploads\/files\/[\w.-]+$/, {
    message: 'Некорректная ссылка на файл',
  })
  mediaUrl?: string;

  @IsOptional()
  @IsIn(MEDIA_TYPES)
  mediaType: MediaType = 'none';

  @IsOptional()
  @IsBoolean()
  is_suggest: boolean = false;

  @IsOptional()
  @IsMongoId()
  orderId?: string;
}

export class MessageActionDto {
  @IsMongoId()
  messageId: string;
}

export class PostResponseDto {
  @IsMongoId()
  orderId: string;

  @IsMongoId()
  responseId: string;
}

export class FinishOrderDto {
  @IsMongoId()
  orderId: string;
}
