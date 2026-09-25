import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { baseSkills, skills } from './constants/skills';
import { Category } from './schemas/category.schema';

/** id категории «Другое» — у неё только базовые навыки. */
const OTHER_CATEGORY_ID = 13;

/**
 * Начальный набор категорий. Пишется в базу, только если коллекция пуста,
 * поэтому на уже заполненную базу не влияет. id совпадают с ключами skills.
 */
const DEFAULT_CATEGORIES: Category[] = [
  { id: 1, title: 'Графический дизайн' },
  { id: 2, title: 'Программирование' },
  { id: 3, title: 'Веб-разработка' },
  { id: 4, title: 'UI/UX-дизайн' },
  { id: 5, title: 'Видео и анимация' },
  { id: 6, title: 'Маркетинг и реклама' },
  { id: 7, title: 'Бизнес и консалтинг' },
  { id: 8, title: 'SEO и продвижение' },
  { id: 9, title: 'Тексты и переводы' },
  { id: 10, title: 'Инжиниринг и 3D' },
  { id: 11, title: 'Искусственный интеллект' },
  { id: 12, title: 'Обучение' },
  { id: OTHER_CATEGORY_ID, title: 'Другое' },
];

@Injectable()
export class CategoryService implements OnModuleInit {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
  ) {}

  async onModuleInit() {
    if (await this.categoryModel.estimatedDocumentCount()) return;
    await this.categoryModel.insertMany(DEFAULT_CATEGORIES);
    this.logger.log(
      `Коллекция категорий была пуста — добавлено ${DEFAULT_CATEGORIES.length}`,
    );
  }

  getCategories() {
    return this.categoryModel.find().sort({ id: 1 });
  }

  getSkills(id: number) {
    if (id === OTHER_CATEGORY_ID) {
      return baseSkills;
    }

    const categorySkills: string[] | undefined =
      skills[id as keyof typeof skills];
    if (!categorySkills) {
      throw new NotFoundException('Категория не найдена');
    }
    return [...categorySkills, ...baseSkills];
  }
}
