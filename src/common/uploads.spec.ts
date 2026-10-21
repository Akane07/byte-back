import { Logger } from '@nestjs/common';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { basename, dirname, join, resolve, sep } from 'path';
import {
  filesToRemove,
  removeUploads,
  UPLOADS_ROOT,
  uploadPath,
} from './uploads';

const WINDOWS = sep === '\\';

/** Путь не вышел за корень загрузок: либо отсечён, либо лежит внутри. */
const expectInside = (url: string) => {
  const path = uploadPath(url);
  if (path !== null) expect(path.startsWith(UPLOADS_ROOT + sep)).toBe(true);
};

const put = (path: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, 'x');
  return path;
};

describe('uploads', () => {
  it('корень — временная папка теста, а не uploads/ проекта', () => {
    expect(UPLOADS_ROOT).toBe(resolve(process.env.UPLOADS_DIR!));
    expect(UPLOADS_ROOT).not.toBe(resolve('uploads'));
  });

  describe('uploadPath', () => {
    it('ссылка на загрузку — путь внутри корня', () => {
      expect(uploadPath('/uploads/avatars/1700-a1.png')).toBe(
        join(UPLOADS_ROOT, 'avatars', '1700-a1.png'),
      );
      expect(uploadPath('/uploads/files/1700-a1.mp4')).toBe(
        join(UPLOADS_ROOT, 'files', '1700-a1.mp4'),
      );
    });

    it.each([
      [''],
      [undefined],
      ['https://example.com/a.png'],
      ['/images/avatar.png'],
      ['uploads/files/a.png'],
      ['/uploads'],
    ])('не ссылка на загрузку (%p) — null', (url) => {
      expect(uploadPath(url)).toBeNull();
    });

    it.each([
      ['/uploads/'],
      ['/uploads/..'],
      ['/uploads/../.env'],
      ['/uploads/files/../../.env'],
      ['/uploads/files/../../../../etc/passwd'],
      ['/uploads/avatars/../files/../../src/main.ts'],
      ['/uploads//etc/passwd'],
    ])('выход за корень (%s) — null', (url) => {
      expect(uploadPath(url)).toBeNull();
    });

    it('%2e%2e%2f не раскодируется: это имя файла внутри корня', () => {
      expect(uploadPath('/uploads/files/%2e%2e%2f%2e%2e%2f.env')).toBe(
        join(UPLOADS_ROOT, 'files', '%2e%2e%2f%2e%2e%2f.env'),
      );
      expectInside('/uploads/%2e%2e/%2e%2e%2f.env');
    });

    // На Windows \ — тоже разделитель, и выход отсекается; на Linux и macOS
    // это обычный символ имени, и путь остаётся внутри корня.
    it.each([
      ['/uploads/files/..\\..\\.env'],
      ['/uploads/files\\..\\../.env'],
      ['/uploads/files/../..\\.env'],
      ['/uploads/avatars\\../..\\..\\x'],
      ['/uploads/C:\\Windows\\win.ini'],
    ])('смешанные разделители (%s) — не выходят за корень', (url) => {
      expectInside(url);
      if (WINDOWS) expect(uploadPath(url)).toBeNull();
    });
  });

  describe('filesToRemove', () => {
    it('то, что было до изменения и чего нет после; пустые ссылки пропускаются', () => {
      expect(
        filesToRemove(
          ['/uploads/files/a.png', '/uploads/files/b.png', undefined, ''],
          ['/uploads/files/b.png', '/uploads/files/c.png', undefined],
        ),
      ).toEqual(['/uploads/files/a.png']);
    });

    it('ничего не заменено — удалять нечего', () => {
      const same = ['/uploads/files/a.png', '/uploads/files/v.mp4'];
      expect(filesToRemove(same, same)).toEqual([]);
      expect(filesToRemove([undefined], [undefined])).toEqual([]);
    });
  });

  describe('removeUploads', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
      warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    });

    afterEach(() => warn.mockRestore());

    it('удаляет указанные файлы, остальные не трогает', async () => {
      const a = put(join(UPLOADS_ROOT, 'files', 'rm-a.png'));
      const b = put(join(UPLOADS_ROOT, 'avatars', 'rm-b.png'));
      const kept = put(join(UPLOADS_ROOT, 'files', 'rm-kept.png'));

      await removeUploads([
        '/uploads/files/rm-a.png',
        '/uploads/avatars/rm-b.png',
        undefined,
        '',
      ]);

      expect(existsSync(a)).toBe(false);
      expect(existsSync(b)).toBe(false);
      expect(existsSync(kept)).toBe(true);
      expect(warn).not.toHaveBeenCalled();
    });

    it('отсутствующий файл — не ошибка', async () => {
      await expect(
        removeUploads(['/uploads/files/missing.png']),
      ).resolves.toBeUndefined();
      expect(warn).not.toHaveBeenCalled();
    });

    it('файл рядом с корнем не удаляется, даже если имя начинается так же', async () => {
      // <корень>-outside.txt начинается со строки корня, поэтому корень
      // сравнивается вместе с разделителем пути.
      const outside = put(`${UPLOADS_ROOT}-outside.txt`);
      try {
        await removeUploads([
          `/uploads/../${basename(outside)}`,
          `/uploads/files/../../${basename(outside)}`,
          `/uploads/${outside.split(sep).join('/')}`,
        ]);
        expect(existsSync(outside)).toBe(true);
      } finally {
        rmSync(outside);
      }
    });

    it('папку не удаляет: ошибка уходит в лог, запрос не падает', async () => {
      const dir = join(UPLOADS_ROOT, 'files', 'rm-dir');
      mkdirSync(dir, { recursive: true });

      await expect(removeUploads(['/uploads/files/rm-dir'])).resolves.toBe(
        undefined,
      );

      expect(existsSync(dir)).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Не удалось удалить /uploads/files/rm-dir'),
      );
    });
  });
});
