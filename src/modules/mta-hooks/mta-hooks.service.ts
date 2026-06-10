import { Injectable, Logger } from '@nestjs/common';
import { AccountService } from '../account/account.service.js';
import { EmailService } from '../email/email.service.js';
import { BridgeClient } from '../infrastructure/bridge/bridge.service.js';
import type {
  MtaHookEnvelope,
  MtaHookRequest,
  MtaHookResponse,
} from './mta-hooks.types.js';

const ACCEPT: MtaHookResponse = { action: 'accept' };

const REJECT_OVER_QUOTA: MtaHookResponse = {
  action: 'reject',
  response: {
    status: 452,
    enhancedStatus: '4.2.2',
    message: 'Recipient mailbox is over quota',
  },
};

@Injectable()
export class MtaHooksService {
  private readonly logger = new Logger(MtaHooksService.name);

  constructor(
    private readonly accountService: AccountService,
    private readonly emailService: EmailService,
    private readonly bridgeClient: BridgeClient,
  ) {}

  async handleRcpt(request: MtaHookRequest): Promise<MtaHookResponse> {
    const recipients = request.envelope?.to ?? [];
    const recipient = recipients.at(-1);
    if (!recipient) {
      return ACCEPT;
    }

    const declaredSize = this.parseDeclaredSize(request.envelope);

    try {
      const overQuota = await this.isRecipientOverQuota(
        recipient.address,
        declaredSize,
      );
      return overQuota ? REJECT_OVER_QUOTA : ACCEPT;
    } catch (error) {
      this.logger.error(
        `MTA hook quota check failed, accepting recipient (fail-open): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return ACCEPT;
    }
  }

  private async isRecipientOverQuota(
    rawAddress: string,
    incomingSize: number,
  ): Promise<boolean> {
    const address = rawAddress.toLowerCase();
    const context = await this.accountService.findRecipientContext(address);
    if (!context) {
      return false;
    }
    const { userUuid, networkBucketId } = context;

    const { used: mailUsed } = await this.emailService.getQuota(address);

    const { maxSpaceBytes, totalUsedSpaceBytes } =
      await this.bridgeClient.reportBucketUsage(
        userUuid,
        networkBucketId,
        mailUsed,
      );

    const projectedUsage = totalUsedSpaceBytes + incomingSize;
    if (projectedUsage > maxSpaceBytes) {
      return true;
    }

    return false;
  }

  private parseDeclaredSize(envelope?: MtaHookEnvelope): number {
    const raw = envelope?.from.parameters?.size;
    if (!raw) {
      return 0;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
}
