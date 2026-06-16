import { Injectable, Logger } from '@nestjs/common';
import { AccountService } from '../account/account.service.js';
import { BridgeClient } from '../infrastructure/bridge/bridge.service.js';
import type {
  StalwartEvent,
  StalwartWebhookPayload,
} from './stalwart-events.types.js';

@Injectable()
export class StalwartEventsService {
  private readonly logger = new Logger(StalwartEventsService.name);

  constructor(
    private readonly accounts: AccountService,
    private readonly bridge: BridgeClient,
  ) {}

  async handleBatch(payload: StalwartWebhookPayload): Promise<void> {
    for (const event of payload.events) {
      if (event.type === 'message-ingest.duplicate') {
        continue;
      }

      if (!event.type.startsWith('message-ingest.')) {
        this.logger.debug(
          { type: event.type },
          'skipping unhandled event type',
        );
        continue;
      }

      await this.handleIngestEvent(event);
    }
  }

  private async handleIngestEvent(event: StalwartEvent): Promise<void> {
    const { accountId, documentId, size } = event.data;
    const entryKey = `${accountId}:${documentId}`;

    const context = await this.accounts.findBucketContextByProviderInternalId(
      String(accountId),
    );

    if (!context) {
      this.logger.warn(
        { accountId, entryKey, type: event.type },
        'No mail account found for ingest event; skipping bucket entry',
      );
      return;
    }

    if (!context.networkBucketId) {
      this.logger.warn(
        { accountId, entryKey, userUuid: context.userUuid },
        'Mail address has no network bucket; skipping bucket entry',
      );
      return;
    }

    const { totalUsedSpaceBytes } = await this.bridge.createBucketEntry(
      context.userUuid,
      context.networkBucketId,
      entryKey,
      size,
    );

    this.logger.log(
      { entryKey, size, totalUsedSpaceBytes, type: event.type },
      'Created bucket entry for ingested message',
    );
  }
}
