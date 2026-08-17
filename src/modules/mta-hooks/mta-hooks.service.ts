import { Injectable, Logger } from '@nestjs/common';
import { AccountService } from '../account/account.service.js';
import { BridgeClient } from '../infrastructure/bridge/bridge.service.js';
import type {
  MtaHookAddress,
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

const LOG_TAG = '[mta-rcpt]';

@Injectable()
export class MtaHooksService {
  private readonly logger = new Logger(MtaHooksService.name);

  constructor(
    private readonly accountService: AccountService,
    private readonly bridgeClient: BridgeClient,
  ) {}

  async handleRcpt(request: MtaHookRequest): Promise<MtaHookResponse> {
    const recipients = request.envelope?.to ?? [];
    const recipient = recipients.at(-1);

    this.logger.log(
      `${LOG_TAG} received stage='${request.context?.stage ?? 'unknown'}' ` +
        `from='${request.envelope?.from?.address ?? 'none'}' ` +
        `recipients=[${recipients.map((r) => r.address).join(', ')}] ` +
        `evaluating='${recipient?.address ?? 'none'}' ` +
        `mailFromParams=${this.describeParameters(request.envelope?.from)} ` +
        `rcptParams=${this.describeParameters(recipient)}`,
    );

    if (!recipient) {
      this.logger.warn(
        `${LOG_TAG} decision=accept reason=no-recipient rawRequest=${JSON.stringify(request)}`,
      );
      return ACCEPT;
    }

    const declaredSize = this.parseDeclaredSize(request.envelope);

    try {
      const overQuota = await this.isRecipientOverQuota(
        recipient.address,
        declaredSize,
      );
      const response = overQuota ? REJECT_OVER_QUOTA : ACCEPT;

      this.logger.log(
        `${LOG_TAG} decision=${response.action} recipient='${recipient.address}' ` +
          `response=${JSON.stringify(response)}`,
      );

      return response;
    } catch (error) {
      this.logger.error(
        `${LOG_TAG} decision=accept reason=fail-open recipient='${recipient.address}' ` +
          `declaredSize=${declaredSize} error=${
            error instanceof Error ? error.message : String(error)
          }`,
        error instanceof Error ? error.stack : undefined,
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
      this.logger.log(
        `${LOG_TAG} lookup miss: address='${address}' resolved to no local user, skipping quota check`,
      );
      return false;
    }

    this.logger.log(
      `${LOG_TAG} lookup hit: address='${address}' userUuid='${userUuid}', fetching usage from bridge`,
    );

    const { maxSpaceBytes, totalUsedSpaceBytes } =
      await this.bridgeClient.getUserUsage(userUuid);

    const projected = totalUsedSpaceBytes + incomingSize;
    const overQuota = projected > maxSpaceBytes;

    this.logger.log(
      `${LOG_TAG} quota check: address='${address}' userUuid='${userUuid}' ` +
        `used=${totalUsedSpaceBytes} declaredSize=${incomingSize} ` +
        `projected=${projected} max=${maxSpaceBytes} overQuota=${overQuota}`,
    );

    return overQuota;
  }

  private parseDeclaredSize(envelope?: MtaHookEnvelope): number {
    const raw = envelope?.from.parameters?.size;
    if (!raw) {
      this.logger.log(
        `${LOG_TAG} no SIZE parameter on MAIL FROM, assuming declaredSize=0 ` +
          `(available keys: ${this.describeParameterKeys(envelope?.from)})`,
      );
      return 0;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      this.logger.warn(
        `${LOG_TAG} unparseable SIZE parameter '${raw}', assuming declaredSize=0`,
      );
      return 0;
    }
    return parsed;
  }

  private describeParameters(address?: MtaHookAddress | null): string {
    if (!address?.parameters) {
      return 'none';
    }
    return JSON.stringify(address.parameters);
  }

  private describeParameterKeys(address?: MtaHookAddress | null): string {
    if (!address?.parameters) {
      return 'none';
    }
    return Object.keys(address.parameters).join(', ') || 'none';
  }
}
