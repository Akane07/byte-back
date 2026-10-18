import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CATEGORIES,
  CATEGORY_IDS,
  OTHER_CATEGORY_ID,
} from './constants/categories';
import { baseSkills, skills } from './constants/skills';
import { Category } from './schemas/category.schema';

@Injectable()
export class CategoryService implements OnModuleInit {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
  ) {}

  /**
   * Справочник категорий задан в коде (constants/categories.ts) и при каждом
   * запуске приводится в базе к нему: новые категории добавляются, у старых
   * обновляются название и формат. Раньше категории записывались только
   * в пустую базу, и уже работающий сайт никогда не получил бы новые.
   */
  async onModuleInit() {
    const result = await this.categoryModel.bulkWrite(
      CATEGORIES.map((category, order) => ({
        updateOne: {
          filter: { id: category.id },
          update: { $set: { ...category, order } },
          upsert: true,
        },
      })),
    );
    if (result.upsertedCount) {
      this.logger.log(`Добавлено категорий: ${result.upsertedCount}`);
    }
  }

  getCategories() {
    return this.categoryModel.find({ id: { $in: CATEGORY_IDS } }).sort({
      order: 1,
    });
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
