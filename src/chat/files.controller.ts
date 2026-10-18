import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { existsSync } from 'fs';
import { extname, join } from 'path';
import { UPLOADS_ROOT } from '../common/uploads';

/**
 * Скачивание вложения из чата под исходным именем. На диске файл лежит
 * под случайным именем (1712…-a3f9.pdf), и без этого заказчик получал
 * «1712…-a3f9.pdf» вместо «ТЗ_лендинг.pdf».
 *
 * Без авторизации — как и раздача /uploads: ссылку открывает браузер,
 * заголовок с токеном он к ней не добавит. Имя файла на диске
 * случайное, перебрать его нельзя.
 */
@Controller('files')
export class FilesController {
  @Get(':file')
  @ApiOperation({
    summary: 'Скачать вложение чата: ?name=<имя для сохранения>',
  })
  download(
    @Param('file') file: string,
    @Res() res: Response,
    @Query('name') name?: string,
  ) {
    if (!/^[\w.-]+$/.test(file)) {
      throw new BadRequestException('Некорректное имя файла');
    }
    const path = join(UPLOADS_ROOT, 'files', file);
    if (!existsSync(path)) {
      throw new NotFoundException('Файл не найден');
    }

    // Расширение — всегда настоящее, от сохранённого файла: нельзя
    // подменить его через name и скачать .pdf под видом .exe.
    const ext = extname(file);
    const base = (name ?? '')
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
      .slice(0, 200)
      .trim();
    const downloadName = base
      ? base.toLowerCase().endsWith(ext)
        ? base
        : `${base}${ext}`
      : file;

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.download(path, downloadName);
  }
}
