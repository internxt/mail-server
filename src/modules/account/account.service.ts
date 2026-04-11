import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AccountProvider } from './account-provider.port.js';
import { MailAccount } from './domain/mail-account.domain.js';
import { MailDomain } from './domain/mail-domain.domain.js';
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

  async listActiveDomains(): Promise<MailDomain[]> {
    return this.domains.findAllActive();
  }

  async findAccount(userId: string): Promise<MailAccount | null> {
    return this.accounts.findByUserId(userId);
  }

  async provisionAccount(params: {
    userId: string;
    address: string;
    domain: string;
    displayName: string;
  }): Promise<MailAccount> {
    const [domainRecord, existingAddress, existingAccount] = await Promise.all([
      this.domains.findByDomain(params.domain),
      this.addresses.findByAddress(params.address),
      this.accounts.findByUserId(params.userId),
    ]);

    if (!domainRecord) {
      throw new NotFoundException(`Domain '${params.domain}' not found`);
    }
    if (existingAccount) {
      throw new ConflictException('User already has a mail account');
    }
    if (existingAddress) {
      throw new ConflictException(
        `Address '${params.address}' is already in use`,
      );
    }

    let account: MailAccount;
    try {
      account = await this.accounts.create({
        userId: params.userId,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'SequelizeUniqueConstraintError'
      ) {
        this.logger.warn(
          `Concurrent provisioning for '${params.userId}', returning existing`,
        );
        return this.getAccountOrFail(params.userId);
      }
      throw error;
    }

    const address = await this.addresses.create({
      mailAccountId: account.id,
      address: params.address,
      domainId: domainRecord.id,
      isDefault: true,
    });

    await this.addresses.createProviderLink({
      mailAddressId: address,
      provider: 'stalwart',
      externalId: params.address,
    });

    const password = randomBytes(32).toString('base64url');

    try {
      await this.provider.createAccount({
        accountId: account.id,
        primaryAddress: params.address,
        displayName: params.displayName,
        password,
      });
    } catch (error) {
      await this.accounts.delete(account.id);
      throw error;
    }

    return this.getAccountOrFail(params.userId);
  }

  async deleteAccount(driveUserUuid: string): Promise<void> {
    const account = await this.getAccountOrFail(driveUserUuid);

    await Promise.all(
      account.addresses.map(async (a) => {
        await this.provider.deleteAccount(a.providerExternalId);
        await this.addresses.deleteProviderLink(a.id);
      }),
    );

    await this.accounts.delete(account.id);
    this.logger.log(`Deleted account for user '${driveUserUuid}'`);
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

  async checkUsernameAvailability(
    username: string,
    domain: string,
  ): Promise<{ available: boolean; suggestion: string | null }> {
    const activeMailDomains = await this.domains.findAllActive();
    const activeDomains = activeMailDomains.map((m) => m.domain);
    const isDomainAvailable = activeDomains.includes(domain);

    const requestedAddress = `${username}@${domain}`;
    const possibleAddresses: string[] = [];

    if (isDomainAvailable) {
      possibleAddresses.push(requestedAddress);
    }

    possibleAddresses.push(
      ...activeDomains
        .filter((d) => d !== domain)
        .map((d) => `${username}@${d}`),
    );

    if (isDomainAvailable) {
      possibleAddresses.push(
        ...Array.from(
          { length: 20 },
          (_, i) => `${username}${i + 1}@${domain}`,
        ),
      );
    }

    const taken = await this.addresses.findByAddresses(possibleAddresses);
    const suggestion = possibleAddresses.find((a) => !taken.has(a));

    if (suggestion === requestedAddress) {
      return { available: true, suggestion: null };
    } else if (suggestion) {
      return { available: false, suggestion };
    } else {
      return { available: false, suggestion: null };
    }
  }

  private async getAccountOrFail(userId: string): Promise<MailAccount> {
    const account = await this.accounts.findByUserId(userId);
    if (!account) {
      throw new NotFoundException(`No mail account for user '${userId}'`);
    }
    return account;
  }
}
