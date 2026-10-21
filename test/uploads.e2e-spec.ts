import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { existsSync } from 'fs';
import { basename, resolve } from 'path';
import * as request from 'supertest';
import { AppModule } from '../src/app/app.module';
import { UPLOADS_ROOT, uploadPath } from '../src/common/uploads';
import { MailService } from '../src/mail/mail.service';
import { DB_START_TIMEOUT, startTestDb, TestDb } from './mongo';

const PASSWORD = 'Secret123';

type Json = Record<string, any>;

/** Файл по ссылке лежит на диске во временной папке загрузок. */
const onDisk = (url: string) => existsSync(uploadPath(url)!);

describe('e2e: удаление загруженных файлов с диска', () => {
  let db: TestDb;
  let app: INestApplication;

  beforeAll(async () => {
    db = await startTestDb();
    process.env.MONGO_URI = db.uri;
    process.env.JWT_SECRET = 'e2e-secret';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        sendVerificationEmail: jest.fn(),
        sendRestoreEmail: jest.fn(),
      })
      .compile();
    await db.attach(moduleRef.get(getConnectionToken()));

    app = moduleRef.createNestApplication();
    // Как в main.ts.
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  }, DB_START_TIMEOUT);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  const api = () => request(app.getHttpServer());

  let seq = 0;
  /** Регистрация: для аватара и портфолио подтверждение почты не нужно. */
  const signUp = async () => {
    const { body } = await api()
      .post('/api/v1/auth/register')
      .send({ email: `files${++seq}@e2e.local`, password: PASSWORD })
      .expect(200);
    return { Authorization: `Bearer ${body.access_token}` };
  };

  const png = (name: string) =>
    [
      Buffer.from(name),
      { filename: `${name}.png`, contentType: 'image/png' },
    ] as const;
  const mp4 = (name: string) =>
    [
      Buffer.from(name),
      { filename: `${name}.mp4`, contentType: 'video/mp4' },
    ] as const;

  const withFields = (req: request.Test) =>
    req
      .field('title', 'Лендинг')
      .field('description', 'Вёрстка')
      .field('role', 'Frontend');

  it('файлы пишутся во временную папку, а не в uploads/ проекта', () => {
    expect(UPLOADS_ROOT).toBe(resolve(process.env.UPLOADS_DIR!));
    expect(UPLOADS_ROOT).not.toBe(resolve('uploads'));
  });

  it('новый аватар заменяет прежний, и прежний файл удаляется', async () => {
    const auth = await signUp();
    const setAvatar = async (name: string) => {
      const { body } = await api()
        .post('/api/v1/user/set_avatar')
        .set(auth)
        .attach('avatar', ...png(name))
        .expect(201);
      return body.avatarUrl as string;
    };

    const first = await setAvatar('first');
    expect(onDisk(first)).toBe(true);
    expect(existsSync(resolve('uploads', 'avatars', basename(first)))).toBe(
      false,
    );

    const second = await setAvatar('second');
    expect(onDisk(second)).toBe(true);
    expect(onDisk(first)).toBe(false);

    const me = await api().get('/api/v1/user/me').set(auth).expect(200);
    expect(me.body.avatar).toBe(second);
  });

  it('правка проекта удаляет убранные и заменённые файлы, удаление — все файлы проекта', async () => {
    const auth = await signUp();
    const stranger = await signUp();

    const create = async (images: string[], video?: string) => {
      const req = withFields(api().post('/api/v1/portfolio').set(auth));
      images.forEach((name) => req.attach('images', ...png(name)));
      if (video) req.attach('video', ...mp4(video));
      const { body } = await req.expect(201);
      return body as Json;
    };

    const project = await create(['a', 'b'], 'v1');
    const other = await create(['other']);
    const [a, b] = project.images as string[];
    expect([a, b, project.video, ...other.images].every(onDisk)).toBe(true);

    // a остаётся, b убрана, c добавлена, видео заменено.
    const edited = await withFields(
      api().patch(`/api/v1/portfolio/${project.id}`).set(auth),
    )
      .field('photos[]', a)
      .attach('images', ...png('c'))
      .attach('video', ...mp4('v2'))
      .expect(200);
    const [, c] = edited.body.images as string[];
    expect(edited.body.images).toEqual([a, c]);
    expect(edited.body.video).not.toBe(project.video);
    expect([a, c, edited.body.video].every(onDisk)).toBe(true);
    expect(onDisk(b)).toBe(false);
    expect(onDisk(project.video)).toBe(false);

    // Пустая строка в video — видео удалено, картинки на месте.
    const noVideo = await withFields(
      api().patch(`/api/v1/portfolio/${project.id}`).set(auth),
    )
      .field('photos[]', a)
      .field('photos[]', c)
      .field('video', '')
      .expect(200);
    expect(noVideo.body.video).toBeUndefined();
    expect(onDisk(edited.body.video)).toBe(false);
    expect([a, c].every(onDisk)).toBe(true);

    // Чужой проект удалить нельзя, его файлы остаются.
    await api()
      .delete(`/api/v1/portfolio/${project.id}`)
      .set(stranger)
      .expect(404);
    expect([a, c].every(onDisk)).toBe(true);

    await api()
      .delete(`/api/v1/portfolio/${project.id}`)
      .set(auth)
      .expect(200, { deleted: true });
    expect([a, c].some(onDisk)).toBe(false);
    // Файлы другого проекта того же автора не задеты.
    expect(other.images.every(onDisk)).toBe(true);
  });
});
