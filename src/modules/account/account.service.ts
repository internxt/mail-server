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

  async getAccount(driveUserUuid: string): Promise<MailAccount> {
    return this.getAccountOrFail(driveUserUuid);
  }

  async deleteAccount(driveUserUuid: string): Promise<void> {
    const account = await this.getAccountOrFail(driveUserUuid);

    if (account.providerAccountId) {
      await this.provider.deleteAccount(account.providerAccountId);
    }

    await this.accounts.delete(account.id);
    this.logger.log(`Deleted account for drive user '${driveUserUuid}'`);
  }

  async addAddress(
    driveUserUuid: string,
    address: string,
    domainName: string,
  ): Promise<void> {
    const [account, domain, existing] = await Promise.all([
      this.accounts.findByDriveUserUuid(driveUserUuid),
      this.domains.findByDomain(domainName),
      this.addresses.findByAddress(address),
    ]);

    if (!account) {
      throw new NotFoundException(
        `No mail account for drive user '${driveUserUuid}'`,
      );
    }
    const providerAccountId = this.requireProviderAccountId(account);

    if (!domain) {
      throw new NotFoundException(`Domain '${domainName}' not found`);
    }
    if (existing) {
      throw new ConflictException(`Address '${address}' already exists`);
    }

    const newAddress = await this.addresses.create({
      mailAccountId: account.id,
      address,
      domainId: domain.id,
      isDefault: false,
    });

    try {
      await this.provider.addAddress(providerAccountId, address);
    } catch (error) {
      await this.addresses.delete(newAddress.id);
      throw error;
    }

    await this.addresses.createProviderLink({
      mailAddressId: newAddress.id,
      provider: 'stalwart',
      externalId: providerAccountId,
    });

    this.logger.log(`Added address '${address}' to account '${driveUserUuid}'`);
  }

  async removeAddress(driveUserUuid: string, address: string): Promise<void> {
    const account = await this.getAccountOrFail(driveUserUuid);

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

    const providerAccountId = this.requireProviderAccountId(account);

    await this.provider.removeAddress(providerAccountId, address);
    await Promise.all([
      this.addresses.deleteProviderLink(addressRecord.id),
      this.addresses.delete(addressRecord.id),
    ]);

    this.logger.log(
      `Removed address '${address}' from account '${driveUserUuid}'`,
    );
  }

  async setPrimaryAddress(
    driveUserUuid: string,
    newAddress: string,
  ): Promise<void> {
    const account = await this.getAccountOrFail(driveUserUuid);

    const addressRecord = account.addresses.find(
      (a) => a.address === newAddress,
    );
    if (!addressRecord) {
      throw new NotFoundException(
        `Address '${newAddress}' not found for this account`,
      );
    }

    if (addressRecord.isDefault) return;

    const providerAccountId = this.requireProviderAccountId(account);

    await this.provider.setPrimaryAddress(providerAccountId, newAddress);

    await Promise.all([
      this.addresses.setDefault(addressRecord.id, account.id),
      this.addresses.updateAllProviderExternalIds(account.id, newAddress),
    ]);

    this.logger.log(
      `Set primary address to '${newAddress}' for account '${driveUserUuid}'`,
    );
  }

  private async getAccountOrFail(driveUserUuid: string): Promise<MailAccount> {
    const account = await this.accounts.findByDriveUserUuid(driveUserUuid);
    if (!account) {
      throw new NotFoundException(
        `No mail account for drive user '${driveUserUuid}'`,
      );
    }
    return account;
  }

  private requireProviderAccountId(account: MailAccount): string {
    const id = account.providerAccountId;
    if (!id) {
      throw new UnprocessableEntityException(
        'Account has no primary address with a provider link',
      );
    }
    return id;
  }
}
