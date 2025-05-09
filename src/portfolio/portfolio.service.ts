import { Injectable } from '@nestjs/common';
import { Portfolio, PortfolioDocument } from './schemas/portfolio.schema';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { PortfolioDto } from './dto/portfolio.dto';

@Injectable()
export class PortfolioService {
    constructor(
        @InjectModel(Portfolio.name) private readonly portfolioModel: Model<PortfolioDocument>,
    ) { }

    async getPortfolioList(userId: string) {
        const portfolios = await this.portfolioModel.find({ user_id: userId }).lean();
        return portfolios.map((portfolio) => {
            delete portfolio.__v;

            const res = {
                ...portfolio,
                viewed_by: portfolio.viewed_by.length,
                id: portfolio._id,
            };

            delete res._id;

            return res;
        });
    }

    async getPortfolio(id: string) {
        const portfolio = await this.portfolioModel.findById(id).lean();

        delete portfolio.__v;

        const res = {
            ...portfolio,
            viewed_by: portfolio.viewed_by.length,
            id: portfolio._id,
        };

        delete res._id;

        return res;
    }

    async createPortfolio(userId: string, body: PortfolioDto) {
        const portfolio = new this.portfolioModel({ ...body, user_id: userId });
        await portfolio.save();
        return portfolio;
    }

    async deletePortfolio(userId: string, id: string) {
        const portfolio = await this.portfolioModel.findById(id);
        if (!portfolio) {
            throw new Error('Portfolio not found');
        }
        if (portfolio.user_id !== userId) {
            throw new Error('Portfolio not found');
        }
        await this.portfolioModel.deleteOne({ _id: id });
        return true;
    }

    async updatePortfolio(userId: string, id: string, body: PortfolioDto) {
        const portfolio = await this.portfolioModel.findById(id);
        if (!portfolio) {
            throw new Error('Portfolio not found');
        }
        if (portfolio.user_id !== userId) {
            throw new Error('Portfolio not found');
        }
        portfolio.set(body);
        await portfolio.save();
        return portfolio;
    }

    async viewPortfolio(userId: string, id: string) {
        const project = await this.portfolioModel.findById(id);
        if (!project) {
            throw new Error('Проект не найден');
        }

        if (userId === project.user_id) return;

        if (!project.viewed_by?.includes(userId)) {
            project.viewed_by.push(userId);
            await project.save();
        }
    }

    async likePortfolio(userId: string, id: string, isLike: boolean) {
        const project = await this.portfolioModel.findById(id);
        if (!project) {
            throw new Error('Проект не найден');
        }

        if (userId === project.user_id) return await this.getPortfolio(id);

        if (isLike) {
            if (!project.liked_by.includes(userId)) {
                project.liked_by.push(userId);
                await project.save();
            }
        } else {
            if (project.liked_by.includes(userId)) {
                const index = project.liked_by.indexOf(userId);
                project.liked_by.splice(index, 1);
                await project.save();
            }
        }

        return await this.getPortfolio(id);
    }
}
