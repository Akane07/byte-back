/**
 * Где выполняется работа:
 * - remote — удалённо, через интернет (сайт, дизайн, тексты);
 * - onsite — на месте, у заказчика или рядом с ним (ремонт, уборка, переезд);
 * - any — бывает и так, и так (репетитор, ремонт техники).
 */
export const CATEGORY_FORMATS = ['remote', 'onsite', 'any'] as const;
export type CategoryFormat = (typeof CATEGORY_FORMATS)[number];

export interface CategoryDefinition {
  id: number;
  title: string;
  format: CategoryFormat;
}

/** id категории «Другое» — у неё только базовые навыки. */
export const OTHER_CATEGORY_ID = 13;

/**
 * Справочник категорий. id 1–13 — исторические (на них ссылаются старые
 * заказы), поэтому новые категории добавляются только с новыми id.
 * Навыки категорий — в skills.ts под теми же id.
 */
export const CATEGORIES: CategoryDefinition[] = [
  // Работа в интернете
  { id: 1, title: 'Графический дизайн', format: 'remote' },
  { id: 2, title: 'Программирование', format: 'remote' },
  { id: 3, title: 'Веб-разработка', format: 'remote' },
  { id: 4, title: 'UI/UX-дизайн', format: 'remote' },
  { id: 5, title: 'Видео и анимация', format: 'remote' },
  { id: 6, title: 'Маркетинг и реклама', format: 'remote' },
  { id: 7, title: 'Бизнес и консалтинг', format: 'remote' },
  { id: 8, title: 'SEO и продвижение', format: 'remote' },
  { id: 9, title: 'Тексты и переводы', format: 'remote' },
  { id: 10, title: 'Инжиниринг и 3D', format: 'remote' },
  { id: 11, title: 'Искусственный интеллект', format: 'remote' },
  // И онлайн, и вживую
  { id: 12, title: 'Обучение и репетиторы', format: 'any' },
  { id: 21, title: 'Ремонт техники и IT-помощь', format: 'any' },
  // Услуги на месте
  { id: 14, title: 'Ремонт и отделка', format: 'onsite' },
  { id: 15, title: 'Уборка и помощь по дому', format: 'onsite' },
  { id: 16, title: 'Переезды и грузоперевозки', format: 'onsite' },
  { id: 17, title: 'Курьеры и доставка', format: 'onsite' },
  { id: 18, title: 'Красота и здоровье', format: 'onsite' },
  { id: 19, title: 'Фото- и видеосъёмка', format: 'onsite' },
  { id: 20, title: 'Праздники и мероприятия', format: 'onsite' },
  { id: 22, title: 'Авто', format: 'onsite' },
  { id: 23, title: 'Няни, сиделки, животные', format: 'onsite' },
  { id: 24, title: 'Подработка и разовые задачи', format: 'onsite' },
  { id: OTHER_CATEGORY_ID, title: 'Другое', format: 'any' },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
