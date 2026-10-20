import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection } from 'mongoose';
import { resolve } from 'path';

export interface TestDb {
  uri: string;
  /** Проверить, что приложение подключено к этой базе; без этого clear() не работает. */
  attach(connection: Connection): Promise<void>;
  /** Очистить все коллекции — между тестами. */
  clear(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Временная MongoDB в памяти на один тестовый файл. Коллекции можно
 * очищать только после attach: если тест по ошибке подключился к другой
 * базе (например, к рабочей из .env), он падает до первой очистки.
 */
export async function startTestDb(): Promise<TestDb> {
  const server = await MongoMemoryServer.create();
  const uri = server.getUri('byte_test');
  let attached: Connection | undefined;

  return {
    uri,
    async attach(connection) {
      await assertSameServer(connection, server);
      attached = connection;
    },
    async clear() {
      if (!attached) {
        throw new Error('Очистка до attach(): подключение не проверено');
      }
      await Promise.all(
        Object.values(attached.collections).map((c) => c.deleteMany({})),
      );
    },
    async stop() {
      await server.stop();
    },
  };
}

/** Адрес, порт и папка данных сервера должны быть те, что у запущенного тестом. */
async function assertSameServer(
  connection: Connection,
  server: MongoMemoryServer,
) {
  const { port, dbPath } = server.instanceInfo!;
  const fail = (reason: string) => {
    throw new Error(
      `Тесты подключены не к временной базе (${connection.host}:${connection.port}/${connection.name}): ${reason}`,
    );
  };

  if (connection.readyState !== 1) fail('нет подключения');
  if (connection.host !== '127.0.0.1' || connection.port !== port) {
    fail(`ожидался 127.0.0.1:${port}`);
  }
  const { parsed } = await connection
    .getClient()
    .db('admin')
    .command({ getCmdLineOpts: 1 });
  if (resolve(parsed.storage?.dbPath ?? '') !== resolve(dbPath)) {
    fail('у сервера другая папка данных');
  }
}
