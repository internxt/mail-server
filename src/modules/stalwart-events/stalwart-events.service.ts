import { Injectable, Logger } from '@nestjs/common';
import type {
  StalwartEvent,
  StalwartWebhookPayload,
} from './stalwart-events.types.js';

@Injectable()
export class StalwartEventsService {
  private readonly logger = new Logger(StalwartEventsService.name);

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

    this.logger.log(
      { entryKey, size, type: event.type },
      'message-ingest event — Bridge entry creation pending Phase 1',
    );

    // TODO: resolve accountId -> userUuid via AccountRepository,
    // then call BridgeClient.createEntry(userUuid, bucketId, entryKey, size)
    // dummy await
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
