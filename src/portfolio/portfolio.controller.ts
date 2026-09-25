import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { UserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe';
import { mediaUpload, uploadUrl } from '../common/uploads';
import { PortfolioDto, UpdatePortfolioDto } from './dto/portfolio.dto';
import { MAX_PORTFOLIO_IMAGES, PortfolioService } from './portfolio.service';
import { Portfolio } from './schemas/portfolio.schema';

type PortfolioFiles = {
  video?: Express.Multer.File[];
  images?: Express.Multer.File[];
};

const portfolioFiles = FileFieldsInterceptor(
  [
    { name: 'video', maxCount: 1 },
    { name: 'images', maxCount: MAX_PORTFOLIO_IMAGES },
  ],
  mediaUpload,
);

function toMedia(files: PortfolioFiles = {}) {
  const video = files.video?.[0];
  return {
    images: (files.images ?? []).map((file) =>
      uploadUrl('files', file.filename),
    ),
    video: video && uploadUrl('files', video.filename),
  };
}

@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Свои проекты' })
  @ApiResponse({ status: 200, type: [Portfolio] })
  getMyPortfolio(@UserId() userId: string) {
    return this.portfolioService.getPortfolioList(userId);
  }

  @Get('user/:id')
  @ApiOperation({ summary: 'Проекты пользователя' })
  @ApiResponse({ status: 200, type: [Portfolio] })
  getPortfolioListByUser(@Param('id', ParseObjectIdPipe) id: string) {
    return this.portfolioService.getPortfolioList(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Проект по id' })
  @ApiResponse({ status: 200, type: Portfolio })
  getPortfolio(@Param('id', ParseObjectIdPipe) id: string) {
    return this.portfolioService.getPortfolio(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Добавить проект',
    description: `multipart: images (до ${MAX_PORTFOLIO_IMAGES}), video (1), title, description, role, skills`,
  })
  @ApiResponse({ status: 201, type: Portfolio })
  @UseInterceptors(portfolioFiles)
  createPortfolio(
    @UserId() userId: string,
    @Body() dto: PortfolioDto,
    @UploadedFiles() files: PortfolioFiles,
  ) {
    return this.portfolioService.createPortfolio(userId, dto, toMedia(files));
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Изменить свой проект',
    description: 'photos[] — оставляемые картинки; images — новые файлы',
  })
  @ApiResponse({ status: 200, type: Portfolio })
  @UseInterceptors(portfolioFiles)
  updatePortfolio(
    @UserId() userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdatePortfolioDto,
    @UploadedFiles() files: PortfolioFiles,
  ) {
    return this.portfolioService.updatePortfolio(
      userId,
      id,
      dto,
      toMedia(files),
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Удалить свой проект' })
  deletePortfolio(
    @UserId() userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.portfolioService.deletePortfolio(userId, id);
  }

  @Post(':id/viewed')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Отметить проект просмотренным' })
  viewPortfolio(
    @UserId() userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.portfolioService.viewPortfolio(userId, id);
  }

  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Поставить или снять лайк',
    description: 'Тело: { liked: boolean }',
  })
  @ApiResponse({ status: 200, type: Portfolio })
  likePortfolio(
    @UserId() userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body('liked', ParseBoolPipe) liked: boolean,
  ) {
    return this.portfolioService.likePortfolio(userId, id, liked);
  }
}
