import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AccountPurgeService } from '../../../account/account-purge.service.js';
import { JobName } from '../../constants.js';

@Injectable()
export class AccountPurgeScheduler {
  private readonly logger = new Logger(AccountPurgeScheduler.name);
  private running = false;

  constructor(
    private readonly purge: AccountPurgeService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM, {
    name: JobName.ACCOUNT_PURGE,
    timeZone: 'UTC',
  })
  async handleCron(): Promise<void> {
    if (!this.config.get<boolean>('executeCronjobs')) return;

    if (this.running) {
      this.logger.warn('Previous purge run is still going; skipping this tick');
      return;
    }

    this.running = true;
    try {
      await this.purge.purgeExpiredAccounts();
    } catch (error) {
      this.logger.error(
        `Purge run failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
    } finally {
      this.running = false;
    }
  }
}
