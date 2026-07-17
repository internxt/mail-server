import { describe, test, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import {
  BridgeApiError,
  BridgeClient,
} from '../infrastructure/bridge/bridge.service.js';
import { MailBucketEntry } from './domain/mail-bucket-entry.domain.js';
import {
  DuplicateEntryKeyError,
  MailBucketEntryRepository,
} from './repositories/mail-bucket-entry.repository.js';
import { MailUsageService } from './mail-usage.service.js';

function entry(overrides: Partial<MailBucketEntry> = {}): MailBucketEntry {
  return MailBucketEntry.build({
    id: 'row-1',
    mailAddressId: 'address-1',
    entryKey: '42:7',
    bridgeEntryId: 'entry-1',
    size: 240,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

const trackParams = {
  mailAddressId: 'address-1',
  userUuid: 'user-1',
  bucketId: 'bucket-1',
  entryKey: '42:7',
  size: 240,
};

describe('MailUsageService', () => {
  let service: MailUsageService;
  let entries: DeepMocked<MailBucketEntryRepository>;
  let bridge: DeepMocked<BridgeClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MailUsageService],
    })
      .useMocker(() => createMock<object>())
      .compile();

    service = module.get(MailUsageService);
    entries = module.get(MailBucketEntryRepository);
    bridge = module.get(BridgeClient);
  });

  describe('trackStoredMessage', () => {
    test('when the entry is new, then mints a bridge entry and persists the pointer', async () => {
      entries.findByEntryKey.mockResolvedValue(null);
      bridge.createBucketEntry.mockResolvedValue({
        id: 'entry-1',
        maxSpaceBytes: 1000,
        totalUsedSpaceBytes: 240,
      });

      await service.trackStoredMessage(trackParams);

      expect(bridge.createBucketEntry).toHaveBeenCalledWith(
        'user-1',
        'bucket-1',
        240,
      );
      expect(entries.create).toHaveBeenCalledWith({
        mailAddressId: 'address-1',
        entryKey: '42:7',
        bridgeEntryId: 'entry-1',
        size: 240,
      });
    });

    test('when the entry is already tracked, then mints nothing (idempotent)', async () => {
      entries.findByEntryKey.mockResolvedValue(entry());

      await service.trackStoredMessage(trackParams);

      expect(bridge.createBucketEntry).not.toHaveBeenCalled();
      expect(entries.create).not.toHaveBeenCalled();
    });

    test('when a concurrent delivery wins the race, then rolls back the minted bridge entry', async () => {
      entries.findByEntryKey.mockResolvedValue(null);
      bridge.createBucketEntry.mockResolvedValue({
        id: 'entry-1',
        maxSpaceBytes: 1000,
        totalUsedSpaceBytes: 240,
      });
      entries.create.mockRejectedValue(new DuplicateEntryKeyError('42:7'));

      await service.trackStoredMessage(trackParams);

      expect(bridge.deleteBucketEntry).toHaveBeenCalledWith(
        'user-1',
        'bucket-1',
        'entry-1',
      );
    });

    test('when persistence fails for another reason, then rolls back the minted bridge entry and propagates', async () => {
      entries.findByEntryKey.mockResolvedValue(null);
      bridge.createBucketEntry.mockResolvedValue({
        id: 'entry-1',
        maxSpaceBytes: 1000,
        totalUsedSpaceBytes: 240,
      });
      entries.create.mockRejectedValue(new Error('DB down'));

      await expect(service.trackStoredMessage(trackParams)).rejects.toThrow(
        'DB down',
      );
      expect(bridge.deleteBucketEntry).toHaveBeenCalledWith(
        'user-1',
        'bucket-1',
        'entry-1',
      );
    });

    test('when persistence fails and the rollback also fails, then the original error still propagates', async () => {
      entries.findByEntryKey.mockResolvedValue(null);
      bridge.createBucketEntry.mockResolvedValue({
        id: 'entry-1',
        maxSpaceBytes: 1000,
        totalUsedSpaceBytes: 240,
      });
      entries.create.mockRejectedValue(new Error('DB down'));
      bridge.deleteBucketEntry.mockRejectedValue(new Error('Bridge down'));

      await expect(service.trackStoredMessage(trackParams)).rejects.toThrow(
        'DB down',
      );
      expect(bridge.deleteBucketEntry).toHaveBeenCalledWith(
        'user-1',
        'bucket-1',
        'entry-1',
      );
    });
  });

  describe('releaseStoredMessage', () => {
    test('when the pointer exists, then deletes the bridge entry by id and drops the pointer', async () => {
      entries.findByEntryKey.mockResolvedValue(entry());

      await service.releaseStoredMessage({
        userUuid: 'user-1',
        bucketId: 'bucket-1',
        entryKey: '42:7',
      });

      expect(bridge.deleteBucketEntry).toHaveBeenCalledWith(
        'user-1',
        'bucket-1',
        'entry-1',
      );
      expect(entries.deleteByEntryKey).toHaveBeenCalledWith('42:7');
    });

    test('when no pointer exists, then is a no-op', async () => {
      entries.findByEntryKey.mockResolvedValue(null);

      await service.releaseStoredMessage({
        userUuid: 'user-1',
        bucketId: 'bucket-1',
        entryKey: '42:7',
      });

      expect(bridge.deleteBucketEntry).not.toHaveBeenCalled();
      expect(entries.deleteByEntryKey).not.toHaveBeenCalled();
    });

    test('when the bridge delete fails, then the pointer is kept for retry', async () => {
      entries.findByEntryKey.mockResolvedValue(entry());
      bridge.deleteBucketEntry.mockRejectedValue(new Error('Bridge down'));

      await expect(
        service.releaseStoredMessage({
          userUuid: 'user-1',
          bucketId: 'bucket-1',
          entryKey: '42:7',
        }),
      ).rejects.toThrow('Bridge down');
      expect(entries.deleteByEntryKey).not.toHaveBeenCalled();
    });

    test('when the bridge entry is already gone (404), then the pointer is still dropped', async () => {
      entries.findByEntryKey.mockResolvedValue(entry());
      bridge.deleteBucketEntry.mockRejectedValue(
        new BridgeApiError('not found', 404, 'entry missing'),
      );

      await service.releaseStoredMessage({
        userUuid: 'user-1',
        bucketId: 'bucket-1',
        entryKey: '42:7',
      });

      expect(entries.deleteByEntryKey).toHaveBeenCalledWith('42:7');
    });
  });
});
