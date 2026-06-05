import { Injectable, Logger } from '@nestjs/common';
import { AccountService } from '../account/account.service.js';
import { EmailService } from '../email/email.service.js';
import { BridgeClient } from '../infrastructure/bridge/bridge.service.js';
import type { MtaHookRequest, MtaHookResponse } from './mta-hooks.types.js';

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

  async handleData(request: MtaHookRequest): Promise<MtaHookResponse> {
    const recipients = request.envelope?.to ?? [];
    if (recipients.length === 0) {
      return ACCEPT;
    }

    const messageSize = request.message?.size ?? 0;
    this.logger.log({ messageSize }, 'Message size');

    try {
      for (const recipient of recipients) {
        const overQuota = await this.isRecipientOverQuota(
          recipient.address,
          messageSize,
        );
        if (overQuota) {
          return REJECT_OVER_QUOTA;
        }
      }
      this.logger.log('Message accepted');
      return ACCEPT;
    } catch (error) {
      this.logger.error(
        `MTA hook quota check failed, accepting message (fail-open): ${
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

    this.logger.log({ driveUsed, mailUsed, incomingSize }, 'Reported usage');

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
}
