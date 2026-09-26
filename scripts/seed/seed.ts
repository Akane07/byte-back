/**
 * Тестовые данные для ручной проверки сайта.
 *
 *   npm run seed         — удалить прежний тестовый набор и создать заново
 *   npm run seed:clear   — только удалить
 *
 * Тестовые пользователи — с почтой на @seed.test, пароль у всех один
 * (SEED_PASSWORD в data.ts). Удаляется только то, что связано с ними:
 * их заказы, отклики, портфолио, переписка и картинки uploads/<dir>/seed-*.
 * Настоящие данные в той же базе не трогаются.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { pbkdf2, randomBytes } from 'crypto';
import { promisify } from 'util';
import mongoose, { Types } from 'mongoose';
import { UserSchema } from '../../src/auth/schemas/user.schema';
import { MessageSchema } from '../../src/chat/schemas/chat.schema';
import { OrderResponseSchema, OrderSchema } from '../../src/order/schemas/order.schema';
import { PortfolioSchema } from '../../src/portfolio/schemas/portfolio.schema';
import {
  DIALOGS,
  ORDERS,
  PORTFOLIOS,
  SEED_DOMAIN,
  SEED_PASSWORD,
  SUGGESTS,
  USERS,
  type SeedUser,
} from './data';
import { avatar, cover } from './png';

const ROOT = join(__dirname, '..', '..');
const UPLOADS = join(ROOT, 'uploads');
const FILE_PREFIX = 'seed-';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();
const ago = (ms: number) => new Date(now - ms);

// Имена моделей — как в модулях Nest (User.name и т. д.): тогда и коллекции те же.
const UserModel = mongoose.model('User', UserSchema);
const OrderModel = mongoose.model('Order', OrderSchema);
const ResponseModel = mongoose.model('OrderResponse', OrderResponseSchema);
const PortfolioModel = mongoose.model('Portfolio', PortfolioSchema);
const MessageModel = mongoose.model('Message', MessageSchema);

/** MONGO_URI из byte-back/.env — тот же адрес, что у сервера. */
function mongoUri() {
  const env = join(ROOT, '.env');
  if (existsSync(env)) {
    const line = readFileSync(env, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith('MONGO_URI='));
    const value = line?.slice('MONGO_URI='.length).trim();
    if (value) return value;
  }
  return process.env.MONGO_URI ?? 'mongodb://localhost:27017/byte';
}

const emailOf = (key: string) => `${key}@${SEED_DOMAIN}`;

/** Как в AuthService.hashPassword — иначе вход не пройдёт. */
async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = await promisify(pbkdf2)(password, salt, 210_000, 64, 'sha512');
  return { salt, passwordHash: hash.toString('hex'), hash_iterations: 210_000 };
}

function saveUpload(dir: 'avatars' | 'files', name: string, data: Buffer) {
  mkdirSync(join(UPLOADS, dir), { recursive: true });
  writeFileSync(join(UPLOADS, dir, FILE_PREFIX + name), data);
  return `/uploads/${dir}/${FILE_PREFIX}${name}`;
}

async function clear() {
  const users = await UserModel.find({ email: new RegExp(`@${SEED_DOMAIN.replace('.', '\\.')}$`) }, { _id: 1 });
  const ids = users.map((u) => String(u._id));
  const orders = await OrderModel.find({ user_id: { $in: ids } }, { _id: 1 });
  const orderIds = orders.map((o) => String(o._id));

  const [r, o, p, m, u] = await Promise.all([
    // И отклики тестовых пользователей, и чужие отклики на тестовые заказы.
    ResponseModel.deleteMany({ $or: [{ user_id: { $in: ids } }, { order_id: { $in: orderIds } }] }),
    OrderModel.deleteMany({ user_id: { $in: ids } }),
    PortfolioModel.deleteMany({ user_id: { $in: ids } }),
    MessageModel.deleteMany({ $or: [{ senderId: { $in: ids } }, { receiverId: { $in: ids } }] }),
    UserModel.deleteMany({ _id: { $in: ids } }),
  ]);

  let files = 0;
  for (const dir of ['avatars', 'files']) {
    const path = join(UPLOADS, dir);
    if (!existsSync(path)) continue;
    for (const name of readdirSync(path)) {
      if (name.startsWith(FILE_PREFIX)) {
        unlinkSync(join(path, name));
        files++;
      }
    }
  }

  console.log(
    `Удалено: пользователей ${u.deletedCount}, заказов ${o.deletedCount}, откликов ${r.deletedCount}, ` +
      `проектов ${p.deletedCount}, сообщений ${m.deletedCount}, файлов ${files}`,
  );
}

async function seed() {
  // --- Пользователи ---
  const id: Record<string, string> = {};
  const byKey: Record<string, SeedUser> = {};
  for (const u of USERS) {
    const _id = new Types.ObjectId();
    id[u.key] = String(_id);
    byKey[u.key] = u;
    await UserModel.create({
      _id,
      email: emailOf(u.key),
      ...(await hashPassword(SEED_PASSWORD)),
      name: u.name ?? u.key, // как при регистрации без имени — часть почты до @
      nickname: u.nickname ?? '',
      speciality: u.speciality ?? '',
      description: u.description ?? '',
      country: u.country ?? '',
      phone: u.phone ?? '',
      telegram: u.telegram ?? '',
      behance: u.behance ?? '',
      git: u.git ?? '',
      skills: u.skills ?? [],
      avatar: u.avatar === undefined ? '' : saveUpload('avatars', `${u.key}.png`, avatar(u.avatar)),
      is_verified: !!u.verified,
      created_at: ago(u.registeredDaysAgo * DAY),
      last_seen: u.lastSeenHoursAgo === undefined ? undefined : ago(u.lastSeenHoursAgo * HOUR).toISOString(),
    });
  }
  const ids = (keys: string[] = []) => keys.map((k) => id[k]);
  const displayName = (key: string) => byKey[key].nickname || byKey[key].name || key;

  // --- Портфолио ---
  for (const [i, p] of PORTFOLIOS.entries()) {
    await PortfolioModel.create({
      user_id: id[p.owner],
      title: p.title,
      description: p.description,
      role: p.role,
      skills: p.skills,
      images: p.images.map((scene, j) => saveUpload('files', `${p.owner}-${i}-${j}.png`, cover(scene, i * 5 + j))),
      liked_by: ids(p.likedBy),
      viewed_by: ids(p.viewedBy),
      created_at: ago(p.daysAgo * DAY),
    });
  }

  // --- Сообщения ---
  // Сохраняются с явными датами: timestamps: false, иначе Mongoose поставил бы «сейчас».
  const message = (data: Record<string, unknown> & { createdAt: Date }) =>
    new MessageModel({ isRead: true, mediaType: 'none', ...data, updatedAt: data.createdAt }).save({
      timestamps: false,
    });

  /** Ответ на предложение или отклик + служебное сообщение, как делает чат. */
  async function answer(
    offer: { id: string; senderId: string; receiverId: string },
    actor: string,
    outcome: 'accepted' | 'rejected',
    at: Date,
  ) {
    await MessageModel.updateOne({ _id: offer.id }, { status: outcome });
    await message({
      senderId: offer.senderId,
      receiverId: offer.receiverId,
      text: `Предложение было ${outcome === 'accepted' ? 'принято' : 'отклонено'} ${displayName(actor)}.`,
      status: 'server',
      createdAt: at,
    });
  }

  // --- Заказы и отклики ---
  const orderIdByTitle: Record<string, string> = {};
  for (const o of ORDERS) {
    const created = ago(o.daysAgo * DAY);
    const state = o.state ?? 'active';
    const order = await OrderModel.create({
      user_id: id[o.owner],
      title: o.title,
      description: o.description,
      category: o.category,
      price_type: o.price_type,
      price: o.price,
      type: o.type,
      deadlines: o.deadlines,
      deadline_date: o.customDays && {
        from: new Date(created.getTime() + o.customDays[0] * DAY).toISOString(),
        to: new Date(created.getTime() + o.customDays[1] * DAY).toISOString(),
      },
      for_experts: !!o.for_experts,
      skills: o.skills,
      draft: state === 'draft',
      is_active: state !== 'archived',
      response_count: o.responses?.length ?? 0,
      viewed_by: ids(o.viewedBy),
      created_at: created,
    });
    const orderId = String(order._id);
    orderIdByTitle[o.title] = orderId;

    for (const [i, r] of (o.responses ?? []).entries()) {
      // Отклики — через несколько часов после публикации, по порядку.
      const at = new Date(created.getTime() + (i + 1) * 2 * HOUR);
      const response = await ResponseModel.create({
        order_id: orderId,
        user_id: id[r.from],
        description: r.text,
        created_at: at,
      });
      const msg = await message({
        senderId: id[r.from],
        receiverId: id[o.owner],
        text: 'Отклик на заказ',
        status: 'response',
        orderId,
        responseId: String(response._id),
        isRead: r.outcome !== undefined,
        createdAt: at,
      });
      await ResponseModel.updateOne({ _id: response._id }, { messageId: String(msg._id) });

      if (r.outcome === 'accepted' || r.outcome === 'rejected') {
        const answeredAt = new Date(at.getTime() + HOUR);
        await answer({ id: String(msg._id), senderId: id[r.from], receiverId: id[o.owner] }, o.owner, r.outcome, answeredAt);
        if (r.outcome === 'accepted') {
          order.performer = id[r.from];
          order.status = state === 'completed' ? 'completed' : 'pending';
          await order.save();
          if (state === 'completed') {
            await message({
              senderId: id[r.from],
              receiverId: id[o.owner],
              text: 'Заказ выполнен и готов к проверке.',
              status: 'server',
              orderId,
              createdAt: new Date(answeredAt.getTime() + 3 * DAY),
            });
          }
        }
      }
    }
  }

  // --- Предложения заказов ---
  for (const s of SUGGESTS) {
    const at = ago(s.hoursAgo * HOUR);
    const msg = await message({
      senderId: id[s.from],
      receiverId: id[s.to],
      text: '',
      is_suggest: true,
      orderId: orderIdByTitle[s.order],
      isRead: s.outcome !== 'pending',
      createdAt: at,
    });
    if (s.outcome !== 'pending') {
      await answer({ id: String(msg._id), senderId: id[s.from], receiverId: id[s.to] }, s.to, s.outcome, new Date(at.getTime() + HOUR));
    }
  }

  // --- Обычная переписка ---
  for (const d of DIALOGS) {
    const [a, b] = d.between;
    for (const [i, [from, text, minutesAgo]] of d.messages.entries()) {
      const last = i === d.messages.length - 1;
      await message({
        senderId: id[from],
        receiverId: id[from === a ? b : a],
        text,
        isRead: !(last && d.unread),
        createdAt: ago(minutesAgo * 60_000),
      });
    }
  }

  // --- Счётчики, как их считает сервер ---
  for (const u of USERS) {
    const count = await OrderModel.countDocuments({ user_id: id[u.key], draft: { $ne: true } });
    await UserModel.updateOne({ _id: id[u.key] }, { orders_count: count });
  }

  console.log(
    `Создано: пользователей ${USERS.length}, проектов ${PORTFOLIOS.length}, заказов ${ORDERS.length}, ` +
      `предложений ${SUGGESTS.length}, диалогов ${DIALOGS.length}.`,
  );
  console.log(`Вход: <ключ>@${SEED_DOMAIN} / ${SEED_PASSWORD}, например ${emailOf('alina')}`);
  console.log('Аккаунты:', USERS.map((u) => u.key).join(', '));
}

async function main() {
  const uri = mongoUri();
  await mongoose.connect(uri);
  console.log(`База: ${uri}`);
  try {
    await clear();
    if (!process.argv.includes('--clear')) await seed();
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
