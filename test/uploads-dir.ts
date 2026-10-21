import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Загрузки — во временной папке на каждый тестовый файл: настоящую uploads/
// тесты не трогают. Файл подключён в setupFilesAfterEnv, то есть выполняется
// раньше, чем тест импортирует src/common/uploads.ts и читает UPLOADS_DIR.
const dir = mkdtempSync(join(tmpdir(), 'byte-uploads-'));
process.env.UPLOADS_DIR = dir;

afterAll(() => rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
