import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  MailAccount,
  MailAccountState,
} from '../domain/mail-account.domain.js';
import { MailAccountModel } from '../models/mail-account.model.js';
import { MailAddressModel } from '../models/mail-address.model.js';
import { MailProviderAccountModel } from '../models/mail-provider-account.model.js';
import { toAddressAttributes } from './address.repository.js';

export interface ClaimedAccount {
  id: string;
  userId: string;
}

@Injectable()
export class AccountRepository {
  constructor(
    @InjectModel(MailAccountModel)
    private readonly accountModel: typeof MailAccountModel,
    private readonly sequelize: Sequelize,
  ) {}

  async findByUserId(userId: string): Promise<MailAccount | null> {
    const model = await this.accountModel.findOne({
      where: { userId },
      include: [
        {
          model: MailAddressModel,
          include: [MailProviderAccountModel],
        },
      ],
    });

    return model ? this.toDomain(model) : null;
  }

  async create(params: { userId: string }): Promise<MailAccount> {
    const model = await this.accountModel.create(
      { userId: params.userId },
      {
        include: [
          { model: MailAddressModel, include: [MailProviderAccountModel] },
        ],
      },
    );
    return this.toDomain(model);
  }

  async delete(id: string, options?: { force?: boolean }): Promise<void> {
    await this.accountModel.destroy({ where: { id }, force: options?.force });
  }

  async setNetworkBucketId(id: string, networkBucketId: string): Promise<void> {
    await this.accountModel.update({ networkBucketId }, { where: { id } });
  }

  async suspend(id: string): Promise<void> {
    await this.accountModel.update(
      { status: MailAccountState.Suspended, suspendedAt: new Date() },
      { where: { id } },
    );
  }

  async reactivate(id: string): Promise<void> {
    await this.accountModel.update(
      { status: MailAccountState.Active, suspendedAt: null },
      { where: { id } },
    );
  }

  async claimExpiredSuspended(params: {
    suspendedBefore: Date;
    limit: number;
  }): Promise<ClaimedAccount[]> {
    return this.runClaim(
      `UPDATE mail_accounts
          SET status = :deleting, updated_at = NOW()
        WHERE id IN (
          SELECT id
            FROM mail_accounts
           WHERE deleted_at IS NULL
             AND status = :suspended
             AND suspended_at IS NOT NULL
             AND suspended_at < :threshold
           ORDER BY suspended_at
           LIMIT :limit
           FOR UPDATE SKIP LOCKED
        )
       RETURNING id, user_id AS "userId"`,
      params.limit,
      {
        suspended: MailAccountState.Suspended,
        threshold: params.suspendedBefore,
      },
    );
  }

  /**
   * Re-claims accounts left mid-purge by a run that died, so the next one
   * finishes them instead of leaving them stuck in 'deleting' forever.
   */
  async claimStalledDeletions(params: {
    updatedBefore: Date;
    limit: number;
  }): Promise<ClaimedAccount[]> {
    return this.runClaim(
      `UPDATE mail_accounts
          SET status = :deleting, updated_at = NOW()
        WHERE id IN (
          SELECT id
            FROM mail_accounts
           WHERE deleted_at IS NULL
             AND status = :deleting
             AND updated_at < :threshold
           ORDER BY updated_at
           LIMIT :limit
           FOR UPDATE SKIP LOCKED
        )
       RETURNING id, user_id AS "userId"`,
      params.limit,
      { threshold: params.updatedBefore },
    );
  }

  private async runClaim(
    sql: string,
    limit: number,
    replacements: Record<string, string | Date>,
  ): Promise<ClaimedAccount[]> {
    if (limit <= 0) return [];

    return this.sequelize.query<ClaimedAccount>(sql, {
      replacements: {
        deleting: MailAccountState.Deleting,
        limit,
        ...replacements,
      },
      type: QueryTypes.SELECT,
    });
  }

  private toDomain(model: MailAccountModel): MailAccount {
    return MailAccount.build({
      id: model.id,
      userId: model.userId,
      status: model.status as MailAccountState,
      suspendedAt: model.suspendedAt,
      networkBucketId: model.networkBucketId,
      createdAt: model.createdAt as Date,
      updatedAt: model.updatedAt as Date,
      addresses: (model.addresses ?? []).map(toAddressAttributes),
    });
  }
}
