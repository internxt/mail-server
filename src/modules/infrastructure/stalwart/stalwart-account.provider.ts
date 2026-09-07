import { Injectable, Logger } from '@nestjs/common';
import { AccountProvider } from '../../account/account-provider.port.js';
import type {
  AccountInfo,
  CreateAccountParams,
  CreateAccountResult,
} from '../../account/account.types.js';
import { decodeStalwartId } from './stalwart-id.codec.js';
import {
  StalwartApiError,
  StalwartService,
  splitEmail,
} from './stalwart.service.js';

@Injectable()
export class StalwartAccountProvider extends AccountProvider {
  private readonly logger = new Logger(StalwartAccountProvider.name);

  constructor(private readonly stalwart: StalwartService) {
    super();
  }

  async createAccount(
    params: CreateAccountParams,
  ): Promise<CreateAccountResult> {
    const { local, domain } = splitEmail(params.primaryAddress);
    const domainId = await this.stalwart.resolveDomainId(domain);
    if (!domainId) {
      throw new StalwartApiError(
        `Cannot create account: domain '${domain}' is not configured in Stalwart`,
        { domain },
      );
    }

    const id = await this.stalwart.createAccount({
      name: local,
      domainId,
      description: params.displayName,
      password: params.password,
      quotaBytes: params.quota ?? 0,
    });
    const internalId = decodeStalwartId(id);

    this.logger.log(
      `Created account '${params.primaryAddress}' (stalwart id ${internalId})`,
    );
    return {
      provider: 'stalwart',
      externalId: params.primaryAddress,
      internalId: String(internalId),
    };
  }

  async deleteAccount(email: string): Promise<void> {
    const deleted = await this.stalwart.deleteAccountByEmail(email);

    this.logger.log(
      deleted
        ? `Deleted account '${email}'`
        : `Account '${email}' was already gone`,
    );
  }

  async suspendAccount(email: string): Promise<void> {
    await this.stalwart.suspendAccountByEmail(email);
    this.logger.log(`Suspended account '${email}'`);
  }

  async reactivateAccount(email: string): Promise<void> {
    await this.stalwart.reactivateAccountByEmail(email);
    this.logger.log(`Reactivated account '${email}'`);
  }

  async getAccount(email: string): Promise<AccountInfo | null> {
    const account = await this.stalwart.getAccountByEmail(email);
    if (!account) return null;

    return {
      name: account.emailAddress,
      displayName: account.description ?? '',
      emails: [account.emailAddress],
      quota: account.quotas?.maxDiskQuota ?? 0,
    };
  }
}
