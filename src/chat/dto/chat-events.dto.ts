import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MEDIA_TYPES, MediaType } from '../schemas/chat.schema';

// Отправитель во всех событиях берётся из токена соединения, а не из тела,
// поэтому поля senderId в этих DTO нет.

export const MAX_MESSAGE_LENGTH = 4000;

export class SendMessageDto {
  @IsMongoId()
  receiverId: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_MESSAGE_LENGTH)
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
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  fileSize?: number;

  @IsOptional()
  @IsBoolean()
  is_suggest: boolean = false;

  @IsOptional()
  @IsMongoId()
  orderId?: string;

  /** Ответ на сообщение из этого же диалога. */
  @IsOptional()
  @IsMongoId()
  replyToId?: string;

  /**
   * Временный id, который клиент присвоил сообщению до ответа сервера.
   * Возвращается в receiveMessage и в exception — так клиент понимает,
   * какое из «отправляется…» доставлено, а какое нет.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientId?: string;
}

export class MessageActionDto {
  @IsMongoId()
  messageId: string;
}

export class EditMessageDto {
  @IsMongoId()
  messageId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(MAX_MESSAGE_LENGTH)
  text: string;
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

  /** Комментарий к сданной работе: что сделано, где посмотреть результат. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_MESSAGE_LENGTH)
  text?: string;
}

export class ProposeCancelDto {
  @IsMongoId()
  orderId: string;

  /** Причина отмены — необязательно. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_MESSAGE_LENGTH)
  text?: string;
}

/** Собеседник, с которым связано событие: прочитать, «печатает…». */
export class PartnerDto {
  @IsMongoId()
  userId: string;
}

export class PresenceQueryDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsMongoId({ each: true })
  userIds: string[];
}
