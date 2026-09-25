import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PortfolioDto, UpdatePortfolioDto } from './dto/portfolio.dto';
import { Portfolio, PortfolioDocument } from './schemas/portfolio.schema';

export const MAX_PORTFOLIO_IMAGES = 5;

type UploadedMedia = { images: string[]; video?: string };

@Injectable()
export class PortfolioService {
  constructor(
    @InjectModel(Portfolio.name)
    private readonly portfolioModel: Model<Portfolio>,
  ) {}

  async getPortfolioList(userId: string) {
    const portfolios = await this.portfolioModel
      .find({ user_id: userId })
      .sort({ created_at: -1 });
    return portfolios.map(serialize);
  }

  async getPortfolio(id: string) {
    return serialize(await this.findPortfolio(id));
  }

  async createPortfolio(
    userId: string,
    dto: PortfolioDto,
    media: UploadedMedia,
  ) {
    if (!media.images.length) {
      throw new BadRequestException('Добавьте хотя бы одно изображение');
    }

    const portfolio = await this.portfolioModel.create({
      ...dto,
      images: media.images,
      video: media.video,
      user_id: userId,
    });
    return serialize(portfolio);
  }

  async updatePortfolio(
    userId: string,
    id: string,
    dto: UpdatePortfolioDto,
    media: UploadedMedia,
  ) {
    const portfolio = await this.findOwnPortfolio(id, userId);

    // Оставить можно только картинки, которые уже принадлежат этому проекту —
    // иначе через photos можно было бы подставить чужие файлы.
    const kept = dto.photos.filter((url) => portfolio.images.includes(url));
    const images = [...kept, ...media.images];

    if (!images.length) {
      throw new BadRequestException('Добавьте хотя бы одно изображение');
    }
    if (images.length > MAX_PORTFOLIO_IMAGES) {
      throw new BadRequestException(
        `В проекте может быть не больше ${MAX_PORTFOLIO_IMAGES} изображений`,
      );
    }

    // Новый файл заменяет видео, пустая строка в video удаляет его,
    // а если поле не передано — видео остаётся прежним.
    const video =
      media.video ?? (dto.video === '' ? undefined : portfolio.video);

    portfolio.set({
      title: dto.title,
      description: dto.description,
      role: dto.role,
      skills: dto.skills,
      images,
      video,
    });
    await portfolio.save();
    return serialize(portfolio);
  }

  async deletePortfolio(userId: string, id: string) {
    const portfolio = await this.findOwnPortfolio(id, userId);
    await portfolio.deleteOne();
    return { deleted: true };
  }

  async viewPortfolio(userId: string, id: string) {
    const portfolio = await this.findPortfolio(id);
    if (portfolio.user_id !== userId) {
      await portfolio.updateOne({ $addToSet: { viewed_by: userId } });
    }
    return { viewed: true };
  }

  async likePortfolio(userId: string, id: string, liked: boolean) {
    const portfolio = await this.findPortfolio(id);

    if (portfolio.user_id !== userId) {
      await portfolio.updateOne(
        liked
          ? { $addToSet: { liked_by: userId } }
          : { $pull: { liked_by: userId } },
      );
    }

    return this.getPortfolio(id);
  }

  private async findPortfolio(id: string): Promise<PortfolioDocument> {
    const portfolio = await this.portfolioModel.findById(id);
    if (!portfolio) {
      throw new NotFoundException('Проект не найден');
    }
    return portfolio;
  }

  private async findOwnPortfolio(id: string, userId: string) {
    const portfolio = await this.findPortfolio(id);
    if (portfolio.user_id !== userId) {
      throw new NotFoundException('Проект не найден');
    }
    return portfolio;
  }
}

/** Ответ API: id вместо _id, число просмотров вместо списка просмотревших. */
function serialize(portfolio: PortfolioDocument) {
  const { _id, __v, viewed_by, ...fields } = portfolio.toObject();
  return { ...fields, id: _id.toString(), viewed_by: viewed_by.length };
}
