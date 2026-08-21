import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import dayjs from 'dayjs';
import { AccountService } from './account.service.js';
import {
  AccountRepository,
  type ClaimedAccount,
} from './repositories/account.repository.js';

export interface PurgeOptions {
  batchSize?: number;
}

export interface PurgeSummary {
  claimed: number;
  purged: number;
  failed: number;
}

@Injectable()
export class AccountPurgeService {
  private readonly logger = new Logger(AccountPurgeService.name);

  constructor(
    private readonly accounts: AccountRepository,
    private readonly accountService: AccountService,
    private readonly config: ConfigService,
  ) {}

  async purgeExpiredAccounts(
    options: PurgeOptions = {},
  ): Promise<PurgeSummary> {
    const batchSize =
      options.batchSize ?? this.config.get<number>('accounts.purgeBatchSize')!;
    const claimed = await this.claimBatch(batchSize);

    if (claimed.length === 0) {
      return { claimed: 0, purged: 0, failed: 0 };
    }

    let purged = 0;
    let failed = 0;

    for (const account of claimed) {
      try {
        await this.accountService.deleteAccount(account.userId);
        purged++;
      } catch (error) {
        failed++;
        this.logger.error(
          `Failed to purge account '${account.id}' for user '${account.userId}': ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }

    this.logger.log(
      `Purge run finished: claimed=${claimed.length} purged=${purged} failed=${failed}`,
    );

    return { claimed: claimed.length, purged, failed };
  }

  private async claimBatch(batchSize: number): Promise<ClaimedAccount[]> {
    if (batchSize <= 0) return [];

    const stalled = await this.accounts.claimStalledDeletions({
      updatedBefore: dayjs()
        .subtract(
          this.config.get<number>('accounts.purgeStalledAfterMinutes')!,
          'minute',
        )
        .toDate(),
      limit: batchSize,
    });

    const expired = await this.accounts.claimExpiredSuspended({
      suspendedBefore: dayjs()
        .subtract(
          this.config.get<number>('accounts.suspendedRetentionDays')!,
          'day',
        )
        .toDate(),
      limit: batchSize - stalled.length,
    });

    return [...stalled, ...expired];
  }
}
