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
    const userUuid = await this.accountService.findUserIdByAddress(address);
    if (!userUuid) {
      return false;
    }

    const { used: mailUsed } = await this.emailService.getQuota(address);

    const { driveUsed, planQuota } = await this.bridgeClient.reportMailUsage(
      userUuid,
      mailUsed,
    );

    const projectedUsage = driveUsed + mailUsed + incomingSize;
    if (projectedUsage > planQuota) {
      this.logger.warn(
        `Rejecting recipient '${address}' (user '${userUuid}'): ` +
          `projected ${projectedUsage} > quota ${planQuota}`,
      );
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
