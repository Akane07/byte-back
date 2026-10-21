import { BadRequestException, Logger } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { randomBytes } from 'crypto';
import { mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { diskStorage } from 'multer';
import { join, resolve, sep } from 'path';

/**
 * Папка загрузок: multer, раздача /uploads и удаление файлов.
 * UPLOADS_DIR берётся только из окружения процесса — модуль загружается
 * раньше, чем ConfigModule читает .env. Тесты так кладут файлы во временную папку.
 */
export const UPLOADS_ROOT = resolve(process.env.UPLOADS_DIR || 'uploads');

export type UploadDir = 'avatars' | 'files';

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/** Картинки в чате: те же, что у аватара, плюс GIF. */
const CHAT_IMAGE_TYPES: Record<string, string> = {
  ...IMAGE_TYPES,
  'image/gif': '.gif',
};

const VIDEO_TYPES: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

/**
 * Документы, которыми обмениваются заказчик и исполнитель: ТЗ, макеты
 * в архиве, отчёты. Отдаются только на скачивание (см. main.ts), поэтому
 * браузер не откроет их как страницу сайта.
 */
const DOCUMENT_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'application/vnd.rar': '.rar',
  'application/x-rar-compressed': '.rar',
  'application/x-7z-compressed': '.7z',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    '.pptx',
  'text/plain': '.txt',
};

/** Расширения файлов, которые браузер показывает в чате сам. */
export const INLINE_EXTENSIONS = new Set(
  Object.values({ ...CHAT_IMAGE_TYPES, ...VIDEO_TYPES }),
);

const MB = 1024 * 1024;

/**
 * multer читает имя файла из multipart как latin1, и кириллица
 * превращается в «Ð¢Ð—.pdf». Перекодируем обратно в UTF-8.
 */
export function originalName(file: Express.Multer.File) {
  return Buffer.from(file.originalname, 'latin1').toString('utf8');
}

export function ensureUploadDirs() {
  for (const dir of ['avatars', 'files'] satisfies UploadDir[]) {
    mkdirSync(join(UPLOADS_ROOT, dir), { recursive: true });
  }
}

/** Публичный путь к загруженному файлу, как его отдаёт static-раздача. */
export function uploadUrl(dir: UploadDir, filename: string) {
  return `/uploads/${dir}/${filename}`;
}

/**
 * Путь на диске по ссылке /uploads/…. null — не ссылка на загрузку или
 * путь после разбора выходит за UPLOADS_ROOT (../, абсолютный путь).
 */
export function uploadPath(url: string | undefined): string | null {
  const prefix = '/uploads/';
  if (!url?.startsWith(prefix)) return null;
  const path = resolve(UPLOADS_ROOT, url.slice(prefix.length));
  return path.startsWith(UPLOADS_ROOT + sep) ? path : null;
}

/** Файлы из before, на которые после изменения больше не ссылаются. */
export function filesToRemove(
  before: (string | undefined)[],
  after: (string | undefined)[],
): string[] {
  return before.filter((url): url is string => !!url && !after.includes(url));
}

const logger = new Logger('Uploads');

/**
 * Удаляет загруженные файлы. Отсутствующий файл — не ошибка; остальные
 * ошибки только в лог: запись в базе уже изменена, и ответ от файла не зависит.
 */
export async function removeUploads(urls: (string | undefined)[]) {
  await Promise.all(
    urls.map(async (url) => {
      const path = uploadPath(url);
      if (!path) return;
      try {
        await unlink(path);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.warn(`Не удалось удалить ${url}: ${(err as Error).message}`);
        }
      }
    }),
  );
}

/**
 * Настройки multer: только перечисленные MIME-типы, расширение берётся
 * из MIME-типа, а не из имени файла — так нельзя подложить .html или .svg.
 */
function uploadOptions(
  dir: UploadDir,
  allowed: Record<string, string>,
  maxSizeMb: number,
): MulterOptions {
  return {
    storage: diskStorage({
      destination: join(UPLOADS_ROOT, dir),
      filename: (_req, file, cb) => {
        cb(
          null,
          `${Date.now()}-${randomBytes(6).toString('hex')}${allowed[file.mimetype]}`,
        );
      },
    }),
    fileFilter: (_req, file, cb) => {
      if (allowed[file.mimetype]) {
        cb(null, true);
      } else {
        cb(
          new BadRequestException(
            `Недопустимый тип файла. Разрешены: ${Object.keys(allowed).join(', ')}`,
          ),
          false,
        );
      }
    },
    limits: { fileSize: maxSizeMb * MB },
  };
}

export const avatarUpload = uploadOptions('avatars', IMAGE_TYPES, 3);
/** Картинки и видео портфолио. */
export const mediaUpload = uploadOptions(
  'files',
  { ...IMAGE_TYPES, ...VIDEO_TYPES },
  50,
);

/** Вложения в чате: ещё и документы с архивами. */
export const chatUpload = uploadOptions(
  'files',
  { ...CHAT_IMAGE_TYPES, ...VIDEO_TYPES, ...DOCUMENT_TYPES },
  50,
);

/** Тип вложения в чате по MIME-типу загруженного файла. */
export function mediaTypeOf(mimetype: string): 'image' | 'video' | 'file' {
  if (CHAT_IMAGE_TYPES[mimetype]) return 'image';
  if (VIDEO_TYPES[mimetype]) return 'video';
  return 'file';
}
