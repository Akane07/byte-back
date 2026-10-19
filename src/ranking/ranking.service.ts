import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order } from '../order/schemas/order.schema';
import {
  activity,
  experience,
  experienceAdvanced,
  Factors,
  isEligible,
  isNewcomer,
  MissingCondition,
  OrderContext,
  ProfileFields,
  quality,
  relevance,
  rerankWithNewcomerQuota,
  score,
  workload,
} from './ranking.math';

/** legacy — прежняя сортировка по rating_score, weighted — многофакторная. */
export const RANK_MODES = ['legacy', 'weighted'] as const;
export type RankMode = (typeof RANK_MODES)[number];

export interface RankingCandidate extends ProfileFields {
  id: string;
  rating_score: number;
  reviews_count: number;
  last_seen?: string;
}

export interface RankingInfo {
  mode: RankMode;
  score: number;
  position: number;
  quotaSlot: boolean;
  factors: Factors;
  isNewcomer: boolean;
  missing: MissingCondition[];
}

export interface Ranked<T> {
  candidate: T;
  ranking: RankingInfo;
}

interface PerformerCounts {
  completed: number;
  inProgress: number;
}

@Injectable()
export class RankingService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
  ) {}

  /** Обе ступени: score по факторам, затем квота для новичков. */
  async rank<T extends RankingCandidate>(
    candidates: T[],
    order?: OrderContext,
    now = new Date(),
  ): Promise<Ranked<T>[]> {
    const described = await this.describe(candidates, order, now);
    return rerankWithNewcomerQuota(
      described.map((d) => ({
        id: d.candidate.id,
        score: d.ranking.score,
        isNewcomer: d.ranking.isNewcomer,
        reviewsCount: d.candidate.reviews_count,
        lastSeen: d.candidate.last_seen,
        d,
      })),
    ).map(
      ({ d, position, quotaSlot }): Ranked<T> => ({
        candidate: d.candidate,
        ranking: { ...d.ranking, mode: 'weighted', position, quotaSlot },
      }),
    );
  }

  /** Разбивка по факторам без изменения порядка — для explain в режиме legacy. */
  async describe<T extends RankingCandidate>(
    candidates: T[],
    order?: OrderContext,
    now = new Date(),
  ): Promise<Ranked<T>[]> {
    const counts = await this.countOrders(candidates.map((c) => c.id));
    return candidates.map((candidate, i): Ranked<T> => {
      const { completed, inProgress } = counts.get(candidate.id) ?? {
        completed: 0,
        inProgress: 0,
      };
      const { eligible, missing } = isEligible(candidate);
      const factors: Factors = {
        Q: quality(candidate.rating_score, candidate.reviews_count),
        E: experience(completed),
        Eadv: experienceAdvanced(completed, eligible),
        A: activity(candidate.last_seen, now),
        L: workload(inProgress),
      };
      if (order) factors.R = relevance(order, candidate);
      return {
        candidate,
        ranking: {
          mode: 'legacy',
          score: score(factors),
          position: i + 1,
          quotaSlot: false,
          factors,
          isNewcomer: isNewcomer(eligible, completed),
          missing,
        },
      };
    });
  }

  /** Завершённые и текущие заказы как исполнителя — одной агрегацией на всех. */
  private async countOrders(ids: string[]) {
    const rows = await this.orderModel.aggregate<
      PerformerCounts & { _id: string }
    >([
      {
        $match: {
          performer: { $in: ids },
          status: { $in: ['completed', 'pending', 'review'] },
        },
      },
      {
        $group: {
          _id: '$performer',
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 0, 1] },
          },
        },
      },
    ]);
    return new Map(rows.map(({ _id, ...c }) => [_id, c]));
  }
}
