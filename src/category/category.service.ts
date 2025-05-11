import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { baseSkills, skills } from './constants/skills';

@Injectable()
export class CategoryService {
    constructor(
        @InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>,
    ) { }

    async getCategories() {
        return this.categoryModel.find().exec();
    }

    async getSkills(id: string) {
        const numId = Number(id);

        if (numId === 13) {
            return baseSkills;
        }

        return skills[numId].concat(baseSkills);
    }
}
