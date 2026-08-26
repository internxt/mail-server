import { Injectable, Logger } from '@nestjs/common';
import { AccountService } from '../account/account.service.js';
import { MailUsageService } from '../usage/mail-usage.service.js';
import type {
  StalwartEvent,
  StalwartIngestEventType,
  StalwartWebhookPayload,
} from './stalwart-events.types.js';

const CRLF_BYTES = 2;

/**
 * The webhook reports the size of the message as it arrived, but on the SMTP
 * delivery path the provider prepends two headers before storing it, and it is
 * the stored size that the mailbox reports back and that we must bill.
 *
 * Those headers are fixed in shape: the address the message was delivered to,
 * and the spam verdict already carried by the event type. Both are derivable
 * from what we hold here, so no extra round trip is needed to bill the message
 * at the size it actually occupies.
 *
 * The other ingest paths (client-side appends, i.e. drafts and sent copies)
 * store the message untouched, so their reported size is already exact.
 */
function deliveryHeaderBytes(
  type: StalwartIngestEventType,
  deliveredTo: string,
): number {
  if (type !== 'message-ingest.ham' && type !== 'message-ingest.spam') return 0;

  const verdict = type === 'message-ingest.spam' ? 'Yes' : 'No';

  return (
    `Delivered-To: ${deliveredTo}`.length +
    CRLF_BYTES +
    `X-Spam-Status: ${verdict}`.length +
    CRLF_BYTES
  );
}

@Injectable()
export class StalwartEventsService {
  private readonly logger = new Logger(StalwartEventsService.name);

  constructor(
    private readonly accounts: AccountService,
    private readonly usage: MailUsageService,
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

    await this.usage.trackStoredMessage({
      mailAddressId: context.mailAddressId,
      userUuid: context.userUuid,
      bucketId: context.networkBucketId,
      entryKey,
      size: size + deliveryHeaderBytes(event.type, context.address),
    });
  }
}
