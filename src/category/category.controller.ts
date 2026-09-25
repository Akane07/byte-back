import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CategoryService } from './category.service';
import { Category } from './schemas/category.schema';

@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  @ApiOperation({ summary: 'Все категории заказов' })
  @ApiResponse({ status: 200, type: [Category] })
  getAllCategories() {
    return this.categoryService.getCategories();
  }

  @Get(':id/skills')
  @ApiOperation({ summary: 'Навыки категории вместе с базовыми' })
  @ApiResponse({ status: 200, type: [String] })
  getSkills(@Param('id', ParseIntPipe) id: number) {
    return this.categoryService.getSkills(id);
  }
}
