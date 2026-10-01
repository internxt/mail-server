import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { ConfigService } from '@nestjs/config';
import { AccountPurgeScheduler } from './account-purge.scheduler.js';
import { AccountPurgeService } from '../../../account/account-purge.service.js';

describe('AccountPurgeScheduler', () => {
  let scheduler: AccountPurgeScheduler;
  let purge: DeepMocked<AccountPurgeService>;
  let config: DeepMocked<ConfigService>;

  const enable = (enabled: boolean) => config.get.mockReturnValue(enabled);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountPurgeScheduler],
    })
      .useMocker(() => createMock<object>())
      .compile();

    scheduler = module.get(AccountPurgeScheduler);
    purge = module.get(AccountPurgeService);
    config = module.get(ConfigService);

    purge.purgeExpiredAccounts.mockResolvedValue({
      claimed: 0,
      purged: 0,
      failed: 0,
    });
  });

  it('when the tick fires on a cronjob instance, then runs a purge', async () => {
    enable(true);

    await scheduler.handleCron();

    expect(config.get).toHaveBeenCalledWith('executeCronjobs');
    expect(purge.purgeExpiredAccounts).toHaveBeenCalled();
  });

  it('when this is not a cronjob instance, then the tick does nothing', async () => {
    enable(false);

    await scheduler.handleCron();

    expect(purge.purgeExpiredAccounts).not.toHaveBeenCalled();
  });

  it('when the flag is unset, then purging stays off', async () => {
    config.get.mockReturnValue(undefined);

    await scheduler.handleCron();

    expect(purge.purgeExpiredAccounts).not.toHaveBeenCalled();
  });

  it('when a run is still going, then the next tick is skipped', async () => {
    enable(true);
    let release!: () => void;
    purge.purgeExpiredAccounts.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ claimed: 0, purged: 0, failed: 0 });
      }),
    );

    const first = scheduler.handleCron();
    await scheduler.handleCron();

    expect(purge.purgeExpiredAccounts).toHaveBeenCalledTimes(1);

    release();
    await first;
  });

  it('when a run fails, then the tick swallows it and lets the next one through', async () => {
    enable(true);
    purge.purgeExpiredAccounts.mockRejectedValueOnce(new Error('DB down'));

    await expect(scheduler.handleCron()).resolves.toBeUndefined();

    await scheduler.handleCron();

    expect(purge.purgeExpiredAccounts).toHaveBeenCalledTimes(2);
  });
});
