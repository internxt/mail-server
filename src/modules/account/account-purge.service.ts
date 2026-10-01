import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import { AccountService } from './account.service.js';
import {
  PURGE_BATCH_SIZE,
  PURGE_STALLED_AFTER_MINUTES,
  PURGE_STALLED_RECLAIM_LIMIT,
  SUSPENDED_RETENTION_DAYS,
} from './constants.js';
import {
  AccountRepository,
  type ClaimedAccount,
} from './repositories/account.repository.js';

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
  ) {}

  async purgeExpiredAccounts(): Promise<PurgeSummary> {
    const claimed = await this.claimBatch();

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

  private async claimBatch(): Promise<ClaimedAccount[]> {
    const stalled = await this.accounts.claimStalledDeletions({
      updatedBefore: dayjs()
        .subtract(PURGE_STALLED_AFTER_MINUTES, 'minute')
        .toDate(),
      limit: PURGE_STALLED_RECLAIM_LIMIT,
    });

    const expired = await this.accounts.claimExpiredSuspended({
      suspendedBefore: dayjs()
        .subtract(SUSPENDED_RETENTION_DAYS, 'day')
        .toDate(),
      limit: PURGE_BATCH_SIZE - stalled.length,
    });

    return [...stalled, ...expired];
  }
}
