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
      roles: ['user'],
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
}
