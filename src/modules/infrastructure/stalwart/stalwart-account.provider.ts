import { Injectable, Logger } from '@nestjs/common';
import { AccountProvider } from '../../account/account-provider.port.js';
import type {
  AccountInfo,
  CreateAccountParams,
} from '../../account/account.types.js';
import { StalwartService } from './stalwart.service.js';

@Injectable()
export class StalwartAccountProvider extends AccountProvider {
  private readonly logger = new Logger(StalwartAccountProvider.name);

  constructor(private readonly stalwart: StalwartService) {
    super();
  }

  async createAccount(params: CreateAccountParams): Promise<void> {
    await this.stalwart.createPrincipal({
      type: 'individual',
      name: params.primaryAddress,
      description: params.displayName,
      secrets: [params.password],
      emails: [params.primaryAddress],
      quota: params.quota ?? 0,
    });

    this.logger.log(`Created account '${params.primaryAddress}'`);
  }

  async deleteAccount(name: string): Promise<void> {
    await this.stalwart.deletePrincipal(name);
    this.logger.log(`Deleted account '${name}'`);
  }

  async getAccount(name: string): Promise<AccountInfo | null> {
    const principal = await this.stalwart.getPrincipal(name);
    if (!principal) return null;

    return {
      name: principal.name,
      displayName: principal.description ?? '',
      emails: principal.emails ?? [],
      quota: principal.quota ?? 0,
    };
  }

  async addAddress(name: string, address: string): Promise<void> {
    await this.stalwart.patchPrincipal(name, [
      { action: 'addItem', field: 'emails', value: address },
    ]);

    this.logger.log(`Added address '${address}' to '${name}'`);
  }

  async removeAddress(name: string, address: string): Promise<void> {
    await this.stalwart.patchPrincipal(name, [
      { action: 'removeItem', field: 'emails', value: address },
    ]);

    this.logger.log(`Removed address '${address}' from '${name}'`);
  }

  async setPrimaryAddress(
    currentName: string,
    newPrimaryAddress: string,
  ): Promise<void> {
    // Stalwart uses the principal name as the login.
    // Changing the primary address means renaming the principal.
    // Current REST API does not support rename — we must recreate.
    const existing = await this.stalwart.getPrincipal(currentName);
    if (!existing) {
      throw new Error(`Account '${currentName}' not found`);
    }

    const updatedEmails = [
      newPrimaryAddress,
      ...(existing.emails ?? []).filter((e) => e !== newPrimaryAddress),
    ];

    await this.stalwart.deletePrincipal(currentName);
    await this.stalwart.createPrincipal({
      ...existing,
      name: newPrimaryAddress,
      emails: updatedEmails,
    });

    this.logger.warn(
      `Renamed account '${currentName}' → '${newPrimaryAddress}' (delete + recreate)`,
    );
  }
}
