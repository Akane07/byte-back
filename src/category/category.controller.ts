import { Controller, Get, Param } from '@nestjs/common';
import { CategoryService } from './category.service';

@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) { }

  @Get('')
  getAllCategories() {
    return this.categoryService.getCategories();
  }

  @Get(":id/skills")
  getSkills(@Param() params: { id: string }) {
    return this.categoryService.getSkills(params.id);
  }
}
