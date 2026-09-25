import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isValidObjectId } from 'mongoose';

/** Отклоняет некорректный id до запроса в базу — иначе Mongoose отдаёт 500. */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isValidObjectId(value)) {
      throw new BadRequestException(`Некорректный идентификатор: ${value}`);
    }
    return value;
  }
}
