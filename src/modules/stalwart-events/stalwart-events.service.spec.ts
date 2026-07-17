import { describe, it, test, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { AccountService } from '../account/account.service.js';
import { MailUsageService } from '../usage/mail-usage.service.js';
import { StalwartEventsService } from './stalwart-events.service.js';
import type {
  StalwartEvent,
  StalwartIngestEventType,
} from './stalwart-events.types.js';

function ingestEvent(
  overrides: Partial<StalwartEvent['data']> = {},
  type: StalwartIngestEventType = 'message-ingest.jmap-append',
): StalwartEvent {
  return {
    id: 'evt-1',
    createdAt: '2026-06-15T00:00:00.000Z',
    type,
    data: {
      accountId: 42,
      documentId: 7,
      mailboxId: [1],
      blobId: 'blob-1',
      size: 240,
      messageId: 'msg-1',
      from: 'sender@example.com',
      to: ['alice@internxt.com'],
      ...overrides,
    },
  };
}

describe('StalwartEventsService', () => {
  let service: StalwartEventsService;
  let accounts: DeepMocked<AccountService>;
  let usage: DeepMocked<MailUsageService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StalwartEventsService],
    })
      .useMocker(() => createMock<object>())
      .compile();

    service = module.get(StalwartEventsService);
    accounts = module.get(AccountService);
    usage = module.get(MailUsageService);
  });

  describe('handleBatch', () => {
    test('when an ingest event resolves to a bucket, then tracks the stored message keyed by accountId:documentId', async () => {
      accounts.findBucketContextByProviderInternalId.mockResolvedValue({
        mailAddressId: 'address-1',
        userUuid: 'user-1',
        networkBucketId: 'bucket-1',
      });

      await service.handleBatch({ events: [ingestEvent()] });

      expect(
        accounts.findBucketContextByProviderInternalId,
      ).toHaveBeenCalledWith('42');
      expect(usage.trackStoredMessage).toHaveBeenCalledWith({
        mailAddressId: 'address-1',
        userUuid: 'user-1',
        bucketId: 'bucket-1',
        entryKey: '42:7',
        size: 240,
      });
    });

    it('when the event type is a duplicate, then it is skipped', async () => {
      await service.handleBatch({
        events: [ingestEvent({}, 'message-ingest.duplicate')],
      });

      expect(
        accounts.findBucketContextByProviderInternalId,
      ).not.toHaveBeenCalled();
      expect(usage.trackStoredMessage).not.toHaveBeenCalled();
    });

    it('when the event type is not a message-ingest, then it is skipped', async () => {
      const event = {
        ...ingestEvent(),
        type: 'delivery.completed' as unknown as StalwartEvent['type'],
      };

      await service.handleBatch({ events: [event] });

      expect(
        accounts.findBucketContextByProviderInternalId,
      ).not.toHaveBeenCalled();
      expect(usage.trackStoredMessage).not.toHaveBeenCalled();
    });

    test('when no account resolves for the event, then no message is tracked', async () => {
      accounts.findBucketContextByProviderInternalId.mockResolvedValue(null);

      await service.handleBatch({ events: [ingestEvent()] });

      expect(usage.trackStoredMessage).not.toHaveBeenCalled();
    });

    test('when the resolved address has no network bucket, then no message is tracked', async () => {
      accounts.findBucketContextByProviderInternalId.mockResolvedValue({
        mailAddressId: 'address-1',
        userUuid: 'user-1',
        networkBucketId: null,
      });

      await service.handleBatch({ events: [ingestEvent()] });

      expect(usage.trackStoredMessage).not.toHaveBeenCalled();
    });

    test('when the batch has several events, then each ingest event is tracked', async () => {
      accounts.findBucketContextByProviderInternalId.mockResolvedValue({
        mailAddressId: 'address-1',
        userUuid: 'user-1',
        networkBucketId: 'bucket-1',
      });

      await service.handleBatch({
        events: [
          ingestEvent({ documentId: 7 }),
          ingestEvent({ documentId: 8 }, 'message-ingest.spam'),
        ],
      });

      expect(usage.trackStoredMessage).toHaveBeenCalledTimes(2);
      expect(usage.trackStoredMessage).toHaveBeenCalledWith(
        expect.objectContaining({ entryKey: '42:7' }),
      );
      expect(usage.trackStoredMessage).toHaveBeenCalledWith(
        expect.objectContaining({ entryKey: '42:8' }),
      );
    });
  });
});
