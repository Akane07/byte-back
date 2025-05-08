import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { PortfolioService } from './portfolio.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { ApiBody, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Portfolio } from './schemas/portfolio.schema';
import { PortfolioDto } from './dto/portfolio.dto';
import { extname } from 'path';
import { diskStorage } from 'multer';
import { FileFieldsInterceptor } from '@nestjs/platform-express';

@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

    @Get('')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Список проектов в портфолио', description: 'Получение списка проектов пользователя' })
    @ApiResponse({ status: 200, description: 'Список проекто в портфолио', type: [Portfolio] })
    getPortfolioList(@Request() req: any) {
      return this.portfolioService.getPortfolioList(req.user.userId);
    }

    @Get(':id')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Список проектов в портфолио', description: 'Получение списка проектов пользователя' })
    @ApiResponse({ status: 200, description: 'Список проекто в портфолио', type: [Portfolio] })
    getPortfolio(@Param() params: { id: string }) {
      return this.portfolioService.getPortfolio(params.id);
    }

    @Get('user/:id')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Список проектов в портфолио по ID пользователя', description: 'Получение списка проектов пользователя по ID' })
    @ApiQuery({ name: 'id', type: String, description: 'ID пользователя', required: true })
    @ApiResponse({ status: 200, description: 'Список проекто в портфолио', type: [Portfolio] })
    getPortfolioListByUser(@Param() params: { id: string }) {
      return this.portfolioService.getPortfolioList(params.id);
    }

    @Post('')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Добавление проекта в портфолио', description: 'Добавление проекта в портфолио' })
    @ApiBody({ type: PortfolioDto, description: 'Данные проекта', required: true })
    @ApiResponse({ status: 200, description: 'Проект добавлен в портфолио', type: Portfolio })
    @UseInterceptors(
      FileFieldsInterceptor(
        [
          { name: 'video', maxCount: 1 },
          { name: 'images', maxCount: 5 },
        ],
        {
          storage: diskStorage({
            destination: './uploads/files/',
            filename: (req, file, cb) => {             
              const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
              cb(null, uniqueSuffix + extname(file.originalname));
            },
          }),
        },
      ),
    )
    createPortfolio(
      @Request() req: any,
      @UploadedFiles()
      files: {
        video?: any[];
        images?: any[];
      },
      @Body() body: PortfolioDto,
    ) {      
      return this.portfolioService.createPortfolio(req.user.userId, {
        ...body,
        video: files.video ? `/uploads/files/${files.video?.[0]?.filename}` : '',
        images: files.images?.map((file) => `/uploads/files/${file.filename}`),
      });
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Обновление проекта в портфолио', description: 'Обновление проекта в портфолио' })
    @ApiQuery({ name: 'id', type: String, description: 'ID проекта', required: true })
    @ApiBody({ type: PortfolioDto, description: 'Данные проекта', required: true })
    @ApiResponse({ status: 200, description: 'Проект обновлен в портфолио', type: Portfolio })
    updatePortfolio(@Request() req: any, @Param() params: { id: string }, @Body() body: PortfolioDto) {
      return this.portfolioService.updatePortfolio(req.user.userId, params.id, body);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Удаление проекта из портфолио', description: 'Удаление проекта из портфолио' })
    @ApiQuery({ name: 'id', type: String, description: 'ID проекта', required: true })
    @ApiResponse({ status: 200, description: 'Проект удален из портфолио', type: Boolean })
    deletePortfolio(@Request() req: any, @Param() params: { id: string }) {
      return this.portfolioService.deletePortfolio(req.user.userId, params.id);
    }
}
