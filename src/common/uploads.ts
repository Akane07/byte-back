import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { randomBytes } from 'crypto';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { join } from 'path';

export const UPLOADS_ROOT = join(process.cwd(), 'uploads');

export type UploadDir = 'avatars' | 'files';

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const VIDEO_TYPES: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

const MB = 1024 * 1024;

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
export const mediaUpload = uploadOptions(
  'files',
  { ...IMAGE_TYPES, ...VIDEO_TYPES },
  50,
);
