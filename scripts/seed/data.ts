/**
 * Содержимое тестового набора. Ссылки между сущностями — по ключу
 * пользователя (`alina`, `sergey`…), id проставляет seed.ts.
 */

export const SEED_DOMAIN = 'seed.test';
export const SEED_PASSWORD = 'Seed1234';

type Scene = 'web' | 'mobile' | 'brand' | 'dashboard' | 'abstract';

export interface SeedUser {
  key: string;
  name?: string;
  nickname?: string;
  speciality?: string;
  description?: string;
  country?: string;
  phone?: string;
  telegram?: string;
  behance?: string;
  git?: string;
  skills?: string[];
  /** Номер палитры аватара; нет — без аватара. */
  avatar?: number;
  verified?: boolean;
  /** Сколько дней назад зарегистрирован и был в сети. */
  registeredDaysAgo: number;
  lastSeenHoursAgo?: number;
}

export const USERS: SeedUser[] = [
  // --- Исполнители: от полностью заполненных до почти пустых ---
  {
    key: 'alina',
    name: 'Алина Соколова',
    nickname: 'alina.design',
    speciality: 'UI/UX-дизайнер',
    description:
      'Проектирую интерфейсы для веба и мобильных приложений 6 лет. Начинаю с исследования: интервью, сценарии, прототипы — и только потом визуал. Работала с финтехом, e-commerce и EdTech. Отдаю макеты с дизайн-системой, компонентами и адаптивами, помогаю разработчикам на этапе вёрстки.',
    country: 'Россия',
    phone: '+79161234567',
    telegram: 'https://t.me/alina_design',
    behance: 'https://www.behance.net/alinasokolova',
    git: '',
    skills: ['Figma', 'UI/UX', 'Прототипирование', 'Дизайн-системы', 'Адаптивный дизайн', 'Внимание к деталям'],
    avatar: 0,
    verified: true,
    registeredDaysAgo: 320,
    lastSeenHoursAgo: 1,
  },
  {
    key: 'maxim',
    name: 'Максим Орлов',
    nickname: 'max_frontend',
    speciality: 'Frontend-разработчик',
    description:
      'Vue и Nuxt — основной стек, также пишу на React. Делаю SPA и лендинги с упором на скорость загрузки и доступность. Покрываю код тестами, настраиваю CI.',
    country: 'Россия',
    telegram: 'https://t.me/maxorlov',
    git: 'https://github.com/maxorlov',
    skills: ['JavaScript', 'Typescript', 'Vue.js', 'Nuxt', 'React', 'HTML', 'CSS', 'Работа в срок'],
    avatar: 1,
    verified: true,
    registeredDaysAgo: 210,
    lastSeenHoursAgo: 5,
  },
  {
    key: 'dmitry',
    name: 'Дмитрий Ковалёв',
    nickname: 'kovalev_dev',
    speciality: 'Backend-разработчик',
    description: 'Node.js, Go, PostgreSQL. Проектирую API, настраиваю очереди и деплой в Docker.',
    country: 'Беларусь',
    git: 'https://github.com/kovalev-dev',
    skills: ['Node.js', 'Golang', 'Docker', 'Linux', 'Логическое мышление'],
    avatar: 2,
    verified: true,
    registeredDaysAgo: 150,
    lastSeenHoursAgo: 30,
  },
  {
    key: 'katya',
    name: 'Екатерина Лебедева',
    nickname: 'katya.motion',
    speciality: 'Моушн-дизайнер',
    description:
      'Анимация для соцсетей, рекламные ролики, анимированные логотипы и интерфейсы. After Effects, Cinema 4D.',
    country: 'Россия',
    telegram: 'https://t.me/katya_motion',
    behance: 'https://www.behance.net/katyamotion',
    skills: ['After Effects', 'Premiere Pro', 'Моушн-дизайн', 'Креативность'],
    avatar: 3,
    verified: true,
    registeredDaysAgo: 95,
    lastSeenHoursAgo: 72,
  },
  {
    key: 'olga',
    name: 'Ольга Миронова',
    speciality: 'Копирайтер',
    description: 'Пишу продающие тексты для лендингов и карточек товаров, редактирую статьи.',
    country: 'Россия',
    skills: ['Копирайтинг', 'Рерайтинг', 'Редактура'],
    verified: true,
    registeredDaysAgo: 60,
    lastSeenHoursAgo: 12,
  },
  {
    key: 'igor',
    name: 'Игорь Власов',
    speciality: 'SEO-специалист',
    skills: ['SEO', 'Keywords'],
    registeredDaysAgo: 40,
  },
  {
    key: 'timur',
    name: 'Тимур Хасанов',
    nickname: 'timur3d',
    speciality: '3D-визуализатор',
    description: 'Предметная визуализация и интерьеры. Blender, 3ds Max.',
    country: 'Казахстан',
    behance: 'https://www.behance.net/timur3d',
    skills: ['3D-моделирование', 'Blender', 'Визуализация'],
    avatar: 5,
    verified: true,
    registeredDaysAgo: 120,
    lastSeenHoursAgo: 48,
  },
  {
    key: 'nastya',
    name: 'Анастасия Белова',
    speciality: 'ML-инженер',
    description: 'Классические модели и нейросети для бизнес-задач: прогнозы, классификация, рекомендации.',
    country: 'Россия',
    git: 'https://github.com/nbelova',
    skills: ['Machine learning', 'Python', 'TensorFlow'],
    avatar: 6,
    verified: true,
    registeredDaysAgo: 75,
    lastSeenHoursAgo: 3,
  },

  // --- Заказчики ---
  {
    key: 'sergey',
    name: 'Сергей Петров',
    nickname: 'petrov_studio',
    speciality: 'Руководитель веб-студии',
    description:
      'Веб-студия «Пиксель»: сайты под ключ для малого бизнеса. Регулярно ищем подрядчиков на дизайн, вёрстку и тексты.',
    country: 'Россия',
    phone: '+79035550101',
    telegram: 'https://t.me/petrov_studio',
    avatar: 4,
    verified: true,
    registeredDaysAgo: 400,
    lastSeenHoursAgo: 2,
  },
  {
    key: 'marina',
    name: 'Марина Зайцева',
    speciality: 'Владелица кофейни «Зерно»',
    description: 'Развиваем сеть кофеен в Казани. Нужны сайт, меню, фирменный стиль и продвижение.',
    country: 'Россия',
    avatar: 7,
    verified: true,
    registeredDaysAgo: 30,
    lastSeenHoursAgo: 20,
  },
  {
    key: 'artem',
    name: 'Артём Никитин',
    nickname: 'nikitin',
    speciality: 'Основатель стартапа',
    description: 'Делаем сервис учёта тренировок. Ищем команду на MVP.',
    country: 'Грузия',
    telegram: 'https://t.me/nikitin_fit',
    avatar: 1,
    registeredDaysAgo: 14,
    lastSeenHoursAgo: 8,
  },
  {
    key: 'vika',
    name: 'Виктория Руденко',
    nickname: 'vika_r',
    speciality: 'Иллюстратор',
    description: 'Рисую иллюстрации для детских книг и упаковки. Иногда сама заказываю вёрстку и тексты.',
    country: 'Россия',
    behance: 'https://www.behance.net/vikarudenko',
    skills: ['Illustrator', 'Photoshop', 'Иллюстрация'],
    avatar: 3,
    verified: true,
    registeredDaysAgo: 180,
    lastSeenHoursAgo: 26,
  },

  // --- Почти пустые профили ---
  // Без имени: как после регистрации по новой форме — имя из почты.
  { key: 'newbie', registeredDaysAgo: 1 },
  { key: 'pavel', name: 'Павел', registeredDaysAgo: 5, lastSeenHoursAgo: 100 },
];

export interface SeedPortfolio {
  owner: string;
  title: string;
  description: string;
  role: string;
  skills: string[];
  /** Сюжеты картинок; первая — обложка. */
  images: Scene[];
  daysAgo: number;
  likedBy?: string[];
  viewedBy?: string[];
}

export const PORTFOLIOS: SeedPortfolio[] = [
  {
    owner: 'alina',
    title: 'Мобильный банк для фрилансеров',
    description:
      'Редизайн приложения: упростили онбординг с 7 шагов до 3, собрали дизайн-систему на 120 компонентов. Конверсия в открытие счёта выросла на 18%.',
    role: 'Ведущий дизайнер',
    skills: ['Figma', 'UI/UX', 'Дизайн-системы'],
    images: ['mobile', 'dashboard', 'abstract'],
    daysAgo: 40,
    likedBy: ['maxim', 'sergey', 'vika', 'katya'],
    viewedBy: ['maxim', 'sergey', 'vika', 'katya', 'artem', 'marina'],
  },
  {
    owner: 'alina',
    title: 'Интернет-магазин керамики',
    description: 'Каталог, карточка товара и корзина. Адаптив от 320 px.',
    role: 'UI/UX-дизайнер',
    skills: ['Figma', 'Адаптивный дизайн'],
    images: ['web', 'mobile'],
    daysAgo: 90,
    likedBy: ['marina'],
    viewedBy: ['marina', 'sergey'],
  },
  {
    owner: 'alina',
    title: 'Дашборд логистической компании',
    description: 'Панель диспетчера: карта рейсов, статусы и отчёты.',
    role: 'Дизайнер',
    skills: ['Figma', 'Прототипирование'],
    images: ['dashboard'],
    daysAgo: 150,
  },
  {
    owner: 'alina',
    title: 'Айдентика фестиваля «Свет»',
    description: 'Логотип, паттерны и носители: афиши, билеты, мерч.',
    role: 'Арт-директор',
    skills: ['Фирменный стиль', 'Логотип'],
    images: ['brand', 'abstract', 'web', 'mobile', 'dashboard'],
    daysAgo: 200,
    likedBy: ['vika', 'timur'],
    viewedBy: ['vika', 'timur', 'olga'],
  },
  {
    owner: 'maxim',
    title: 'Лендинг онлайн-школы',
    description: 'Nuxt 3, SSR, 98 баллов в Lighthouse. Интеграция с CRM и оплатой.',
    role: 'Frontend-разработчик',
    skills: ['Nuxt', 'Typescript'],
    images: ['web', 'abstract'],
    daysAgo: 20,
    likedBy: ['alina', 'sergey'],
    viewedBy: ['alina', 'sergey', 'artem'],
  },
  {
    owner: 'maxim',
    title: 'Личный кабинет клиента',
    description: 'SPA на Vue 3 с графиками и выгрузкой отчётов.',
    role: 'Frontend-разработчик',
    skills: ['Vue.js', 'Typescript'],
    images: ['dashboard', 'mobile'],
    daysAgo: 70,
  },
  {
    owner: 'dmitry',
    title: 'API сервиса доставки',
    description: 'REST + очереди, 2000 заказов в минуту в пике. Go, PostgreSQL, Redis.',
    role: 'Backend-разработчик',
    skills: ['Golang', 'Docker'],
    images: ['dashboard'],
    daysAgo: 35,
    viewedBy: ['artem'],
  },
  {
    owner: 'katya',
    title: 'Анимированный логотип для банка',
    description: 'Три варианта анимации для заставок и соцсетей.',
    role: 'Моушн-дизайнер',
    skills: ['After Effects', 'Моушн-дизайн'],
    images: ['brand', 'abstract'],
    daysAgo: 15,
    likedBy: ['alina'],
    viewedBy: ['alina', 'vika'],
  },
  {
    owner: 'timur',
    title: 'Визуализация кухни в стиле лофт',
    description: 'Фотореалистичные рендеры для каталога мебельной фабрики.',
    role: '3D-визуализатор',
    skills: ['Blender', 'Визуализация'],
    images: ['abstract', 'brand'],
    daysAgo: 55,
    likedBy: ['marina', 'vika', 'alina'],
    viewedBy: ['marina', 'vika', 'alina', 'sergey'],
  },
  // У заказчиков тоже есть проекты: их профили открываются прямо из ленты
  // (аватар на странице заказа, «О клиенте»), а исполнители — только через
  // чаты и отклики.
  {
    owner: 'vika',
    title: 'Иллюстрации к сказке «Лисий хвост»',
    description: '14 разворотов для детской книги, акварельная стилистика, обложка и форзацы.',
    role: 'Иллюстратор',
    skills: ['Illustrator', 'Иллюстрация'],
    images: ['abstract', 'brand', 'abstract'],
    daysAgo: 30,
    likedBy: ['alina', 'katya', 'marina'],
    viewedBy: ['alina', 'katya', 'marina', 'sergey'],
  },
  {
    owner: 'vika',
    title: 'Упаковка детского чая',
    description: 'Серия из шести коробок с персонажами для каждого вкуса.',
    role: 'Иллюстратор, дизайнер упаковки',
    skills: ['Photoshop', 'Дизайн упаковки'],
    images: ['brand', 'mobile'],
    daysAgo: 12,
    likedBy: ['timur'],
    viewedBy: ['timur', 'olga'],
  },
  {
    owner: 'sergey',
    title: 'Сайт автосалона «Драйв»',
    description: 'Каталог автомобилей с фильтрами, кредитный калькулятор, запись на тест-драйв. Сделано командой студии.',
    role: 'Руководитель проекта',
    skills: ['Управление проектами', 'UI/UX'],
    images: ['web', 'dashboard', 'mobile'],
    daysAgo: 80,
    likedBy: ['maxim'],
    viewedBy: ['maxim', 'alina', 'artem'],
  },
  {
    owner: 'sergey',
    title: 'Лендинг пекарни',
    description: 'Одностраничник с меню и доставкой за две недели.',
    role: 'Руководитель проекта',
    skills: ['Управление проектами'],
    images: ['web'],
    daysAgo: 130,
  },
  {
    owner: 'artem',
    title: 'Прототип приложения для тренировок',
    description: 'Кликабельный прототип, на котором мы проверяли идею на 40 пользователях.',
    role: 'Продакт',
    skills: ['Figma', 'Прототипирование'],
    images: ['mobile', 'dashboard'],
    daysAgo: 10,
    viewedBy: ['alina'],
  },
  {
    owner: 'olga',
    title: 'Тексты для сайта клиники',
    description: 'Структура и тексты 12 страниц: услуги, врачи, цены.',
    role: 'Копирайтер',
    skills: ['Копирайтинг'],
    images: ['web'],
    daysAgo: 25,
  },
];

type Outcome = 'pending' | 'accepted' | 'rejected';

export interface SeedResponse {
  from: string;
  text: string;
  /** Ответ заказчика на отклик в чате. */
  outcome?: Outcome;
}

export interface SeedOrder {
  owner: string;
  title: string;
  description: string;
  category: number;
  price_type: 'fixed' | 'hourly' | 'contract';
  price: number | { from: number; to: number };
  type: 'one-time' | 'reusable';
  deadlines: 'less-week' | 'more-week' | 'less-month' | 'more-month' | 'contract' | 'custom';
  /** Для deadlines = custom: через сколько дней от публикации начало и конец. */
  customDays?: [number, number];
  for_experts?: boolean;
  skills: string[];
  daysAgo: number;
  /** active — в ленте; completed — исполнитель завершил (нужен принятый отклик). */
  state?: 'active' | 'draft' | 'archived' | 'completed';
  responses?: SeedResponse[];
  viewedBy?: string[];
}

export const ORDERS: SeedOrder[] = [
  // --- Активные, в ленте (больше 10 — чтобы работала пагинация) ---
  {
    owner: 'marina',
    title: 'Сайт для сети кофеен «Зерно»',
    description:
      'Нужен сайт на 5 страниц: главная, меню, адреса с картой, вакансии, контакты. Есть логотип и фотографии. Важно удобное меню с телефона и онлайн-предзаказ.',
    category: 3,
    price_type: 'fixed',
    price: 85000,
    type: 'one-time',
    deadlines: 'less-month',
    skills: ['HTML', 'CSS', 'JavaScript', 'Адаптивная вёрстка'],
    daysAgo: 0.1,
    responses: [
      { from: 'maxim', text: 'Здравствуйте! Сделаю на Nuxt, с предзаказом через Telegram-бота. Примеры — в портфолио, срок 3 недели.' },
      { from: 'alina', text: 'Могу взять дизайн всех страниц и передать разработчику готовые макеты с адаптивами.' },
    ],
    viewedBy: ['maxim', 'alina', 'olga', 'igor'],
  },
  {
    owner: 'sergey',
    title: 'Вёрстка лендинга по готовому макету Figma',
    description: 'Макет на 8 экранов, анимации при прокрутке. Нужна кроссбраузерность и адаптив.',
    category: 3,
    price_type: 'fixed',
    price: 30000,
    type: 'one-time',
    deadlines: 'less-week',
    skills: ['HTML', 'CSS', 'JavaScript'],
    daysAgo: 0.4,
    viewedBy: ['maxim'],
  },
  {
    owner: 'artem',
    title: 'MVP мобильного приложения для учёта тренировок',
    description:
      'Ищем команду или сильного фулстека на MVP: авторизация, план тренировок, дневник, графики прогресса. Бэкенд — на ваш выбор, фронт — Flutter или React Native. Готов обсуждать долгосрочное сотрудничество.',
    category: 2,
    price_type: 'hourly',
    price: { from: 1500, to: 2500 },
    type: 'reusable',
    deadlines: 'more-month',
    for_experts: true,
    skills: ['Node.js', 'React Native', 'Flutter', 'PostgreSQL', 'Docker', 'Aws', 'Typescript', 'Архитектура'],
    daysAgo: 1,
    responses: [
      { from: 'dmitry', text: 'Бэкенд на Go + PostgreSQL возьму целиком, есть опыт с похожими трекерами.', outcome: 'pending' },
    ],
    viewedBy: ['dmitry', 'maxim', 'nastya'],
  },
  {
    owner: 'vika',
    title: 'Тексты для упаковки детского чая',
    description: 'Короткие тексты на 6 вкусов: название, описание, состав простыми словами.',
    category: 9,
    price_type: 'fixed',
    price: 6000,
    type: 'one-time',
    deadlines: 'less-week',
    skills: ['Копирайтинг'],
    daysAgo: 1.5,
    responses: [{ from: 'olga', text: 'Добрый день! Пишу для детских брендов, пришлю два варианта на выбор.' }],
  },
  {
    owner: 'sergey',
    title: 'Логотип и фирменный стиль для автосервиса',
    description: 'Логотип, цвета, шрифты, визитка и вывеска. Жду 2–3 концепции.',
    category: 1,
    price_type: 'fixed',
    price: 25000,
    type: 'one-time',
    deadlines: 'more-week',
    skills: ['Логотип', 'Фирменный стиль', 'Illustrator'],
    daysAgo: 2,
    responses: [
      { from: 'alina', text: 'Предложу три концепции за неделю, затем доработка выбранной.' },
      { from: 'vika', text: 'Могу нарисовать логотип с иллюстративным знаком.', outcome: 'rejected' },
    ],
  },
  {
    owner: 'marina',
    title: 'Продвижение кофейни в соцсетях',
    description: 'Контент-план на месяц, 12 постов, таргет на район. Бюджет на рекламу отдельно.',
    category: 6,
    price_type: 'contract',
    price: 0,
    type: 'reusable',
    deadlines: 'contract',
    skills: ['Таргетинг', 'SMM', 'Контент-план'],
    daysAgo: 3,
  },
  {
    owner: 'artem',
    title: 'Модель прогноза оттока пользователей',
    description: 'Есть выгрузка событий за год. Нужна модель и отчёт, какие факторы влияют на отток.',
    category: 11,
    price_type: 'fixed',
    price: 120000,
    type: 'one-time',
    deadlines: 'custom',
    customDays: [3, 40],
    for_experts: true,
    skills: ['Machine learning', 'Python'],
    daysAgo: 4,
    responses: [{ from: 'nastya', text: 'Сделаю бейзлайн за неделю, дальше итерации. Отчёт — в Jupyter и презентации.' }],
  },
  {
    owner: 'sergey',
    title: 'SEO-аудит сайта стоматологии',
    description: 'Технический аудит, семантика, рекомендации по структуре.',
    category: 8,
    price_type: 'fixed',
    price: 15000,
    type: 'one-time',
    deadlines: 'less-week',
    skills: ['SEO', 'Keywords'],
    daysAgo: 5,
    responses: [{ from: 'igor', text: 'Готов начать завтра.' }],
  },
  {
    owner: 'vika',
    title: '3D-визуализация упаковки',
    description: 'Коробка чая в трёх ракурсах на светлом фоне, развёртка есть.',
    category: 10,
    price_type: 'fixed',
    price: 9000,
    type: 'one-time',
    deadlines: 'less-week',
    skills: ['3D-моделирование', 'Blender'],
    daysAgo: 6,
    viewedBy: ['timur'],
  },
  {
    owner: 'marina',
    title: 'Анимированное меню для экранов в зале',
    description: 'Три экрана, смена позиций и цен, лёгкая анимация. Нужен исходник.',
    category: 5,
    price_type: 'hourly',
    price: { from: 800, to: 1200 },
    type: 'one-time',
    deadlines: 'more-week',
    skills: ['After Effects', 'Моушн-дизайн'],
    daysAgo: 8,
  },
  {
    owner: 'pavel',
    title: 'Помочь с курсовой по базам данных',
    description: 'Нужно спроектировать БД библиотеки и написать 10 запросов.',
    category: 12,
    price_type: 'fixed',
    price: 3000,
    type: 'one-time',
    deadlines: 'less-week',
    skills: ['SQL'],
    daysAgo: 10,
  },
  {
    owner: 'sergey',
    title:
      'Очень длинное название заказа, чтобы проверить, как карточка и страница заказа справляются с переносами и обрезкой текста в несколько строк',
    description:
      'Описание тоже длинное. '.repeat(40) +
      'Проверяем, что текст корректно переносится, не ломает вёрстку и обрезается в карточке ленты.',
    category: 13,
    price_type: 'fixed',
    price: 10000000,
    type: 'one-time',
    deadlines: 'more-month',
    skills: ['Ответственность', 'Пунктуальность', 'Коммуникабельность', 'Внимание к деталям', 'Креативность', 'Работа в срок', 'Логическое мышление'],
    daysAgo: 12,
  },
  {
    owner: 'artem',
    title: 'Дизайн экранов фитнес-приложения',
    description: '15 экранов: онбординг, план, тренировка, прогресс, профиль.',
    category: 4,
    price_type: 'fixed',
    price: 70000,
    type: 'one-time',
    deadlines: 'more-week',
    skills: ['Figma', 'UI/UX'],
    daysAgo: 16,
    responses: [{ from: 'alina', text: 'Сделаю, начнём с прототипа ключевого сценария.', outcome: 'pending' }],
  },
  {
    owner: 'vika',
    title: 'Перевод сказки на английский',
    description: '20 страниц, детская книга, нужен живой язык.',
    category: 9,
    price_type: 'fixed',
    price: 12000,
    type: 'one-time',
    deadlines: 'more-week',
    skills: ['Переводы'],
    daysAgo: 22,
  },

  // --- В работе и завершённые (есть исполнитель — в ленте не видны) ---
  {
    owner: 'sergey',
    title: 'Тексты для сайта юридической фирмы',
    description: '7 страниц услуг, по 2000 знаков.',
    category: 9,
    price_type: 'fixed',
    price: 14000,
    type: 'one-time',
    deadlines: 'more-week',
    skills: ['Копирайтинг'],
    daysAgo: 9,
    responses: [{ from: 'olga', text: 'Возьму, пришлю структуру завтра.', outcome: 'accepted' }],
  },
  {
    owner: 'artem',
    title: 'Настроить CI/CD и деплой на VPS',
    description: 'GitHub Actions, Docker Compose, бэкапы БД.',
    category: 2,
    price_type: 'fixed',
    price: 20000,
    type: 'one-time',
    deadlines: 'less-week',
    skills: ['Docker', 'Linux', 'Devops'],
    daysAgo: 7,
    responses: [{ from: 'dmitry', text: 'Сделаю за 3 дня.', outcome: 'accepted' }],
  },
  {
    owner: 'marina',
    title: 'Меню кофейни для печати',
    description: 'Двустороннее меню А4 в фирменных цветах.',
    category: 1,
    price_type: 'fixed',
    price: 5000,
    type: 'one-time',
    deadlines: 'less-week',
    skills: ['Photoshop', 'Типографика'],
    daysAgo: 20,
    state: 'completed',
    responses: [{ from: 'vika', text: 'Сделаю с иллюстрациями кофейных зёрен.', outcome: 'accepted' }],
  },
  {
    owner: 'sergey',
    title: 'Вёрстка email-рассылки',
    description: 'Шаблон письма под Gmail, Outlook и Яндекс.',
    category: 3,
    price_type: 'fixed',
    price: 7000,
    type: 'one-time',
    deadlines: 'less-week',
    skills: ['HTML', 'CSS'],
    daysAgo: 45,
    state: 'completed',
    responses: [{ from: 'maxim', text: 'Сверстаю таблицами, проверю в Litmus.', outcome: 'accepted' }],
  },

  // --- Черновики и архив (видны только владельцу в «Мои заказы») ---
  {
    owner: 'sergey',
    title: 'Черновик: редизайн сайта студии',
    description: 'Пока собираю требования.',
    category: 4,
    price_type: 'contract',
    price: 0,
    type: 'one-time',
    deadlines: 'contract',
    skills: ['Figma'],
    daysAgo: 1,
    state: 'draft',
  },
  {
    owner: 'marina',
    title: 'Черновик: фотосъёмка интерьера',
    description: '',
    category: 13,
    price_type: 'fixed',
    price: 0,
    type: 'one-time',
    deadlines: 'less-week',
    skills: [],
    daysAgo: 2,
    state: 'draft',
  },
  {
    owner: 'sergey',
    title: 'Баннеры для акции (в архиве)',
    description: 'Акция закончилась, заказ неактуален.',
    category: 1,
    price_type: 'fixed',
    price: 4000,
    type: 'one-time',
    deadlines: 'less-week',
    skills: ['Баннеры'],
    daysAgo: 60,
    state: 'archived',
  },
];

/** Предложения заказов: заказчик предлагает свой активный заказ исполнителю. */
export interface SeedSuggest {
  from: string;
  to: string;
  /** Заголовок заказа из ORDERS (владелец — from). */
  order: string;
  outcome: Outcome;
  hoursAgo: number;
}

export const SUGGESTS: SeedSuggest[] = [
  { from: 'marina', to: 'katya', order: 'Анимированное меню для экранов в зале', outcome: 'pending', hoursAgo: 20 },
  { from: 'sergey', to: 'maxim', order: 'Вёрстка лендинга по готовому макету Figma', outcome: 'pending', hoursAgo: 3 },
  { from: 'vika', to: 'timur', order: '3D-визуализация упаковки', outcome: 'rejected', hoursAgo: 50 },
];

/** Обычная переписка: [отправитель, текст, минут назад]. */
export interface SeedDialog {
  between: [string, string];
  messages: [string, string, number][];
  /** Последнее сообщение не прочитано получателем. */
  unread?: boolean;
}

export const DIALOGS: SeedDialog[] = [
  {
    between: ['sergey', 'alina'],
    messages: [
      ['sergey', 'Алина, добрый день! Видел ваш кейс с мобильным банком — впечатляет.', 3000],
      ['alina', 'Здравствуйте, спасибо! Чем могу помочь?', 2990],
      ['sergey', 'У нас несколько клиентов на редизайн, хотим подключать вас на дизайн. Какая у вас загрузка на ближайший месяц?', 2980],
      ['alina', 'Сейчас свободна примерно на половину времени. Пришлите брифы — оценю сроки.', 2900],
      ['sergey', 'Отлично, пришлю сегодня вечером.', 2890],
      ['sergey', 'Отправил бриф на почту, посмотрите, пожалуйста.', 60],
    ],
    unread: true,
  },
  {
    between: ['artem', 'maxim'],
    messages: [
      ['artem', 'Максим, привет! Нужен фронт для веб-версии нашего приложения, интересно?', 400],
      ['maxim', 'Привет! Да, расскажи подробнее про стек и сроки.', 380],
      ['artem', 'Vue 3, дизайн будет через две недели. Пока можно начать с авторизации.', 370],
    ],
  },
  {
    between: ['vika', 'olga'],
    messages: [
      ['olga', 'Виктория, отправила тексты на все шесть вкусов.', 1500],
      ['vika', 'Спасибо, очень понравилось! Поправьте, пожалуйста, «мятный» — там состав другой.', 1400],
      ['olga', 'Готово 👍', 1380],
    ],
  },
];
