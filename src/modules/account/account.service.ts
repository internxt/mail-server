import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AccountProvider } from './account-provider.port.js';
import { MailAccount } from './domain/mail-account.domain.js';
import { AccountRepository } from './repositories/account.repository.js';
import { AddressRepository } from './repositories/address.repository.js';
import { DomainRepository } from './repositories/domain.repository.js';

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly provider: AccountProvider,
    private readonly accounts: AccountRepository,
    private readonly addresses: AddressRepository,
    private readonly domains: DomainRepository,
  ) {}

  async getAccount(userId: string): Promise<MailAccount> {
    return this.getAccountOrFail(userId);
  }

  async deleteAccount(userId: string): Promise<void> {
    const account = await this.getAccountOrFail(userId);

    await Promise.all(
      account.addresses.map(async (a) => {
        await this.provider.deleteAccount(a.providerExternalId);
        await this.addresses.deleteProviderLink(a.id);
      }),
    );

    await this.accounts.delete(account.id);
    this.logger.log(`Deleted account for user '${userId}'`);
  }

  async addAddress(
    userId: string,
    address: string,
    domainName: string,
    password: string,
    displayName?: string,
  ): Promise<void> {
    const [account, domain, existing] = await Promise.all([
      this.accounts.findByUserId(userId),
      this.domains.findByDomain(domainName),
      this.addresses.findByAddress(address),
    ]);

    if (!account) {
      throw new NotFoundException(`No mail account for user '${userId}'`);
    }
    if (!domain) {
      throw new NotFoundException(`Domain '${domainName}' not found`);
    }
    if (existing) {
      throw new ConflictException(`Address '${address}' already exists`);
    }

    const newAddressId = await this.addresses.create({
      mailAccountId: account.id,
      address,
      domainId: domain.id,
      isDefault: false,
    });

    try {
      await this.provider.createAccount({
        accountId: newAddressId,
        primaryAddress: address,
        displayName: displayName ?? '',
        password,
      });
    } catch (error) {
      await this.addresses.delete(newAddressId);
      throw error;
    }

    await this.addresses.createProviderLink({
      mailAddressId: newAddressId,
      provider: 'stalwart',
      externalId: address,
    });

    this.logger.log(`Added address '${address}' to account '${userId}'`);
  }

  async removeAddress(userId: string, address: string): Promise<void> {
    const account = await this.getAccountOrFail(userId);

    const addressRecord = account.addresses.find((a) => a.address === address);
    if (!addressRecord) {
      throw new NotFoundException(
        `Address '${address}' not found for this account`,
      );
    }

    if (addressRecord.isDefault) {
      throw new UnprocessableEntityException(
        'Cannot remove the default address',
      );
    }

    await this.provider.deleteAccount(addressRecord.providerExternalId);
    await Promise.all([
      this.addresses.deleteProviderLink(addressRecord.id),
      this.addresses.delete(addressRecord.id),
    ]);

    this.logger.log(`Removed address '${address}' from account '${userId}'`);
  }

  async setPrimaryAddress(userId: string, newAddress: string): Promise<void> {
    const account = await this.getAccountOrFail(userId);

    const addressRecord = account.addresses.find(
      (a) => a.address === newAddress,
    );
    if (!addressRecord) {
      throw new NotFoundException(
        `Address '${newAddress}' not found for this account`,
      );
    }

    if (addressRecord.isDefault) return;

    await this.addresses.setDefault(addressRecord.id, account.id);

    this.logger.log(
      `Set primary address to '${newAddress}' for account '${userId}'`,
    );
  }

  private async getAccountOrFail(userId: string): Promise<MailAccount> {
    const account = await this.accounts.findByUserId(userId);
    if (!account) {
      throw new NotFoundException(`No mail account for user '${userId}'`);
    }
    return account;
  }
}
