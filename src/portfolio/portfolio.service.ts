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
        const portfolios = await this.portfolioModel.find({ user_id: userId }).exec();
        return portfolios;
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
}
