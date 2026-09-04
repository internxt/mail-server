import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { ConfigService } from '@nestjs/config';
import { AccountPurgeService } from './account-purge.service.js';
import { AccountService } from './account.service.js';
import { AccountRepository } from './repositories/account.repository.js';

const NOW = new Date('2026-08-21T12:00:00.000Z');
const RETENTION_DAYS = 30;
const BATCH_SIZE = 100;
const STALLED_AFTER_MINUTES = 60;

describe('AccountPurgeService', () => {
  let service: AccountPurgeService;
  let accounts: DeepMocked<AccountRepository>;
  let accountService: DeepMocked<AccountService>;
  let config: DeepMocked<ConfigService>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountPurgeService],
    })
      .useMocker(() => createMock<object>())
      .compile();

    service = module.get(AccountPurgeService);
    accounts = module.get(AccountRepository);
    accountService = module.get(AccountService);
    config = module.get(ConfigService);

    config.get.mockImplementation((key: string) => {
      const values: Record<string, number> = {
        'accounts.suspendedRetentionDays': RETENTION_DAYS,
        'accounts.purgeBatchSize': BATCH_SIZE,
        'accounts.purgeStalledAfterMinutes': STALLED_AFTER_MINUTES,
      };
      return values[key] as never;
    });

    accounts.claimStalledDeletions.mockResolvedValue([]);
    accounts.claimExpiredSuspended.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('when accounts are past retention, then claims and deletes each of them', async () => {
    accounts.claimExpiredSuspended.mockResolvedValue([
      { id: 'acc-1', userId: 'user-1' },
      { id: 'acc-2', userId: 'user-2' },
    ]);

    const summary = await service.purgeExpiredAccounts();

    expect(accounts.claimExpiredSuspended).toHaveBeenCalledWith({
      suspendedBefore: new Date('2026-07-22T12:00:00.000Z'),
      limit: BATCH_SIZE,
    });
    expect(accountService.deleteAccount).toHaveBeenCalledWith('user-1');
    expect(accountService.deleteAccount).toHaveBeenCalledWith('user-2');
    expect(summary).toEqual({ claimed: 2, purged: 2, failed: 0 });
  });

  it('when nothing is due, then reports an empty run without deleting anything', async () => {
    const summary = await service.purgeExpiredAccounts();

    expect(accountService.deleteAccount).not.toHaveBeenCalled();
    expect(summary).toEqual({ claimed: 0, purged: 0, failed: 0 });
  });

  it('when a claim has gone stale, then it is retried before newly expired ones', async () => {
    accounts.claimStalledDeletions.mockResolvedValue([
      { id: 'acc-stuck', userId: 'user-stuck' },
    ]);

    await service.purgeExpiredAccounts({ batchSize: 3 });

    expect(accounts.claimStalledDeletions).toHaveBeenCalledWith({
      updatedBefore: new Date('2026-08-21T11:00:00.000Z'),
      limit: 3,
    });
    expect(accounts.claimExpiredSuspended).toHaveBeenCalledWith({
      suspendedBefore: new Date('2026-07-22T12:00:00.000Z'),
      limit: 2,
    });
    expect(accountService.deleteAccount).toHaveBeenCalledWith('user-stuck');
  });

  it('when stalled claims fill the batch, then no new accounts are claimed', async () => {
    accounts.claimStalledDeletions.mockResolvedValue([
      { id: 'acc-1', userId: 'user-1' },
      { id: 'acc-2', userId: 'user-2' },
    ]);

    await service.purgeExpiredAccounts({ batchSize: 2 });

    expect(accounts.claimExpiredSuspended).toHaveBeenCalledWith({
      suspendedBefore: new Date('2026-07-22T12:00:00.000Z'),
      limit: 0,
    });
  });

  it('when one account fails, then the rest of the batch still runs', async () => {
    accounts.claimExpiredSuspended.mockResolvedValue([
      { id: 'acc-1', userId: 'user-1' },
      { id: 'acc-2', userId: 'user-2' },
      { id: 'acc-3', userId: 'user-3' },
    ]);
    accountService.deleteAccount.mockImplementation((userId: string) =>
      userId === 'user-2'
        ? Promise.reject(new Error('Bridge refused'))
        : Promise.resolve(),
    );

    const summary = await service.purgeExpiredAccounts();

    expect(accountService.deleteAccount).toHaveBeenCalledWith('user-3');
    expect(summary).toEqual({ claimed: 3, purged: 2, failed: 1 });
  });

  it('when the batch size is zero, then nothing is claimed at all', async () => {
    const summary = await service.purgeExpiredAccounts({ batchSize: 0 });

    expect(accounts.claimStalledDeletions).not.toHaveBeenCalled();
    expect(accounts.claimExpiredSuspended).not.toHaveBeenCalled();
    expect(summary).toEqual({ claimed: 0, purged: 0, failed: 0 });
  });
});
