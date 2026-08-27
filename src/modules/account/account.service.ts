import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import dayjs from 'dayjs';
import {
  BridgeClient,
  isBridgeNotFound,
} from '../infrastructure/bridge/bridge.service.js';
import { PaymentsService } from '../infrastructure/payments/payments.service.js';
import { MailNotSetupException } from '../provisioning/mail-not-setup.exception.js';
import { AccountProvider } from './account-provider.port.js';
import type { CreateAccountResult } from './account.types.js';
import { MailAccount, MailAccountState } from './domain/mail-account.domain.js';
import { MailAddress } from './domain/mail-address.domain.js';
import { MailDomain } from './domain/mail-domain.domain.js';
import { AccountRepository } from './repositories/account.repository.js';
import {
  AddressRepository,
  type ProviderAccountBucketContext,
} from './repositories/address.repository.js';
import { DeletedAddressRepository } from './repositories/deleted-address.repository.js';
import { DomainRepository } from './repositories/domain.repository.js';
import { MailAddressKeysRepository } from './repositories/mail-address-keys.repository.js';

export interface MailAddressKeyBundle {
  publicKey: string;
  encryptionPrivateKey: string;
  recoveryPrivateKey: string;
}

export interface MailAccountStatus {
  id: string;
  defaultAddress: string | null;
  status: MailAccountState;
  suspendedAt: Date | null;
  deletionAt: Date | null;
}

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly provider: AccountProvider,
    private readonly accounts: AccountRepository,
    private readonly addresses: AddressRepository,
    private readonly deletedAddresses: DeletedAddressRepository,
    private readonly domains: DomainRepository,
    private readonly keys: MailAddressKeysRepository,
    private readonly bridge: BridgeClient,
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  async getAccount(userId: string): Promise<MailAccount> {
    return this.getAccountOrFail(userId);
  }

  async getAccountStatus(userId: string): Promise<MailAccountStatus> {
    const account = await this.getAccountOrFail(userId);

    return {
      id: account.id,
      defaultAddress: account.defaultAddress?.address ?? null,
      status: account.status,
      suspendedAt: account.suspendedAt,
      deletionAt: this.computeDeletionAt(account.suspendedAt),
    };
  }

  private computeDeletionAt(suspendedAt: Date | null): Date | null {
    if (!suspendedAt) return null;
    const days = this.config.get<number>('accounts.suspendedRetentionDays')!;
    return dayjs(suspendedAt).add(days, 'day').toDate();
  }

  async listActiveDomains(): Promise<MailDomain[]> {
    return this.domains.findAllActive();
  }

  async lookupPublicKeysForAddresses(
    addresses: string[],
  ): Promise<Array<{ address: string; publicKey: string | null }>> {
    const activeDomains = await this.domains.findAllActive();
    const domainSet = new Set(activeDomains.map((d) => d.domain));

    const internxtAddresses = addresses.filter((a) => {
      const domain = a.split('@')[1];
      return domain && domainSet.has(domain);
    });

    if (internxtAddresses.length === 0) {
      return addresses.map((address) => ({ address, publicKey: null }));
    }

    const addressIdMap =
      await this.addresses.findAddressIdsByAddresses(internxtAddresses);
    const keyMap = await this.keys.findPublicKeysByAddressIds([
      ...addressIdMap.values(),
    ]);

    return addresses.map((address) => {
      const addressId = addressIdMap.get(address);
      return {
        address,
        publicKey: addressId ? (keyMap.get(addressId) ?? null) : null,
      };
    });
  }

  async findAccount(userId: string): Promise<MailAccount | null> {
    return this.accounts.findByUserId(userId);
  }

  async findUserIdByAddress(address: string): Promise<string | null> {
    return this.addresses.findUserIdByAddress(address);
  }

  async findBucketContextByProviderInternalId(
    providerInternalId: string,
  ): Promise<ProviderAccountBucketContext | null> {
    return this.addresses.findBucketContextByProviderInternalId(
      providerInternalId,
    );
  }

  async findBucketContextByAddress(
    address: string,
  ): Promise<ProviderAccountBucketContext | null> {
    return this.addresses.findBucketContextByAddress(address);
  }

  async getAddressKeys(
    userId: string,
    address: string,
  ): Promise<MailAddressKeyBundle & { address: string }> {
    const account = await this.accounts.findByUserId(userId);
    if (!account || account.addresses.length === 0) {
      throw new MailNotSetupException();
    }

    const addressRecord = account.addresses.find((a) => a.address === address);
    if (!addressRecord) {
      throw new NotFoundException(
        `Address '${address}' not found for this account`,
      );
    }

    const keys = await this.keys.findByAddressId(addressRecord.id);
    if (!keys) {
      throw new NotFoundException(
        `No encryption keys for address '${address}'`,
      );
    }

    return {
      address: addressRecord.address,
      publicKey: keys.publicKey,
      encryptionPrivateKey: keys.encryptionPrivateKey,
      recoveryPrivateKey: keys.recoveryPrivateKey,
    };
  }

  async provisionAccount(params: {
    userId: string;
    address: string;
    domain: string;
    displayName: string;
    keys: MailAddressKeyBundle;
  }): Promise<MailAccount> {
    const [
      tier,
      usage,
      domainRecord,
      existingAddress,
      existingAccount,
      givenUp,
    ] = await Promise.all([
      this.payments.getUserTier(params.userId),
      this.bridge.getUserUsage(params.userId),
      this.domains.findByDomain(params.domain),
      this.addresses.findByAddress(params.address),
      this.accounts.findByUserId(params.userId),
      this.deletedAddresses.findClaimedByOthers(
        [params.address],
        params.userId,
      ),
    ]);

    if (!tier.featuresPerService.mail?.enabled) {
      throw new ForbiddenException(
        'Mail access is not available for your current plan',
      );
    }
    if (!domainRecord) {
      throw new NotFoundException(`Domain '${params.domain}' not found`);
    }
    if (existingAccount) {
      throw new ConflictException('User already has a mail account');
    }
    if (existingAddress || givenUp.has(params.address)) {
      throw new ConflictException(
        `Address '${params.address}' is already in use`,
      );
    }

    const quota = usage.maxSpaceBytes;
    if (!quota || quota <= 0) {
      throw new UnprocessableEntityException(
        `Cannot provision mail account for '${params.userId}': user has no storage allowance`,
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
        const existing = await this.accounts.findByUserId(params.userId);
        if (existing) {
          this.logger.warn(
            `Concurrent provisioning for '${params.userId}', returning existing`,
          );
          return existing;
        }
        throw new ConflictException(
          `Account for user '${params.userId}' already exists`,
        );
      }
      throw error;
    }

    const addressId = await this.addresses.create({
      mailAccountId: account.id,
      address: params.address,
      domainId: domainRecord.id,
      isDefault: true,
    });

    await this.keys.create({
      mailAddressId: addressId,
      ...params.keys,
    });

    const password = randomBytes(32).toString('base64url');

    let created: CreateAccountResult;
    try {
      created = await this.provider.createAccount({
        accountId: account.id,
        primaryAddress: params.address,
        displayName: params.displayName,
        password,
        quota,
      });
    } catch (error) {
      await this.rollbackAccount(account.id);
      throw error;
    }

    try {
      await this.addresses.createProviderLink({
        mailAddressId: addressId,
        provider: created.provider,
        externalId: created.externalId,
        providerInternalId: created.internalId,
      });
      await this.createNetworkBucket(params.userId, addressId);
    } catch (error) {
      await this.rollbackAccount(account.id, created.externalId);
      throw error;
    }

    return this.getAccountOrFail(params.userId);
  }

  async deleteAccount(driveUserUuid: string): Promise<void> {
    const account = await this.getAccountOrFail(driveUserUuid);

    await Promise.all(
      account.addresses.map((a) =>
        this.provider.deleteAccount(a.providerExternalId),
      ),
    );

    await Promise.all(
      account.addresses.map((a) =>
        this.releaseNetworkBucket(driveUserUuid, a.networkBucketId, a.id),
      ),
    );

    await this.deletedAddresses.record(
      account.addresses.map((a) => ({
        address: a.address,
        userId: driveUserUuid,
      })),
    );

    await this.accounts.delete(account.id, { force: true });

    this.logger.log(`Deleted account for user '${driveUserUuid}'`);
  }

  async addAddress(
    userId: string,
    address: string,
    domainName: string,
    password: string,
    displayName?: string,
  ): Promise<void> {
    const [usage, account, domain, existing, givenUp] = await Promise.all([
      this.bridge.getUserUsage(userId),
      this.accounts.findByUserId(userId),
      this.domains.findByDomain(domainName),
      this.addresses.findByAddress(address),
      this.deletedAddresses.findClaimedByOthers([address], userId),
    ]);

    if (!account) {
      throw new NotFoundException(`No mail account for user '${userId}'`);
    }
    if (!domain) {
      throw new NotFoundException(`Domain '${domainName}' not found`);
    }
    if (existing || givenUp.has(address)) {
      throw new ConflictException(`Address '${address}' already exists`);
    }

    const quota = usage.maxSpaceBytes;
    if (!quota || quota <= 0) {
      throw new UnprocessableEntityException(
        `Cannot add address for '${userId}': user has no storage allowance`,
      );
    }

    const newAddressId = await this.addresses.create({
      mailAccountId: account.id,
      address,
      domainId: domain.id,
      isDefault: false,
    });

    let created: CreateAccountResult;
    try {
      created = await this.provider.createAccount({
        accountId: newAddressId,
        primaryAddress: address,
        displayName: displayName ?? '',
        password,
        quota,
      });
    } catch (error) {
      await this.rollbackAddress(newAddressId);
      throw error;
    }

    try {
      await this.addresses.createProviderLink({
        mailAddressId: newAddressId,
        provider: created.provider,
        externalId: created.externalId,
        providerInternalId: created.internalId,
      });
      await this.createNetworkBucket(userId, newAddressId);
    } catch (error) {
      await this.rollbackAddress(newAddressId, created.externalId);
      throw error;
    }

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
    await this.deletedAddresses.record([{ address, userId }]);
    await Promise.all([
      this.addresses.deleteProviderLink(addressRecord.id),
      this.addresses.delete(addressRecord.id),
    ]);
    await this.deleteNetworkBucket(userId, addressRecord);

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

  async checkAddressAvailability(
    username: string,
    domain: string,
    userId: string,
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

    const [taken, givenUp] = await Promise.all([
      this.addresses.findByAddresses(possibleAddresses),
      this.deletedAddresses.findClaimedByOthers(possibleAddresses, userId),
    ]);
    const suggestion = possibleAddresses.find(
      (a) => !taken.has(a) && !givenUp.has(a),
    );

    if (suggestion === requestedAddress) {
      return { available: true, suggestion: null };
    } else if (suggestion) {
      return { available: false, suggestion };
    } else {
      return { available: false, suggestion: null };
    }
  }

  private async rollbackAccount(
    accountId: string,
    providerExternalId?: string,
  ): Promise<void> {
    if (providerExternalId) {
      await this.tryDeleteProviderAccount(providerExternalId);
    }
    await this.accounts.delete(accountId, { force: true });
  }

  private async rollbackAddress(
    addressId: string,
    providerExternalId?: string,
  ): Promise<void> {
    if (providerExternalId) {
      await this.tryDeleteProviderAccount(providerExternalId);
    }
    await this.addresses.delete(addressId, { force: true });
  }

  private async tryDeleteProviderAccount(
    providerExternalId: string,
  ): Promise<void> {
    try {
      await this.provider.deleteAccount(providerExternalId);
    } catch (error) {
      this.logger.warn(
        `Rollback: failed to delete provider account '${providerExternalId}': ${(error as Error).message}`,
      );
    }
  }

  private async createNetworkBucket(
    userUuid: string,
    addressId: string,
  ): Promise<void> {
    const bucket = await this.bridge.createMailBucket(userUuid, addressId);
    await this.addresses.setNetworkBucketId(addressId, bucket.id);
  }

  /**
   * Deletes a network bucket and the quota it holds.
   *
   * A 404 means the bucket, or the user behind it, is already gone — nothing
   * left to release, so that counts as done. Anything else is left to the
   * caller: giving up here would drop the rows carrying the bucket id and
   * strand the charge with no way to find it again.
   */
  private async releaseNetworkBucket(
    userUuid: string,
    networkBucketId: string | null,
    addressId: string,
  ): Promise<void> {
    if (!networkBucketId) return;

    try {
      const { totalUsedSpaceBytes } = await this.bridge.deleteMailBucket(
        userUuid,
        networkBucketId,
        addressId,
      );
      this.logger.log(
        `Deleted network bucket '${networkBucketId}' for '${userUuid}', user now at ${totalUsedSpaceBytes} bytes`,
      );
    } catch (error) {
      if (isBridgeNotFound(error)) {
        this.logger.log(
          `Network bucket '${networkBucketId}' for '${userUuid}' was already gone`,
        );
        return;
      }
      throw error;
    }
  }

  private async deleteNetworkBucket(
    userUuid: string,
    address: MailAddress,
  ): Promise<void> {
    try {
      await this.releaseNetworkBucket(
        userUuid,
        address.networkBucketId,
        address.id,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to delete network bucket '${address.networkBucketId}' for '${userUuid}': ${(error as Error).message}`,
      );
    }
  }

  /**
   * Once an account has been claimed for deletion its mailboxes are already
   * being torn down, so there is nothing coherent left to suspend or bring
   * back. The caller has to provision a new account instead.
   */
  private assertNotBeingDeleted(account: MailAccount): void {
    if (account.isBeingDeleted) {
      throw new ConflictException(
        `Account for user '${account.userId}' is being deleted`,
      );
    }
  }

  private async getAccountOrFail(userId: string): Promise<MailAccount> {
    const account = await this.accounts.findByUserId(userId);
    if (!account) {
      throw new NotFoundException(`No mail account for user '${userId}'`);
    }
    return account;
  }

  async suspendAccount(userId: string): Promise<void> {
    const account = await this.getAccountOrFail(userId);
    this.assertNotBeingDeleted(account);
    if (account.isSuspended) {
      this.logger.log(`Account for user '${userId}' is already suspended`);
      return;
    }

    await Promise.all(
      account.addresses.map((a) =>
        this.provider.suspendAccount(a.providerExternalId),
      ),
    );

    await this.accounts.suspend(account.id);
    this.logger.log(`Suspended account for user '${userId}'`);
    //TODO: add audit table to keep track of this event
  }

  async reactivateAccount(userId: string): Promise<void> {
    const account = await this.getAccountOrFail(userId);
    this.assertNotBeingDeleted(account);
    if (!account.isSuspended) {
      this.logger.log(`Account for user '${userId}' is already active`);
      return;
    }

    await Promise.all(
      account.addresses.map((a) =>
        this.provider.reactivateAccount(a.providerExternalId),
      ),
    );

    await this.accounts.reactivate(account.id);
    this.logger.log(`Reactivated account for user '${userId}'`);
  }
}
