import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, createConnection } from 'mongoose';
import { startTestDb, TestDb } from './mongo';

describe('тестовая база', () => {
  let db: TestDb;
  let other: MongoMemoryServer;
  const connections: Connection[] = [];
  const connect = async (uri: string) => {
    const connection = await createConnection(uri).asPromise();
    connections.push(connection);
    return connection;
  };

  beforeAll(async () => {
    [db, other] = await Promise.all([
      startTestDb(),
      MongoMemoryServer.create(),
    ]);
  });

  afterAll(async () => {
    await Promise.all(connections.map((c) => c.close()));
    await Promise.all([db.stop(), other.stop()]);
  });

  it('не очищает коллекции, пока подключение не проверено', async () => {
    await expect(db.clear()).rejects.toThrow('подключение не проверено');
  });

  it('отказывается от подключения к другому серверу', async () => {
    // Другой сервер вместо рабочей базы: проверка не должна его пропустить.
    const wrong = await connect(other.getUri('byte'));
    await wrong.collection('users').insertOne({ name: 'не трогать' });

    await expect(db.attach(wrong)).rejects.toThrow('не к временной базе');
    await expect(db.clear()).rejects.toThrow('подключение не проверено');
    expect(await wrong.collection('users').countDocuments()).toBe(1);
  });

  it('после проверки очищает коллекции своей базы', async () => {
    const own = await connect(db.uri);
    await own.collection('things').insertOne({ n: 1 });

    await db.attach(own);
    await db.clear();
    expect(await own.collection('things').countDocuments()).toBe(0);
  });
});
